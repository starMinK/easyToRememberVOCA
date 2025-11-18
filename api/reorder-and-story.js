// api/reorder-and-story.js

export default async function handler(req, res) {
  // CORS 설정 (CodePen에서 직접 호출 가능하게)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    const { vocab } = req.body || {};

    if (!Array.isArray(vocab) || !vocab.length) {
      return res.status(400).json({ error: 'vocab is required' });
    }

    const prompt = `
다음 영단어와 뜻 목록을 비슷한 의미/형태/어원끼리 묶어서 좋은 암기 순서로 재배열하고,
각 단어마다 짧은 한국어 예문/스토리 한 문장을 만들어.
반드시 유효한 JSON만 반환해. 형식은:
{"items":[{"word":"...","meaning":"...","group":"...","story":"..."}, ...]}

단어 목록:
${vocab.map(v => `- ${v.word}: ${v.meaning}`).join('\n')}
    `.trim();

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that returns ONLY valid JSON, with no explanations or code fences.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.5
      })
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      console.error('OpenAI error:', data);
      return res.status(500).json({ error: 'OpenAI API error', detail: data });
    }

    const raw = (data.choices?.[0]?.message?.content || '').trim();

    // ```json ... ``` 또는 ``` ... ``` 코드블럭 제거
    let cleaned = raw
      .replace(/^```json\s*/i, '') // 맨 앞의 ```json
      .replace(/^```/, '')         // 혹시 그냥 ```로 시작한 경우
      .replace(/```$/, '')         // 맨 뒤의 ```
      .trim();

    let json;
    try {
      json = JSON.parse(cleaned);
    } catch (e) {
      console.error('JSON parse error:', e, raw);
      return res.status(500).json({
        error: 'JSON parse error from LLM',
        raw
      });
    }

    return res.status(200).json(json);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
