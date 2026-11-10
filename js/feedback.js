/* =====================================================================
   피드백 — 피드백용 CSV 만들기, Claude에 줄 프롬프트, 돌려받은 CSV 읽기
   ===================================================================== */
import { ITEMS, ITEM, countWords } from "./items.js?v=20261110a";

/* 피드백용 CSV 열 (마지막 3개를 Claude가 채움) */
export const FB_COLS = {
  sid: "학번", no: "문항 번호", short: "문항",
  answer: "제출 답안", revised: "고쳐 쓴 답안", words: "고쳐 쓴 답안 단어 수",
  checks: "조건 충족(자가 체크)",
  s_task: "과제 점수(자가)", r_task: "과제 근거",
  s_content: "내용 및 구성 점수(자가)", r_content: "내용 및 구성 근거",
  s_lang: "언어 사용 점수(자가)", r_lang: "언어 사용 근거",
  total: "자가채점 합계", max: "만점",
  good: "잘한 점", fix: "고칠 점", rewrite: "고친 문장"
};
const KEYS = Object.keys(FB_COLS);

/* ---------- CSV ---------- */
export function csvCell(v) { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
export function toCsv(rows) { return "﻿" + rows.map(r => r.map(csvCell).join(",")).join("\r\n"); }

/* RFC 4180 CSV 읽기 (따옴표 안 쉼표·줄바꿈 지원) */
export function parseCsv(text) {
  text = String(text || "").replace(/^﻿/, "");
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ""));
}

/* 피드백용 CSV: 자가채점까지 마친 답안만 */
export function buildFeedbackCsv(students, answers, { qids, cls = "all", skipDone = true } = {}) {
  const rows = [KEYS.map(k => FB_COLS[k])];
  const list = Object.values(answers)
    .filter(a => a.gradedAt && (!qids || qids.includes(a.qid)))
    .filter(a => cls === "all" || +String(a.sid).slice(1, 3) === +cls)
    .filter(a => !(skipDone && (a.fbGood || a.fbFix || a.fbRewrite)))
    .sort((a, b) => (a.qid + a.sid).localeCompare(b.qid + b.sid));
  list.forEach(a => {
    const i = ITEM[a.qid], sc = a.scores || {}, rs = a.reasons || {};
    const has = (k) => i.rubric.some(r => r.key === k);
    rows.push([a.sid, i.no, i.short, a.answer || "", a.revised || "", countWords(a.revised),
      (a.checks || []).map((c, n) => `${n + 1}${c ? "○" : "×"}`).join(" "),
      sc.task ?? "", rs.task ?? "",
      has("content") ? (sc.content ?? "") : "해당 없음", has("content") ? (rs.content ?? "") : "",
      sc.lang ?? "", rs.lang ?? "",
      a.selfTotal ?? "", i.points,
      a.fbGood || "", a.fbFix || "", a.fbRewrite || ""]);
  });
  return { csv: toCsv(rows), count: rows.length - 1 };
}

/* 돌려받은 CSV → [{sid, qid, good, fix, rewrite}] + 문제 목록 */
export function readFeedbackCsv(text) {
  const t = parseCsv(text);
  if (!t.length) return { error: "CSV가 비어 있어요." };
  const head = t[0].map(h => String(h).trim());
  const find = (...names) => head.findIndex(h => names.some(n => h === n || h.replace(/\s/g, "") === n.replace(/\s/g, "")));
  const ix = { sid: find("학번"), no: find("문항 번호", "문항번호"), good: find("잘한 점"), fix: find("고칠 점"), rewrite: find("고친 문장") };
  const miss = Object.entries(ix).filter(([, v]) => v < 0).map(([k]) => ({ sid: "학번", no: "문항 번호", good: "잘한 점", fix: "고칠 점", rewrite: "고친 문장" }[k]));
  if (miss.length) return { error: `필요한 열이 없어요: ${miss.join(", ")}` };
  const rows = [], bad = [];
  t.slice(1).forEach((r, n) => {
    const sid = String(r[ix.sid] || "").replace(/\D/g, "");
    const noRaw = String(r[ix.no] || "").trim();
    const no = +noRaw.replace(/^q/i, "").replace(/[^0-9]/g, "");
    const item = ITEMS.find(i => i.no === no);
    if (!/^3\d{4}$/.test(sid) || !item) { bad.push(`${n + 2}행 (학번 ${r[ix.sid] || "?"}, 문항 ${noRaw || "?"})`); return; }
    rows.push({ sid, qid: item.id, good: (r[ix.good] || "").trim(), fix: (r[ix.fix] || "").trim(), rewrite: (r[ix.rewrite] || "").trim() });
  });
  return { rows, bad };
}

/* ---------- 고친 문장 비교 (단어 단위) ---------- */
export function wordDiff(a, b) {
  const tok = (x) => String(x || "").match(/\s+|[A-Za-z0-9'’\-]+|[^\sA-Za-z0-9'’\-]/g) || [];
  const A = tok(a), B = tok(b);
  const n = A.length, m = B.length;
  if (n * m > 400000) return B.map(t => ({ t, add: false }));
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (j < m) {
    if (i < n && A[i] === B[j]) { out.push({ t: B[j], add: false }); i++; j++; }
    else if (i < n && dp[i + 1][j] >= dp[i][j + 1]) i++;
    else { out.push({ t: B[j], add: !/^\s+$/.test(B[j]) }); j++; }
  }
  // 바뀐 단어 사이의 띄어쓰기도 함께 표시해서 한 덩어리로 보이게
  for (let k = 1; k < out.length - 1; k++) if (/^\s+$/.test(out[k].t) && out[k - 1].add && out[k + 1].add) out[k].add = true;
  return out;
}

/* ---------- Claude에 줄 프롬프트 ---------- */
export function buildPrompt() {
  const itemText = ITEMS.map(i => {
    const extra = i.id === "q2" ? "\n- 도표 값(100칼로리 소모에 걸리는 시간): walking 50분, running 13분, jumping rope 18분, walking up stairs 28분\n- 학생은 주어진 글 \"" + i.lead + "\" 다음에 이어질 문장을 씀"
      : i.id === "q4" ? `\n- 주어진 부분: ${i.mail.greeting} / ${i.mail.given} … ${i.mail.closing} [이름]\n- 학생 답안은 주어진 첫 문장 다음부터 쓴 본문만 있음. 단어 수도 본문만 셈\n- 스마트폰 문제점 보기: ${i.problems.join(" / ")}`
      : i.id === "q3" ? `\n- 라디오 진행자 질문: "${i.host}"\n- 찬성 근거: ${i.pros.join(" / ")}\n- 반대 근거: ${i.cons.join(" / ")}`
      : "";
    return `### ${i.no}번. ${i.short} (${i.type}, ${i.points}점)
- 발문: ${i.prompt}${extra}
- 조건:
${i.conditions.map((c, k) => `  ${k + 1}. ${c}`).join("\n")}
- 채점 기준표:
${i.rubric.map(r => `  - ${r.name} (${r.max}점): ${r.levels.map(l => `${l.s}점 = ${l.d}`).join(" / ")}`).join("\n")}
- 채점 시 유의점: ${i.notes.join(" ")}
- 예시 답안: ${i.example}`;
  }).join("\n\n");

  return `# Writing Studio 피드백 작성 요청

당신은 중학교 3학년 영어 쓰기 수업에서 교사를 돕는 피드백 도우미입니다.
첨부한 CSV 파일에는 학생들이 쓴 영어 답안과 자가채점 결과가 한 줄에 하나씩 들어 있습니다.
각 행의 **잘한 점**, **고칠 점**, **고친 문장** 칸을 채워서, 같은 형식의 CSV 파일로 돌려주세요.

## 1. 무엇을 보고 쓰나요
- 피드백의 중심은 **고쳐 쓴 답안**입니다. '제출 답안'은 처음 쓴 답안이니, 고쳐 쓰면서 나아진 점이 있으면 칭찬에 활용하세요.
- **자가채점**(조건 충족 체크, 요소별 점수와 근거)을 아래 채점 기준표와 비교하세요. 어떤 요소에서 학생이 매긴 점수가 기준과 1점 이상 다르다고 판단되면, 고칠 점의 마지막 항목에 한 문장으로 알려 주세요. (예: "자가채점에서 언어 사용을 2점으로 주었는데, 오류가 두 군데 있어서 1점이 기준에 더 가까워요.") 맞게 채점했다면 잘한 점에서 짧게 인정해 주어도 좋아요.
- 새 점수를 매기거나 점수 숫자만 따로 쓰지 마세요.

## 2. 세 칸을 이렇게 써 주세요
- **잘한 점** (1~2문장, 120자 안팎): 학생이 실제로 쓴 영어 표현을 그대로 인용해서 구체적으로 칭찬합니다. "잘했어요"처럼 막연한 말만 쓰지 않습니다.
- **고칠 점** (1~3개, 250자 안팎): 가장 중요한 것부터 ①②③ 번호를 붙입니다. 조건을 충족하지 못한 것이 있으면 맨 앞에 씁니다. 각 항목은 "학생이 쓴 표현 → 고친 표현"과 짧은 이유로 씁니다. 문법 용어는 중학생이 알 만한 수준으로만 씁니다. 항목 사이는 줄바꿈 없이 한 칸 띄웁니다.
- **고친 문장** (영어): 학생의 고쳐 쓴 답안을 바탕으로 문법·철자·어휘 오류만 최소한으로 고친 완성 답안입니다. 학생의 생각, 내용, 어휘 수준을 그대로 살리고 **예시 답안으로 바꿔 쓰지 마세요.** 단어 수 같은 조건이 부족하면 학생 내용에 이어지는 1~2문장을 덧붙여도 됩니다. 고친 곳에 괄호나 표시를 넣지 마세요(웹앱이 바뀐 단어를 자동으로 표시합니다).
- 답안이 비어 있거나 문항과 관계없는 내용이면: 잘한 점은 비워 두고, 고칠 점에 무엇을 써야 하는지 조건을 바탕으로 안내하고, 고친 문장에는 조건을 지킨 짧은 예시를 씁니다.

## 3. 말투
- 다정한 한국어 존댓말(~해요체)로 씁니다. 영어 표현은 원문 그대로 둡니다.
- "틀렸어요" 대신 "~로 바꾸면 더 정확해요"처럼 다음 행동이 보이게 씁니다.
- 학생 이름을 부르지 않고, 다른 학생과 비교하지 않고, 이모지를 쓰지 않습니다.
- 모든 학생에게 비슷한 분량으로 씁니다.

## 4. 결 맞추기 예시 (2번 문항)
- 고쳐 쓴 답안: Running take less time then jumping rope.
- 자가채점: 과제 수행 2점, 언어 사용 2점
- 잘한 점: 비교 표현 less time than을 써서 running과 jumping rope를 도표 내용에 맞게 정확히 비교했어요.
- 고칠 점: ① Running은 하나의 활동이라 동사에 -s를 붙여 take → takes로 써야 해요. ② then(그때)과 than(~보다)은 달라요. 비교할 때는 than을 써요. ③ 자가채점에서 언어 사용을 2점으로 주었는데, 오류가 두 군데 있어서 1점이 기준에 더 가까워요.
- 고친 문장: Running takes less time than jumping rope to burn 100 calories.

## 5. 출력 형식 (꼭 지켜 주세요)
- 입력 CSV와 **같은 열, 같은 순서, 같은 행 수**로 돌려주세요. 학번, 문항 번호를 비롯한 다른 칸은 한 글자도 바꾸지 않습니다.
- 모든 행을 빠짐없이 처리하세요. 행이 많아도 생략하거나 "이하 같음"으로 줄이지 않습니다.
- UTF-8 CSV로, 쉼표·큰따옴표·줄바꿈이 들어간 칸은 큰따옴표로 감쌉니다.
- 결과는 \`피드백_완료.csv\` 파일로 내려받을 수 있게 만들어 주세요. 채팅창에 CSV 내용을 길게 붙여 넣지 말고, 몇 행을 처리했는지와 눈에 띈 공통 오류 2~3가지만 짧게 알려 주세요.

## 6. 문항별 정보

${itemText}
`;
}
