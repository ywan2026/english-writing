import { ITEMS, ITEM, countWords } from "./items.js?v=20261110b";
import * as S from "./store.js?v=20261110b";
import { buildFeedbackCsv, readFeedbackCsv, buildPrompt, wordDiff } from "./feedback.js?v=20261110b";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const QIDS = ITEMS.map(i => i.id);
const KEYS = [["task", "과제"], ["content", "내용 및 구성"], ["lang", "언어 사용"]];

const st = { students: {}, answers: {}, open: {}, fb: {}, fbPreview: null, fbOpt: { q: "all", skip: true }, view: "all", cls: "all", q: "", filter: "all", un: [] };

/* ---------- UI helpers ---------- */
function toast(t, m = "", icon = "✓", color = "#0a84ff") {
  $("#toastT").textContent = t; $("#toastM").textContent = m; $("#toastI").textContent = icon; $("#toastI").style.background = color;
  const el = $("#toast"); el.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("show"), 3200);
}
function loading(on, t = "불러오는 중…") { $("#loadingT").textContent = t; $("#loading").classList.toggle("show", on); }
function sheet(html, wide = false) { const b = $("#sheetBox"); b.className = "sheet" + (wide ? " wide" : ""); b.innerHTML = html; $("#sheet").classList.add("show"); return b; }
const closeSheet = () => $("#sheet").classList.remove("show");
$("#sheet").addEventListener("click", e => { if (e.target.id === "sheet") closeSheet(); });
function confirmSheet({ icon = "⚠️", title, msg, ok = "확인", danger = false }) {
  return new Promise(res => {
    const b = sheet(`<div class="big">${icon}</div><h3>${title}</h3><p>${msg}</p><div class="btns"><button class="pill ghost" data-r="0">취소</button><button class="pill ${danger ? "red" : ""}" data-r="1">${ok}</button></div>`);
    b.querySelectorAll("[data-r]").forEach(x => x.onclick = () => { closeSheet(); res(x.dataset.r === "1"); });
  });
}
const fmt = (v) => { const t = S.ms(v); if (!t) return ""; const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

document.addEventListener("click", e => {
  const mi = e.target.closest("[data-menu]");
  $$(".mi.open").forEach(x => { if (x !== mi) x.classList.remove("open"); });
  if (mi && !e.target.closest(".dropdown")) mi.classList.toggle("open");
  const act = e.target.closest("[data-act]");
  if (act) { $$(".mi.open").forEach(x => x.classList.remove("open")); doAct(act.dataset.act); }
  const g = e.target.closest("[data-go]");
  if (g) { st.view = g.dataset.go; st.filter = "all"; render(); }
});
function doAct(a) {
  if (a === "sidebar") setSidebar(!$("#win").classList.contains("sb-collapsed"));
  if (a === "theme") { const d = document.documentElement; const on = d.dataset.theme !== "dark"; d.dataset.theme = on ? "dark" : ""; localStorage.setItem("ew-theme", on ? "dark" : ""); }
  if (a === "csv") exportCsv(false);
  if (a === "csvAll") exportCsv(true);
  if (a === "student") window.open("./", "_blank");
  if (a === "refresh") S.refreshNow();
  if (a === "logout") { S.teacherLogout(); location.href = "./"; }
}
if (localStorage.getItem("ew-theme") === "dark") document.documentElement.dataset.theme = "dark";
/* 사이드바 접기 (상태 기억) */
function setSidebar(collapsed) {
  $("#win").classList.toggle("sb-collapsed", collapsed);
  localStorage.setItem("ew-sidebar", collapsed ? "1" : "");
  const t = $("#sbToggle"); t.title = collapsed ? "사이드바 펼치기 (⌘\\ / Ctrl+\\)" : "사이드바 접기 (⌘\\ / Ctrl+\\)"; t.setAttribute("aria-label", collapsed ? "사이드바 펼치기" : "사이드바 접기");
}
setSidebar(localStorage.getItem("ew-sidebar") === "1");
document.addEventListener("keydown", e => { if ((e.metaKey || e.ctrlKey) && e.key === "\\") { e.preventDefault(); setSidebar(!$("#win").classList.contains("sb-collapsed")); } });
function tick() {
  const d = new Date(), days = ["일", "월", "화", "수", "목", "금", "토"];
  $("#clock").textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]}) ${d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })}`;
  $("#lkDate").textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`;
  $("#lkTime").textContent = `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")}`;
}
tick(); setInterval(tick, 10000);

/* ---------- 데이터 ---------- */
const A = (sid, q) => st.answers[`${sid}_${q}`] || null;
function stat(a, q) {
  if (!a) return { k: "none", t: "–" };
  if (a.gradedAt) return { k: "done", t: `✓ ${a.selfTotal}/${ITEM[q].points}` };
  if (a.submittedAt) return { k: "sub", t: "제출" };
  if ((a.answer || "").trim()) return { k: "draft", t: "작성 중" };
  return { k: "none", t: "–" };
}
const badge = (s) => s.k === "none" ? `<span class="badge lock">–</span>` : `<span class="badge ${s.k}">${s.t}</span>`;
function studentList() {
  // 학생 문서 + (혹시 학생 문서가 없는) 답안의 학번
  const m = { ...st.students };
  Object.values(st.answers).forEach(a => { if (!m[a.sid]) m[a.sid] = { sid: a.sid, name: a.name, cls: S.classOf(a.sid), num: S.numOf(a.sid) }; });
  return Object.values(m)
    .filter(s => st.cls === "all" || S.classOf(s.sid) === +st.cls)
    .filter(s => !st.q || s.sid.includes(st.q) || (s.name || "").includes(st.q))
    .sort((a, b) => a.sid.localeCompare(b.sid));
}
const classes = () => [...new Set([...Object.keys(st.students), ...Object.values(st.answers).map(a => a.sid)].map(S.classOf))].sort((a, b) => a - b);

/* ---------- 렌더 ---------- */
function render() {
  renderSide();
  const filt = `<div class="filters">
      <select id="fCls"><option value="all">전체 반</option>${classes().map(c => `<option value="${c}" ${+st.cls === c ? "selected" : ""}>3학년 ${c}반</option>`).join("")}</select>
      <input class="field" id="fQ" placeholder="학번·이름 검색" value="${esc(st.q)}">
    </div>`;
  if (st.view === "all") renderAll(filt);
  else if (st.view === "fbmake") renderFbMake(filt);
  else if (st.view.startsWith("fb-")) renderFbItem(st.view.slice(3), filt);
  else renderItem(st.view, filt);
  const c = $("#fCls"); c && (c.onchange = () => { st.cls = c.value; render(); });
  const q = $("#fQ"); q && (q.oninput = () => { st.q = q.value.trim(); clearTimeout(render._t); render._t = setTimeout(() => { render(); const n = $("#fQ"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); });
}
function renderSide() {
  $("#navAll").classList.toggle("active", st.view === "all");
  $("#navItems").innerHTML = ITEMS.map(i => {
    const n = Object.values(st.answers).filter(a => a.qid === i.id && a.submittedAt).length;
    return `<button data-go="${i.id}" class="${st.view === i.id ? "active" : ""}"><span class="ico" style="background:${i.color}">${i.glyph}</span>
      <span class="lbl">${i.no}. ${esc(i.short)}</span><span class="badge sub">${n}</span></button>`;
  }).join("");
  $("#fbNav").innerHTML = `<button data-go="fbmake" class="${st.view === "fbmake" ? "active" : ""}"><span class="ico" style="background:linear-gradient(145deg,#ff9f0a,#ff375f)">✦</span><span class="lbl">피드백 만들기 (CSV)</span></button>` +
    ITEMS.map(i => {
      const all = Object.values(st.answers).filter(a => a.qid === i.id && a.gradedAt);
      const n = all.filter(hasFb).length;
      return `<button data-go="fb-${i.id}" class="${st.view === "fb-" + i.id ? "active" : ""}"><span class="ico" style="background:${i.color}">${i.glyph}</span>
        <span class="lbl">${i.no}번 피드백</span>${st.fb[i.id] ? '<span class="badge done">공개</span>' : ""}<span class="badge sub">${n}/${all.length}</span></button>`;
    }).join("");
  $("#openRows").innerHTML = ITEMS.map(i => `<div class="qrow"><span class="ico" style="background:${i.color}">${i.glyph}</span>
      <span class="lbl" style="flex:1">${i.no}번 ${st.open[i.id] ? "<b style='color:#1f8a3a'>공개 중</b>" : "<span style='color:var(--text-3)'>닫힘</span>"}</span>
      <button class="switch ${st.open[i.id] ? "on" : ""}" data-open="${i.id}" aria-label="${i.no}번 공개"></button></div>`).join("");
  $$("[data-open]").forEach(b => b.onclick = async () => {
    const q = b.dataset.open, v = !st.open[q];
    b.classList.toggle("on", v);
    try { await S.setOpen(q, v); S.refreshNow(); toast(v ? `${ITEM[q].no}번 문항을 열었어요` : `${ITEM[q].no}번 문항을 닫았어요`, v ? "학생 화면에 바로 나타나요." : "제출한 학생은 자가채점을 계속할 수 있어요.", v ? "🔓" : "🔒", v ? "#34c759" : "#8e8e93"); }
    catch (e) { console.error(e); b.classList.toggle("on", !v); toast("바꾸지 못했어요", e.code || "", "!", "#ff3b30"); }
  });
}

function renderAll(filt) {
  const list = studentList();
  $("#toolbar").innerHTML = `<h1>전체 현황</h1>${S.isLocal() ? '<span class="local-badge">로컬 모드</span>' : ""}<button class="pill" data-act="csv">CSV 내보내기</button>`;
  const cnt = (q, k) => list.filter(s => { const x = stat(A(s.sid, q), q).k; return k === "sub" ? (x === "sub" || x === "done") : x === k; }).length;
  $("#page").innerHTML = `${filt}
    <div class="stats">${ITEMS.map(i => `<div class="stat"><div class="k"><span class="ico" style="background:${i.color};width:18px;height:18px;font-size:10px">${i.glyph}</span>${i.no}. ${esc(i.short)}</div>
      <div class="v">${cnt(i.id, "sub")}<small>/ ${list.length}명 제출</small></div><div class="note" style="margin:2px 0 0">자가채점 ${cnt(i.id, "done")} · 작성 중 ${cnt(i.id, "draft")}</div></div>`).join("")}</div>
    ${list.length ? `<table class="tbl"><thead><tr><th>학번</th><th>이름</th>${ITEMS.map(i => `<th>${i.no}. ${esc(i.short)} (${i.points})</th>`).join("")}<th>자가채점 합계</th></tr></thead><tbody>
      ${list.map(s => {
        let sum = 0, any = false;
        const cells = ITEMS.map(i => { const a = A(s.sid, i.id); if (a && a.gradedAt) { sum += a.selfTotal; any = true; }
          return `<td><button class="cellbtn" data-cell="${s.sid}|${i.id}">${badge(stat(a, i.id))}</button></td>`; }).join("");
        return `<tr><td class="mono">${s.sid}</td><td><button class="cellbtn" data-stu="${s.sid}" style="font-weight:600">${esc(s.name)}</button></td>${cells}<td class="mono">${any ? sum : ""}</td></tr>`;
      }).join("")}</tbody></table>` : `<div class="empty">아직 로그인한 학생이 없어요.<br>왼쪽 아래에서 문항을 공개하고 학생들에게 주소를 알려 주세요.</div>`}`;
  $$("[data-cell]").forEach(b => b.onclick = () => { const [sid, q] = b.dataset.cell.split("|"); detail(sid, q); });
  $$("[data-stu]").forEach(b => b.onclick = () => studentSheet(b.dataset.stu));
}

function scoreLine(i, a) {
  if (!a || !a.gradedAt) return "";
  return `<div class="sg">${i.rubric.map(r => `<b>${esc(r.name)} ${a.scores?.[r.key] ?? "–"}/${r.max}</b>${a.reasons?.[r.key] ? ` — ${esc(a.reasons[r.key])}` : ""}`).join("<br>")}
    <br>조건 충족: ${(a.checks || []).map((c, k) => `${k + 1}${c ? "○" : "×"}`).join(" ")}</div>`;
}

function renderItem(q, filt) {
  const i = ITEM[q], list = studentList();
  const rows = list.map(s => ({ s, a: A(s.sid, q) })).map(x => ({ ...x, k: stat(x.a, q).k }));
  const pick = rows.filter(x => st.filter === "all" ? x.k !== "none" : x.k === st.filter);
  const graded = rows.filter(x => x.k === "done");
  const avg = graded.length ? (graded.reduce((t, x) => t + x.a.selfTotal, 0) / graded.length).toFixed(1) : "–";
  const sub = rows.filter(x => x.k === "sub" || x.k === "done");
  const wavg = sub.length ? Math.round(sub.reduce((t, x) => t + countWords(x.a.answer), 0) / sub.length) : "–";
  $("#toolbar").innerHTML = `<h1>${i.no}. ${esc(i.short)} <span style="font-weight:500;color:var(--text-2);font-size:13px">${i.type} · ${i.points}점</span></h1>
    <button class="switch ${st.open[q] ? "on" : ""}" id="tbOpen" title="학생에게 공개"></button><span style="font-size:12px;color:var(--text-2)">${st.open[q] ? "공개 중" : "닫힘"}</span>
    <button class="pill" data-act="csv">CSV 내보내기</button>`;
  $("#tbOpen").onclick = () => $(`[data-open="${q}"]`).click();
  const seg = [["all", "전체"], ["draft", "작성 중"], ["sub", "제출(채점 전)"], ["done", "자가채점 완료"]];
  $("#page").innerHTML = `${filt}
    <div class="stats">
      <div class="stat"><div class="k">제출</div><div class="v">${sub.length}<small>/ ${list.length}명</small></div></div>
      <div class="stat"><div class="k">자가채점 완료</div><div class="v">${graded.length}<small>명</small></div></div>
      <div class="stat"><div class="k">자가채점 평균</div><div class="v">${avg}<small>/ ${i.points}점</small></div></div>
      <div class="stat"><div class="k">평균 단어 수 (제출)</div><div class="v">${wavg}<small>${i.minWords ? `기준 ${i.minWords}` : "단어"}</small></div></div>
    </div>
    <div class="filters"><div class="seg">${seg.map(([k, t]) => `<button data-f="${k}" class="${st.filter === k ? "on" : ""}">${t} ${k === "all" ? "" : rows.filter(x => x.k === k).length}</button>`).join("")}</div></div>
    ${pick.length ? `<div class="ans-list">${pick.map(({ s, a, k }) => `<div class="ans">
        <div class="ah"><b>${s.sid} ${esc(s.name)}</b>${badge(stat(a, q))}<span style="color:var(--text-2);font-size:12px">${countWords(a.answer)}단어 · ${a.submittedAt ? "제출 " + fmt(a.submittedAt) : "저장 " + fmt(a.draftAt || a.updatedAt)}</span>
          <span class="r"><button class="pill ghost" data-cell="${s.sid}|${q}">자세히</button></span></div>
        <div class="ab"><div><span class="lab">${a.submittedAt ? "제출 답안" : "쓰는 중인 답안"}</span>${esc(a.answer)}${a.signName ? `\n[ ${esc(a.signName)} ]` : ""}</div>
          <div><span class="lab">고쳐 쓴 답안</span>${a.revised ? esc(a.revised) : '<span style="color:var(--text-3)">—</span>'}</div></div>
        ${scoreLine(i, a)}${hasFb(a) ? fbBlock(a) : ""}</div>`).join("")}</div>`
      : `<div class="empty">${st.filter === "all" ? "아직 이 문항에 답안을 쓴 학생이 없어요." : "해당하는 학생이 없어요."}</div>`}`;
  $$("[data-f]").forEach(b => b.onclick = () => { st.filter = b.dataset.f; render(); });
  $$("[data-cell]").forEach(b => b.onclick = () => { const [sid, qq] = b.dataset.cell.split("|"); detail(sid, qq); });
}

/* ---------- 피드백 ---------- */
const hasFb = (a) => !!(a && (a.fbGood || a.fbFix || a.fbRewrite));
function diffHtml(from, to) {
  return wordDiff(from, to).map(x => x.add ? `<mark class="add">${esc(x.t)}</mark>` : esc(x.t)).join("");
}
function fbBlock(a) {
  if (!hasFb(a)) return `<div class="fbx empty-fb">아직 피드백이 없어요.</div>`;
  return `<div class="fbx">
    ${a.fbGood ? `<div class="fbr good"><span class="fbt">👍 잘한 점</span>${esc(a.fbGood)}</div>` : ""}
    ${a.fbFix ? `<div class="fbr fix"><span class="fbt">✏️ 고칠 점</span>${esc(a.fbFix)}</div>` : ""}
    ${a.fbRewrite ? `<div class="fbr rw"><span class="fbt">✅ 고친 문장 <small>(바뀐 단어 표시)</small></span><span class="en">${diffHtml(a.revised || a.answer, a.fbRewrite)}</span></div>` : ""}
  </div>`;
}

function renderFbMake(filt) {
  const graded = Object.values(st.answers).filter(a => a.gradedAt);
  const inCls = (a) => st.cls === "all" || S.classOf(a.sid) === +st.cls;
  const pool = graded.filter(a => inCls(a) && (st.fbOpt.q === "all" || a.qid === st.fbOpt.q));
  const target = pool.filter(a => !(st.fbOpt.skip && hasFb(a)));
  const pv = st.fbPreview;
  $("#toolbar").innerHTML = `<h1>피드백 만들기</h1>${S.isLocal() ? '<span class="local-badge">로컬 모드</span>' : ""}`;
  $("#page").innerHTML = `${filt}
    <div class="banner gray"><div class="ico" style="background:linear-gradient(145deg,#ff9f0a,#ff375f)">✦</div>
      <div><b>CSV 내려받기 → Claude에게 피드백 받기 → CSV 올리기</b>자가채점까지 마친 답안만 대상이에요. 올린 피드백은 문항별 '피드백 공개'를 켜야 학생에게 보여요.</div></div>

    <div class="gtitle"><span class="stepn">1</span> 피드백용 CSV 내려받기</div>
    <div class="group"><div class="row fbopts">
      <label>문항 <select id="fbQ"><option value="all">전체 문항</option>${ITEMS.map(i => `<option value="${i.id}" ${st.fbOpt.q === i.id ? "selected" : ""}>${i.no}. ${esc(i.short)}</option>`).join("")}</select></label>
      <label class="chk"><input type="checkbox" id="fbSkip" ${st.fbOpt.skip ? "checked" : ""}> 이미 피드백이 있는 답안은 빼기</label>
      <span class="sp"></span>
      <span class="note" style="margin:0">자가채점 완료 ${pool.length}개 중 <b>${target.length}개</b></span>
      <button class="pill" id="fbDl" ${target.length ? "" : "disabled"}>CSV 내려받기</button>
    </div></div>
    <div class="note">위쪽의 반 선택도 적용돼요. 학생이 많으면 문항별로 나눠 내려받으면 Claude가 더 꼼꼼하게 처리해요.</div>

    <div class="gtitle"><span class="stepn">2</span> Claude에게 피드백 받기</div>
    <div class="group"><div class="row" style="line-height:1.7;font-size:13.5px">
      claude.ai에서 <b>새 대화</b>를 열고 ① 내려받은 CSV 파일을 첨부한 뒤 ② 아래 프롬프트를 붙여 넣어 보내세요.<br>
      Claude가 만들어 준 <b>피드백_완료.csv</b> 파일을 내려받아 3단계에서 올리면 돼요.
      <div style="display:flex;gap:8px;margin-top:10px"><button class="pill" id="fbCopy">📋 프롬프트 복사</button><button class="pill ghost" id="fbShow">프롬프트 보기</button><button class="pill ghost" id="fbMd">.md 파일로 내려받기</button></div>
    </div></div>

    <div class="gtitle"><span class="stepn">3</span> 피드백 CSV 올리기</div>
    <label class="drop" id="fbDrop"><input type="file" id="fbFile" accept=".csv,text/csv" hidden>
      <div class="big">⬆︎</div><b>피드백_완료.csv 를 끌어다 놓거나 눌러서 고르세요</b><span>학번 · 문항 번호 · 잘한 점 · 고칠 점 · 고친 문장 열을 읽어요</span></label>
    <div id="fbPrev">${pv ? previewHtml(pv) : ""}</div>`;
  $("#fbQ").onchange = (e) => { st.fbOpt.q = e.target.value; render(); };
  $("#fbSkip").onchange = (e) => { st.fbOpt.skip = e.target.checked; render(); };
  $("#fbDl").onclick = () => downloadFbCsv();
  $("#fbCopy").onclick = async () => {
    try { await navigator.clipboard.writeText(buildPrompt()); toast("프롬프트를 복사했어요", "Claude 대화창에 붙여 넣으세요.", "📋", "#34c759"); }
    catch (e) { showPrompt(); }
  };
  $("#fbShow").onclick = showPrompt;
  $("#fbMd").onclick = () => saveFile(new Blob([buildPrompt()], { type: "text/markdown;charset=utf-8" }), "Writing_Studio_피드백_프롬프트.md");
  const drop = $("#fbDrop"), file = $("#fbFile");
  file.onchange = () => file.files[0] && loadFbFile(file.files[0]);
  ["dragover", "dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; f && loadFbFile(f); });
  bindPreview();
}

function saveFile(blob, name) {
  const url = URL.createObjectURL(blob), el = document.createElement("a");
  el.href = url; el.download = name; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function stamp() { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`; }
function downloadFbCsv() {
  const { csv, count } = buildFeedbackCsv(st.students, st.answers, { qids: st.fbOpt.q === "all" ? null : [st.fbOpt.q], cls: st.cls, skipDone: st.fbOpt.skip });
  if (!count) return toast("내보낼 답안이 없어요", "", "!", "#ff9f0a");
  const part = st.fbOpt.q === "all" ? "전체문항" : `${ITEM[st.fbOpt.q].no}번`;
  saveFile(new Blob([csv], { type: "text/csv;charset=utf-8" }), `피드백요청_${part}${st.cls !== "all" ? "_" + st.cls + "반" : ""}_${stamp()}.csv`);
  toast("피드백용 CSV를 내려받았어요", `${count}개 답안 · 이제 프롬프트를 복사하세요`, "⬇︎", "#34c759");
}
function showPrompt() {
  const b = sheet(`<h3 style="text-align:left;font-size:16px">Claude에게 보낼 프롬프트</h3>
    <p style="text-align:left">CSV 파일을 첨부하고 이 내용을 그대로 붙여 넣으세요. 문항·조건·채점 기준표·예시 답안이 모두 들어 있어요.</p>
    <textarea class="area" readonly style="min-height:46vh;font-size:12.5px;font-family:var(--mono)">${esc(buildPrompt())}</textarea>
    <div class="btns"><button class="pill ghost" id="pClose">닫기</button><button class="pill" id="pCopy">전체 복사</button></div>`, true);
  $("#pClose").onclick = closeSheet;
  $("#pCopy").onclick = () => { const t = b.querySelector("textarea"); t.select(); try { navigator.clipboard.writeText(t.value); } catch (e) { document.execCommand("copy"); } toast("복사했어요", "", "📋", "#34c759"); };
}

async function loadFbFile(f) {
  const buf = await f.arrayBuffer();
  let text = new TextDecoder("utf-8").decode(buf), r = readFeedbackCsv(text);
  if (r.error && text.includes("\uFFFD")) { try { text = new TextDecoder("euc-kr").decode(buf); r = readFeedbackCsv(text); } catch (e) {} }  // 엑셀에서 다시 저장한 CSV
  if (r.error) { st.fbPreview = null; toast("CSV를 읽지 못했어요", r.error, "!", "#ff3b30"); render(); return; }
  const rows = r.rows.map(x => {
    const a = A(x.sid, x.qid), s = st.students[x.sid];
    const empty = !(x.good || x.fix || x.rewrite);
    return { ...x, name: s?.name || a?.name || "", st: !a ? "missing" : empty ? "empty" : hasFb(a) ? "over" : "new" };
  });
  st.fbPreview = { file: f.name, rows, bad: r.bad };
  render();
  $("#fbPrev").scrollIntoView({ behavior: "smooth", block: "start" });
}
function previewHtml(pv) {
  const c = (k) => pv.rows.filter(r => r.st === k).length;
  const lab = { new: ["새로 입력", "done"], over: ["덮어씀", "draft"], missing: ["답안 없음 · 건너뜀", "lock"], empty: ["빈 피드백 · 건너뜀", "lock"] };
  return `<div class="gtitle">미리보기 · ${esc(pv.file)}<span class="r">새로 입력 ${c("new")} · 덮어씀 ${c("over")} · 건너뜀 ${c("missing") + c("empty") + pv.bad.length}</span></div>
    ${pv.bad.length ? `<div class="banner gray" style="margin-bottom:10px"><div class="ico" style="background:#ff9f0a">!</div><div><b>읽지 못한 행 ${pv.bad.length}개</b>${esc(pv.bad.slice(0, 6).join(", "))}${pv.bad.length > 6 ? " …" : ""}</div></div>` : ""}
    <div class="group" style="max-height:420px;overflow:auto"><table class="tbl fbtbl"><thead><tr><th>학번</th><th>이름</th><th>문항</th><th>잘한 점</th><th>고칠 점</th><th>고친 문장</th><th>처리</th></tr></thead><tbody>
    ${pv.rows.map(r => `<tr><td class="mono">${r.sid}</td><td>${esc(r.name)}</td><td>${ITEM[r.qid].no}번</td>
      <td><div class="clip">${esc(r.good)}</div></td><td><div class="clip">${esc(r.fix)}</div></td><td><div class="clip en">${esc(r.rewrite)}</div></td>
      <td><span class="badge ${lab[r.st][1]}">${lab[r.st][0]}</span></td></tr>`).join("")}
    </tbody></table></div>
    <div class="btns" style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="pill ghost" id="pvCancel">취소</button>
      <button class="pill green" id="pvApply" ${c("new") + c("over") ? "" : "disabled"}>피드백 ${c("new") + c("over")}개 입력하기</button></div>`;
}
function bindPreview() {
  const x = $("#pvCancel"), y = $("#pvApply");
  x && (x.onclick = () => { st.fbPreview = null; render(); });
  y && (y.onclick = async () => {
    const rows = st.fbPreview.rows.filter(r => r.st === "new" || r.st === "over");
    const over = rows.filter(r => r.st === "over").length;
    if (over) {
      const ok = await confirmSheet({ icon: "✏️", title: "피드백을 입력할까요?", msg: `${rows.length}개 중 ${over}개는 이미 있는 피드백을 덮어써요.`, ok: "입력하기" });
      if (!ok) return;
    }
    loading(true, "피드백을 입력하는 중…");
    try {
      const r = await S.saveFeedback(rows.map(({ sid, qid, good, fix, rewrite }) => ({ sid, qid, good, fix, rewrite })),
        (d, t) => $("#loadingT").textContent = `피드백을 입력하는 중… ${d}/${t}`);
      st.fbPreview = null; S.refreshNow();
      const qs = [...new Set(rows.map(r => r.qid))];
      toast(`피드백 ${r.updated}개를 입력했어요`, r.missing.length ? `${r.missing.length}개는 답안이 없어 건너뛰었어요` : "문항별 피드백 화면에서 확인하고 공개하세요.", "✓", "#34c759");
      st.view = qs.length === 1 ? "fb-" + qs[0] : st.view; render();
    } catch (e) { console.error(e); toast("입력하지 못했어요", e.code || "", "!", "#ff3b30"); }
    finally { loading(false); }
  });
}

function renderFbItem(q, filt) {
  const i = ITEM[q], list = studentList();
  const rows = list.map(s => ({ s, a: A(s.sid, q) })).filter(x => x.a && x.a.gradedAt);
  const done = rows.filter(x => hasFb(x.a));
  const f = st.fbFilter || "all";
  const pick = rows.filter(x => f === "all" || (f === "has" ? hasFb(x.a) : !hasFb(x.a)));
  $("#toolbar").innerHTML = `<h1>${i.no}번 피드백 <span style="font-weight:500;color:var(--text-2);font-size:13px">${esc(i.short)}</span></h1>
    <span style="font-size:12px;color:var(--text-2)">학생에게 피드백 공개</span><button class="switch ${st.fb[q] ? "on" : ""}" id="fbOpen"></button>`;
  $("#fbOpen").onclick = async (e) => {
    const v = !st.fb[q]; e.currentTarget.classList.toggle("on", v);
    try { await S.setFb(q, v); st.fb[q] = v; S.refreshNow(); toast(v ? `${i.no}번 피드백을 공개했어요` : `${i.no}번 피드백을 숨겼어요`, v ? "학생 화면 '선생님 피드백'에 30초 안에 나타나요." : "", v ? "🔓" : "🔒", v ? "#34c759" : "#8e8e93"); render(); }
    catch (err) { console.error(err); toast("바꾸지 못했어요", err.code || "", "!", "#ff3b30"); render(); }
  };
  const seg = [["all", `전체 ${rows.length}`], ["has", `피드백 있음 ${done.length}`], ["none", `피드백 없음 ${rows.length - done.length}`]];
  $("#page").innerHTML = `${filt}
    ${st.fb[q] ? `<div class="banner green"><div class="ico" style="background:#34c759">🔓</div><div><b>학생에게 공개 중이에요.</b>여기서 고치면 학생 화면에도 바로 반영돼요.</div></div>`
      : `<div class="banner gray"><div class="ico" style="background:#8e8e93">🔒</div><div><b>아직 학생에게 보이지 않아요.</b>피드백을 검토한 뒤 오른쪽 위 스위치를 켜면 공개돼요.</div></div>`}
    <div class="filters"><div class="seg">${seg.map(([k, t]) => `<button data-ff="${k}" class="${f === k ? "on" : ""}">${t}</button>`).join("")}</div>
      <span class="sp"></span><button class="pill ghost" data-go="fbmake">✦ 피드백 만들기</button></div>
    ${pick.length ? `<div class="ans-list">${pick.map(({ s, a }) => `<div class="ans">
        <div class="ah"><b>${s.sid} ${esc(s.name)}</b><span class="badge done">자가 ${a.selfTotal}/${i.points}</span>
          ${a.fbAt ? `<span style="color:var(--text-2);font-size:12px">피드백 ${fmt(a.fbAt)}</span>` : ""}
          <span class="r"><button class="pill ghost" data-fbedit="${s.sid}|${q}">${hasFb(a) ? "수정" : "직접 쓰기"}</button></span></div>
        <div class="ab"><div><span class="lab">고쳐 쓴 답안</span>${esc(a.revised || a.answer)}</div><div><span class="lab">자가채점</span><span style="font-family:var(--font);font-size:12.5px;color:var(--text-2)">${i.rubric.map(r => `${esc(r.name)} ${a.scores?.[r.key] ?? "–"}/${r.max}${a.reasons?.[r.key] ? " · " + esc(a.reasons[r.key]) : ""}`).join("\n")}</span></div></div>
        ${fbBlock(a)}</div>`).join("")}</div>`
      : `<div class="empty">${rows.length ? "해당하는 답안이 없어요." : "아직 이 문항의 자가채점을 마친 학생이 없어요."}</div>`}`;
  $$("[data-ff]").forEach(b => b.onclick = () => { st.fbFilter = b.dataset.ff; render(); });
  $$("[data-fbedit]").forEach(b => b.onclick = () => { const [sid, qq] = b.dataset.fbedit.split("|"); fbEditor(sid, qq); });
}

function fbEditor(sid, q) {
  const i = ITEM[q], a = A(sid, q), s = st.students[sid] || { name: a?.name || "" };
  if (!a) return;
  const b = sheet(`<h3 style="text-align:left;font-size:16px">${sid} ${esc(s.name)} · ${i.no}번 피드백</h3>
    <div class="card" style="margin:10px 0"><div class="ch">고쳐 쓴 답안</div><div class="cb">${esc(a.revised || a.answer)}</div></div>
    <div class="fbedit">
      <label>👍 잘한 점<textarea class="area" id="eG" style="min-height:70px;font-size:14px">${esc(a.fbGood || "")}</textarea></label>
      <label>✏️ 고칠 점<textarea class="area" id="eF" style="min-height:100px;font-size:14px">${esc(a.fbFix || "")}</textarea></label>
      <label>✅ 고친 문장 (영어)<textarea class="area" id="eR" style="min-height:90px;font-size:14px;font-family:Georgia,serif" spellcheck="false">${esc(a.fbRewrite || "")}</textarea></label>
    </div>
    <div class="btns">${hasFb(a) ? '<button class="pill ghost" id="eDel" style="margin-right:auto;color:#ff3b30">피드백 지우기</button>' : ""}<button class="pill ghost" id="eNo">취소</button><button class="pill" id="eOk">저장</button></div>`, true);
  const save = async (good, fix, rewrite) => {
    loading(true, "저장하는 중…");
    try { await S.saveFeedback([{ sid, qid: q, good, fix, rewrite }]); closeSheet(); S.refreshNow(); toast("피드백을 저장했어요", `${sid} ${s.name} · ${i.no}번`); }
    catch (e) { console.error(e); toast("저장하지 못했어요", e.code || "", "!", "#ff3b30"); }
    finally { loading(false); }
  };
  $("#eNo").onclick = closeSheet;
  $("#eOk").onclick = () => save($("#eG").value.trim(), $("#eF").value.trim(), $("#eR").value.trim());
  const d = $("#eDel"); d && (d.onclick = () => save("", "", ""));
}

/* ---------- 상세 ---------- */
function detail(sid, q) {
  const i = ITEM[q], a = A(sid, q), s = st.students[sid] || { sid, name: a?.name || "" };
  const body = !a ? `<p style="text-align:left">아직 이 문항에 답안을 쓰지 않았어요.</p>` : `
    <dl class="dl">
      <dt>상태</dt><dd>${badge(stat(a, q))}</dd>
      <dt>${a.submittedAt ? "제출 답안" : "쓰는 중인 답안"}</dt><dd style="font-family:Georgia,serif;font-size:14.5px">${esc(a.answer)}${a.signName ? `\n[ ${esc(a.signName)} ]` : ""}</dd>
      <dt>단어 수</dt><dd>${countWords(a.answer)}${i.minWords ? ` (기준 ${i.minWords})` : ""}</dd>
      <dt>제출 시각</dt><dd>${fmt(a.submittedAt) || "—"}</dd>
      ${a.gradedAt ? `<dt>조건 충족</dt><dd>${i.conditions.map((c, k) => `${(a.checks || [])[k] ? "○" : "×"} ${esc(c)}`).join("\n")}</dd>
        ${i.rubric.map(r => `<dt>${esc(r.name)}</dt><dd><b>${a.scores?.[r.key] ?? "–"} / ${r.max}</b>${a.reasons?.[r.key] ? ` · ${esc(a.reasons[r.key])}` : ""}</dd>`).join("")}
        <dt>자가채점 합계</dt><dd><b>${a.selfTotal} / ${i.points}</b></dd>
        <dt>고쳐 쓴 답안</dt><dd style="font-family:Georgia,serif;font-size:14.5px">${esc(a.revised)}</dd>
        <dt>자가채점 시각</dt><dd>${fmt(a.gradedAt)}</dd>
        <dt>선생님 피드백</dt><dd>${fbBlock(a)}<span style="font-size:12px;color:var(--text-2)">${st.fb[q] ? "학생에게 공개 중" : "아직 학생에게 비공개"}</span></dd>` : ""}
    </dl>`;
  const b = sheet(`<h3 style="text-align:left;font-size:16px">${sid} ${esc(s.name)} · ${i.no}. ${esc(i.short)}</h3>${body}
    <div class="btns">${a && a.submittedAt ? `<button class="pill ghost" id="dReopen" style="margin-right:auto">제출 취소 (다시 쓰게 하기)</button>` : ""}${a && a.gradedAt ? '<button class="pill ghost" id="dFb">피드백 쓰기·수정</button>' : ""}<button class="pill" id="dOk">닫기</button></div>`, true);
  $("#dOk").onclick = closeSheet;
  const dfb = $("#dFb"); dfb && (dfb.onclick = () => fbEditor(sid, q));
  const r = $("#dReopen");
  r && (r.onclick = async () => {
    closeSheet();
    const ok = await confirmSheet({ title: "제출을 취소할까요?", msg: `${sid} ${esc(s.name)} 학생의 ${i.no}번 제출과 자가채점 기록이 지워지고, 답안은 '작성 중'으로 돌아가요.<br>학생이 화면을 새로고침하면 다시 쓰고 제출할 수 있어요.`, ok: "제출 취소", danger: true });
    if (!ok) return;
    try { await S.reopenAnswer(sid, q); S.refreshNow(); toast("제출을 취소했어요", `${sid} ${s.name} · ${i.no}번`); } catch (e) { console.error(e); toast("취소하지 못했어요", e.code || "", "!", "#ff3b30"); }
  });
}
function studentSheet(sid) {
  const s = st.students[sid] || { sid, name: "" };
  const b = sheet(`<div class="big">🧑‍🎓</div><h3>${sid} ${esc(s.name)}</h3><p>3학년 ${S.classOf(sid)}반 ${S.numOf(sid)}번 · 처음 로그인 ${fmt(s.createdAt) || "—"}</p>
    <p style="margin-top:10px">학생이 이름을 잘못 등록했다면 기록을 삭제하세요.<br>삭제하면 이 학생의 모든 답안과 자가채점도 함께 지워지고, 다시 로그인해 새로 등록할 수 있어요.</p>
    <div class="btns"><button class="pill red" id="sDel" style="margin-right:auto">학생 기록 삭제</button><button class="pill" id="sOk">닫기</button></div>`);
  $("#sOk").onclick = closeSheet;
  $("#sDel").onclick = async () => {
    closeSheet();
    const ok = await confirmSheet({ title: "정말 삭제할까요?", msg: `${sid} ${esc(s.name)} 학생의 등록 정보와 4개 문항 답안이 모두 지워져요. 되돌릴 수 없어요.`, ok: "삭제", danger: true });
    if (!ok) return;
    try { await S.deleteStudent(sid, QIDS); S.refreshNow(); toast("삭제했어요", `${sid} ${s.name}`); } catch (e) { console.error(e); toast("삭제하지 못했어요", e.code || "", "!", "#ff3b30"); }
  };
}

/* ---------- CSV ---------- */
function csvCell(v) { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function exportCsv(all) {
  const qs = !all && st.view !== "all" ? [st.view] : QIDS;
  const keepCls = st.cls, keepQ = st.q;
  if (all) { st.cls = "all"; st.q = ""; }
  const list = studentList();
  st.cls = keepCls; st.q = keepQ;
  const head = ["학번", "반", "번호", "이름", "문항 번호", "문항", "유형", "상태", "답안", "이메일 서명", "단어 수", "제출 시각",
    "조건 충족", ...KEYS.flatMap(([, n]) => [`${n} 점수`, `${n} 근거`]), "자가채점 합계", "만점", "고쳐 쓴 답안", "자가채점 시각", "피드백: 잘한 점", "피드백: 고칠 점", "피드백: 고친 문장", "피드백 공개", "마지막 저장 시각"];
  const label = { none: "미작성", draft: "작성 중(미제출)", sub: "제출(자가채점 전)", done: "자가채점 완료" };
  const rows = [head];
  list.forEach(s => qs.forEach(q => {
    const i = ITEM[q], a = A(s.sid, q), k = stat(a, q).k;
    rows.push([s.sid, S.classOf(s.sid), S.numOf(s.sid), s.name, i.no, i.short, i.type, label[k],
      a?.answer || "", a?.signName || "", a ? countWords(a.answer) : "", fmt(a?.submittedAt),
      a?.gradedAt ? (a.checks || []).map((c, n) => `${n + 1}${c ? "○" : "×"}`).join(" ") : "",
      ...KEYS.flatMap(([key]) => {
        const has = i.rubric.some(r => r.key === key);
        return a?.gradedAt && has ? [a.scores?.[key] ?? "", a.reasons?.[key] ?? ""] : ["", ""];
      }),
      a?.gradedAt ? a.selfTotal : "", i.points, a?.revised || "", fmt(a?.gradedAt), a?.fbGood || "", a?.fbFix || "", a?.fbRewrite || "", hasFb(a) ? (st.fb[q] ? "공개" : "비공개") : "", fmt(a?.updatedAt)]);
  }));
  if (rows.length === 1) return toast("내보낼 학생이 없어요", "", "!", "#ff9f0a");
  const csv = "﻿" + rows.map(r => r.map(csvCell).join(",")).join("\r\n");
  const d = new Date(), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
  const part = qs.length === 1 ? `${ITEM[qs[0]].no}번` : "전체문항";
  const cp = !all && st.cls !== "all" ? `_${st.cls}반` : "";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob), el = document.createElement("a");
  el.href = url; el.download = `영어쓰기_자가채점_${part}${cp}_${stamp}.csv`;
  document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast("CSV를 내려받았어요", `${rows.length - 1}행 · ${part}${cp}`, "⬇︎", "#34c759");
}

/* ---------- 로그인 (교사 암호) ---------- */
function lkMsg(t, err = false) { const m = $("#lkMsg"); m.innerHTML = t; m.classList.toggle("err", err); }
$("#lkForm").addEventListener("submit", async e => {
  e.preventDefault();
  const pw = $("#lkPw").value.trim();
  if (!pw) return lkMsg("암호를 입력하세요.", true);
  $("#lkGo").disabled = true; lkMsg('<span class="spinner"></span>');
  try { await S.teacherLogin(pw); lkMsg(""); show(); }
  catch (err) { lkMsg(err.code === "wrong-password" ? "암호가 맞지 않아요." : "연결에 실패했어요. 다시 시도하세요.", true); $("#lkPw").select(); }
  finally { $("#lkGo").disabled = false; }
});
let lastAt = 0;
setInterval(() => { if (lastAt) $("#liveStatus").textContent = `● ${Math.max(0, Math.round((Date.now() - lastAt) / 1000))}초 전 갱신`; }, 1000);
function startData() {
  st.un.forEach(u => u()); st.un = [];
  $("#liveStatus").innerHTML = '<span class="spinner dark"></span>';
  st.un.push(S.watchAll(d => {
    st.students = d.students || {}; st.answers = d.answers || {}; st.open = d.open || {}; st.fb = d.fb || {};
    lastAt = Date.now(); $("#liveStatus").textContent = "● 방금 갱신";
    render();
  }, e => {
    console.error(e);
    if (e.code === "wrong-password") { S.teacherLogout(); hide(); lkMsg("암호가 바뀌었어요. 다시 입력하세요.", true); return; }
    $("#liveStatus").textContent = "⚠︎ 연결 끊김 · 다시 시도 중";
  }));
}
function show() {
  $("#tEmail").textContent = S.isLocal() ? "로컬 모드" : "관리자";
  $("#login").classList.remove("show"); $("#win").classList.add("show");
  startData();
}
function hide() { st.un.forEach(x => x()); st.un = []; $("#win").classList.remove("show"); $("#login").classList.add("show"); $("#lkPw").focus(); }

(async function boot() {
  await S.initStore();
  $("#sideFoot").innerHTML = S.isLocal()
    ? '<span class="local-badge">로컬 모드</span><br>스프레드시트 연결 전이에요. 이 브라우저에 저장된 데이터만 보여요.'
    : "구글 스프레드시트와 연결돼 있어요.<br>10초마다 새로 불러와요.";
  if (S.teacherSession()) show(); else hide();
})();
