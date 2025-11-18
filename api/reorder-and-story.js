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

    // -------------------------------
    // 1) system 메시지: 형식/규칙 강하게
    // -------------------------------
    const systemMessage = `
You are a Korean word-mnemonic generator.

반드시 아래 규칙을 지켜라:

1) 출력은 무조건 JSON 하나만:
   {"items":[{"word":"...","meaning":"...","group":"...","story":"..."}, ...]}

2) 코드블럭(트리플 backtick) 절대 사용 금지.
3) JSON 바깥에 어떤 텍스트도 쓰지 마라.
   - 설명, 주석, 인사말, 추가 문장 모두 금지.
4) "story"는 암기용 이미지/말장난 한 줄만.
   - 예문 문장 금지.
   - 단어 뜻을 그대로 나열하는 형식 금지.
5) 한국어 중심으로 작성하되, 필요하면 간단한 영어만 살짝 사용 가능.
`.trim();

    // -------------------------------
    // 2) user 프롬프트: 그룹/스토리 규칙 + 예시 JSON
    // -------------------------------
    const prompt = `
다음 영단어와 뜻 목록을 비슷한 의미/형태/어원끼리 묶어서
좋은 암기 순서로 재배열하고,
각 단어마다 "초단기 이미지 암기용" 한 줄 스토리를 만들어줘.

### 1. 그룹핑 규칙
- 비슷한 의미/형태/어원끼리 묶어서 "group"에 한국어로 적어라.
- 예시 그룹:
  - "생각/통찰/마음"
  - "달성/성공/발전"
  - "규칙/조직/관리"
  - "부족/희귀"
  - "금지/지정"
  - "문서/증명"
  - "변형/흐름"
  - "사람/사회"
  - "나쁨/파괴"
  - "예배/관념/소설"
  - "장소/행위"
- 가능하면 위 범주 이름을 그대로 group에 사용해라.
- 위에 없는 경우에만, 비슷한 형식으로 새 group 이름을 만들어도 된다.
- 같은 group 이름을 가진 단어들은 연속해서 배치한다. (정렬까지 책임)

### 2. story 작성 규칙 (매우 중요)
- 예문 문장 금지. (예: "He achieved his goal." X)
- 단어의 뜻을 그대로 나열하거나, 너무 직설적으로 의미를 설명하는 형식 금지.
  - X: "duty: 맡은 일, 반드시 해내자!"
  - X: "laundry: 세탁물, 빨래"
- 장면/이미지/말장난 위주로 만들어라.
- 25자 이내로 짧고 강렬하게.
- 한국어 중심 + 간단한 영어 섞기 가능.

### 3. JSON 형식 예시 (중요)
아래는 단어 3개만 있는 예시이다. 이 형식과 톤을 그대로 따라라.

{
  "items": [
    {
      "word": "insight",
      "meaning": "통찰, 통찰력",
      "group": "생각/통찰/마음",
      "story": "인싸(insight)는 다 꿰뚫어봐"
    },
    {
      "word": "achieve",
      "meaning": "이루다, 달성하다",
      "group": "달성/성공/발전",
      "story": "야 치브! 목표 클리어!"
    },
    {
      "word": "laundry",
      "meaning": "세탁물",
      "group": "장소/행위",
      "story": "런드리룸, 빨래 산더미 폭발"
    }
  ]
}

### 4. 실제로 처리할 단어 목록
${vocab.map(v => `- ${v.word}: ${v.meaning}`).join('\n')}

주의:
- 위 JSON 예시는 설명용일 뿐이다.
- 실제 출력에서는 위 예시를 절대 포함하지 말 것.
- 오직 실제 단어들만 포함한 {"items":[...]} JSON 하나만 출력할 것.
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
            content: systemMessage
          },
          { role: 'user', content: prompt }
        ],
        // 형식 안정성을 위해 낮은 temperature 사용
        temperature: 0.2
      })
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      console.error('OpenAI error:', data);
      return res.status(500).json({ error: 'OpenAI API error', detail: data });
    }

    const raw = (data.choices?.[0]?.message?.content || '').trim();

    // 혹시라도 들어올 수 있는 ```json ... ``` 또는 ``` ... ``` 코드블럭 방어
    let cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```/, '')
      .replace(/```$/, '')
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
