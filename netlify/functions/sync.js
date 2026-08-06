// Manual cross-device backup/restore keyed by a 6-digit PIN, backed by Netlify
// Blobs. There are no accounts — the PIN *is* the key — so this is deliberately
// scoped to "same person, second device" manual backup/restore (GET to pull the
// last snapshot, PUT to overwrite it), not real-time multi-device sync: syncing
// two independently-edited devices automatically would risk silently discarding
// whichever one didn't happen to push last.
//
// Security note: a 6-digit PIN only has 1,000,000 possible values and this
// endpoint has no rate limiting, so it must never be treated as access control —
// anyone who guesses/brute-forces a PIN can read or overwrite that snapshot. It's
// meant purely to distinguish one person's devices from another's, not to protect
// sensitive data.
const { getStore } = require('@netlify/blobs');

const PIN_RE = /^\d{6}$/;
// Netlify Functions (synchronous, AWS Lambda-based) reject request/response
// bodies above ~6MB at the platform level, well before this function's own code
// ever runs — a 20MB check here was meaningless. The client now gzip-compresses
// the export and base64-wraps it as {"data":"..."} JSON (see App.cloudSave in
// js/app.js), so this checks the size of that already-compressed wire payload,
// with headroom left for the JSON wrapper and base64's ~33% overhead.
const MAX_BODY_BYTES = 5.5 * 1024 * 1024;

exports.handler = async (event) => {
  const pin = (event.queryStringParameters && event.queryStringParameters.pin) || '';
  if (!PIN_RE.test(pin)) {
    return { statusCode: 400, body: JSON.stringify({ error: '6자리 숫자 비밀번호가 필요합니다.' }) };
  }

  let store;
  try {
    store = getStore('storyweaver-sync');
  } catch (autoErr) {
    // Netlify normally injects site/token context into a deployed function
    // automatically, so plain getStore(name) just works — but that injection can
    // fail to kick in for a given deploy (e.g. it wasn't a clean build after
    // @netlify/blobs was added as a dependency). The documented workaround is to
    // configure the store manually, which needs NETLIFY_SITE_ID and
    // NETLIFY_BLOBS_TOKEN set as environment variables on the site (Site
    // configuration > Environment variables): site ID from Site configuration >
    // General > Site details, token from User settings > Applications > Personal
    // access tokens (needs at least the "Blobs" scope).
    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN;
    if (!siteID || !token) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: `클라우드 저장소를 사용할 수 없습니다: ${autoErr.message} — 이 배포에서는 자동 설정이 안 됐어요. Netlify 사이트의 환경 변수에 NETLIFY_SITE_ID와 NETLIFY_BLOBS_TOKEN을 추가한 뒤 다시 배포해주세요.`,
        }),
      };
    }
    try {
      store = getStore({ name: 'storyweaver-sync', siteID, token });
    } catch (manualErr) {
      return { statusCode: 500, body: JSON.stringify({ error: `클라우드 저장소를 사용할 수 없습니다: ${manualErr.message}` }) };
    }
  }

  // Stored/transferred as opaque base64 text end-to-end — the function never
  // needs to gzip/gunzip itself, it just passes the client's compressed bytes
  // through to and from Blobs, wrapped in plain JSON so there's no ambiguity
  // around Netlify's binary-body encoding rules.
  if (event.httpMethod === 'GET') {
    try {
      const data = await store.get(pin, { type: 'text' });
      if (!data) return { statusCode: 404, body: JSON.stringify({ error: '이 비밀번호로 저장된 데이터가 없습니다.' }) };
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) };
    } catch (err) {
      return { statusCode: 502, body: JSON.stringify({ error: `불러오기 실패: ${err.message}` }) };
    }
  }

  if (event.httpMethod === 'PUT') {
    const body = event.body || '';
    const byteLength = Buffer.byteLength(body, 'utf8');
    if (byteLength > MAX_BODY_BYTES) {
      return { statusCode: 413, body: JSON.stringify({ error: `압축한 백업도 너무 커요 (약 ${(byteLength / 1024 / 1024).toFixed(1)}MB, 최대 ${(MAX_BODY_BYTES / 1024 / 1024).toFixed(1)}MB) — 첨부 이미지가 많은 작품이 있다면 용량을 줄여보세요.` }) };
    }
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch (err) {
      return { statusCode: 400, body: JSON.stringify({ error: '올바른 JSON이 아닙니다.' }) };
    }
    if (typeof parsed.data !== 'string' || !parsed.data) {
      return { statusCode: 400, body: JSON.stringify({ error: '압축된 데이터(data) 필드가 없습니다.' }) };
    }
    try {
      await store.set(pin, parsed.data);
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    } catch (err) {
      return { statusCode: 502, body: JSON.stringify({ error: `저장 실패: ${err.message}` }) };
    }
  }

  return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
};
