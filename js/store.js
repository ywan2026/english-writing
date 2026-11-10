/* =====================================================================
   데이터 저장소 — Google 스프레드시트(Apps Script 웹 앱) 또는 로컬 모드
   스프레드시트 시트: 설정 / 학생 / 답안   (apps-script/Code.gs 참고)
   실시간 연결 대신 몇 초마다 새로 불러옵니다(학생 30초, 교사 10초).
   ===================================================================== */
import { SCRIPT_URL } from "./config.js?v=20261110a";

const LS = "english-writing-v1";
const TPW = "english-writing-tpw";
export const NOW = "__now__";
const remote = !!SCRIPT_URL;
export const isLocal = () => !remote;

export const ms = (v) => (typeof v === "number" ? v : null);
export const classOf = (sid) => +String(sid).slice(1, 3);
export const numOf = (sid) => +String(sid).slice(3, 5);
const aid = (sid, qid) => `${sid}_${qid}`;

/* ---------- 서버 호출 ---------- */
const MSG = {
  CLOSED: "permission-denied", NAME_MISMATCH: "name-mismatch", NO_STUDENT: "no-student",
  WRONG_PASSWORD: "wrong-password", BAD_SID: "bad-sid", BAD_NAME: "bad-name"
};
async function call(action, data = {}, tries = 2) {
  let lastErr;
  for (let t = 0; t < tries; t++) {
    try {
      // Content-Type을 지정하지 않아야(text/plain) CORS 사전 요청 없이 Apps Script에 보낼 수 있어요
      const res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action, ...data }), redirect: "follow" });
      const j = await res.json();
      if (!j.ok) { const e = new Error(j.error); e.code = MSG[j.error] || j.error; throw e; }
      return j;
    } catch (e) {
      lastErr = e;
      if (e.code) throw e;              // 서버가 거절한 것은 다시 시도하지 않음
      await new Promise(r => setTimeout(r, 800));
    }
  }
  const e = new Error("NETWORK"); e.code = "network"; e.cause = lastErr; throw e;
}

/* ---------- 로컬 모드 ---------- */
const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch (e) { return {}; } };
const lsSet = (o) => { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) {} window.dispatchEvent(new Event("ew-local")); };
const lsPatch = (fn) => { const o = lsGet(); o.settings ||= { open: {} }; o.students ||= {}; o.answers ||= {}; const r = fn(o); lsSet(o); return r; };
const onLocal = (fn) => {
  const h = () => fn(); const s = (e) => { if (e.key === LS) fn(); };
  window.addEventListener("ew-local", h); window.addEventListener("storage", s);
  return () => { window.removeEventListener("ew-local", h); window.removeEventListener("storage", s); };
};

/* 주기적으로 불러오기 (화면이 보일 때만) */
const pollers = new Set();
function poll(fn, every) {
  let stop = false, timer = null;
  const run = async () => { clearTimeout(timer); if (stop) return; try { await fn(); } catch (e) {} if (!stop) timer = setTimeout(run, every); };
  const vis = () => { if (document.visibilityState === "visible") run(); };
  document.addEventListener("visibilitychange", vis);
  const p = { run }; pollers.add(p);
  run();
  return () => { stop = true; clearTimeout(timer); document.removeEventListener("visibilitychange", vis); pollers.delete(p); };
}
export function refreshNow() { pollers.forEach(p => p.run()); }

export async function initStore() {
  if (!remote) return { local: true };
  return { local: false };
}

/* ================= 학생 ================= */
export async function lookupStudent(sid) {
  if (!remote) { const s = lsGet().students?.[sid]; return s ? { exists: true, name: s.name } : { exists: false }; }
  const r = await call("lookup", { sid });
  return { exists: r.exists, name: r.name };
}

export async function createStudent(sid, name) {
  if (!remote) { lsPatch(o => { o.students[sid] ||= { sid, name, cls: classOf(sid), num: numOf(sid), createdAt: Date.now() }; }); return; }
  const r = await call("register", { sid, name });
  if (r.exists && r.name.replace(/\s+/g, "") !== name.replace(/\s+/g, "")) { const e = new Error("NAME_MISMATCH"); e.code = "name-mismatch"; throw e; }
}

export function watchSettings(cb) {
  if (!remote) { const run = () => { const st = lsGet().settings || {}; cb({ open: st.open || {}, fb: st.fb || {} }); }; run(); return onLocal(run); }
  return poll(async () => { const r = await call("state", {}, 1); cb({ open: r.open, fb: r.fb || {} }); }, 30000);
}

export async function getMyAnswers(sid, qids, name) {
  if (!remote) {
    const o = lsGet(), A = o.answers || {}, fb = o.settings?.fb || {};
    return Object.fromEntries(qids.map(q => [q, hideFb(A[aid(sid, q)] ? { ...A[aid(sid, q)] } : null, fb)]));
  }
  const r = await call("mine", { sid, name });
  return r.answers;
}

/* base: {sid,qid,name,cls} */
export async function saveAnswer(base, patch) {
  if (!remote) {
    return lsPatch(o => {
      const id = aid(base.sid, base.qid), cur = o.answers[id] || {};
      if (cur.submittedAt && "answer" in patch && patch.answer !== cur.answer) { const e = new Error("LOCKED"); e.code = "permission-denied"; throw e; }
      if (!cur.submittedAt && !o.settings.open?.[base.qid]) { const e = new Error("CLOSED"); e.code = "permission-denied"; throw e; }
      const now = Date.now(), p = {};
      for (const [k, v] of Object.entries(patch)) p[k] = v === NOW ? now : v;
      o.answers[id] = { ...cur, ...base, id, ...p, updatedAt: now };
      return hideFb({ ...o.answers[id] }, o.settings.fb || {});
    });
  }
  const r = await call("save", { sid: base.sid, name: base.name, qid: base.qid, patch });
  return r.answer;
}

export function signOutStudent() {}

const FB_KEYS = ["fbGood", "fbFix", "fbRewrite", "fbAt"];
function hideFb(a, fb) { if (a && !fb[a.qid]) FB_KEYS.forEach(k => delete a[k]); return a; }

/* ================= 교사 ================= */
export const teacherSession = () => sessionStorage.getItem(TPW);
export async function teacherLogin(pw) {
  if (remote) await call("tCheck", { pw });
  else if (!pw) { const e = new Error("WRONG_PASSWORD"); e.code = "wrong-password"; throw e; }
  sessionStorage.setItem(TPW, pw);
}
export function teacherLogout() { sessionStorage.removeItem(TPW); }
const tcall = (action, data = {}) => call(action, { ...data, pw: teacherSession() });

export async function setOpen(qid, val) {
  if (!remote) { lsPatch(o => { o.settings.open = { ...(o.settings.open || {}), [qid]: val }; }); return; }
  await tcall("tSetOpen", { qid, val });
}

export async function setFb(qid, val) {
  if (!remote) { lsPatch(o => { o.settings.fb = { ...(o.settings.fb || {}), [qid]: val }; }); return; }
  await tcall("tSetFb", { qid, val });
}

/* 피드백 저장: rows = [{sid, qid, good, fix, rewrite}] → {updated, missing[]} */
export async function saveFeedback(rows, onProgress) {
  if (!remote) {
    return lsPatch(o => {
      let updated = 0; const missing = [];
      rows.forEach(x => {
        const a = o.answers[aid(x.sid, x.qid)];
        if (!a) { missing.push(aid(x.sid, x.qid)); return; }
        const has = [x.good, x.fix, x.rewrite].some(v => (v || "").trim());
        Object.assign(a, { fbGood: x.good || "", fbFix: x.fix || "", fbRewrite: x.rewrite || "", fbAt: has ? Date.now() : null });
        if (!has) delete a.fbAt;
        updated++;
      });
      return { updated, missing };
    });
  }
  let updated = 0; const missing = [];
  for (let i = 0; i < rows.length; i += 40) {
    const r = await tcall("tFeedback", { rows: rows.slice(i, i + 40) });
    updated += r.updated; missing.push(...r.missing);
    onProgress && onProgress(Math.min(i + 40, rows.length), rows.length);
  }
  return { updated, missing };
}

/* cb({students, answers, open, fb}) */
export function watchAll(cb, onErr) {
  if (!remote) {
    const run = () => { const o = lsGet(); cb({ students: o.students || {}, answers: o.answers || {}, open: o.settings?.open || {}, fb: o.settings?.fb || {} }); };
    run(); return onLocal(run);
  }
  return poll(async () => {
    try { const r = await tcall("tAll"); cb({ students: r.students, answers: r.answers, open: r.open, fb: r.fb || {} }); }
    catch (e) { onErr && onErr(e); throw e; }
  }, 10000);
}

/* 제출 취소: 답안은 남기고 다시 쓸 수 있게 */
export async function reopenAnswer(sid, qid) {
  const kill = ["submittedAt", "checks", "scores", "reasons", "revised", "selfTotal", "gradedAt"];
  if (!remote) { lsPatch(o => { const a = o.answers[aid(sid, qid)]; if (a) kill.forEach(k => delete a[k]); }); return; }
  await tcall("tReopen", { sid, qid });
}

/* 학생 기록 전체 삭제 */
export async function deleteStudent(sid, qids) {
  if (!remote) { lsPatch(o => { delete o.students[sid]; qids.forEach(q => delete o.answers[aid(sid, q)]); }); return; }
  await tcall("tDelete", { sid });
}
