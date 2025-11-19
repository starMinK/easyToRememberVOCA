// api/grade-answer.js

export default async function handler(req, res) {
  // CORS (CodePen 등 외부에서 직접 호출 가능하게)
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
    const {
      questionType,   // 'word_to_meaning' | 'meaning_to_word' (지금은 word_to_meaning만 사용)
      correctWord,    // 영어 단어
      correctMeaning, // 콤마로 구분된 정답 의미 문자열
      userAnswer
    } = req.body || {};

    if (!questionType || !correctMeaning || !userAnswer) {
      return res.status(400).json({ error: 'questionType, correctMeaning, userAnswer는 필수입니다.' });
    }

    const systemMessage = `
You are a strict but fair English-Korean vocabulary grading assistant.

반드시 아래 규칙을 지켜라:

1) 출력은 무조건 JSON 하나만:
   {"isCorrect": true or false, "feedback": "<한국어 피드백 한 줄>"}

2) 코드블럭(트리플 backtick) 절대 사용 금지.
3) JSON 바깥에 어떤 텍스트도 쓰지 마라.
4) "feedback"은 한국어로 짧게, 학습자에게 이해하기 쉽게 설명해라.
`.trim();

    const prompt = `
아래 정보로 영어 단어 암기 문제의 정답 여부를 판단해라.

- questionType: ${questionType}
- englishWord: ${correctWord || '(없음)'}
- correctMeaningList(콤마로 구분): ${correctMeaning}
- userAnswer: ${userAnswer}

채점 기준:

[공통]
- 띄어쓰기, 조사(을/를/이/가 등), 문장부호 차이는 무시한다.
- 정답 의미와 "사실상 같은 의미"인 표현이면 정답 처리한다.
- 아주 엉뚱한 의미이거나 전혀 다른 단어면 오답 처리한다.

[questionType = "word_to_meaning"]
- correctMeaning는 "중단,중단하다,잠시 멈추다" 와 같이 콤마로 여러 의미가 적혀있다.
- userAnswer가 이 중 하나와 동의어/유사어라면 정답이다.
  예: 정답 "부족" 에 대해 "모자람", "결핍" 등도 정답으로 인정해라.
- 단, 전혀 다른 개념(예: "책상" 등)은 오답이다.

[questionType = "meaning_to_word"]
- userAnswer는 영어 단어여야 한다.
- correctWord와 같은 영어 단어인지 확인해라.
- 대소문자는 무시하고, 철자가 1~2글자 정도만 틀린 경우는 "오타로 보이는지" 판단해서 정답 처리해도 된다.
- 완전히 다른 단어면 오답이다.

반드시:
- {"isCorrect": true/false, "feedback": "..."} 만 JSON으로 출력해라.
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
          { role: 'system', content: systemMessage },
          { role: 'user', content: prompt }
        ],
        temperature: 0.15 // 너무 창의적이면 안 되고, 엄격하게 채점해야 해서 낮게
      })
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      console.error('OpenAI grade-answer error:', data);
      return res.status(500).json({ error: 'OpenAI API error', detail: data });
    }

    const raw = (data.choices?.[0]?.message?.content || '').trim();

    // 혹시라도 ```json ... ``` 같은 코드블럭 방어
    let cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```/, '')
      .replace(/```$/, '')
      .trim();

    let json;
    try {
      json = JSON.parse(cleaned);
    } catch (e) {
      console.error('grade-answer JSON parse error:', e, raw);
      return res.status(500).json({
        error: 'JSON parse error from LLM',
        raw
      });
    }

    // 최소한의 검증
    if (typeof json.isCorrect !== 'boolean') {
      json.isCorrect = false;
      json.feedback = json.feedback || '형식 오류로 인해 오답 처리되었습니다.';
    }
    if (typeof json.feedback !== 'string') {
      json.feedback = json.isCorrect ? '정답입니다.' : '오답입니다.';
    }

    return res.status(200).json(json);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
