/* =====================================================================
   Writing Studio — Google Apps Script 서버
   스프레드시트 → 확장 프로그램 → Apps Script 에 이 코드를 통째로 붙여 넣고
   배포 → 새 배포 → 웹 앱 (실행: 나, 액세스: 모든 사용자) 로 배포하세요.
   ===================================================================== */

// 교사(관리자) 암호 — 공개 저장소에는 진짜 암호를 올리지 마세요.
// Apps Script 편집기에 붙여 넣은 뒤 아래 값을 원하는 암호로 바꿔 저장하세요.
const TEACHER_PASSWORD = 'CHANGE_ME';
const QIDS = ['q1', 'q2', 'q3', 'q4'];

const SH_SET = '설정', SH_STU = '학생', SH_ANS = '답안';
const STU_COLS = [['sid', '학번'], ['name', '이름'], ['cls', '반'], ['num', '번호'], ['createdAt', '등록 시각']];
const ANS_COLS = [
  ['id', 'ID'], ['sid', '학번'], ['qid', '문항'], ['name', '이름'], ['cls', '반'],
  ['answer', '답안'], ['signName', '서명'], ['words', '단어 수'],
  ['draftAt', '임시저장 시각'], ['submittedAt', '제출 시각'],
  ['checks', '조건 체크'], ['s_task', '과제 점수'], ['s_content', '내용 및 구성 점수'], ['s_lang', '언어 사용 점수'],
  ['r_task', '과제 근거'], ['r_content', '내용 및 구성 근거'], ['r_lang', '언어 사용 근거'],
  ['revised', '고쳐 쓴 답안'], ['selfTotal', '자가채점 합계'], ['gradedAt', '자가채점 시각'], ['updatedAt', '마지막 저장 시각']
];
const TIME_KEYS = ['createdAt', 'draftAt', 'submittedAt', 'gradedAt', 'updatedAt'];
const STUDENT_FIELDS = ['answer', 'signName', 'words', 'draftAt', 'submittedAt', 'checks', 'scores', 'reasons', 'revised', 'selfTotal', 'gradedAt'];
const LOCKED_AFTER_SUBMIT = ['answer', 'signName', 'words', 'draftAt', 'submittedAt'];

/* ---------------- 진입점 ---------------- */
function doGet() { return out({ ok: true, app: 'Writing Studio' }); }

function doPost(e) {
  let req = {};
  try { req = JSON.parse(e.postData.contents || '{}'); } catch (err) { return out({ ok: false, error: 'BAD_JSON' }); }
  try {
    const fn = ACTIONS[req.action];
    if (!fn) return out({ ok: false, error: 'UNKNOWN_ACTION' });
    if (req.action.charAt(0) === 't' && (TEACHER_PASSWORD === 'CHANGE_ME' || String(req.pw) !== TEACHER_PASSWORD)) return out({ ok: false, error: 'WRONG_PASSWORD' });
    return out(Object.assign({ ok: true }, fn(req) || {}));
  } catch (err) {
    return out({ ok: false, error: String(err.message || err) });
  }
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

const ACTIONS = {
  /* ----- 학생 ----- */
  lookup: (r) => { const s = findStudent(r.sid); return s ? { exists: true, name: s.name } : { exists: false }; },
  register: (r) => withLock(() => {
    const sid = String(r.sid || ''), name = cleanName(r.name);
    if (!/^3\d{4}$/.test(sid)) throw new Error('BAD_SID');
    if (name.length < 2 || name.length > 12) throw new Error('BAD_NAME');
    const ex = findStudent(sid);
    if (ex) return { exists: true, name: ex.name };
    sheet(SH_STU).appendRow([sid, name, +sid.slice(1, 3), +sid.slice(3), new Date()]);
    return { exists: false, name: name };
  }),
  state: () => ({ open: readOpen() }),
  mine: (r) => {
    checkStudent(r.sid, r.name);
    const all = readAnswers(), res = {};
    QIDS.forEach(q => { res[q] = all[r.sid + '_' + q] || null; });
    return { answers: res, open: readOpen() };
  },
  save: (r) => withLock(() => {
    checkStudent(r.sid, r.name);
    const q = r.qid;
    if (QIDS.indexOf(q) < 0) throw new Error('BAD_QID');
    const sh = sheet(SH_ANS), id = r.sid + '_' + q;
    const { row, obj } = findAnswerRow(sh, id);
    const cur = obj || { id: id, sid: r.sid, qid: q };
    const patch = r.patch || {};
    if (cur.submittedAt) {
      LOCKED_AFTER_SUBMIT.forEach(k => { if (k in patch) delete patch[k]; });
    } else if (!readOpen()[q]) {
      throw new Error('CLOSED');
    }
    const now = new Date();
    STUDENT_FIELDS.forEach(k => {
      if (!(k in patch)) return;
      let v = patch[k];
      if (v === '__now__') v = now;
      if (typeof v === 'string' && v.length > 6000) v = v.slice(0, 6000);
      cur[k] = v;
    });
    cur.name = r.name; cur.cls = +String(r.sid).slice(1, 3); cur.updatedAt = now;
    writeAnswer(sh, row, cur);
    return { answer: pack(cur) };
  }),

  /* ----- 교사 (암호 필요) ----- */
  tCheck: () => ({}),
  tAll: () => ({ students: readStudents(), answers: readAnswers(), open: readOpen() }),
  tSetOpen: (r) => withLock(() => {
    if (QIDS.indexOf(r.qid) < 0) throw new Error('BAD_QID');
    const sh = sheet(SH_SET), v = sh.getDataRange().getValues(), key = 'open_' + r.qid;
    let found = false;
    for (let i = 1; i < v.length; i++) if (v[i][0] === key) { sh.getRange(i + 1, 2).setValue(!!r.val); found = true; }
    if (!found) sh.appendRow([key, !!r.val]);
    return { open: readOpen() };
  }),
  tReopen: (r) => withLock(() => {
    const sh = sheet(SH_ANS), { row, obj } = findAnswerRow(sh, r.sid + '_' + r.qid);
    if (!obj) return {};
    ['submittedAt', 'checks', 'scores', 'reasons', 'revised', 'selfTotal', 'gradedAt'].forEach(k => delete obj[k]);
    obj.updatedAt = new Date();
    writeAnswer(sh, row, obj);
    return {};
  }),
  tDelete: (r) => withLock(() => {
    const sid = String(r.sid);
    [[SH_ANS, 1], [SH_STU, 0]].forEach(([n, col]) => {
      const sh = sheet(n), v = sh.getDataRange().getValues();
      for (let i = v.length - 1; i >= 1; i--) if (String(v[i][col]) === sid) sh.deleteRow(i + 1);
    });
    return {};
  })
};

/* ---------------- 시트 도우미 ---------------- */
function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet(name) {
  let sh = ss().getSheetByName(name);
  if (!sh) { setup(); sh = ss().getSheetByName(name); }
  return sh;
}
/* 처음 한 번 실행하면 시트 3개가 만들어집니다 (doPost에서도 자동 실행) */
function setup() {
  const s = ss();
  const make = (name, headers, widths) => {
    let sh = s.getSheetByName(name);
    if (!sh) sh = s.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.appendRow(headers);
      sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8f0fe');
      sh.setFrozenRows(1);
      (widths || []).forEach((w, i) => w && sh.setColumnWidth(i + 1, w));
    }
    return sh;
  };
  const set = make(SH_SET, ['항목', '값'], [120, 80]);
  if (set.getLastRow() === 1) QIDS.forEach(q => set.appendRow(['open_' + q, false]));
  make(SH_STU, STU_COLS.map(c => c[1]), [70, 90, 50, 50, 150]);
  make(SH_ANS, ANS_COLS.map(c => c[1]), [100, 70, 50, 80, 40, 360, 100, 60, 140, 140, 90, 70, 70, 70, 200, 200, 200, 360, 80, 140, 140]);
  const def = s.getSheetByName('시트1') || s.getSheetByName('Sheet1');
  if (def && s.getSheets().length > 3 && def.getLastRow() === 0) s.deleteSheet(def);
}
function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}
const cleanName = (s) => String(s || '').replace(/\s+/g, '').trim();
const ms = (v) => (v instanceof Date) ? v.getTime() : (v === '' || v === null || v === undefined ? null : v);

function readOpen() {
  const v = sheet(SH_SET).getDataRange().getValues(), o = {};
  QIDS.forEach(q => o[q] = false);
  for (let i = 1; i < v.length; i++) {
    const k = String(v[i][0]);
    if (k.indexOf('open_') === 0) o[k.slice(5)] = v[i][1] === true || String(v[i][1]).toUpperCase() === 'TRUE';
  }
  return o;
}
function readStudents() {
  const v = sheet(SH_STU).getDataRange().getValues(), o = {};
  for (let i = 1; i < v.length; i++) {
    if (!v[i][0]) continue;
    const s = {}; STU_COLS.forEach(([k], j) => s[k] = ms(v[i][j]));
    s.sid = String(s.sid); s.name = String(s.name);
    o[s.sid] = s;
  }
  return o;
}
function findStudent(sid) { return readStudents()[String(sid)] || null; }
function checkStudent(sid, name) {
  const s = findStudent(sid);
  if (!s) throw new Error('NO_STUDENT');
  if (cleanName(s.name) !== cleanName(name)) throw new Error('NAME_MISMATCH');
}

/* 행 → 객체 */
function rowToObj(r) {
  const raw = {}; ANS_COLS.forEach(([k], j) => raw[k] = r[j]);
  const o = {};
  ['id', 'sid', 'qid', 'name', 'answer', 'signName', 'revised'].forEach(k => o[k] = raw[k] === '' ? '' : String(raw[k]));
  o.cls = raw.cls === '' ? null : +raw.cls;
  o.words = raw.words === '' ? 0 : +raw.words;
  TIME_KEYS.forEach(k => { if (k in raw) o[k] = ms(raw[k]); });
  if (raw.checks !== '') o.checks = String(raw.checks).split('').map(x => x === '○');
  const sc = {}, rs = {}; let has = false;
  ['task', 'content', 'lang'].forEach(k => {
    if (raw['s_' + k] !== '') { sc[k] = +raw['s_' + k]; has = true; }
    if (raw['r_' + k] !== '') rs[k] = String(raw['r_' + k]);
  });
  if (has) { o.scores = sc; o.reasons = rs; }
  if (raw.selfTotal !== '') o.selfTotal = +raw.selfTotal;
  Object.keys(o).forEach(k => { if (o[k] === null || o[k] === '') delete o[k]; });
  if (!o.answer) o.answer = '';
  return o;
}
/* 객체 → 행 */
function objToRow(o) {
  const sc = o.scores || {}, rs = o.reasons || {};
  const flat = Object.assign({}, o, {
    checks: o.checks ? o.checks.map(x => x ? '○' : '×').join('') : '',
    s_task: nz(sc.task), s_content: nz(sc.content), s_lang: nz(sc.lang),
    r_task: nz(rs.task), r_content: nz(rs.content), r_lang: nz(rs.lang)
  });
  return ANS_COLS.map(([k]) => {
    let v = flat[k];
    if (v === undefined || v === null) return '';
    if (TIME_KEYS.indexOf(k) >= 0 && typeof v === 'number') return new Date(v);
    if (typeof v === 'string' && /^[=+\-@]/.test(v) && ['answer', 'revised', 'signName', 'r_task', 'r_content', 'r_lang', 'name'].indexOf(k) >= 0) return "'" + v;
    return v;
  });
}
function nz(v) { return v === undefined || v === null ? '' : v; }
function pack(o) { return rowToObj(objToRow(o).map(v => (typeof v === 'string' && v.charAt(0) === "'") ? v.slice(1) : v)); }

function readAnswers() {
  const v = sheet(SH_ANS).getDataRange().getValues(), o = {};
  for (let i = 1; i < v.length; i++) if (v[i][0]) { const a = rowToObj(v[i]); o[a.id] = a; }
  return o;
}
function findAnswerRow(sh, id) {
  const ids = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues();
  for (let i = 1; i < ids.length; i++) if (String(ids[i][0]) === id) {
    return { row: i + 1, obj: rowToObj(sh.getRange(i + 1, 1, 1, ANS_COLS.length).getValues()[0]) };
  }
  return { row: null, obj: null };
}
function writeAnswer(sh, row, obj) {
  const r = objToRow(obj);
  if (row) sh.getRange(row, 1, 1, r.length).setValues([r]);
  else sh.appendRow(r);
}
