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

    // ---------------------------------------
    // 0) 의미(meaning) 정규화: "진짜 구분자"만 콤마로
    // ---------------------------------------
    function normalizeMeaning(raw) {
      let m = String(raw || '').trim();

      if (!m) return '';

      // 1) 명확한 구분자들을 콤마로 통일: / · • | ; 등
      m = m.replace(/[/·•\|;]/g, ',');

      // 2) 의미 사이를 두 칸 이상 띄어쓴 경우 → 콤마로 간주
      //    예: "마음가짐  사고방식" -> "마음가짐,사고방식"
      m = m.replace(/\s{2,}/g, ',');

      // 3) 콤마 주변 공백 정리: " , " / ", " / " ," -> ","
      m = m.replace(/\s*,\s*/g, ',');

      // 4) 콤마 두 개 이상 연속 → 하나로
      m = m.replace(/,{2,}/g, ',');

      // 5) 앞뒤 공백/콤마 제거
      m = m.replace(/^\s+|\s+$/g, '');
      m = m.replace(/^,|,$/g, '');

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
You are a Korean mnemonic generator.

반드시 아래 규칙을 지켜라:

1) 출력은 반드시 JSON 하나만:
   {"items":[{"word":"...","meaning":"...","rootword":"...","story":"..."}, ...]}

2) 코드블럭(트리플 backtick) 절대 사용 금지.
   JSON 바깥에 어떤 텍스트도 쓰지 마라. (설명/인사/주석 모두 금지)

3) "meaning"은 내가 제공한 문자열을 그대로 복사해서 넣는다.
   - meaning의 단어, 순서, 콤마 구분자를 절대로 수정/삭제/추가하지 마라.
   - meaning은 오직 입력에서 받은 문자열 그대로를 사용한다.

4) "rootword":
   - 해당 단어의 어원을 (in)안에, (spect)보다 식으로 적어라.
   - 여러 어원이 있다면 모두 포함해라.
   - 어원을 잘 모르겠으면 빈 문자열("") 대신 "어원 정보 없음"이라고 적어라.

5) "story":
   - 초단기 이미지 암기용 한 줄 한국어 스토리.
   - 반드시 한국어 발음을 활용한 비틀기 + 뜻(한국어 뜻)을 함께 떠올릴 수 있는 문장일 것.
   - 영어 단어를 그대로 반복해서 쓰는 스토리는 피하라.
     나쁜 예: "마인드셋(mindset)으로 마음 세팅 완료!" (영어 그대로 넣은 형태)
   - 좋은 예:
     - insight → "인싸(insight)는 다 꿰뚫어봐!"
     - mindset → "마음 셋(mind set)을 제대로 해야 사고방식이 잡힌다."
     - achieve → "야 치브(achieve)! 목표 달성했다!"
   - 스토리는 짧을수록 좋지만, 단어 발음과 뜻을 둘 다 연상 가능해야 한다.
   - 모든 단어는 반드시 story를 채워라. 공백("") 절대 금지.
`.trim();

    // -----------------------------------
    // 2) user 프롬프트
    // -----------------------------------
    const prompt = `
아래 단어 목록을 비슷한 어원/의미끼리 자연스럽게 묶어서 재배열하고,
각 단어마다 rootword와 한국어 발음 기반 이미지 암기 스토리(story)를 작성해라.

주의:
- 출력은 반드시 {"items":[...]} 형식의 JSON 하나만.
- meaning은 아래 목록에 있는 문자열을 그대로 사용해라. (수정 금지)

### 실제 단어 목록 (meaning은 콤마로 구분된 상태임)
${normalizedVocab.map(v => `- ${v.word}: ${v.meaning}`).join('\n')}

출력 예시 형식:
{"items":[{"word":"...","meaning":"...","rootword":"...","story":"..."}, ...]}
(예시는 출력에 포함시키지 마라)
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
        model: 'gpt-4o',   // 🔥 비용 조금 올리고 품질 확 올린 버전
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8
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

    // -----------------------------------
    // 5) 후처리: meaning, rootword, story 보정
    //    - meaning: 항상 우리가 정규화한 값을 사용
    //    - rootword/story: 비어 있으면 기본값 채우기
    // -----------------------------------
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
      const baseMeaning = v.meaning; // 이미 우리가 정규화한 콤마 기반 meaning

      const llmItem = llmMap.get(key) || {};
      let rootword = String(llmItem.rootword || '').trim();
      let story = String(llmItem.story || '').trim();

      if (!rootword) {
        rootword = '어원 정보 없음';
      }
      if (!story) {
        story = `${v.word} : ${baseMeaning} 를(을) 꼭 외우자.`;
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
