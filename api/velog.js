// velog.js
import fetch from 'node-fetch';

export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let { slug } = req.query;
  if (!slug) {
    return res.status(400).json({ error: 'slug is required' });
  }

  try {
    // ------ 1) 기본 문자열 정리 ------
    slug = String(slug).trim();

    // ------ 2) 전체 URL로 넣은 경우 처리 ------
    // 예) "https://velog.io/@dvlp/워마13-15"
    if (slug.startsWith('http://') || slug.startsWith('https://')) {
      try {
        const u = new URL(slug);
        // "/@dvlp/워마13-15" -> "@dvlp/워마13-15"
        slug = u.pathname.replace(/^\/+/, '');
      } catch (e) {
        // URL 파싱 실패하면 그냥 slug 그대로 사용
      }
    }

    // ------ 3) velog.io 도메인까지 적어 넣은 경우 정리 ------
    // 예) "velog.io/@dvlp/워마13-15" 등
    slug = slug
      .replace(/^https?:\/\/velog\.io\//, '') // "https://velog.io/" 제거
      .replace(/^velog\.io\//, '')           // "velog.io/" 제거
      .replace(/^\/+/, '');                  // 앞쪽 슬래시들 제거

    // ------ 4) @ 없으면 기본 계정 @dvlp로 붙여주기 ------
    // - "워마13-15"  -> "@dvlp/워마13-15"
    // - "@other/단어장" -> 그대로 사용 (다른 사람도 가능)
    if (!slug.startsWith('@')) {
      slug = `@dvlp/${slug}`;
    }

    // 최종 Velog URL
    const url = `https://velog.io/${slug}`;

    // Velog 글 HTML 가져오기
    const htmlRes = await fetch(url);

    if (!htmlRes.ok) {
      const text = await htmlRes.text();
      return res.status(htmlRes.status).json({
        error: 'Failed to fetch velog',
        status: htmlRes.status,
        detail: text,
      });
    }

    const html = await htmlRes.text();

    // 지금은 전체 HTML만 내려주고 있음.
    // 프론트에서 cleanVelogText()로 후처리해서 쓰는 구조 유지.
    return res.status(200).json({
      rawHtml: html,
      // 필요하면 content: parsedMarkdown 이런 식으로 추가 가능
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'Failed to fetch velog',
      detail: String(err),
    });
  }
}
