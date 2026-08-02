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
const MAX_BYTES = 20 * 1024 * 1024; // generous for a full JSON export, still bounded

exports.handler = async (event) => {
  const pin = (event.queryStringParameters && event.queryStringParameters.pin) || '';
  if (!PIN_RE.test(pin)) {
    return { statusCode: 400, body: JSON.stringify({ error: '6자리 숫자 비밀번호가 필요합니다.' }) };
  }

  let store;
  try {
    store = getStore('storyweaver-sync');
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: `클라우드 저장소를 사용할 수 없습니다: ${err.message}` }) };
  }

  if (event.httpMethod === 'GET') {
    try {
      const data = await store.get(pin, { type: 'json' });
      if (!data) return { statusCode: 404, body: JSON.stringify({ error: '이 비밀번호로 저장된 데이터가 없습니다.' }) };
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
    } catch (err) {
      return { statusCode: 502, body: JSON.stringify({ error: `불러오기 실패: ${err.message}` }) };
    }
  }

  if (event.httpMethod === 'PUT') {
    const body = event.body || '';
    const byteLength = Buffer.byteLength(body, 'utf8');
    if (byteLength > MAX_BYTES) {
      return { statusCode: 413, body: JSON.stringify({ error: '데이터가 너무 큽니다 (20MB 제한).' }) };
    }
    let payload;
    try {
      payload = JSON.parse(body);
    } catch (err) {
      return { statusCode: 400, body: JSON.stringify({ error: '올바른 JSON이 아닙니다.' }) };
    }
    try {
      await store.setJSON(pin, payload);
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    } catch (err) {
      return { statusCode: 502, body: JSON.stringify({ error: `저장 실패: ${err.message}` }) };
    }
  }

  return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
};
