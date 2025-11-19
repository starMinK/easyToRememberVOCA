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
    // 0) meaning 정규화
    //    - 구분자들을 콤마(,)로 정리
    //    - "마음가짐  사고방식" 같은 2칸 이상 공백도 콤마 처리
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
    // 1) system 메시지 (5.1 스타일 스토리용)
    // -----------------------------------
    const systemMessage = `
You are a Korean mnemonic generator specializing in ultra-short, fun memory stories for English vocabulary.

다음 규칙을 반드시 지켜라:

[출력 형식]
- 출력은 오직 하나의 JSON:
  {"items":[{"word":"...","meaning":"...","rootword":"...","story":"..."}, ...]}
- JSON 바깥에 인사, 설명, 주석, 텍스트를 절대 쓰지 마라.

[필드 규칙]
1) word
   - 입력으로 받은 영어 단어를 그대로 사용.
2) meaning
   - 입력으로 받은 meaning 문자열을 그대로 사용.
   - 의미를 추가/삭제/수정하지 마라.
3) rootword
   - 알맞은 어원이 있을 경우, (어근)뜻 형식을 사용해 간단히 적어라.
     예: "(civis)시민,(al)형용사형" / "(optio)선택"
   - 명확한 어원을 모르겠으면 "어원 정보 없음"으로 적어라.
   - 대충 지어낸 어원은 쓰지 마라.
4) story (가장 중요)
   - 무조건 한 줄짜리 한국어 문장으로 작성.
   - 절대 비워 두지 마라. story는 항상 최소 1개 이상 단어가 들어간다.
   - 학생이 단어를 떠올리기 쉽게, "발음 + 뜻"이 함께 연상되도록 만든다.
   - 구조:
     - 영어 단어와 비슷하게 들리는 한국어 표현 + (영단어)
     - 그 표현이 의미(meaning)와 자연스럽게 연결되는 짧은 상황·이미지 문장
   - 예시 톤:
     - "옵션(Option)이 많아서 뭐 고를지 고민이야."  → 선택/선택권
     - "인싸(Insight)는 남들보다 통찰력이 좋아."    → 통찰력
     - "얼티밋(Ultimate) 스킬은 진짜 궁극기 느낌이야." → 궁극적인
   - 사용할 수 있는 요소:
     - 한국어 단어/표현 + (영단어) 조합
     - 짧은 대화체, 일상 상황, 감정 표현
   - 금지 사항:
     - "뜻을 외우자", "꼭 기억해라", "암기하자" 같은 메타 문장.
     - "X는 Y이다."식의 건조한 정의 설명만 있는 문장.
     - 영어 알파벳 나열 (스펠링 설명) 을 문장에 쓰는 것.
   - 허용 사항:
     - 영단어의 발음을 한글로 자연스럽게 비틀어 쓰는 것 (옵션, 인싸, 얼티밋 등).
     - 한글 발음 옆에 (word)를 붙여서 단어를 같이 보여 주는 것.
   - 길이:
     - 가능한 한 짧고 임팩트 있게 (한 문장, 25자 내외 느낌).
`.trim();

    // -----------------------------------
    // 2) user 프롬프트
    //    - 비슷한 의미/어원끼리 묶어서 "순서"만 재배열
    // -----------------------------------
    const prompt = `
아래 단어 목록을 보고 다음 작업을 수행하라.

1) 같은 어원(rootword)을 공유하거나, 의미(meaning)가 비슷한 단어끼리는
   JSON 배열 안에서 서로 "연속되도록" 순서를 재배열하라.
   - 별도의 그룹 ID는 만들 필요 없다.
   - 단지 비슷한 단어들이 붙어 있도록 items 배열의 순서만 조정하면 된다.

2) 각 단어에 대해 다음 필드를 채워라:
   - word: 입력과 동일
   - meaning: 입력에서 제공된 문자열을 그대로 사용 (수정 금지)
   - rootword: 알맞은 어원이 있으면 (어근)뜻 형식으로, 없으면 "어원 정보 없음"
   - story: 위 규칙에 따라 한 줄짜리 한국어 스토리 작성 (절대 비우지 말 것)

[실제 단어 목록]
${normalizedVocab.map(v => `- ${v.word}: ${v.meaning}`).join('\n')}

반드시 아래 형식으로만 출력하라:
{"items":[{"word":"...","meaning":"...","rootword":"...","story":"..."}, ...]}
`.trim();

    // -----------------------------------
    // 3) OpenAI 호출 (1차: 전체 리스트 처리)
    // -----------------------------------
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',  // 스토리 자연스러움용
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8, // 너가 원하던 자연스러움
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

    // -----------------------------------
    // 5) word → LLM item 매핑
    //    (소문자 기준 1:1 매핑, 먼저 나온 것 우선)
    // -----------------------------------
    const llmMap = new Map();
    llmItems.forEach((it) => {
      const w = String(it.word || '').trim().toLowerCase();
      if (!w) return;
      if (!llmMap.has(w)) {
        llmMap.set(w, it);
      }
    });

    // -----------------------------------
    // 6) story가 비었거나 너무 이상한 경우를 위해
    //    단일 단어 재생성용 helper (GPT 한 번 더 호출)
    // -----------------------------------
    async function regenerateStory(word, meaning) {
      const singlePrompt = `
영어 단어 하나에 대해 초단기 이미지 암기용 스토리를 만들어라.

[규칙]
- 출력은 반드시 JSON 하나:
  {"word":"${word}","story":"..."}
- story는 한 줄짜리 한국어 문장.
- ${word}의 의미: "${meaning}"
- 한국어 표현 + (${word})를 섞어서, 발음과 의미가 동시에 떠오르도록 만들어라.
- "뜻을 외우자", "기억하자", "암기하자" 등의 메타 문장은 쓰지 마라.
- 정의 설명이 아니라 짧은 상황/이미지/감정이 느껴지는 문장으로 만들어라.

예시 톤:
- "옵션(Option)이 너무 많아서 뭐 고를지 고민된다."
- "인싸(Insight)는 남들보다 통찰력이 남다르다."
- "얼티밋(Ultimate) 스킬 쓸 때가 진짜 마지막 한 방이지."
      `.trim();

      try {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content:
                  'You are a Korean mnemonic story generator. 출력은 항상 {"word":"...","story":"..."} JSON 한 개만 생성한다.'
              },
              { role: 'user', content: singlePrompt }
            ],
            temperature: 0.9
          })
        });

        const j = await r.json();
        if (!r.ok) {
          console.warn('regenerateStory OpenAI error:', j);
          return '';
        }

        let txt = (j.choices?.[0]?.message?.content || '').trim();
        txt = txt
          .replace(/^```json/i, '')
          .replace(/^```/i, '')
          .replace(/```$/, '')
          .trim();

        const parsed = JSON.parse(txt);
        const s = String(parsed.story || '').trim();
        return s;
      } catch (e) {
        console.error('regenerateStory error:', e);
        return '';
      }
    }

    // -----------------------------------
    // 7) 최종 items 생성
    //    - meaning: 우리가 정규화한 값
    //    - rootword/story: LLM 값 사용, 없으면 보정
    // -----------------------------------
    const finalItems = [];

    for (const v of normalizedVocab) {
      const key = v.word.toLowerCase();
      const baseMeaning = v.meaning;
      const llmItem = llmMap.get(key) || {};

      let rootword = String(llmItem.rootword || '').trim();
      let story = String(llmItem.story || '').trim();

      if (!rootword) {
        rootword = '어원 정보 없음';
      }

      // story가 비었거나, 너무 짧거나, "외우자/기억/암기" 같은 메타 문장일 때
      const badMeta = /(외우자|기억하|암기하)/;
      if (!story || story.length < 3 || badMeta.test(story)) {
        const regenerated = await regenerateStory(v.word, baseMeaning);
        if (regenerated && regenerated.length >= 3 && !badMeta.test(regenerated)) {
          story = regenerated.trim();
        }
      }

      finalItems.push({
        word: v.word,
        meaning: baseMeaning,
        rootword,
        story
      });
    }

    return res.status(200).json({ items: finalItems });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
