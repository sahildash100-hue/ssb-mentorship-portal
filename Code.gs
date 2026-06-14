const SHEET_ID = '1nUNq_rHOAkA80yjLxRehH-xf1IXEbein-T2LZMsuZrY';
const SHEETS = {
  MENTOR:  'Mentor Details',
  MASTER:  'Master Session Details',
  STUDENT: 'Student Data'
};
const SESSION_DURATION_MIN = 60;
const AVAIL_PREFIX = 'Avail_';   // each mentor gets a locked tab: Avail_<MentorID> with columns Date | Start Time
// Only these emails may log in as students (others are denied even if in Student Data).
// Set to [] to allow ANY registered student. Edit this list to add/remove access.
const ALLOWED_STUDENTS = ['sahil.dash100@gmail.com', 'shanmuga@ssb.scaler.com'];
/* ===================== Web app entry ===================== */
function doGet(e) {
  const params = (e && e.parameter) || {};
  const t = HtmlService.createTemplateFromFile('index');
  t.initialView = params.view || 'app';      // 'app' | 'mentor-feedback'
  t.sid = params.sid || '';                   // session row for mentor feedback
  t.webAppUrl = ScriptApp.getService().getUrl();   // for the sign-out / switch-account link
  return t.evaluate()
    .setTitle('SSB Mentorship Booking Portal')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
function getWebAppUrl_() {
  return ScriptApp.getService().getUrl();
}
/** Direct link to the Master Session Details tab, optionally anchored to a row,
 *  so a mentor can write feedback straight into the sheet. */
function masterSheetUrl_(row) {
  const gid = getSheet_(SHEETS.MASTER).getSheetId();
  let url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit#gid=' + gid;
  if (row) url += '&range=A' + row;
  return url;
}
/* ===================== Sheet helpers ===================== */
function getSheet_(name) {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(name);
  if (!sh) throw new Error('Sheet not found: ' + name);
  return sh;
}
/** Read a sheet into [{__row, header:value,...}] with trimmed headers. */
function readObjects_(name) {
  const sh = getSheet_(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return { headers: (values[0] || []).map(trim_), rows: [] };
  const headers = values[0].map(trim_);
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i].join('') === '') continue;            // skip blank rows
    const obj = { __row: i + 1 };
    headers.forEach((h, c) => obj[h] = values[i][c]);
    rows.push(obj);
  }
  return { headers, rows };
}
function headerIndex_(sh) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(trim_);
  const map = {};
  headers.forEach((h, i) => map[h] = i + 1);            // 1-based column
  return map;
}
/** Return the 1-based column for a header, creating the column if missing. */
function ensureColumn_(sh, header) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(trim_);
  const i = headers.indexOf(header);
  if (i !== -1) return i + 1;
  const col = sh.getLastColumn() + 1;
  sh.getRange(1, col).setValue(header).setFontWeight('bold');
  return col;
}
const trim_ = v => String(v == null ? '' : v).trim();
const lc_   = v => trim_(v).toLowerCase();
const blank_ = v => trim_(v) === '';
function toISO_(v) {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toISOString();
}
function formatDateTime_(d) {
  return Utilities.formatDate(new Date(d), Session.getScriptTimeZone(), "EEE, dd MMM yyyy '•' hh:mm a");
}
/* ===================== Authentication ===================== */
function getActiveEmail_() {
  return lc_(Session.getActiveUser().getEmail());
}
/** Returns the student record for the logged-in user, or null. */
function getActiveStudent() {
  const email = getActiveEmail_();
  if (!email) return null;
  if (ALLOWED_STUDENTS.length && ALLOWED_STUDENTS.indexOf(email) === -1) return null;  // allowlist gate
  const { rows } = readObjects_(SHEETS.STUDENT);
  const m = rows.find(r => lc_(r['Student Email']) === email);
  if (!m) return null;
  return {
    email: trim_(m['Student Email']),
    name:  trim_(m['Full Name']),
    roll:  trim_(m['Roll No']),
    batch: trim_(m['Batch'])
  };
}
/* ===================== Dashboard / data ===================== */
function getDashboardData() {
  const student = getActiveStudent();
  if (!student) return { authorized: false, email: getActiveEmail_() };
  const sessions = getStudentSessions_(student.email);
  const now = new Date();
  let completed = 0, pendingFeedback = 0;
  sessions.forEach(s => {
    const dt = s.datetime ? new Date(s.datetime) : null;
    const isPast = dt && dt < now;
    if (isPast) completed++;
    if (isPast && (blank_(s.studentFeedback) || blank_(s.studentRating))) pendingFeedback++;
  });
  return {
    authorized: true,
    student,
    summary: { total: sessions.length, completed, pendingFeedback },
    sessions
  };
}
/** All sessions for an email, newest first, normalized. */
function getStudentSessions_(email) {
  const { rows } = readObjects_(SHEETS.MASTER);
  const e = lc_(email);
  const list = rows
    .filter(r => lc_(r['Student Email']) === e)
    .map(normalizeSession_);
  list.sort((a, b) => new Date(b.datetime || 0) - new Date(a.datetime || 0));
  return list;
}
/** All sessions for a given mentor (across all students), normalized. */
function getMentorSessions_(mentorName) {
  const { rows } = readObjects_(SHEETS.MASTER);
  const n = lc_(mentorName);
  return rows.filter(r => lc_(r['MSN-Mentor']) === n).map(normalizeSession_);
}
function normalizeSession_(r) {
  return {
    row:            r.__row,
    sessionNo:      trim_(r['MSN Session']),
    mentor:         trim_(r['MSN-Mentor']),
    datetime:       toISO_(r['MSN-DATETime']),
    meetLink:       trim_(r['Meetlink']),
    recording:      trim_(r['MSN-Recording']),
    studentFeedback:trim_(r['MSN-StudentFeedback']),
    studentRating:  trim_(r['MSN-StudentRating']),
    mentorFeedback: trim_(r['MSN-MentorFeedback']),
    mentorRating:   trim_(r['MSN-MentorRating']),
    studentCompleted: trim_(r['MSN-StudentCompleted']),
    mentorCompleted:  trim_(r['MSN-MentorCompleted']),
    studentEmail:   trim_(r['Student Email']),
    studentName:    trim_(r['Full Name']),
    roll:           trim_(r['Roll No']),
    batch:          trim_(r['Batch'])
  };
}
/* ===================== Mentors ===================== */
function getMentors() {
  const { rows } = readObjects_(SHEETS.MENTOR);
  const list = rows.map(r => ({
    id:        trim_(r['ID']),
    name:      trim_(r['Name']),
    email:     trim_(r['Email']),
    linkedin:  trim_(r['LinkedIn']),
    portfolio: trim_(r['PortfolioLink']),
    exp:       trim_(r['Year of Exp']),
    university:trim_(r['University']),
    stream:    trim_(r['Education Stream']),
    role:      trim_(r['Current Role']),
    org:       trim_(r['Current Organization']),
    skills:    trim_(r['Skills']),
    photo:     trim_(r['PhotoLink']),
    calendly:  trim_(r['CalendlyLink']),
    meetingLink: trim_(r['MeetingLink']) || trim_(r['CalendlyLink']) || trim_(r['SchedulistaLink'])
  })).filter(m => m.name);
  // Feature Sahil Dash first in the Mentors list (stable for everyone else)
  const FEATURED = 'sahil.25035@ssb.scaler.com';
  list.sort((a, b) => (lc_(b.email) === FEATURED ? 1 : 0) - (lc_(a.email) === FEATURED ? 1 : 0));
  return list;
}
function getMentorById_(id) {
  return getMentors().find(m => String(m.id) === String(id)) || null;
}
function getMentorByName_(name) {
  return getMentors().find(m => lc_(m.name) === lc_(name)) || null;
}
/* ===================== Availability / slots ===================== */
/** Combine a Date-or-string date cell + a Date-or-string time cell into one
 *  Date in the script timezone. Tolerant of how Sheets stores the cells. */
function buildSlotDate_(dateCell, timeCell) {
  let y, mo, d;
  if (dateCell instanceof Date) {
    y = dateCell.getFullYear(); mo = dateCell.getMonth(); d = dateCell.getDate();
  } else {
    const ds = trim_(dateCell);
    let mt = ds.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);          // yyyy-mm-dd
    if (mt) { y = +mt[1]; mo = +mt[2] - 1; d = +mt[3]; }
    else {
      mt = ds.match(/^(\d{1,2})\D+(\d{1,2})\D+(\d{4})/);           // dd-mm-yyyy
      if (!mt) return null;
      d = +mt[1]; mo = +mt[2] - 1; y = +mt[3];
    }
  }
  let h = 0, mi = 0;
  if (timeCell instanceof Date) {
    h = timeCell.getHours(); mi = timeCell.getMinutes();
  } else {
    const tm = trim_(timeCell).match(/(\d{1,2}):(\d{2})/);
    if (tm) { h = +tm[1]; mi = +tm[2]; }
  }
  const dt = new Date(y, mo, d, h, mi, 0, 0);
  return isNaN(dt.getTime()) ? null : dt;
}
/** The locked availability tab name for a mentor (one tab per mentor). */
function availTabName_(mentor) {
  return AVAIL_PREFIX + mentor.id;
}
const SLOT_WEEKS_AHEAD = 4;   // how many weeks of recurring slots to offer the student
/** Map a weekday name (Mon / Monday / etc.) to 0=Sun..6=Sat, or -1 if invalid. */
function weekdayIndex_(name) {
  const map = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 };
  const k = lc_(name).slice(0, 3);
  return (k in map) ? map[k] : -1;
}
/** Available, bookable 60-min slots from a mentor's RECURRING weekly schedule
 *  in their locked 'Avail_<ID>' tab (columns: Day | Start Time). Generates
 *  concrete dates for the next SLOT_WEEKS_AHEAD weeks, future-only, minus booked.
 *  Returns [{ iso, label, date }] (date = yyyy-MM-dd for the calendar picker). */
function getMentorSlots(mentorId) {
  const mentor = getMentorById_(mentorId);
  if (!mentor) return [];
  let sh;
  try { sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(availTabName_(mentor)); } catch (e) { sh = null; }
  if (!sh) return [];
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(h => lc_(h));
  const cDay = headers.indexOf('day');
  let   cTime = headers.indexOf('start time');
  if (cTime === -1) cTime = headers.indexOf('time');
  if (cDay === -1 || cTime === -1) return [];

  // Weekly recurring rules: [{ dow, h, mi }]
  const rules = [];
  for (let i = 1; i < values.length; i++) {
    const dow = weekdayIndex_(values[i][cDay]);
    const tm = trim_(values[i][cTime]).match(/(\d{1,2}):(\d{2})/);
    if (dow >= 0 && tm) rules.push({ dow: dow, h: +tm[1], mi: +tm[2] });
  }
  if (!rules.length) return [];

  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const booked = {};
  getMentorSessions_(mentor.name).forEach(s => {
    if (s.datetime) booked[new Date(s.datetime).getTime()] = true;
  });

  const seen = {}, out = [];
  for (let d = 0; d < SLOT_WEEKS_AHEAD * 7; d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
    const dow = day.getDay();
    rules.forEach(r => {
      if (r.dow !== dow) return;
      const dt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), r.h, r.mi, 0, 0);
      if (dt <= now) return;
      const t = dt.getTime();
      if (booked[t] || seen[t]) return;
      seen[t] = true;
      out.push({ iso: dt.toISOString(), label: formatDateTime_(dt), date: Utilities.formatDate(dt, tz, 'yyyy-MM-dd') });
    });
  }
  out.sort((a, b) => new Date(a.iso) - new Date(b.iso));
  return out;
}
/* ---- One-time provisioning: create + lock each mentor's availability tab ---- */
/** Create (if missing) a mentor's availability tab with 3 editable starter
 *  slots, force canonical text format, and lock editing to that mentor's email.
 *  Run once per mentor — or use provisionAllMentorSheets(). */
function provisionMentorSheet(mentorId) {
  const mentor = getMentorById_(mentorId);
  if (!mentor) throw new Error('Mentor not found: ' + mentorId);
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const name = availTabName_(mentor);
  const SEED = [                                  // recurring weekly: 3 days, 2 slots each
    ['Monday', '17:00'], ['Monday', '18:00'],
    ['Wednesday', '17:00'], ['Wednesday', '18:00'],
    ['Friday', '17:00'], ['Friday', '18:00']
  ];
  let sh = ss.getSheetByName(name);
  if (sh) sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(p => p.remove());  // unlock to edit
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, 2).setValues([['Day', 'Start Time']]).setFontWeight('bold');
    sh.getRange(2, 1, 6, 2).setValues(SEED);
    sh.setColumnWidth(1, 140); sh.setColumnWidth(2, 120);
  } else if (lc_(sh.getRange(1, 1).getValue()) !== 'day') {
    // Migrate an old 'Date | Start Time' tab to the recurring 'Day | Start Time' schema
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(sh.getLastColumn(), 2)).clearContent();
    sh.getRange(1, 1, 1, 2).setValues([['Day', 'Start Time']]).setFontWeight('bold');
    sh.getRange(2, 1, 6, 2).setValues(SEED);
    sh.setColumnWidth(1, 140); sh.setColumnWidth(2, 120);
  }
  // Keep day/time as canonical text so Sheets auto-formatting can't drift it
  sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), 2).setNumberFormat('@');
  // Re-lock: only this mentor (+ owner) may edit the tab
  if (mentor.email) {
    const prot = sh.protect().setDescription('Availability — ' + mentor.name);
    if (prot.canDomainEdit()) prot.setDomainEdit(false);
    prot.removeEditors(prot.getEditors());
    prot.addEditor(mentor.email);
  }
  return 'Provisioned: ' + name + ' for ' + mentor.email;
}
/** Provision locked availability tabs for ALL mentors at once. */
function provisionAllMentorSheets() {
  return getMentors().map(function (m) {
    try { return provisionMentorSheet(m.id); } catch (e) { return 'ERR ' + m.id + ': ' + e.message; }
  });
}
/* ---- Format guard: normalize date/time as the mentor types ---- */
/** Simple trigger — when a mentor edits a Date/Start Time cell in an Avail_ tab,
 *  rewrite it in the portal's canonical format (yyyy-MM-dd / HH:mm). */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sh = e.range.getSheet();
    if (sh.getName().indexOf(AVAIL_PREFIX) !== 0) return;
    if (e.range.getRow() < 2) return;
    const tz = Session.getScriptTimeZone();
    const col = e.range.getColumn();
    if (col === 1) {
      const v = normalizeDayCell_(e.value);        // Day (weekday name)
      if (v !== null) e.range.setNumberFormat('@').setValue(v);
    } else if (col === 2) {
      const v = normalizeTimeCell_(e.value, tz);   // Start Time (HH:mm)
      if (v !== null) e.range.setNumberFormat('@').setValue(v);
    }
  } catch (err) { /* never block the mentor's edit */ }
}
/** Normalize a weekday cell to its full name (mon/MONDAY/etc → Monday). */
function normalizeDayCell_(v) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const idx = weekdayIndex_(v);
  return idx >= 0 ? days[idx] : null;
}
function normalizeDateCell_(v, tz) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  let mt = String(v).trim().match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})$/);   // yyyy-mm-dd
  if (mt) { const d = new Date(+mt[1], +mt[2] - 1, +mt[3]); if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz, 'yyyy-MM-dd'); }
  mt = String(v).trim().match(/^(\d{1,2})\D+(\d{1,2})\D+(\d{4})$/);       // dd-mm-yyyy
  if (mt) { const d = new Date(+mt[3], +mt[2] - 1, +mt[1]); if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz, 'yyyy-MM-dd'); }
  const d = new Date(v); if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  return null;
}
function normalizeTimeCell_(v, tz) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'HH:mm');
  const mt = String(v).trim().match(/^(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?$/i);
  if (mt) {
    let h = +mt[1], mi = +mt[2];
    if (mt[3]) { const pm = /p/i.test(mt[3]); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
    if (h < 24 && mi < 60) return (h < 10 ? '0' : '') + h + ':' + (mi < 10 ? '0' : '') + mi;
  }
  return null;
}
/* ===================== Feedback gate ===================== */
/** A student must have given feedback on every COMPLETED (past) session. */
function canBook() {
  const student = getActiveStudent();
  if (!student) return { authorized: false };
  const now = new Date();
  const pending = getStudentSessions_(student.email).find(s => {
    const dt = s.datetime ? new Date(s.datetime) : null;
    const isPast = dt && dt < now;
    return isPast && (blank_(s.studentFeedback) || blank_(s.studentRating));
  });
  return pending
    ? { authorized: true, allowed: false, pending }
    : { authorized: true, allowed: true };
}
function submitStudentFeedback(sessionRow, text, rating) {
  const student = getActiveStudent();
  if (!student) throw new Error('Not authorized.');
  rating = Number(rating);
  if (blank_(text) || !(rating >= 1 && rating <= 5)) {
    throw new Error('Please provide feedback text and a rating between 1 and 5.');
  }
  const sh = getSheet_(SHEETS.MASTER);
  const col = headerIndex_(sh);
  const owner = lc_(sh.getRange(Number(sessionRow), col['Student Email']).getValue());
  if (owner !== lc_(student.email)) throw new Error('Invalid session.');
  sh.getRange(Number(sessionRow), col['MSN-StudentFeedback']).setValue(text);
  sh.getRange(Number(sessionRow), col['MSN-StudentRating']).setValue(rating);
  return { ok: true };
}
/* ===================== Session completion (mutual) ===================== */
/** Student marks the meeting complete (their agreement). Emails the mentor a
 *  link to confirm + give feedback. */
function markStudentComplete(sessionRow) {
  const student = getActiveStudent();
  if (!student) throw new Error('Not authorized.');
  const sh = getSheet_(SHEETS.MASTER);
  const col = headerIndex_(sh);
  const owner = lc_(sh.getRange(Number(sessionRow), col['Student Email']).getValue());
  if (owner !== lc_(student.email)) throw new Error('Invalid session.');
  const scCol = ensureColumn_(sh, 'MSN-StudentCompleted');
  const mcCol = ensureColumn_(sh, 'MSN-MentorCompleted');
  sh.getRange(Number(sessionRow), scCol).setValue(new Date());
  const mentorCompleted = !blank_(sh.getRange(Number(sessionRow), mcCol).getValue());
  safe_(() => sendMentorCompletionEmail_(Number(sessionRow)));
  return { ok: true, bothCompleted: mentorCompleted };
}
/** Mentor confirms the meeting is complete (their agreement). */
function markMentorComplete(sessionRow) {
  const sh = getSheet_(SHEETS.MASTER);
  const col = headerIndex_(sh);
  const mentorName = trim_(sh.getRange(Number(sessionRow), col['MSN-Mentor']).getValue());
  const mentor = getMentorByName_(mentorName);
  if (!mentor || lc_(mentor.email) !== getActiveEmail_()) {
    throw new Error('You are not authorized to confirm this session.');
  }
  const scCol = ensureColumn_(sh, 'MSN-StudentCompleted');
  const mcCol = ensureColumn_(sh, 'MSN-MentorCompleted');
  sh.getRange(Number(sessionRow), mcCol).setValue(new Date());
  const studentCompleted = !blank_(sh.getRange(Number(sessionRow), scCol).getValue());
  return { ok: true, bothCompleted: studentCompleted };
}
/** Email the mentor a link to confirm completion + give feedback. */
function sendMentorCompletionEmail_(sessionRow) {
  const sh = getSheet_(SHEETS.MASTER);
  const col = headerIndex_(sh);
  const get = h => sh.getRange(Number(sessionRow), col[h]).getValue();
  const mentor = getMentorByName_(trim_(get('MSN-Mentor')));
  if (!mentor || !mentor.email) return;
  const html =
    '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">' +
    '<h2>Mentorship session — share your feedback</h2>' +
    '<p>Hi ' + esc_(mentor.name) + ',</p>' +
    '<p>The student <b>' + esc_(trim_(get('Full Name'))) + '</b> has marked your session (' +
    esc_(trim_(get('MSN Session'))) + ') as complete. Please share your feedback by filling the ' +
    '<b>MSN-MentorFeedback</b> and <b>MSN-MentorRating</b> (1–5) cells on <b>row ' + sessionRow + '</b> of the sheet:</p>' +
    '<p><a href="' + masterSheetUrl_(sessionRow) + '" style="background:#0d6efd;color:#fff;padding:10px 16px;' +
    'border-radius:6px;text-decoration:none">Open the feedback sheet &rarr;</a></p>' +
    '<p>— SSB Mentorship Portal</p></div>';
  GmailApp.sendEmail(mentor.email, 'Share your feedback — session with ' + trim_(get('Full Name')), '',
    { htmlBody: html, name: 'SSB Mentorship Portal' });
}
/** Student-triggered: re-email the mentor the confirm/feedback link.
 *  No-op if the mentor has already submitted feedback. */
function remindMentorFeedback(sessionRow) {
  const student = getActiveStudent();
  if (!student) throw new Error('Not authorized.');
  const sh = getSheet_(SHEETS.MASTER);
  const col = headerIndex_(sh);
  const owner = lc_(sh.getRange(Number(sessionRow), col['Student Email']).getValue());
  if (owner !== lc_(student.email)) throw new Error('Invalid session.');
  if (!blank_(sh.getRange(Number(sessionRow), col['MSN-MentorFeedback']).getValue())) {
    return { ok: true, already: true };
  }
  sendMentorCompletionEmail_(Number(sessionRow));
  return { ok: true };
}
/* ===================== Booking ===================== */
function bookSession(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const student = getActiveStudent();
    if (!student) throw new Error('Not authorized.');
    const gate = canBook();
    if (!gate.allowed) {
      throw new Error('You must submit feedback for your previous mentorship session before booking another session.');
    }
    const mentor = getMentorById_(payload.mentorId);
    if (!mentor) throw new Error('Mentor not found.');
    const start = new Date(payload.datetime);
    if (isNaN(start.getTime())) throw new Error('Invalid date/time.');
    if (start <= new Date()) throw new Error('You cannot book a session in the past.');
    const end = new Date(start.getTime() + SESSION_DURATION_MIN * 60000);
    // If the mentor has published availability, the chosen time must be one of those slots
    const publishedSlots = getMentorSlots(payload.mentorId);
    if (publishedSlots.length && !publishedSlots.some(s => new Date(s.iso).getTime() === start.getTime())) {
      throw new Error('Please choose one of the mentor\'s available slots.');
    }
    // Duplicate + overlap checks against the student's existing sessions
    const sessions = getStudentSessions_(student.email);
    sessions.forEach(s => {
      if (!s.datetime) return;
      const sStart = new Date(s.datetime);
      const sEnd = new Date(sStart.getTime() + SESSION_DURATION_MIN * 60000);
      if (sStart.getTime() === start.getTime() && lc_(s.mentor) === lc_(mentor.name)) {
        throw new Error('You already have a booking with this mentor at that time.');
      }
      if (start < sEnd && end > sStart) {
        throw new Error('This time overlaps with another session you have booked.');
      }
    });
    // Mentor-side conflict — prevent double-booking the same mentor (any student)
    getMentorSessions_(mentor.name).forEach(s => {
      if (!s.datetime) return;
      const mStart = new Date(s.datetime);
      const mEnd = new Date(mStart.getTime() + SESSION_DURATION_MIN * 60000);
      if (start < mEnd && end > mStart) {
        throw new Error('This mentor is already booked at that time. Please choose another slot.');
      }
    });
    // Meeting link: use the mentor's own link if they've set one (sidesteps org
    // Meet restrictions); otherwise auto-generate a Google Meet.
    const conf = mentor.meetingLink
      ? createCalendarEventWithLink_(student, mentor, start, end, mentor.meetingLink)
      : createCalendarEvent_(student, mentor, start, end);
    // Persist
    const sessionNo = 'MSN ' + (sessions.length + 1);
    appendSessionRow_(student, mentor, sessionNo, start, conf.meetLink);
    // Notifications
    safe_(() => sendStudentConfirmation_(student, mentor, start, conf.meetLink));
    safe_(() => sendMentorNotification_(student, mentor, start, conf.meetLink));
    return { ok: true, sessionNo: sessionNo, meetLink: conf.meetLink, datetime: start.toISOString() };
  } finally {
    lock.releaseLock();
  }
}
function createCalendarEvent_(student, mentor, start, end) {
  const tz = Session.getScriptTimeZone();
  const event = {
    summary: 'SSB Mentorship Session - ' + student.name + ' with ' + mentor.name,
    description: 'SSB mentorship session booked via the SSB Mentorship Booking Portal.',
    start: { dateTime: start.toISOString(), timeZone: tz },
    end:   { dateTime: end.toISOString(),   timeZone: tz },
    attendees: [{ email: student.email }, { email: mentor.email }],
    conferenceData: {
      createRequest: {
        requestId: Utilities.getUuid(),
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    }
  };
  const created = Calendar.Events.insert(event, 'primary', { conferenceDataVersion: 1, sendUpdates: 'all' });
  let meetLink = created.hangoutLink || '';
  if (!meetLink && created.conferenceData && created.conferenceData.entryPoints) {
    const ep = created.conferenceData.entryPoints.find(p => p.entryPointType === 'video');
    meetLink = ep ? ep.uri : '';
  }
  return { eventId: created.id, meetLink: meetLink };
}
/** Calendar event that uses the mentor's OWN meeting link (no auto-Meet) —
 *  sidesteps the org's Google Meet "safety settings" block. The link is set as
 *  the event location + in the description, and both parties get the invite. */
function createCalendarEventWithLink_(student, mentor, start, end, link) {
  const tz = Session.getScriptTimeZone();
  const event = {
    summary: 'SSB Mentorship Session - ' + student.name + ' with ' + mentor.name,
    description: 'SSB mentorship session booked via the SSB Mentorship Booking Portal.\n\nJoin here: ' + link,
    location: link,
    start: { dateTime: start.toISOString(), timeZone: tz },
    end:   { dateTime: end.toISOString(),   timeZone: tz },
    attendees: [{ email: student.email }, { email: mentor.email }]
  };
  const created = Calendar.Events.insert(event, 'primary', { sendUpdates: 'all' });
  return { eventId: created.id, meetLink: link };
}
function appendSessionRow_(student, mentor, sessionNo, start, meetLink) {
  const sh = getSheet_(SHEETS.MASTER);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(trim_);
  const data = {
    'Student Email': student.email,
    'Full Name': student.name,
    'Roll No': student.roll,
    'Batch': student.batch,
    'Meetlink': meetLink,
    'MSN Session': sessionNo,
    'MSN-Mentor': mentor.name,
    'MSN-DATETime': start,
    'MSN-Recording': '',
    'MSN-StudentFeedback': '',
    'MSN-StudentRating': '',
    'MSN-MentorFeedback': '',
    'MSN-MentorRating': '',
    'MSN-StudentCompleted': '',
    'MSN-MentorCompleted': ''
  };
  sh.appendRow(headers.map(h => (h in data) ? data[h] : ''));
}
/* ===================== Emails ===================== */
function sendStudentConfirmation_(student, mentor, start, meetLink) {
  const when = formatDateTime_(start);
  const html =
    '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">' +
    '<h2>Your mentorship session is confirmed ✅</h2>' +
    '<p>Hi ' + esc_(student.name) + ',</p>' +
    '<p>Your SSB mentorship session has been booked.</p>' +
    '<table cellpadding="6">' +
    row_('Mentor', mentor.name) +
    row_('Date', Utilities.formatDate(start, Session.getScriptTimeZone(), 'EEE, dd MMM yyyy')) +
    row_('Time', Utilities.formatDate(start, Session.getScriptTimeZone(), 'hh:mm a')) +
    row_('Meet link', '<a href="' + meetLink + '">' + meetLink + '</a>') +
    '</table>' +
    '<p>A calendar invite has been sent to your Google Calendar.</p>' +
    '<p>— SSB Mentorship Portal</p></div>';
  GmailApp.sendEmail(student.email, 'SSB Mentorship Session Confirmed — ' + when, '',
    { htmlBody: html, name: 'SSB Mentorship Portal' });
}
function sendMentorNotification_(student, mentor, start, meetLink) {
  const when = formatDateTime_(start);
  const html =
    '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">' +
    '<h2>New mentorship session booked</h2>' +
    '<p>Hi ' + esc_(mentor.name) + ',</p>' +
    '<p>A student has booked a mentorship session with you.</p>' +
    '<table cellpadding="6">' +
    row_('Student', student.name) +
    row_('Email', student.email) +
    row_('Roll No', student.roll) +
    row_('Batch', student.batch) +
    row_('Date', Utilities.formatDate(start, Session.getScriptTimeZone(), 'EEE, dd MMM yyyy')) +
    row_('Time', Utilities.formatDate(start, Session.getScriptTimeZone(), 'hh:mm a')) +
    row_('Meet link', '<a href="' + meetLink + '">' + meetLink + '</a>') +
    '</table><p>— SSB Mentorship Portal</p></div>';
  GmailApp.sendEmail(mentor.email, 'New SSB Mentorship Session — ' + when, '',
    { htmlBody: html, name: 'SSB Mentorship Portal' });
}
/** When a new session is booked, ask the mentor of the student's most recent
 *  COMPLETED session (that still lacks mentor feedback) to submit it. */
function requestMentorFeedbackForPrevious_(student) {
  const now = new Date();
  const prev = getStudentSessions_(student.email).find(s => {
    const dt = s.datetime ? new Date(s.datetime) : null;
    return dt && dt < now && (blank_(s.mentorFeedback) || blank_(s.mentorRating));
  });
  if (!prev) return;
  const mentor = getMentorByName_(prev.mentor);
  if (!mentor || !mentor.email) return;
  const url = getWebAppUrl_() + '?view=mentor-feedback&sid=' + prev.row;
  const html =
    '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">' +
    '<h2>Feedback requested for a completed session</h2>' +
    '<p>Hi ' + esc_(mentor.name) + ',</p>' +
    '<p>Please share your feedback for your completed mentorship session with <b>' +
    esc_(student.name) + '</b> (' + esc_(prev.sessionNo) + ', ' +
    formatDateTime_(prev.datetime) + ').</p>' +
    '<p><a href="' + url + '" style="background:#0d6efd;color:#fff;padding:10px 16px;' +
    'border-radius:6px;text-decoration:none">Submit feedback</a></p>' +
    '<p>— SSB Mentorship Portal</p></div>';
  GmailApp.sendEmail(mentor.email, 'Feedback request — session with ' + student.name, '',
    { htmlBody: html, name: 'SSB Mentorship Portal' });
}
/* ===================== Mentor feedback page ===================== */
function getMentorFeedbackContext(sessionRow) {
  const sh = getSheet_(SHEETS.MASTER);
  const col = headerIndex_(sh);
  const last = sh.getLastColumn();
  const vals = sh.getRange(Number(sessionRow), 1, 1, last).getValues()[0];
  const get = h => vals[col[h] - 1];
  const mentorName = trim_(get('MSN-Mentor'));
  const mentor = getMentorByName_(mentorName);
  const activeEmail = getActiveEmail_();
  const authorized = mentor && lc_(mentor.email) === activeEmail;
  return {
    authorized: !!authorized,
    sessionRow: Number(sessionRow),
    studentName: trim_(get('Full Name')),
    studentEmail: trim_(get('Student Email')),
    sessionNo: trim_(get('MSN Session')),
    datetime: toISO_(get('MSN-DATETime')),
    mentorName: mentorName,
    activeEmail: activeEmail,
    expectedEmail: mentor ? mentor.email : '',
    studentCompleted: !blank_(get('MSN-StudentCompleted')),
    mentorCompleted:  !blank_(get('MSN-MentorCompleted')),
    bothCompleted:    !blank_(get('MSN-StudentCompleted')) && !blank_(get('MSN-MentorCompleted')),
    alreadySubmitted: !blank_(get('MSN-MentorFeedback')) && !blank_(get('MSN-MentorRating'))
  };
}
function submitMentorFeedback(sessionRow, text, rating) {
  rating = Number(rating);
  if (blank_(text) || !(rating >= 1 && rating <= 5)) {
    throw new Error('Please provide feedback text and a rating between 1 and 5.');
  }
  const sh = getSheet_(SHEETS.MASTER);
  const col = headerIndex_(sh);
  const mentorName = trim_(sh.getRange(Number(sessionRow), col['MSN-Mentor']).getValue());
  const mentor = getMentorByName_(mentorName);
  if (!mentor || lc_(mentor.email) !== getActiveEmail_()) {
    throw new Error('You are not authorized to submit feedback for this session.');
  }
  // Both parties must have marked the meeting complete before feedback unlocks
  const scCol = ensureColumn_(sh, 'MSN-StudentCompleted');
  const mcCol = ensureColumn_(sh, 'MSN-MentorCompleted');
  if (blank_(sh.getRange(Number(sessionRow), scCol).getValue()) ||
      blank_(sh.getRange(Number(sessionRow), mcCol).getValue())) {
    throw new Error('Both parties must mark the meeting complete before feedback can be submitted.');
  }
  sh.getRange(Number(sessionRow), col['MSN-MentorFeedback']).setValue(text);
  sh.getRange(Number(sessionRow), col['MSN-MentorRating']).setValue(rating);
  return { ok: true };
}
/** Run in the editor to list YOUR sessions + ready-to-click feedback links.
 *  Pass your mentor email, or leave blank for the default. Open a link while
 *  signed in as that mentor to submit feedback for the student. */
function mentorFeedbackInbox(mentorEmail) {
  mentorEmail = mentorEmail || 'sahil.25035@ssb.scaler.com';
  const mentor = getMentors().find(m => lc_(m.email) === lc_(mentorEmail));
  if (!mentor) return 'No mentor found with email ' + mentorEmail;
  const base = getWebAppUrl_();
  const list = getMentorSessions_(mentor.name).map(s => ({
    session: s.sessionNo,
    student: s.studentName,
    when: s.datetime,
    feedbackGiven: !!(s.mentorFeedback && s.mentorRating),
    link: base + '?view=mentor-feedback&sid=' + s.row
  }));
  return list.length ? list : 'No sessions yet for ' + mentor.name;
}
/* ===================== Small utils ===================== */
function row_(k, v) { return '<tr><td><b>' + esc_(k) + '</b></td><td>' + v + '</td></tr>'; }
function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function safe_(fn) { try { fn(); } catch (err) { console.error(err); } }

/** Run ONCE to add yourself as a mentor. Idempotent. */
function addMentorSelf() {
  const sh = getSheet_(SHEETS.MENTOR);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(trim_);

  const me = {
    'Name':                  'Sahil Dash',
    'Email':                 'sahil.25035@ssb.scaler.com',
    'LinkedIn':              'https://www.linkedin.com/in/sahil-dash-530246188',
    'University':            'Scaler School of Business',
    'Education Stream':      'PGP-MT',
    'Current Role':          'Founder & Product Manager',
    'Current Organization':  'Scaler School of Business',
    'Previous Organisation': 'Niyogin Fintech',
    'Previous Company':      'Meritto (NoPaperForms)',
    'Previous Roles':        'Team Lead; Senior Analyst',
    'Skills':                'Product Strategy, User Research, Data Analysis, Roadmapping, A/B Testing, SQL, Agile/Scrum, Figma',
    'PhotoLink':              'https://kommodo.ai/i/1o0Fut37hRk6STBRQEmd'
  };

  const existing = getMentors().find(m => lc_(m.email) === lc_(me['Email']));
  if (existing) return 'Already a mentor: ' + me['Email'] + ' (ID ' + existing.id + ')';

  let prefix = 'SSB2024M', maxN = 0;
  getMentors().forEach(m => {
    const mt = String(m.id).match(/^(.*?)(\d+)$/);
    if (mt) { prefix = mt[1]; maxN = Math.max(maxN, Number(mt[2])); }
  });
  me['ID'] = prefix + (maxN + 1);

  sh.appendRow(headers.map(h => (h in me) ? me[h] : ''));
  return 'Added mentor: ' + me['Name'] + ' (ID ' + me['ID'] + ')';
}

/** Quick check: which spreadsheet does the code point to? */
function whichSheet() {
  return SpreadsheetApp.openById(SHEET_ID).getName();
}

/* ===================== One-shot demo/submission setup ===================== */
/** Run ONCE. Does everything the reviewer flow needs:
 *   1. adds the reviewer as a student (so they can sign in & book)
 *   2. shares the sheet (Editor) with the reviewer + your mentor account
 *   3. ensures a 'Year of Exp' column + sets it on your mentor row
 *   4. sets your mentor photo URL
 *   5. provisions + locks every mentor's availability tab (3 starter slots)
 *  Edit the CONFIG values below first if anything is wrong, then Run.
 *  Idempotent: safe to run more than once. */
function setupEverything() {
  const CONFIG = {
    reviewerEmail: 'shanmuga@ssb.scaler.com',
    reviewerName:  'Shanmuga (Reviewer)',
    reviewerRoll:  'REVIEWER',
    reviewerBatch: '2024',
    mentorEmail:   'sahil.25035@ssb.scaler.com',                                   // your mentor row
    yearsOfExp:    '4+ years',
    photoUrl:      'https://drive.google.com/thumbnail?id=1OW6YBQN5RoR3s5BOMTDiunyLumHNg3IV&sz=w400',
    meetingLink:   ''   // put your Zoom/Meet room URL here (or directly in the MeetingLink column of Mentor Details)
  };
  const log = [];

  // 1) Reviewer as a student
  log.push(addStudent_(CONFIG.reviewerEmail, CONFIG.reviewerName, CONFIG.reviewerRoll, CONFIG.reviewerBatch));

  // 2) Share the sheet so the reviewer can book (write) and the mentor can edit their tab
  [CONFIG.reviewerEmail, CONFIG.mentorEmail].forEach(em => {
    try { SpreadsheetApp.openById(SHEET_ID).addEditor(em); log.push('Shared sheet (Editor) with ' + em); }
    catch (e) { log.push('Share FAILED for ' + em + ': ' + e.message); }
  });

  // 3) 'Year of Exp' column + value on your mentor row (create column if missing)
  log.push(setMentorField_(CONFIG.mentorEmail, 'Year of Exp', CONFIG.yearsOfExp, true));

  // 4) Photo URL on your mentor row
  log.push(setMentorField_(CONFIG.mentorEmail, 'PhotoLink', CONFIG.photoUrl, false));

  // 4b) Mentor's own meeting link (sidesteps org Meet block) — only if provided
  if (CONFIG.meetingLink) log.push(setMentorField_(CONFIG.mentorEmail, 'MeetingLink', CONFIG.meetingLink, true));

  // 5) Provision + lock availability tabs for all mentors
  log.push('Slots → ' + provisionAllMentorSheets().join(' | '));

  return log;
}

/** Append a student row if the email isn't already present. */
function addStudent_(email, name, roll, batch) {
  const sh = getSheet_(SHEETS.STUDENT);
  const { rows } = readObjects_(SHEETS.STUDENT);
  if (rows.some(r => lc_(r['Student Email']) === lc_(email))) return 'Student already exists: ' + email;
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(trim_);
  const data = { 'Student Email': email, 'Full Name': name, 'Roll No': roll, 'Batch': batch };
  sh.appendRow(headers.map(h => (h in data) ? data[h] : ''));
  return 'Added student: ' + email;
}

/** Set a field on the mentor row matched by email; optionally create the column. */
function setMentorField_(email, header, value, createIfMissing) {
  const sh = getSheet_(SHEETS.MENTOR);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(trim_);
  let col = headers.indexOf(header) + 1;                       // 1-based, 0 if missing
  if (col === 0) {
    if (!createIfMissing) return 'Column missing (skipped): ' + header;
    col = sh.getLastColumn() + 1;
    sh.getRange(1, col).setValue(header).setFontWeight('bold');
  }
  const { rows } = readObjects_(SHEETS.MENTOR);
  const rec = rows.find(r => lc_(r['Email']) === lc_(email));
  if (!rec) return 'Mentor not found for ' + email + ' (add yourself as a mentor first)';
  sh.getRange(rec.__row, col).setValue(value);
  return 'Set ' + header + ' = "' + value + '" on row ' + rec.__row;
}

/** Run in the editor to verify the reviewer can complete the full flow.
 *  Prints a PASS/FAIL/WARN checklist. Edit reviewer/mentor below if needed. */
function verifySetup() {
  const reviewer = 'shanmuga@ssb.scaler.com';
  const mentorName = 'Sahil Dash';
  const out = [];

  // 1. Reviewer registered as a student
  const students = readObjects_(SHEETS.STUDENT).rows;
  out.push((students.some(r => lc_(r['Student Email']) === lc_(reviewer)) ? 'PASS' : 'FAIL') +
    ' — reviewer in Student Data (' + reviewer + ')');

  // 2. Sheet shared with reviewer as Editor
  let editors = [];
  try { editors = SpreadsheetApp.openById(SHEET_ID).getEditors().map(u => lc_(u.getEmail())); } catch (e) {}
  out.push((editors.indexOf(lc_(reviewer)) !== -1 ? 'PASS' : 'FAIL') +
    ' — sheet shared as Editor with reviewer');

  // 3. Mentor profile + fields
  const mentor = getMentors().find(m => lc_(m.name) === lc_(mentorName));
  if (!mentor) { out.push('FAIL — mentor "' + mentorName + '" not found'); return out; }
  out.push('PASS — mentor profile found (ID ' + mentor.id + ', email ' + mentor.email + ')');
  out.push((mentor.photo ? 'PASS' : 'WARN') + ' — photo: ' + (mentor.photo || '(empty)'));
  out.push((mentor.exp ? 'PASS' : 'WARN') + ' — years of experience: ' + (mentor.exp || '(empty)'));
  out.push((mentor.meetingLink ? 'PASS' : 'WARN') + ' — meeting link: ' + (mentor.meetingLink || '(none → will auto-Meet)'));
  out.push((lc_(getMentors()[0].name) === lc_(mentorName) ? 'PASS' : 'WARN') + ' — mentor appears first in the list');

  // 4. Bookable future slots
  const slots = getMentorSlots(mentor.id);
  out.push((slots.length ? 'PASS' : 'FAIL') + ' — ' + slots.length + ' available future slot(s)' +
    (slots.length ? ' (next: ' + slots[0].label + ')' : ' → run provisionMentorSheet or add rows to tab Avail_' + mentor.id));

  out.push('NOTE — to give MENTOR feedback, sign in as: ' + mentor.email);
  out.push('NOTE — confirm deployment access = "Anyone" so the reviewer can open the app, and send them the /exec Web App URL.');
  return out;
}
