import { ITEMS, ITEM, countWords, taskFromChecks, capFor, totalOf } from "./items.js?v=20261106b";
import * as S from "./store.js?v=20261106b";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SESSION = "english-writing-session";
const GDRAFT = "english-writing-grade";

const st = {
  me: null,            // {sid, name, cls}
  open: {},            // 공개된 문항
  ans: {},             // qid -> doc
  view: "home",
  saveTimer: null,
  saving: false,
  g: null              // 자가채점 중인 상태 {qid, checks, scores, reasons, revised}
};

/* ---------------- 공통 UI ---------------- */
function toast(t, m = "", icon = "✓", color = "#0a84ff") {
  $("#toastT").textContent = t; $("#toastM").textContent = m;
  $("#toastI").textContent = icon; $("#toastI").style.background = color;
  const el = $("#toast"); el.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("show"), 3200);
}
function loading(on, t = "불러오는 중…") { $("#loadingT").textContent = t; $("#loading").classList.toggle("show", on); }
function sheet(html, { wide = false } = {}) {
  const box = $("#sheetBox"); box.className = "sheet" + (wide ? " wide" : ""); box.innerHTML = html;
  $("#sheet").classList.add("show");
  return box;
}
function closeSheet() { $("#sheet").classList.remove("show"); }
function confirmSheet({ icon = "📝", title, msg, ok = "확인", cancel = "취소", danger = false }) {
  return new Promise(res => {
    const b = sheet(`<div class="big">${icon}</div><h3>${title}</h3><p>${msg}</p>
      <div class="btns"><button class="pill ghost" data-r="0">${cancel}</button><button class="pill ${danger ? "red" : ""}" data-r="1">${ok}</button></div>`);
    b.querySelectorAll("[data-r]").forEach(x => x.onclick = () => { closeSheet(); res(x.dataset.r === "1"); });
  });
}
function setSave(t) { $("#saveStatus").textContent = t; }

/* 메뉴 */
document.addEventListener("click", e => {
  const mi = e.target.closest("[data-menu]");
  $$(".mi.open").forEach(x => { if (x !== mi) x.classList.remove("open"); });
  if (mi && !e.target.closest(".dropdown")) mi.classList.toggle("open");
  const act = e.target.closest("[data-act]");
  if (act) { $$(".mi.open").forEach(x => x.classList.remove("open")); doAct(act.dataset.act); }
});
function doAct(a) {
  if (a === "theme") { const d = document.documentElement; const on = d.dataset.theme !== "dark"; d.dataset.theme = on ? "dark" : ""; localStorage.setItem("ew-theme", on ? "dark" : ""); }
  if (a === "home" && st.me) go("home");
  if (a === "logout") logout();
  if (a === "admin") adminLogin();
}
if (localStorage.getItem("ew-theme") === "dark") document.documentElement.dataset.theme = "dark";

/* 관리자 모드 */
function adminLogin() {
  if (S.teacherSession()) { location.href = "teacher.html"; return; }
  const b = sheet(`<div class="big">🔐</div><h3>관리자 모드</h3><p>교사 암호를 입력하세요.</p>
    <form id="admF"><input class="field" id="admPw" type="password" inputmode="numeric" autocomplete="off" placeholder="교사 암호" style="text-align:center;font-size:16px;letter-spacing:.3em">
    <div class="err" id="admErr" style="color:#ff3b30;font-size:12px;min-height:16px;margin-top:6px;text-align:center"></div>
    <div class="btns"><button type="button" class="pill ghost" id="admNo">취소</button><button class="pill" id="admOk">들어가기</button></div></form>`);
  const pw = b.querySelector("#admPw"); setTimeout(() => pw.focus(), 50);
  b.querySelector("#admNo").onclick = closeSheet;
  b.querySelector("#admF").onsubmit = async (e) => {
    e.preventDefault();
    const ok = b.querySelector("#admOk"); ok.disabled = true; b.querySelector("#admErr").textContent = "";
    try { await flushSave(); await S.teacherLogin(pw.value.trim()); location.href = "teacher.html"; }
    catch (err) { b.querySelector("#admErr").textContent = err.code === "wrong-password" ? "암호가 맞지 않아요." : "연결에 실패했어요. 다시 시도하세요."; pw.select(); }
    finally { ok.disabled = false; }
  };
}

/* 시계 */
function tick() {
  const d = new Date();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  $("#clock").textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]}) ${d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })}`;
  $("#lkDate").textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`;
  $("#lkTime").textContent = `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")}`;
}
tick(); setInterval(tick, 10000);

/* ---------------- 로그인 ---------------- */
const normName = (s) => (s || "").replace(/\s+/g, "").trim();
function lkMsg(t, err = false) { const m = $("#lkMsg"); m.innerHTML = t; m.classList.toggle("err", err); }

$("#lkSid").addEventListener("input", e => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 5); });
$("#lkForm").addEventListener("submit", async e => {
  e.preventDefault();
  const sid = $("#lkSid").value.trim(), name = normName($("#lkName").value);
  if (!/^3\d{4}$/.test(sid) || +sid.slice(1, 3) < 1 || +sid.slice(3) < 1) return lkMsg("학번 5자리를 확인하세요. (예: 30701)", true);
  if (name.length < 2) return lkMsg("이름을 입력하세요.", true);
  $("#lkGo").disabled = true; lkMsg('<span class="spinner"></span>');
  try {
    const r = await S.lookupStudent(sid);
    if (r.exists) {
      if (normName(r.name) !== name) { lkMsg(`${sid}은(는) 다른 이름으로 등록되어 있어요.<br>학번을 다시 확인하고, 맞다면 선생님께 말씀하세요.`, true); return; }
      await enter({ sid, name: r.name });
    } else {
      const ok = await confirmSheet({ icon: "👋", title: "처음 오셨네요!",
        msg: `<b>3학년 ${+sid.slice(1, 3)}반 ${+sid.slice(3)}번 ${esc(name)}</b>(으)로 등록할까요?<br>등록한 뒤에는 학번과 이름을 바꿀 수 없어요.`, ok: "등록하기" });
      if (!ok) { lkMsg(""); return; }
      try { await S.createStudent(sid, name); }
      catch (err) { if (err.code === "name-mismatch") { lkMsg(`${sid}은(는) 방금 다른 이름으로 등록되었어요.<br>선생님께 말씀하세요.`, true); return; } throw err; }
      await enter({ sid, name });
    }
  } catch (err) {
    console.error(err);
    lkMsg(err.code === "bad-name" ? "이름은 2~12글자로 입력하세요." : "연결에 실패했어요. 와이파이를 확인하고 다시 시도하세요.", true);
  } finally { $("#lkGo").disabled = false; }
});

let unSettings = null;
async function enter(me) {
  st.me = { ...me, cls: S.classOf(me.sid) };
  localStorage.setItem(SESSION, JSON.stringify({ sid: me.sid, name: me.name }));
  loading(true);
  try { st.ans = await S.getMyAnswers(me.sid, ITEMS.map(i => i.id), me.name); }
  catch (e) { console.error(e); st.ans = {}; toast("답안을 불러오지 못했어요", "새로고침해 보세요.", "!", "#ff3b30"); }
  loading(false);
  $("#login").classList.remove("show");
  $("#win").classList.add("show");
  $("#avatar").textContent = me.name.slice(-2);
  $("#meName").textContent = me.name;
  $("#meId").textContent = `3학년 ${st.me.cls}반 ${S.numOf(me.sid)}번 · ${me.sid}`;
  $("#sideFoot").innerHTML = S.isLocal() ? '<span class="local-badge">로컬 모드</span><br>이 기기에만 저장돼요.' : "답안은 자동으로 저장돼요.<br>문항 공개 상태는 30초마다 확인해요.";
  unSettings && unSettings();
  unSettings = S.watchSettings(s => {
    const prev = st.open; st.open = s.open || {};
    const newly = ITEMS.filter(i => st.open[i.id] && !prev[i.id] && Object.keys(prev).length);
    if (newly.length) toast("새 문항이 열렸어요", newly.map(i => `${i.no}. ${i.short}`).join(", "), "🔓", "#34c759");
    renderNav();
    if (st.view === "home") renderHome();
    else if (!isSubmitted(st.view) && !!prev[st.view] !== !!st.open[st.view]) renderItem(st.view);
  });
  go("home");
}

async function logout() {
  if (!st.me) return;
  await flushSave();
  const ok = await confirmSheet({ icon: "👋", title: "로그아웃할까요?", msg: "쓰던 답안은 저장되어 있어요.", ok: "로그아웃" });
  if (!ok) return;
  localStorage.removeItem(SESSION);
  unSettings && unSettings(); unSettings = null;
  await S.signOutStudent();
  st.me = null; st.ans = {}; st.view = "home";
  $("#win").classList.remove("show");
  $("#lkSid").value = ""; $("#lkName").value = ""; lkMsg("");
  $("#login").classList.add("show");
  setSave("");
}

/* ---------------- 상태 ---------------- */
const isSubmitted = (q) => !!(st.ans[q] && st.ans[q].submittedAt);
function status(q) {
  const a = st.ans[q];
  if (a && a.gradedAt) return { k: "done", t: `✓ ${a.selfTotal}/${ITEM[q].points}` };
  if (a && a.submittedAt) return { k: "sub", t: "자가채점" };
  if (!st.open[q]) return { k: "lock", t: "🔒" };
  if (a && (a.answer || "").trim()) return { k: "draft", t: "작성 중" };
  return { k: "new", t: "" };
}
const canView = (q) => st.open[q] || isSubmitted(q);
const badge = (s) => s.t ? `<span class="badge ${s.k}">${s.t}</span>` : "";

function renderNav() {
  $("#navItems").innerHTML = ITEMS.map(i => {
    const s = status(i.id);
    return `<button data-go="${i.id}" class="${st.view === i.id ? "active" : ""} ${canView(i.id) ? "" : "locked"}">
      <span class="ico" style="background:${i.color}">${i.glyph}</span><span class="lbl">${i.no}. ${esc(i.short)}</span>${badge(s)}</button>`;
  }).join("");
  $("#navHome").classList.toggle("active", st.view === "home");
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-go]"); if (!b) return;
  const q = b.dataset.go;
  if (q !== "home" && !canView(q)) { toast("아직 열리지 않은 문항이에요", "선생님이 열어 주시면 풀 수 있어요.", "🔒", "#8e8e93"); return; }
  go(q);
});
async function go(v) {
  await flushSave();
  st.view = v; st.g = null;
  renderNav();
  if (v === "home") renderHome(); else renderItem(v);
  $("#content").scrollTop = 0;
}

/* ---------------- 홈 ---------------- */
function renderHome() {
  $("#toolbar").innerHTML = `<h1>오늘의 쓰기</h1>${S.isLocal() ? '<span class="local-badge">로컬 모드</span>' : ""}`;
  const openCnt = ITEMS.filter(i => canView(i.id)).length;
  $("#page").innerHTML = `
    <div class="hero"><div class="ico" style="background:linear-gradient(145deg,#5ac8fa,#0a84ff)">✎</div>
      <div><h2>${esc(st.me.name)}, 안녕하세요!</h2><p>선생님이 연 문항을 풀고 제출한 뒤, 예시 답안과 채점 기준표로 스스로 채점해 보세요.</p></div></div>
    <div class="banner gray"><div class="ico" style="background:#8e8e93">i</div>
      <div><b>① 쓰기 → ② 제출하기 → ③ 예시 답안·채점 기준 보기 → ④ 자가채점·고쳐 쓰기</b>
      제출한 답안은 고칠 수 없어요. 대신 자가채점 단계에서 고쳐 쓴 답안을 따로 남길 수 있어요.</div></div>
    <div class="gtitle">문항 <span class="r">${openCnt}개 열림</span></div>
    <div class="cards">${ITEMS.map(i => {
      const s = status(i.id), v = canView(i.id);
      return `<button class="qcard ${v ? "" : "locked"}" data-go="${i.id}">
        <div class="top"><span class="ico" style="background:${i.color}">${i.glyph}</span>
          <div><div class="tt">${i.no}. ${esc(i.short)}</div><div class="meta">${i.type} · ${i.points}점</div></div>
          ${badge(s.k === "new" ? { k: "draft", t: "시작하기" } : s.k === "lock" ? { k: "lock", t: "🔒 잠김" } : s)}</div>
        <div class="desc">${esc(i.prompt)}</div></button>`;
    }).join("")}</div>`;
}

/* ---------------- 문제 영역 ---------------- */
function condHtml(i) {
  return `<div class="cond"><div class="t">&lt;조건&gt;</div><ol>${i.conditions.map((c, k) =>
    `<li>${esc(c)}${i.problems && k === 0 ? `<ul>${i.problems.map(p => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}</li>`).join("")}</ol></div>`;
}
function problemHtml(i) {
  let h = `<p class="prompt">${esc(i.prompt)}<span class="pts">[${i.points}점]</span></p>`;
  if (i.kind === "plain") h += `<div class="gtitle">읽기 자료</div><div class="passage">${i.passageHtml}</div>`;
  if (i.kind === "chart") h += `<div class="gtitle">도표</div><div class="chart"><img src="assets/chart.jpg" alt="100칼로리를 소모하는 데 걸리는 시간: walking 50분, running 13분, jumping rope 18분, walking up stairs 28분"></div>`;
  if (i.kind === "radio") h += `<div class="gtitle">교복 착용에 관한 찬반 의견의 근거</div><div class="pc">
      <div class="pro"><h4>👍 찬성</h4><ul>${i.pros.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div class="con"><h4>👎 반대</h4><ul>${i.cons.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div></div>`;
  h += `<div class="gtitle">조건</div>${condHtml(i)}`;
  return h;
}

/* 답안 입력 영역 (kind별) */
function editorHtml(i, a, ro) {
  const v = esc(a?.answer || ""), r = ro ? "readonly" : "";
  if (i.kind === "plain") return `<textarea class="area" id="ed" ${r} spellcheck="false" placeholder="${esc(i.placeholder)}">${v}</textarea>`;
  if (i.kind === "chart") return `<p class="lead-in">${esc(i.lead)}</p><textarea class="area" id="ed" ${r} spellcheck="false" style="min-height:110px" placeholder="${esc(i.placeholder)}">${v}</textarea>`;
  if (i.kind === "radio") return `<div class="chat"><div class="onair"><i></i>ON AIR · Teen Talk · EBC Radio</div>
      <div class="bub"><div class="av">🎙</div><div><div class="who">Show host</div><div class="b">${esc(i.host)}</div></div></div>
      <div class="bub me"><div class="av">🙋</div><div class="col"><div class="who" style="margin-right:4px">You</div>
        <textarea class="area" id="ed" ${r} spellcheck="false" placeholder="${esc(i.placeholder)}">${v}</textarea></div></div></div>`;
  if (i.kind === "mail") {
    const m = i.mail;
    return `<div class="mail"><div class="mt"><div class="traffic"><span></span><span></span><span></span></div><span>새로운 메시지</span></div>
      <div class="mf"><span>받는 사람:</span><span>${esc(m.to)}</span></div>
      <div class="mf"><span>제목:</span><span><b>${esc(m.subject)}</b></span></div>
      <div class="mb"><p>${esc(m.greeting)}</p><p>${esc(m.given)}</p>
        <textarea class="area" id="ed" ${r} spellcheck="false" placeholder="${esc(i.placeholder)}">${v}</textarea>
        <p>${esc(m.closing)}</p>
        <div class="sig">[ <input class="field" id="sign" ${r} maxlength="30" placeholder="Your Name (영어 이름)" value="${esc(a?.signName || "")}" spellcheck="false"> ]</div></div></div>`;
  }
}
function wordInfo(i, n) {
  if (!i.minWords) return `<span>단어 수 <b>${n}</b></span>`;
  return `<span>${i.wordNote ? esc(i.wordNote) + " " : ""}</span><span class="${n >= i.minWords ? "ok" : "no"}">단어 수 <b>${n}</b> / ${i.minWords}단어 이상 ${n >= i.minWords ? "✓" : ""}</span>`;
}

/* ---------------- 문항 화면 ---------------- */
function renderItem(q) {
  const i = ITEM[q], a = st.ans[q];
  if (!canView(q)) return go("home");
  const sub = isSubmitted(q);
  const hero = `<div class="hero"><div class="ico" style="background:${i.color}">${i.glyph}</div>
    <div><h2>${i.no}. ${esc(i.short)}</h2><p>${i.type} · ${i.points}점</p></div></div>`;
  if (!sub) {
    const ro = !st.open[q];
    const n = countWords(a?.answer);
    $("#toolbar").innerHTML = `<h1>${i.no}. ${esc(i.short)}</h1>
      <span class="wc ${i.minWords && n >= i.minWords ? "ok" : ""}" id="tbWc">${n}단어</span>
      <button class="pill" id="submitBtn" ${ro ? "disabled" : ""}>제출하기</button>`;
    $("#page").innerHTML = hero +
      (ro ? `<div class="banner gray"><div class="ico" style="background:#8e8e93">🔒</div><div><b>선생님이 이 문항을 닫았어요.</b>지금은 답안을 고치거나 제출할 수 없어요.</div></div>` : "") +
      problemHtml(i) +
      `<div class="gtitle">나의 답안</div>${editorHtml(i, a, ro)}
       <div class="wrow" id="wrow">${wordInfo(i, n)}</div>
       <details class="std"><summary>성취기준 보기</summary><div>${i.standards.map(esc).join("<br>")}</div></details>`;
    const ed = $("#ed"), sign = $("#sign");
    const onInput = () => {
      const n2 = countWords(ed.value);
      $("#tbWc").textContent = `${n2}단어`; $("#tbWc").classList.toggle("ok", !!(i.minWords && n2 >= i.minWords));
      $("#wrow").innerHTML = wordInfo(i, n2);
      st.ans[q] = { ...(st.ans[q] || {}), answer: ed.value, signName: sign ? sign.value : "" };
      queueSave(q);
      renderNavLight();
    };
    if (!ro) {
      ed.addEventListener("input", onInput); sign && sign.addEventListener("input", onInput);
      ed.addEventListener("blur", () => flushSave());
      $("#submitBtn").onclick = () => submit(q);
    }
    return;
  }
  renderGrade(q, hero);
}
function renderNavLight() {
  const b = $(`#navItems [data-go="${st.view}"]`); if (!b) return;
  const s = status(st.view), old = b.querySelector(".badge");
  if (old) old.remove();
  if (s.t) b.insertAdjacentHTML("beforeend", badge(s));
}

/* ---------------- 자동 저장 ---------------- */
function base(q) { return { sid: st.me.sid, qid: q, name: st.me.name, cls: st.me.cls }; }
function queueSave(q) {
  setSave("편집됨");
  clearTimeout(st.saveTimer);
  st.saveTimer = setTimeout(() => doSave(q), 4000);
  st.pending = q;
}
async function doSave(q) {
  st.pending = null;
  if (!st.me || isSubmitted(q) || !st.open[q]) return;
  const a = st.ans[q] || {};
  setSave("저장 중…");
  try {
    await S.saveAnswer(base(q), { answer: a.answer || "", signName: a.signName || "", words: countWords(a.answer), draftAt: S.NOW });
    setSave(`저장됨 ✓ ${new Date().toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })}`);
  } catch (e) {
    console.error(e); setSave("⚠︎ 저장 실패");
    if (e.code === "permission-denied") { setSave("🔒 문항이 닫혔어요"); return; }
    toast("저장하지 못했어요", "와이파이를 확인하세요. 잠시 후 다시 저장해요.", "!", "#ff3b30");
    st.saveTimer = setTimeout(() => doSave(q), 8000);
  }
}
async function flushSave() {
  if (st.pending) { clearTimeout(st.saveTimer); await doSave(st.pending); }
}
window.addEventListener("beforeunload", e => { if (st.pending) { flushSave(); e.preventDefault(); e.returnValue = ""; } });

/* ---------------- 제출 ---------------- */
async function submit(q) {
  const i = ITEM[q], a = st.ans[q] || {};
  const n = countWords(a.answer);
  if (n < 1) return toast("답안을 먼저 써 주세요", "", "!", "#ff9f0a");
  const short = i.minWords && n < i.minWords ? `<br><span style="color:#c26a00">아직 ${i.minWords}단어가 안 돼요. (지금 ${n}단어)</span>` : "";
  const ok = await confirmSheet({ icon: "📮", title: "답안을 제출할까요?",
    msg: `제출하면 답안을 더 이상 고칠 수 없어요.<br>제출 후에 예시 답안과 채점 기준표가 열려요.${short}`, ok: "제출하기" });
  if (!ok) return;
  clearTimeout(st.saveTimer); st.pending = null;
  loading(true, "제출하는 중…");
  try {
    await S.saveAnswer(base(q), { answer: a.answer || "", signName: a.signName || "", words: n, submittedAt: S.NOW });
    st.ans[q] = { ...a, words: n, submittedAt: Date.now() };
    toast("제출했어요!", "이제 스스로 채점해 보세요.", "📮", "#34c759");
    renderNav(); renderItem(q); $("#content").scrollTop = 0;
  } catch (e) {
    console.error(e);
    toast("제출하지 못했어요", e.code === "permission-denied" ? "문항이 닫혔거나 이미 제출했어요." : "와이파이를 확인하고 다시 눌러 주세요.", "!", "#ff3b30");
  } finally { loading(false); }
}

/* ---------------- 자가채점 ---------------- */
function gKey(q) { return `${GDRAFT}:${st.me.sid}:${q}`; }
function initG(q) {
  const i = ITEM[q], a = st.ans[q] || {};
  let g;
  if (a.gradedAt) g = { checks: [...(a.checks || [])], scores: { ...(a.scores || {}) }, reasons: { ...(a.reasons || {}) }, revised: a.revised ?? a.answer ?? "" };
  else {
    try { g = JSON.parse(localStorage.getItem(gKey(q)) || "null"); } catch (e) { g = null; }
    g ||= { checks: i.conditions.map(() => false), scores: {}, reasons: {}, revised: a.answer || "" };
  }
  if (i.autoWordsCond !== undefined) g.checks[i.autoWordsCond] = countWords(a.answer) >= i.minWords;
  g.scores.task = taskFromChecks(g.checks);
  g.qid = q;
  return g;
}
function keepG() { if (st.g && st.me) localStorage.setItem(gKey(st.g.qid), JSON.stringify(st.g)); }

function answerCard(i, text, sign, title, cls, right = "") {
  let body;
  if (i.kind === "mail") body = `<span class="giv">${esc(i.mail.greeting)}\n${esc(i.mail.given)}\n</span>${esc(text)}<span class="giv">\n${esc(i.mail.closing)}\n[ </span>${esc(sign || "")}<span class="giv"> ]</span>`;
  else if (i.kind === "chart") body = `<span class="giv">… Walking takes the longest time to burn 100 calories. </span>${esc(text)}`;
  else if (i.kind === "radio") body = `<span class="giv">You: </span>${esc(text)}`;
  else body = esc(text);
  return `<div class="card"><div class="ch">${title}<span class="r">${right}</span></div><div class="cb ${cls}">${body}</div></div>`;
}

function renderGrade(q, hero) {
  const i = ITEM[q], a = st.ans[q];
  st.g = st.g && st.g.qid === q ? st.g : initG(q);
  const g = st.g, done = !!a.gradedAt;
  $("#toolbar").innerHTML = `<h1>${i.no}. ${esc(i.short)}</h1>${badge(status(q))}`;
  $("#page").innerHTML = hero +
    (done ? `<div class="banner green"><div class="ico" style="background:#34c759">✓</div><div><b>자가채점을 마쳤어요.</b>점수나 근거, 고쳐 쓴 답안을 바꾸고 다시 저장할 수 있어요.</div></div>`
          : `<div class="banner blue"><div class="ico" style="background:#0a84ff">📮</div><div><b>제출 완료!</b>예시 답안과 채점 기준표를 보고 내 답안을 스스로 채점해 보세요.</div></div>`) +
    `<details class="std" style="margin:0 0 4px"><summary>문제 다시 보기</summary><div style="color:inherit;font-size:inherit">${problemHtml(i)}</div></details>
     <div class="gtitle">① 내 답안과 예시 답안 비교하기</div>
     <div class="cmp">${answerCard(i, a.answer, a.signName, "📝 내 답안 (제출)", "", `${countWords(a.answer)}단어`)}
       ${answerCard(i, i.example, i.exampleName, "✅ 예시 답안", "ex", `${countWords(i.example)}단어`)}</div>
     <div class="gtitle">② 채점 기준표로 스스로 채점하기 <span class="r">만점 ${i.points}점</span></div>
     <div id="rubric"></div>
     <div class="gtitle">③ 고쳐 쓰기 <span class="r">제출한 답안은 그대로 남아요</span></div>
     <textarea class="area" id="rev" spellcheck="false" placeholder="예시 답안과 채점 기준을 참고해서 내 답안을 더 좋게 고쳐 써 보세요.">${esc(g.revised)}</textarea>
     <div class="wrow"><span>바꾼 부분이 잘 보이도록 고쳐 써 보세요.</span><span>단어 수 <b id="revWc">${countWords(g.revised)}</b></span></div>
     <div class="total" id="total"></div>
     <div class="gtitle">채점 시 유의점</div>
     <ul class="notes">${i.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>`;
  renderRubric(q);
  $("#rev").addEventListener("input", e => { g.revised = e.target.value; $("#revWc").textContent = countWords(g.revised); keepG(); });
}

function renderRubric(q) {
  const i = ITEM[q], g = st.g;
  g.scores.task = taskFromChecks(g.checks);
  // 상한을 넘는 점수는 다시 고르게
  i.rubric.forEach(r => { const c = capFor(i, r.key, g.scores); if (c !== null && g.scores[r.key] > c) delete g.scores[r.key]; });
  $("#rubric").innerHTML = i.rubric.map((r, ri) => {
    const cap = capFor(i, r.key, g.scores), sel = g.scores[r.key];
    const checks = r.fromChecks ? `<div class="checks">${i.conditions.map((c, k) => {
        const auto = i.autoWordsCond === k;
        return `<label class="ck ${auto ? "auto" : ""}"><input type="checkbox" data-ck="${k}" ${g.checks[k] ? "checked" : ""} ${auto ? "disabled" : ""}>
          <span>조건 ${k + 1}. ${esc(c)}${auto ? `<span class="tag">자동 확인 · ${countWords(st.ans[q].answer)}단어</span>` : ""}</span></label>`;
      }).join("")}</div><div class="note" style="margin:0 2px 8px">충족한 조건에 체크하면 ${esc(r.name)} 점수가 자동으로 정해져요.</div>` : "";
    return `<div class="rub"><div class="rh"><span class="ico" style="background:${["#ff9f0a", "#af52de", "#0a84ff"][ri] || "#8e8e93"}">${ri + 1}</span><h4>${esc(r.name)}</h4>
        <span class="sc"><b>${typeof sel === "number" ? sel : "–"}</b> / ${r.max}점</span></div>
      <div class="rb">${checks}<div class="lv">${r.levels.map(l => {
        const dis = cap !== null && l.s > cap;
        return `<button class="opt ${sel === l.s ? "on" : ""} ${r.fromChecks ? "ro" : ""}" data-k="${r.key}" data-s="${l.s}" ${dis || r.fromChecks ? "disabled" : ""}
          ${r.fromChecks && !dis ? 'style="opacity:1;cursor:default"' : ""}><span class="s">${l.s}점</span><span>${esc(l.d)}</span></button>`;
      }).join("")}</div>
      ${i.caps && i.caps.limit.includes(r.key) ? `<div class="capnote ${cap !== null ? "show" : ""}">⚠︎ ${esc(i.caps.text)}</div>` : ""}
      <div class="why"><label>근거${r.fromChecks ? " (선택)" : ""}</label>
        <input class="field" data-why="${r.key}" maxlength="150" value="${esc(g.reasons[r.key] || "")}" placeholder="${r.fromChecks ? "조건을 어떻게 충족했는지 (선택)" : "왜 이 점수를 주었는지 한 줄로 써 보세요"}"></div></div></div>`;
  }).join("");
  $$("#rubric [data-ck]").forEach(x => x.onchange = () => { g.checks[+x.dataset.ck] = x.checked; keepG(); renderRubric(q); });
  $$("#rubric .opt[data-k]").forEach(x => x.onclick = () => { if (x.disabled) return; g.scores[x.dataset.k] = +x.dataset.s; keepG(); renderRubric(q); });
  $$("#rubric [data-why]").forEach(x => x.oninput = () => { g.reasons[x.dataset.why] = x.value; keepG(); });
  renderTotal(q);
}

function renderTotal(q) {
  const i = ITEM[q], g = st.g, a = st.ans[q];
  const t = totalOf(i, g.scores);
  const miss = i.rubric.filter(r => typeof g.scores[r.key] !== "number").length;
  $("#total").innerHTML = `<div class="big">${t}<small> / ${i.points}</small></div>
    <div class="t">${miss ? `아직 고르지 않은 채점 요소가 ${miss}개 있어요.` : "모든 채점 요소를 골랐어요."}<br>${a.gradedAt ? "저장한 뒤에도 다시 고칠 수 있어요." : "근거를 쓰고 저장하면 자가채점이 끝나요."}</div>
    <button class="pill" id="saveG">${a.gradedAt ? "수정 내용 저장" : "자가채점 저장"}</button>`;
  $("#saveG").onclick = () => saveGrade(q);
}

async function saveGrade(q) {
  const i = ITEM[q], g = st.g;
  const miss = i.rubric.filter(r => typeof g.scores[r.key] !== "number");
  if (miss.length) return toast("점수를 모두 골라 주세요", miss.map(r => r.name).join(", "), "!", "#ff9f0a");
  const noWhy = i.rubric.filter(r => !r.fromChecks && (g.reasons[r.key] || "").trim().length < 2);
  if (noWhy.length) { toast("근거를 한 줄씩 써 주세요", noWhy.map(r => r.name).join(", "), "!", "#ff9f0a"); const f = $(`[data-why="${noWhy[0].key}"]`); f && f.focus(); return; }
  if (!g.revised.trim()) return toast("고쳐 쓴 답안을 써 주세요", "", "!", "#ff9f0a");
  const total = totalOf(i, g.scores);
  loading(true, "저장하는 중…");
  try {
    const reasons = Object.fromEntries(i.rubric.map(r => [r.key, (g.reasons[r.key] || "").trim()]));
    const scores = Object.fromEntries(i.rubric.map(r => [r.key, g.scores[r.key]]));
    await S.saveAnswer(base(q), { checks: g.checks, scores, reasons, revised: g.revised, selfTotal: total, gradedAt: S.NOW });
    st.ans[q] = { ...st.ans[q], checks: [...g.checks], scores, reasons, revised: g.revised, selfTotal: total, gradedAt: Date.now() };
    localStorage.removeItem(gKey(q));
    toast("자가채점을 저장했어요", `${i.no}. ${i.short} · ${total}/${i.points}점`, "✓", "#34c759");
    renderNav(); renderItem(q);
  } catch (e) {
    console.error(e); toast("저장하지 못했어요", "와이파이를 확인하고 다시 눌러 주세요.", "!", "#ff3b30");
  } finally { loading(false); }
}

/* ---------------- 시작 ---------------- */
(async function boot() {
  loading(true, "연결하는 중…");
  await S.initStore();
  let ses = null;
  try { ses = JSON.parse(localStorage.getItem(SESSION) || "null"); } catch (e) {}
  if (ses && ses.sid) {
    try {
      const s = await S.lookupStudent(ses.sid);
      if (s.exists && normName(s.name) === normName(ses.name)) { loading(false); return enter({ sid: ses.sid, name: s.name }); }
    } catch (e) { console.error(e); }
    localStorage.removeItem(SESSION);
  }
  loading(false);
  $("#login").classList.add("show");
  $("#lkSid").focus();
})();
