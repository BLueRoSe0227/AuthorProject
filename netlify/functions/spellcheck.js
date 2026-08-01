// Proxies the manuscript text to Naver's internal (undocumented) spell-checker
// endpoint so the "맞춤법 검사" panel can catch context-dependent errors that no
// fixed rule list can (e.g. "저녁밥을 멀다" — "멀다" is a real, correctly-spelled
// word, just the wrong one here).
//
// This is NOT an official API: it's the same request Naver's own search-box
// speller widget makes, reverse-engineered (the request shape below matches the
// currently-maintained https://github.com/9beach/hanspell client as of 2026).
// It can break or get rate-limited without notice — every failure here is caught
// per-chunk so one bad chunk doesn't take down the whole scan, and the app's own
// rule-based check (js/proofreaderRules.js) keeps working independently of this.
const NAVER_MAX_WORDS = 80; // stays under Naver's GET query-length limit
const NAVER_MIN_INTERVAL_MS = 250; // be a polite caller, not a scraper hammering the endpoint
const NAVER_PROXY_URL = 'https://m.search.naver.com/p/csearch/ocontent/util/SpellerProxy';
const NAVER_PASSPORT_PAGE = `https://search.naver.com/search.naver?query=${encodeURIComponent('맞춤법 검사기')}`;
const NAVER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
// Netlify's default synchronous function timeout is 10s; each chunk costs a full
// network round trip plus NAVER_MIN_INTERVAL_MS, so input is capped conservatively
// rather than risking a timeout on long scenes. The caller (js/proofreader.js) only
// sends the first MAX_INPUT_LENGTH characters and should tell the user so.
const MAX_INPUT_LENGTH = 2000;

const COLOR_CATEGORY = { red: 'spelling', green: 'spacing', blue: 'expression', violet: 'expression' };
const COLOR_MESSAGE = {
  red: '맞춤법 오류로 의심됩니다. (네이버 맞춤법 검사, 비공식)',
  green: '띄어쓰기 오류로 의심됩니다. (네이버 맞춤법 검사, 비공식)',
  blue: '표준어 의심 또는 대치어 추천입니다. (네이버 맞춤법 검사, 비공식)',
  violet: '통계적 교정 제안입니다. (네이버 맞춤법 검사, 비공식)',
};

// Best-effort cache across warm invocations of the same function container —
// harmless if it doesn't persist, since getPassportKey() re-fetches on a cold start.
let cachedPassportKey = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeEntities(str) {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

async function fetchPassportKey() {
  const res = await fetch(NAVER_PASSPORT_PAGE, { headers: { 'User-Agent': NAVER_UA } });
  const body = await res.text();
  const m = body.match(/passportKey=([a-f0-9]+)/);
  if (!m) throw new Error('네이버 passportKey를 가져오지 못했습니다.');
  return m[1];
}

async function getPassportKey(forceRefresh) {
  if (!forceRefresh && cachedPassportKey) return cachedPassportKey;
  cachedPassportKey = await fetchPassportKey();
  return cachedPassportKey;
}

function unwrapJsonp(body) {
  const start = body.indexOf('(');
  const end = body.lastIndexOf(')');
  if (start === -1 || end === -1 || end <= start) throw new Error('네이버 응답을 해석할 수 없습니다.');
  return JSON.parse(body.slice(start + 1, end));
}

// Naver returns two parallel HTML fragments: `origin_html` has the flagged spans
// from the input, `html` has the color-coded suggested replacements — same index
// order, paired up positionally (there's no shared id to join on).
function parseNaverResult(result) {
  if (!result || result.errata_count === 0) return [];

  const origins = [];
  const reSpan = /<span class='result_underline'>([\s\S]*?)<\/span>/g;
  let m;
  while ((m = reSpan.exec(result.origin_html))) origins.push(decodeEntities(m[1]));

  const fixes = [];
  const reEm = /<em class='([a-z]+)_text'>([\s\S]*?)<\/em>/g;
  while ((m = reEm.exec(result.html))) fixes.push({ color: m[1], text: decodeEntities(m[2]) });

  const len = Math.min(origins.length, fixes.length);
  const typos = [];
  for (let i = 0; i < len; i += 1) {
    typos.push({ token: origins[i], suggestion: fixes[i].text, color: fixes[i].color });
  }
  return typos;
}

async function callNaver(text) {
  const tryOnce = async () => {
    const key = await getPassportKey(false);
    const url = `${NAVER_PROXY_URL}?_callback=jQuery&q=${encodeURIComponent(text)}&where=nexearch&color_blindness=0&passportKey=${key}`;
    return fetch(url, { headers: { 'User-Agent': NAVER_UA, Referer: 'https://search.naver.com/' } });
  };

  let res = await tryOnce();
  let body = await res.text();
  if (body.includes('유효한 키가 아닙니다')) {
    cachedPassportKey = null;
    res = await tryOnce();
    body = await res.text();
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return body;
}

// Splits on whitespace so each chunk stays under NAVER_MAX_WORDS words while
// remaining an exact contiguous slice of `text` — callers rely on chunk lengths
// summing back to text.length to keep global offsets correct.
function splitByWordCount(text, limit) {
  const chunks = [];
  let start = 0;
  let wordCount = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (/\s/.test(text[i])) {
      wordCount += 1;
      if (wordCount >= limit) {
        chunks.push(text.slice(start, i + 1));
        start = i + 1;
        wordCount = 0;
      }
    }
  }
  if (start < text.length) chunks.push(text.slice(start));
  return chunks;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'POST 요청만 지원합니다.' }) };
  }

  let text;
  try {
    text = JSON.parse(event.body || '{}').text;
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: '잘못된 요청 본문입니다.' }) };
  }
  text = (text || '').slice(0, MAX_INPUT_LENGTH);
  if (!text.trim()) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issues: [] }) };
  }

  const chunks = splitByWordCount(text, NAVER_MAX_WORDS);
  const issues = [];
  const errors = [];
  let offset = 0;

  for (let c = 0; c < chunks.length; c += 1) {
    const chunk = chunks[c];
    try {
      const body = await callNaver(chunk);
      const json = unwrapJsonp(body);
      const result = json && json.message && json.message.result;
      if (!result) {
        const err = (json && json.message && json.message.error) || '알 수 없는 응답';
        errors.push(err);
      } else {
        const typos = parseNaverResult(result);
        let searchFrom = 0;
        typos.forEach((t) => {
          const localIdx = chunk.indexOf(t.token, searchFrom);
          if (localIdx === -1) return; // Naver's rendering didn't line up with our input verbatim — skip rather than mis-locate
          issues.push({
            index: offset + localIdx,
            length: t.token.length,
            original: t.token,
            suggestion: t.suggestion,
            category: COLOR_CATEGORY[t.color] || 'expression',
            message: COLOR_MESSAGE[t.color] || '네이버 맞춤법 검사 제안입니다.',
          });
          searchFrom = localIdx + t.token.length;
        });
      }
    } catch (err) {
      errors.push(err.message);
    }
    offset += chunk.length;
    if (c < chunks.length - 1) await sleep(NAVER_MIN_INTERVAL_MS);
  }

  if (!issues.length && errors.length === chunks.length) {
    return { statusCode: 502, body: JSON.stringify({ error: `네이버 맞춤법 검사 실패: ${errors[0]}` }) };
  }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issues }) };
};
