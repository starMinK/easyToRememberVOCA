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
각 단어마다 "초단기 이미지 암기용" 한 줄 스토리를 만들어줘.

요구사항 (매우 중요):
- 각 항목은 JSON 형식:
  {"word":"...","meaning":"...","group":"...","story":"..."}
- "story"는 예문 문장이 아니라, 단기 암기를 위한 "이미지/연상" 한 줄이어야 함.
- 최대 25자 내외로 짧고 강렬하게.
- 단어의 뜻을 그대로 반복하거나, "duty: 맡은 일, 반드시 해내자!"처럼
  단어와 뜻을 단순하게 이어 쓰는 형식은 금지.
- 대신, 장면/이미지/말장난 등으로 기억이 확 남게 만들어라.
- 한국어 + 간단한 영어 섞어도 괜찮지만, 전체적으로 한국어 중심.
- 예시:
  - transform 변형시키다, 변환하다 → "트랜스포머: 로봇 번쩍 변신!"
  - duty 의무 → "듀티=군인 근무, 거수경례 딱!"
  - laundry 세탁물 → "런드리=빨래 산더미, 세탁기 폭발"
  - surgery 외과 수술 → "수술대 위 긴장감 MAX"

반드시 유효한 JSON만 반환해.
- 코드블럭(\\\`\\\`\\\`) 사용 금지.
- 설명 문장, 주석, 텍스트 절대 추가하지 말 것.
- 오직 {"items":[...]} 형식 하나만.

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
              'You must return ONLY valid JSON with no code fences and no extra text. Format: {"items":[...]}'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
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
