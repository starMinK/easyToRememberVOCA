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
각 단어마다 외우기 쉬운 "암기용 한 줄 문장"을 만들어줘.

요구사항:
- 각 항목은 다음 JSON 형식으로:
  {"word":"...","meaning":"...","group":"...","story":"..."}
- "story"는 예문 문장이 아니라, 단어를 떠올리기 쉬운 짧은 문장/이미지여야 함.
- 한국어와 영어를 섞어도 좋고, 완전한 문장이 아니어도 됨.
- 가능한 한 25자 이내, 짧고 강렬하게.
- 뜻을 그대로 반복하기보다는, 연상되는 이미지/상황/소리 등을 표현.
- 예: transform 변형시키다, 변환하다 → "트랜스포머: 로봇 변신!"

반드시 유효한 JSON만 반환해. 코드블럭(\`\`\`)이나 설명 문장은 포함하지 마.
형식:
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
            content:
              'You are a helpful assistant that returns ONLY valid JSON (no code fences, no extra text).'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.6
      })
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      console.error('OpenAI error:', data);
      return res.status(500).json({ error: 'OpenAI API error', detail: data });
    }

    const raw = (data.choices?.[0]?.message?.content || '').trim();

    // 혹시 들어올 수 있는 ```json ... ``` 또는 ``` ... ``` 코드블럭 제거
    let cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```/, '')
      .replace(/```$/,'')
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
