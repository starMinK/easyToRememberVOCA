//velog.js
import fetch from 'node-fetch';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { slug } = req.query;
  if (!slug) {
    return res.status(400).json({ error: 'slug is required' });
  }

  try {
    // Velog 글 HTML 가져오기
    const url = `https://velog.io/${encodeURIComponent(slug)}`;
    const html = await fetch(url).then(r => r.text());

    // 여기서 정규식이나 간단 파싱으로 본문만 뽑을 수 있음.
    // 일단은 전체 html을 내려주고, CodePen에서 추가 파싱해도 됨.
    // 추천은: 너가 CodePen에서 이미 쓰던 Velog API 코드(마크다운)를
    // 이 함수 안으로 옮겨서, content만 json으로 내려주는 것.

    return res.status(200).json({
      rawHtml: html
      // 또는 content: parsedMarkdown
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch velog', detail: String(err) });
  }
}
