// Thin proxy in front of the 국립국어원 표준국어대사전 오픈API (stdict.korean.go.kr).
// Exists only because that API has no CORS headers and requires the key as a
// URL param — both of which rule out calling it straight from the browser in
// this bundler-less static app. The API key itself lives in the Netlify site's
// environment variables (STDICT_API_KEY), never in the repo.
exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const q = (params.q || '').trim();
  const method = ['exact', 'include', 'start'].includes(params.method) ? params.method : 'exact';

  if (!q) {
    return { statusCode: 400, body: JSON.stringify({ error: '검색어(q)가 필요합니다.' }) };
  }

  const key = process.env.STDICT_API_KEY;
  if (!key) {
    return { statusCode: 500, body: JSON.stringify({ error: '서버에 STDICT_API_KEY가 설정되어 있지 않습니다.' }) };
  }

  const url = `https://stdict.korean.go.kr/api/search.do?key=${key}&q=${encodeURIComponent(q)}&req_type=json&method=${method}&type1=word&num=10`;

  try {
    const res = await fetch(url);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: '표준국어대사전 응답을 해석할 수 없습니다.', raw: text.slice(0, 300) }),
      };
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: `표준국어대사전 호출 실패: ${err.message}` }) };
  }
};
