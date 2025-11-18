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
4) "story"는 단어별 스토리 메이킹 (초단기 이미지 암기용)을 만들어 넣기.
`.trim();

    // -------------------------------
    // 2) user 프롬프트: 그룹/스토리 규칙 + 예시 JSON
    // -------------------------------
    const prompt = `
다음 영단어와 뜻 목록을 비슷한 의미/형태/어원끼리 묶어서
좋은 암기 순서로 재배열하고,
각 단어마다 "초단기 이미지 암기용" 한 줄 스토리를 만들어줘.

### 1. 그룹핑 규칙
- 동일한 어원을 사용한 단어들을 "group"에 해당 어원을 뜻과 함께 적어라.
- 같은 어원, 즉 같은 group 이름을 가진 단어들은 연속해서 배치한다.

### 2. story 작성 규칙 (매우 중요)
- 사용자가 해당 단어를 외우가 쉽게 단어별 스토리를 만들어 (초단기 이미지 암기용) 넣어라.
- 스토리는 단어 발음과 뜻이 한 스토리로 잘 어우려져야 한다.
- 예를들어 단어가 insight라면 인싸(insight)는 다 꿰뚫어봐!를 출력한다. 이는 '인싸'<- 한글로 insight를 표현, '다 꿰둟어봐' <- 뜻을 내재함. 과 같은 방식이다.
- 짧을 수록 좋다.
### 3. JSON 형식 예시 (중요)
아래는 단어 3개만 있는 예시이다. 이 형식과 톤을 그대로 따라라.

{
  "items": [
    {
      "word": "insight",
      "meaning": "통찰, 통찰력",
      "group": "(in)안에",
      "story": "인싸(insight)는 다 꿰뚫어봐"
    },
    {
      "word": "achieve",
      "meaning": "이루다, 달성하다",
      "group": "(ad)머리",
      "story": "야 치브(achive)! 목표 클리어!"
    },
    {
      "word": "laundry",
      "meaning": "세탁물",
      "group": "",
      "story": "런드리(laundry)룸, 빨래 산더미 폭발"
    }
  ]
}

### 4. 실제로 처리할 단어 목록
${vocab.map(v => `- ${v.word}: ${v.meaning}`).join('\n')}

주의:
- 위 JSON 예시는 설명용일 뿐이다.
- 실제 출력에서는 위 예시를 절대 포함하지 마라.
- 오직 실제 단어들만 포함한 {"items":[...]} JSON 하나만 출력해라.
- 단어 뜻의 접두사는 , 만 사용한다. 띄어쓰기나 다른 기호로 구별하지 않는다. 만약 불러온 단어가 , 이외의 문자로 구분되어 있다면 알아서 잘 , 로 변경하라.
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
