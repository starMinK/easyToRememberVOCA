// api/reorder-and-story.js

export default async function handler(req, res) {
  // CORS 설정 (CodePen 등에서 직접 호출 가능하게)
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

    // ---------------------------------------
    // 0) 의미(meaning) 정규화
    //    - 진짜 구분자들만 콤마로
    //    - 필요시 "띄어쓰기로만 구분된 뜻"도 콤마로
    // ---------------------------------------
    function normalizeMeaning(raw) {
      let m = String(raw || '').trim();
      if (!m) return '';

      // 1) 명확한 구분자들을 콤마로 통일: / · • | ; 등
      m = m.replace(/[/·•\|;]/g, ',');

      // 2) 의미 사이를 두 칸 이상 띄어쓴 경우 → 콤마로 간주
      //    ex) "마음가짐  사고방식" -> "마음가짐,사고방식"
      m = m.replace(/\s{2,}/g, ',');

      // 3) 콤마 주변 공백 정리: " , " / ", " / " ," -> ","
      m = m.replace(/\s*,\s*/g, ',');

      // 4) 콤마 두 개 이상 연속 → 하나로
      m = m.replace(/,{2,}/g, ',');

      // 5) 앞뒤 공백/콤마 제거
      m = m.replace(/^\s+|\s+$/g, '');
      m = m.replace(/^,|,$/g, '');

      // 6) 여전히 콤마가 하나도 없고, 의미 안에 공백이 있다면
      //    → 사용자가 띄어쓰기로 뜻을 구분했을 가능성: 공백을 콤마로 변환
      //    ex) "시민의 민간의" -> "시민의,민간의"
      if (!m.includes(' ') && !m.includes(',')) {
        // 공백도 없고 콤마도 없는 단일 단어/구는 그대로 둔다.
        return m;
      }

      if (!m.includes(',') && /\s+/.test(m)) {
        m = m.replace(/\s+/g, ',');
      }

      return m;
    }

    const normalizedVocab = vocab.map((v) => ({
      word: String(v.word || '').trim(),
      meaning: normalizeMeaning(v.meaning)
    }));

    // -----------------------------------
    // 1) system 메시지
    // -----------------------------------
    const systemMessage = `
You are a Korean mnemonic generator specializing in 재미있는 발음 기반 암기 스토리.

규칙:

1) 출력은 반드시 JSON 하나:
   {"items":[{"word":"...","meaning":"...","rootword":"...","story":"..."}, ...]}

2) meaning은 입력된 것을 그대로 사용. 수정하지 않기.

3) rootword는 반드시 넣기.
   여러 어원이 있으면 (xxx:뜻)+(yyy:뜻) 형태로 나열.

4) story는 반드시 한 줄 생성 (빈 문자열 금지).

5) 스토리 작성 규칙 — 네가 원하는 스타일
   - 영단어의 실제 발음을 비틀어 한국어 단어처럼 들리는 말장난을 사용해도 된다.
   - 단, “발음을 그대로 한글로 표기하는 것(프루브, 포즈, 마이너)”은 금지.
   - 발음 힌트가 필요하면 자연스러운 한국어 단어처럼 변형해서 괄호로 단어를 알려줘라.
     예: 어쩔션(option), 인싸(insight), 다이제(digest)
   - 스토리는 10~18자 내외의 초단기 이미지 문장.
   - “뜻을 외우자”, “기억하자” 같은 메타 문장 금지.
   - 반드시 재밌고 직관적이며 일상적 상황이어야 한다.

6) 모든 story는 서로 독립적으로 완성되어야 한다.
`.trim();

    // -----------------------------------
    // 2) user 프롬프트
    // -----------------------------------
    const prompt = `
아래 단어 목록을 같은 어원이 있다면 해당 단어끼리 순서대로 재배열하고,
각 단어마다 한국어 발음 기반 이미지 암기 스토리(story)를 작성해라.

주의:
- 출력은 반드시 {"items":[...]} 형식의 JSON 하나만.
- meaning은 아래 목록에 있는 문자열을 그대로 사용해라. (수정 금지)

### 실제 단어 목록 (meaning은 콤마로 구분된 상태일 수 있음)
${normalizedVocab.map(v => `- ${v.word}: ${v.meaning}`).join('\n')}

출력 형식:
{"items":[{"word":"...","meaning":"...","rootword":"...","story":"..."}, ...]}

이 형식만 출력하고, 다른 텍스트는 절대 쓰지 마라.
`.trim();

    // -----------------------------------
    // 3) OpenAI 호출
    // -----------------------------------
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',   // 자연스러운 스토리용
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8   // 네가 원하는 수준의 창의성/자연스러움
      })
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      console.error('OpenAI error:', data);
      return res.status(500).json({ error: 'OpenAI API error', detail: data });
    }

    // -----------------------------------
    // 4) 코드블럭 제거 후 JSON 파싱
    // -----------------------------------
    const raw = (data.choices?.[0]?.message?.content || '').trim();

    let cleaned = raw
      .replace(/^```json/i, '')
      .replace(/^```/i, '')
      .replace(/```$/, '')
      .trim();

    let llmJson;
    try {
      llmJson = JSON.parse(cleaned);
    } catch (e) {
      console.error('JSON parse error:', cleaned);
      return res.status(500).json({
        error: 'JSON parse error from LLM',
        raw: cleaned
      });
    }
    
    const llmItems = Array.isArray(llmJson.items) ? llmJson.items : [];

    // word → LLM item 매핑
    const llmMap = new Map();
    llmItems.forEach((it) => {
      const w = String(it.word || '').trim().toLowerCase();
      if (!w) return;
      if (!llmMap.has(w)) {
        llmMap.set(w, it);
      }
    });

    const finalItems = normalizedVocab.map((v) => {
      const key = v.word.toLowerCase();
      const baseMeaning = v.meaning; // 우리가 정규화한 meaning

      const llmItem = llmMap.get(key) || {};
      let rootword = String(llmItem.rootword || '').trim();
      let story = String(llmItem.story || '').trim();

      if (!rootword) {
        rootword = '어원 정보 없음';
      }

      // story 비었으면 더 이상 기괴한 fallback 안 씀
      // 프론트에서 "스토리 없음" 등으로 처리하도록 빈 문자열 유지
      if (!story) {
        story = '';
      }

      return {
        word: v.word,
        meaning: baseMeaning,
        rootword,
        story
      };
    });

    return res.status(200).json({ items: finalItems });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
