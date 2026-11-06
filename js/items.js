/* =====================================================================
   문항 데이터 — 발문, 조건, 채점 기준표, 예시 답안
   kind: "plain" | "chart" | "radio" | "mail"  (문제 화면 모양)
   rubric[].key : task(과제) · content(내용 및 구성) · lang(언어 사용)
   rubric[0]은 조건 체크 개수로 점수가 자동으로 정해집니다 (fromChecks).
   caps: 과제 점수가 maxTask 이하이면 limit의 요소는 최대 to점까지만
   ===================================================================== */

const LANG = {
  key: "lang", name: "언어 사용", max: 2,
  levels: [
    { s: 2, d: "언어 형식과 철자에서 오류가 거의 없으며, 적절한 어휘를 정확하게 사용함." },
    { s: 1, d: "언어 형식과 철자에서 오류가 다소 있으며, 일부 어휘 선택이 부적절하나 내용 전달이 가능함." },
    { s: 0, d: "언어 형식과 철자에서 오류가 많고, 일부 어휘 선택이 부적절하여 내용 전달에 지장이 있음." }
  ]
};

const COMMON_NOTES = [
  "대소문자 구분, 구두점의 유무는 평가 대상에서 제외한다.",
  "답안을 작성하지 않았거나 무관한 내용을 작성하였을 때에는 0점을 부여한다."
];

export const ITEMS = [
  /* ---------------- 1. 3Rs ---------------- */
  {
    id: "q1", no: 1, short: "3Rs 실천 방법", type: "서술형", points: 6,
    color: "#34c759", glyph: "♻︎", kind: "plain",
    standards: ["[9영03-02] 일상생활이나 친숙한 일반적 대상이나 주제에 관한 글을 읽고 세부 정보를 파악할 수 있다.",
                "[9영04-05] 자신이나 주변 사람, 일상생활에 관해 짧고 간단한 글을 쓸 수 있다."],
    prompt: "다음 글을 읽고, 3Rs(Reduce, Reuse, Recycle) 중 한 가지를 선택하여, 이를 일상생활에서 실천할 수 있는 방법을 <조건>에 맞게 쓰시오.",
    passageHtml: `
      <p>Do you know about the 3Rs? Three ways everyone can help make the Earth a green place are <b>Reduce</b>, <b>Reuse</b> and <b>Recycle</b>!</p>
      <div class="r3">
        <div class="r3c" style="--c:#34c759"><div class="r3h">Reduce</div><p>Reduce means to use less of something; for example...</p>
          <ul><li>walking to school reduces pollution</li><li>turning off the lights before you leave saves energy</li></ul></div>
        <div class="r3c" style="--c:#0a84ff"><div class="r3h">Reuse</div><p>Reuse is to use again things we already have.</p>
          <ul><li>taking your own bags when shopping at the marketplace</li><li>using the two sides of the paper before taking a new one</li></ul></div>
        <div class="r3c" style="--c:#ff9f0a"><div class="r3h">Recycle</div><p>Recycle means to turn old materials into new one. Some everyday things are made from recycled materials.</p>
          <ul><li>cereal boxes are made from recycled paper</li><li>old glass bottles can be recycled into new ones</li></ul></div>
      </div>`,
    conditions: [
      "3Rs 중 어떤 것을 선택하였는지를 명시할 것",
      "3Rs(Reduce, Reuse, Recycle) 중 선택한 한 가지를 일상생활에서 실천할 수 있는 현실적인 방법을 구체적으로 제시할 것"
    ],
    placeholder: "To reduce, I can …",
    rubric: [
      { key: "task", name: "과제 완성", max: 2, fromChecks: true, levels: [
        { s: 2, d: "2가지 조건 모두를 충족시켜 답안을 작성함." },
        { s: 1, d: "2가지 조건 중 1가지 조건만을 충족시켜 답안을 작성함." },
        { s: 0, d: "모든 조건을 충족시키지 못함." }]},
      { key: "content", name: "내용 및 구성", max: 2, levels: [
        { s: 2, d: "3Rs 중 선택한 한 가지를 실천하기 위한 현실적 방안이 구체적이며 논리적으로 타당함." },
        { s: 1, d: "3Rs 중 선택한 한 가지를 실천하기 위한 현실적 방안을 제시하였으나, 구체성이 부족하거나 논리적 타당성이 다소 미흡함." },
        { s: 0, d: "3Rs 중 선택한 한 가지를 실천하기 위한 현실적 방안이 구체적이지 않으며 논리적으로 타당하지 않음." }]},
      LANG
    ],
    caps: { maxTask: 1, limit: ["lang"], to: 1, text: "과제 완성 점수가 1점 이하이면 언어 사용 점수는 0점 또는 1점만 줄 수 있어요." },
    notes: [...COMMON_NOTES, "과제 완성 점수가 1점인 경우, 언어 사용 점수는 0점 또는 1점을 부여한다."],
    example: "To reuse, I can use a water bottle every day instead of buying single-use plastic bottles."
  },

  /* ---------------- 2. 도표 ---------------- */
  {
    id: "q2", no: 2, short: "도표 비교 문장", type: "서술형", points: 4,
    color: "#ff9f0a", glyph: "▥", kind: "chart",
    standards: ["[9영03-03] 일상생활이나 친숙한 일반적 주제의 그림, 사진, 또는 도표에 관한 글을 읽고 세부 정보를 파악할 수 있다.",
                "[9영04-03] 일상생활에 관한 그림, 사진, 또는 도표 등을 설명하는 문장을 쓸 수 있다."],
    prompt: "다음 도표를 설명하는 글을 <조건>에 맞게 완성하시오.",
    lead: "The chart above shows the time in minutes needed to burn 100 calories for each activity: walking, running, jumping rope, and walking up stairs. Walking takes the longest time to burn 100 calories.",
    conditions: [
      "walking, running, jumping rope, walking up stairs 중 두 가지를 선택하여 서로 비교하는 문장을 작성할 것",
      "도표의 내용과 일치하도록 작성할 것"
    ],
    placeholder: "이어질 문장을 영어로 써 보세요.",
    rubric: [
      { key: "task", name: "과제 수행", max: 2, fromChecks: true, levels: [
        { s: 2, d: "2가지 조건을 모두 충족하여 작성함." },
        { s: 1, d: "2가지 조건 중 1가지 조건만을 충족하여 작성함." },
        { s: 0, d: "모든 조건을 충족하지 못함." }]},
      LANG
    ],
    caps: { maxTask: 1, limit: ["lang"], to: 1, text: "과제 수행 점수가 1점 이하이면 언어 사용 점수는 0점 또는 1점만 줄 수 있어요." },
    notes: [...COMMON_NOTES, "과제 수행 점수가 1점인 경우, 언어 사용 점수는 0점 또는 1점을 부여한다."],
    example: "Jumping rope takes less time than walking up stairs to burn 100 calories."
  },

  /* ---------------- 3. 교복 ---------------- */
  {
    id: "q3", no: 3, short: "교복 찬반 인터뷰", type: "논술형", points: 8,
    color: "#af52de", glyph: "☎︎", kind: "radio", minWords: 40,
    standards: ["[9영03-04] 일상생활이나 친숙한 일반적 주제의 글을 읽고 줄거리, 주제, 요지를 파악할 수 있다.",
                "[9영04-02] 일상생활에 관한 자신의 의견이나 감정을 표현하는 문장을 쓸 수 있다."],
    prompt: "다음은 교복 착용에 관한 학생들의 찬반 의견의 근거이다. 전화 인터뷰의 빈칸에 들어갈 말을 <조건>에 맞게 영어로 쓰시오.",
    pros: ["교복은 학생들이 매일 입을 옷을 고민하는 시간을 줄여 준다.",
           "학생들 사이의 경제적 차이가 겉으로 드러나는 것을 줄일 수 있다.",
           "학교에 대한 소속감과 공동체 의식을 높여 줄 수 있다."],
    cons: ["교복은 학생들의 개성과 자기 표현의 자유를 제한할 수 있다.",
           "디자인이나 재질에 따라 오래 입으면 불편하거나 활동하기 불편할 수 있다.",
           "계절이나 날씨 변화에 맞게 자유롭게 옷을 조절해 입기 어려운 경우가 있다."],
    host: "Welcome back to Teen Talk on EBC Radio. Today, we're talking about school uniforms. We have our first caller now. Hello. Can you introduce yourself and tell us what you think about school uniforms?",
    conditions: [
      "자신을 ‘어디에 사는 누구인지’ 간단히 소개할 것",
      "교복 착용에 대한 찬성 또는 반대 입장 중 하나를 선택하여 그 이유를 쓸 것",
      "40단어 이상으로 작성할 것"
    ],
    autoWordsCond: 2,
    placeholder: "Hi, I'm … from …",
    rubric: [
      { key: "task", name: "과제 완성", max: 3, fromChecks: true, levels: [
        { s: 3, d: "3가지 조건 모두를 충족시켜 인터뷰 글을 완성함." },
        { s: 2, d: "3가지 조건 중 2가지 조건만을 충족시켜 인터뷰 글을 완성함." },
        { s: 1, d: "3가지 조건 중 1가지 조건만을 충족시켜 인터뷰 글을 완성함." },
        { s: 0, d: "모든 조건을 충족시키지 못함." }]},
      { key: "content", name: "내용 및 구성", max: 3, levels: [
        { s: 3, d: "교복 착용에 관한 자신의 주장과 근거를 명확하게 제시하였으며, 논리의 흐름이 매끄럽고 자연스러움." },
        { s: 2, d: "교복 착용에 관한 자신의 주장과 근거를 비교적 명확하게 제시하였으며, 논리의 흐름이 비교적 자연스러움." },
        { s: 1, d: "교복 착용에 관한 자신의 주장과 근거를 제시하고 있으나, 논리 연결이 다소 부족함." },
        { s: 0, d: "자신의 주장과 근거가 불분명하거나 관련성이 약함." }]},
      LANG
    ],
    caps: { maxTask: 2, limit: ["content", "lang"], to: 1, text: "과제 완성 점수가 2점 이하이면 내용 및 구성, 언어 사용 점수는 0점 또는 1점만 줄 수 있어요." },
    notes: [...COMMON_NOTES, "과제 완성 점수가 2점 이하인 경우, 내용 및 구성 점수와 언어 사용 점수는 0점 또는 1점을 부여한다."],
    example: "Hi, I’m Minji Kim from Busan, and I’m a middle school student. I agree with wearing school uniforms. School uniforms help students feel equal and save time in the morning. Also, students do not need to spend much money on clothes for school every day."
  },

  /* ---------------- 4. 이메일 ---------------- */
  {
    id: "q4", no: 4, short: "고객센터 문의 이메일", type: "논술형", points: 8,
    color: "#0a84ff", glyph: "✉︎", kind: "mail", minWords: 50,
    standards: ["[9영04-06] 간단한 초대, 감사, 축하, 위로, 일기, 편지 등의 글을 쓸 수 있다."],
    prompt: "일주일 전에 구매한 스마트폰에 문제가 생겨, 이에 대해 고객센터(Customer Service Center)에 이메일을 쓰고자 한다. 이메일을 <조건>에 맞게 작성하시오.",
    problems: ["앱의 실행 속도가 지나치게 느림",
               "터치스크린의 일부가 터치에 반응하지 않음",
               "스마트폰을 충전해도 배터리가 100%까지 충전되지 않음"],
    mail: {
      to: "service@mobilehelp-center.com",
      subject: "Problem with My Smartphone",
      greeting: "Dear Customer Service Center,",
      given: "I bought my new smartphone from your store a week ago, but there is already a problem with it.",
      closing: "Best regards,"
    },
    conditions: [
      "다음 중 하나를 골라 일주일 전에 구매한 스마트폰의 문제점을 구체적으로 설명할 것",
      "고객센터에 스마트폰의 교환 방법을 문의할 것",
      "이메일을 마무리하는 인사말을 포함할 것",
      "50단어 이상 작성할 것"
    ],
    autoWordsCond: 3,
    placeholder: "주어진 첫 문장 다음부터 이어서 써 보세요.",
    rubric: [
      { key: "task", name: "과제 완성", max: 4, fromChecks: true, levels: [
        { s: 4, d: "4가지 조건 모두를 충족시켜 이메일을 작성함." },
        { s: 3, d: "4가지 조건 중 3가지 조건만을 충족시켜 이메일을 작성함." },
        { s: 2, d: "4가지 조건 중 2가지 조건만을 충족시켜 이메일을 작성함." },
        { s: 1, d: "4가지 조건 중 1가지 조건만을 충족시켜 이메일을 작성함." },
        { s: 0, d: "모든 조건을 충족시키지 못함." }]},
      { key: "content", name: "내용 및 구성", max: 2, levels: [
        { s: 2, d: "이메일의 형식을 잘 갖추고 있으며, 스마트폰의 문제점을 구체적으로 설명하고 교환 방법을 자세히 문의하는 내용의 이메일을 작성함." },
        { s: 1, d: "이메일의 구조를 잘 갖추고 있으나, 스마트폰의 문제점을 구체적으로 설명하지 못하였거나 교환 방법을 자세히 문의하지 못함." },
        { s: 0, d: "이메일의 형식을 제대로 갖추지 못하였고, 스마트폰의 문제점 설명 및 교환 방법 문의가 미흡함." }]},
      LANG
    ],
    caps: { maxTask: 2, limit: ["content", "lang"], to: 1, text: "과제 완성 점수가 2점 이하이면 내용 및 구성, 언어 사용 점수는 0점 또는 1점만 줄 수 있어요." },
    notes: [...COMMON_NOTES, "과제 완성 점수가 2점 이하인 경우, 내용 및 구성 점수와 언어 사용 점수는 0점 또는 1점을 부여한다."],
    example: "The phone is very slow, and some apps suddenly close while I am using them. This problem makes using the phone very difficult. I have tried restarting the phone several times, but the problem still continues. Could you please tell me how I can exchange the smartphone and what steps I need to follow? Thank you for your help.",
    exampleName: "Sumi Kim",
    wordNote: "단어 수는 주어진 첫 문장을 빼고 내가 쓴 부분만 셉니다."
  }
];

export const ITEM = Object.fromEntries(ITEMS.map(i => [i.id, i]));

/* 영어 단어 수 */
export function countWords(s) {
  return ((s || "").match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g) || []).length;
}

/* 과제 점수 = 충족한 조건 수 */
export function taskFromChecks(checks) { return (checks || []).filter(Boolean).length; }

/* 상한 적용 후 각 요소의 최대 점수 */
export function capFor(item, key, scores) {
  const c = item.caps;
  if (!c || !c.limit.includes(key)) return null;
  const t = scores && typeof scores.task === "number" ? scores.task : null;
  return t !== null && t <= c.maxTask ? c.to : null;
}

export function totalOf(item, scores) {
  return item.rubric.reduce((a, r) => a + (typeof scores?.[r.key] === "number" ? scores[r.key] : 0), 0);
}
