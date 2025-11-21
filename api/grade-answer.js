// grade-answer.js
export default async function handler(req, res) {
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
    // ✅ 여러 필드 이름에 대응 (프론트/백 호환)
    const {
      correctMeaning,
      correctAnswer,
      meaning,
      userAnswer,
    } = req.body || {};

    // correctMeaning / correctAnswer / meaning 중 "있는 것 하나"를 정답 의미로 사용
    const finalCorrectMeaning = (correctMeaning || correctAnswer || meaning || '').toString().trim();

    if (!finalCorrectMeaning || !userAnswer) {
      return res.status(400).json({
        error: 'correctMeaning/correctAnswer/meaning and userAnswer required'
      });
    }

    const systemMessage = `
너는 한국어 뜻 비교를 해주는 채점 도우미야.

반드시 아래 형식으로만 대답해:
{"isCorrect":true/false,"message":"짧은 한국어 한 줄 설명"}

규칙:
- correctMeaning은 "정답 의미", userAnswer는 "사용자 입력"이다.
- 두 표현이 일반적인 국어 감각에서 같은 뜻이거나 매우 비슷하면 isCorrect=true.
- 사소한 조사, 어미, 복수형, 높임/반말 차이는 무시해라.
- 완전히 다른 의미이거나 핵심 의미가 다르면 isCorrect=false.
- message는 30자 이내의 짧은 한국어 한 줄로 써라.
- JSON 바깥 아무 텍스트도 쓰지 마라.
    `.trim();

    const userPrompt = `
정답 의미: ${finalCorrectMeaning}
사용자 입력: ${userAnswer}

두 표현이 같은 뜻이거나 매우 비슷한지 판정해줘.
    `.trim();

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 60,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      console.error('OpenAI grade-meaning error:', data);
      return res.status(500).json({ error: 'OpenAI API error', detail: data });
    }

    const raw = (data.choices?.[0]?.message?.content || '').trim();

    // 혹시 코드블럭으로 감싸져 오면 제거
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      const json = JSON.parse(cleaned);
      return res.status(200).json({
        isCorrect: !!json.isCorrect,
        // 프론트에서는 data.explain || data.reason || data.message 를 보니까
        // 여기서는 message만 보내면 됨
        message: typeof json.message === 'string' ? json.message : undefined
      });
    } catch (e) {
      console.error('grade-meaning JSON parse error', e, raw);
      return res.status(200).json({
        isCorrect: false,
        message: '의미가 충분히 같다고 보긴 어렵습니다.'
      });
    }
  } catch (err) {
    console.error('grade-meaning handler error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
