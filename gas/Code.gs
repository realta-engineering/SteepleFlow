var SPREADSHEET_TIME_ZONE_CACHE_ = "";
const APP = {
  SESSION_HOURS: 12,
  SHEETS: {
    Admins: ["id", "role", "churchId", "name", "email", "passwordHash", "active", "createdAt"],
    Churches: ["id", "name", "city", "adminName", "adminEmail", "active", "members", "createdAt"],
    Cycles: ["id", "churchId", "name", "start", "end", "status", "token", "publicToken", "roles", "dates", "createdAt"],
    Participants: ["id", "cycleId", "churchId", "name", "email", "roles", "unavailable", "submittedAt", "autoAssign"],
    Assignments: ["id", "cycleId", "date", "role", "participantId", "locked", "updatedAt"],
    Sessions: ["token", "email", "role", "churchId", "name", "expiresAt"]
  }
};

/**
 * Run once from the Apps Script editor. The script must be bound to the
 * spreadsheet that will serve as the database.
 */
function setupDatabase() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(APP.SHEETS).forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    const headers = APP.SHEETS[name];
    const existing = sheet.getLastRow() ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0] : [];
    headers.forEach((header, index) => { if (existing[index] && existing[index] !== header) throw new Error(`Unexpected ${name} column ${index + 1}: expected ${header}.`); });
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#173f35").setFontColor("#ffffff");
    sheet.autoResizeColumns(1, headers.length);
  });
  PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", ss.getId());
  return "Database ready.";
}

/** Create or replace the super-admin from one-time Script Properties. */
function configureSuperAdmin() {
  const properties = PropertiesService.getScriptProperties();
  const name = properties.getProperty("INITIAL_ADMIN_NAME");
  const email = properties.getProperty("INITIAL_ADMIN_EMAIL");
  const password = properties.getProperty("INITIAL_ADMIN_PASSWORD");
  if (!name || !email || !password) throw new Error("Set INITIAL_ADMIN_NAME, INITIAL_ADMIN_EMAIL, and INITIAL_ADMIN_PASSWORD in Script Properties.");
  if (String(password).length < 10) throw new Error("Use a password of at least 10 characters.");
  const existing = rows_("Admins").find(a => a.role === "super");
  const normalizedEmail = String(email).trim().toLowerCase();
  if (existing) updateWhere_("Admins", row => row.id === existing.id, row => Object.assign(row, { name: clean_(name, 120), email: normalizedEmail, passwordHash: hashPassword_(password), active: true }));
  else ensureSuperAdmin_(name, normalizedEmail, password);
  deleteWhere_("Sessions", row => row.role === "super");
  properties.deleteProperty("INITIAL_ADMIN_PASSWORD");
  return "Super-admin configured. The initial password property was removed.";
}

/** Reset an administrator password from the Apps Script editor. */
function setAdminPassword(email, newPassword) {
  if (!email || !newPassword || String(newPassword).length < 10) throw new Error("Use a password of at least 10 characters.");
  const normalized = String(email).trim().toLowerCase();
  let found = false;
  updateWhere_("Admins", row => String(row.email).toLowerCase() === normalized, row => {
    found = true;
    return Object.assign(row, { passwordHash: hashPassword_(newPassword) });
  });
  if (!found) throw new Error("Administrator not found.");
  deleteWhere_("Sessions", row => String(row.email).toLowerCase() === normalized);
  return "Password updated and existing sessions revoked.";
}
function doGet() {
  return json_({ ok: true, service: "SteepleFlow API", version: 1 });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const request = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const publicActions = ["login", "getCycleByToken", "getPublishedRoster", "submitAvailability"];
    let session = null;
    if (!publicActions.includes(request.action)) session = requireSession_(request.token);
    const handlers = {
      login: () => login_(request.payload),
      getCycleByToken: () => getCycleByToken_(request.payload),
      getPublishedRoster: () => getPublishedRoster_(request.payload),
      submitAvailability: () => withLock_(lock, () => submitAvailability_(request.payload)),
      getBootstrap: () => getBootstrap_(session),
      createChurch: () => withLock_(lock, () => createChurch_(session, request.payload)),
      updateChurch: () => withLock_(lock, () => updateChurch_(session, request.payload)),
      createCycle: () => withLock_(lock, () => createCycle_(session, request.payload)),
      deleteCycle: () => withLock_(lock, () => deleteCycle_(session, request.payload)),
      addParticipant: () => withLock_(lock, () => addParticipant_(session, request.payload)),
      setParticipantAutoAssign: () => withLock_(lock, () => setParticipantAutoAssign_(session, request.payload)),
      saveAssignments: () => withLock_(lock, () => saveAssignments_(session, request.payload)),
      publishRoster: () => withLock_(lock, () => publishRoster_(session, request.payload))
    };
    if (!handlers[request.action]) throw new Error("Unknown API action.");
    return json_(Object.assign({ ok: true }, handlers[request.action]() || {}));
  } catch (error) {
    return json_({ ok: false, error: error.message || "Unexpected server error." });
  }
}

function login_(payload) {
  if (!payload || !payload.email || !payload.password) throw new Error("Email and password are required.");
  const email = String(payload.email).trim().toLowerCase();
  const admin = rows_("Admins").find(row => String(row.email).toLowerCase() === email && truthy_(row.active));
  if (!admin || admin.passwordHash !== hashPassword_(payload.password)) throw new Error("Email or password is incorrect.");
  deleteWhere_("Sessions", row => Number(row.expiresAt) < Date.now() || String(row.email).toLowerCase() === email);
  const session = {
    token: token_(32), email, role: admin.role, churchId: admin.churchId || "",
    name: admin.name, expiresAt: Date.now() + APP.SESSION_HOURS * 60 * 60 * 1000
  };
  append_("Sessions", session);
  return { session: session, data: bootstrapData_(session) };
}

function getBootstrap_(session) {
  return { data: bootstrapData_(session) };
}

function bootstrapData_(session) {
  const allChurches = rows_("Churches");
  const churches = session.role === "super" ? allChurches : allChurches.filter(c => c.id === session.churchId);
  const churchIds = churches.map(c => c.id);
  const cycles = rows_("Cycles").filter(c => churchIds.includes(c.churchId)).map(decodeCycle_);
  const cycleIds = cycles.map(c => c.id);
  const participants = rows_("Participants").filter(p => cycleIds.includes(p.cycleId)).map(decodeParticipant_);
  const assignments = rows_("Assignments").filter(a => cycleIds.includes(a.cycleId)).map(decodeAssignment_);
  return { churches, cycles, participants, assignments };
}

function getCycleByToken_(payload) {
  const token = String((payload || {}).token || "");
  const raw = rows_("Cycles").find(c => safeEqual_(String(c.token), token));
  if (!raw || !["open", "published"].includes(raw.status)) throw new Error("This submission link is invalid or closed.");
  const church = rows_("Churches").find(c => c.id === raw.churchId && truthy_(c.active));
  if (!church) throw new Error("This church workspace is unavailable.");
  return { cycle: decodeCycle_(raw), church: publicChurch_(church) };
}

function getPublishedRoster_(payload) {
  const token = String((payload || {}).token || "");
  const raw = rows_("Cycles").find(c => safeEqual_(String(c.publicToken), token));
  if (!raw || raw.status !== "published") throw new Error("This roster is not published.");
  const cycle = decodeCycle_(raw);
  const church = rows_("Churches").find(c => c.id === cycle.churchId);
  const participants = rows_("Participants").filter(p => p.cycleId === cycle.id).map(decodeParticipant_).map(p => ({ id: p.id, name: p.name }));
  const assignments = rows_("Assignments").filter(a => a.cycleId === cycle.id).map(decodeAssignment_);
  return { cycle, church: publicChurch_(church), participants, assignments };
}

function submitAvailability_(payload) {
  if (!payload || !payload.token || !payload.participant) throw new Error("Incomplete availability response.");
  const rawCycle = rows_("Cycles").find(c => safeEqual_(String(c.token), String(payload.token)));
  if (!rawCycle || rawCycle.status !== "open") throw new Error("This availability request is closed.");
  const cycle = decodeCycle_(rawCycle);
  const p = payload.participant;
  if (!p.name || !p.email || !Array.isArray(p.roles) || !p.roles.length) throw new Error("Name, email, and at least one role are required.");
  const roles = p.roles.filter(role => cycle.roles.includes(role));
  const unavailable = (p.unavailable || []).filter(date => cycle.dates.includes(date));
  if (!roles.length) throw new Error("The selected roles are not valid for this cycle.");
  const email = String(p.email).trim().toLowerCase();
  const existing = rows_("Participants").find(row => row.cycleId === cycle.id && String(row.email).toLowerCase() === email);
  deleteWhere_("Participants", row => row.cycleId === cycle.id && String(row.email).toLowerCase() === email);
  append_("Participants", { id: p.id || (existing && existing.id) || id_("p"), cycleId: cycle.id, churchId: cycle.churchId, name: clean_(p.name, 120), email, roles: JSON.stringify(roles), unavailable: JSON.stringify(unavailable), submittedAt: new Date().toISOString(), autoAssign: existing && existing.autoAssign !== "" ? truthy_(existing.autoAssign) : true });
  return { message: "Availability received." };
}

function createChurch_(session, payload) {
  requireRole_(session, "super");
  if (!payload.name || !payload.adminName || !payload.adminEmail) throw new Error("Church and administrator details are required.");
  const email = String(payload.adminEmail).trim().toLowerCase();
  if (rows_("Admins").some(a => String(a.email).toLowerCase() === email)) throw new Error("An administrator already uses this email.");
  const churchId = id_("church");
  const temporaryPassword = token_(9);
  append_("Churches", { id: churchId, name: clean_(payload.name, 150), city: clean_(payload.city, 100), adminName: clean_(payload.adminName, 120), adminEmail: email, active: true, members: 0, createdAt: new Date().toISOString() });
  append_("Admins", { id: id_("admin"), role: "admin", churchId, name: clean_(payload.adminName, 120), email, passwordHash: hashPassword_(temporaryPassword), active: true, createdAt: new Date().toISOString() });
  return { churchId, temporaryPassword };
}

function updateChurch_(session, payload) {
  requireRole_(session, "super");
  if (!payload.id) throw new Error("Church id is required.");
  updateWhere_("Churches", row => row.id === payload.id, row => Object.assign(row, {
    name: clean_(payload.name || row.name, 150), city: clean_(payload.city || row.city, 100), active: payload.active !== false,
    adminName: clean_(payload.adminName || row.adminName, 120), adminEmail: String(payload.adminEmail || row.adminEmail).toLowerCase()
  }));
  return { churchId: payload.id };
}

function createCycle_(session, payload) {
  requireChurch_(session, payload.churchId);
  if (!payload.name || !payload.start || !payload.end || !Array.isArray(payload.roles) || !payload.roles.length) throw new Error("Cycle dates and roles are required.");
  const row = Object.assign({}, payload, {
    id: payload.id || id_("cycle"), token: token_(24), publicToken: token_(24), status: "open",
    roles: JSON.stringify(payload.roles.map(r => clean_(r, 80))), dates: JSON.stringify(payload.dates || []), createdAt: new Date().toISOString()
  });
  append_("Cycles", row);
  return { cycle: decodeCycle_(row) };
}

function deleteCycle_(session, payload) {
  const cycle = cycleForSession_(session, (payload || {}).cycleId);
  deleteWhere_("Assignments", row => row.cycleId === cycle.id);
  deleteWhere_("Participants", row => row.cycleId === cycle.id);
  deleteWhere_("Cycles", row => row.id === cycle.id);
  return { cycleId: cycle.id };
}

function addParticipant_(session, payload) {
  const cycle = decodeCycle_(cycleForSession_(session, (payload || {}).cycleId));
  const participant = (payload || {}).participant || {};
  if (!participant.name || !participant.email || !Array.isArray(participant.roles) || !participant.roles.length) throw new Error("Name, email, and at least one role are required.");
  const roles = participant.roles.filter(role => cycle.roles.includes(role));
  const unavailable = (participant.unavailable || []).filter(date => cycle.dates.includes(date));
  if (!roles.length) throw new Error("The selected roles are not valid for this cycle.");
  const email = String(participant.email).trim().toLowerCase();
  const existing = rows_("Participants").find(row => row.cycleId === cycle.id && String(row.email).toLowerCase() === email);
  const row = {
    id: existing ? existing.id : id_("p"), cycleId: cycle.id, churchId: cycle.churchId,
    name: clean_(participant.name, 120), email,
    roles: JSON.stringify(roles), unavailable: JSON.stringify(unavailable),
    submittedAt: new Date().toISOString(), autoAssign: existing && existing.autoAssign !== "" ? truthy_(existing.autoAssign) : true
  };
  deleteWhere_("Participants", existing => existing.cycleId === cycle.id && String(existing.email).toLowerCase() === email);
  append_("Participants", row);
  return { participant: decodeParticipant_(row) };
}

function setParticipantAutoAssign_(session, payload) {
  const cycle = cycleForSession_(session, (payload || {}).cycleId);
  const participantId = String((payload || {}).participantId || "");
  const participant = rows_("Participants").find(row => row.id === participantId && row.cycleId === cycle.id);
  if (!participant) throw new Error("Participant not found for this cycle.");
  const autoAssign = (payload || {}).autoAssign !== false;
  updateWhere_("Participants", row => row.id === participantId && row.cycleId === cycle.id, row => Object.assign(row, { autoAssign }));
  participant.autoAssign = autoAssign;
  return { participant: decodeParticipant_(participant) };
}

function saveAssignments_(session, payload) {
  const cycle = cycleForSession_(session, payload.cycleId);
  const validRoles = decodeCycle_(cycle).roles;
  const validDates = decodeCycle_(cycle).dates;
  const assignments = (payload.assignments || []).map(a => {
    if (!validRoles.includes(a.role) || !validDates.includes(a.date)) throw new Error("Assignment contains an invalid role or date.");
    return { id: a.id || id_("assignment"), cycleId: cycle.id, date: a.date, role: a.role, participantId: a.participantId, locked: !!a.locked, updatedAt: new Date().toISOString() };
  });
  deleteWhere_("Assignments", row => row.cycleId === cycle.id);
  assignments.forEach(a => append_("Assignments", a));
  return { saved: (payload.assignments || []).length };
}

function publishRoster_(session, payload) {
  saveAssignments_(session, payload);
  updateWhere_("Cycles", row => row.id === payload.cycleId, row => Object.assign(row, { status: "published" }));
  return { publicToken: rows_("Cycles").find(c => c.id === payload.cycleId).publicToken };
}

function requireSession_(token) {
  const session = rows_("Sessions").find(s => safeEqual_(String(s.token), String(token || "")) && Number(s.expiresAt) > Date.now());
  if (!session) throw new Error("Your session has expired. Please sign in again.");
  return session;
}
function requireRole_(session, role) { if (!session || session.role !== role) throw new Error("You are not authorized for this action."); }
function requireChurch_(session, churchId) { if (session.role !== "super" && session.churchId !== churchId) throw new Error("You cannot access another church workspace."); }
function cycleForSession_(session, cycleId) { const cycle=rows_("Cycles").find(c=>c.id===cycleId);if(!cycle)throw new Error("Cycle not found.");requireChurch_(session,cycle.churchId);return cycle; }

function sheet_(name) {
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error(`Missing ${name} sheet. Run setupDatabase first.`);
  return sheet;
}
function rows_(name) { const sheet=sheet_(name),last=sheet.getLastRow();if(last<2)return[];const headers=APP.SHEETS[name];return sheet.getRange(2,1,last-1,headers.length).getValues().map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]]))); }
function append_(name, row) { const headers=APP.SHEETS[name];sheet_(name).appendRow(headers.map(h=>row[h]===undefined?"":row[h])); }
function deleteWhere_(name, predicate) { const sheet=sheet_(name),data=rows_(name);for(let i=data.length-1;i>=0;i--)if(predicate(data[i]))sheet.deleteRow(i+2); }
function updateWhere_(name, predicate, updater) { const sheet=sheet_(name),headers=APP.SHEETS[name],data=rows_(name);data.forEach((row,i)=>{if(predicate(row)){const next=updater(Object.assign({},row))||row;sheet.getRange(i+2,1,1,headers.length).setValues([headers.map(h=>next[h]===undefined?"":next[h])]);}}); }
function decodeCycle_(row) { const copy=Object.assign({},row);copy.start=dateOnly_(copy.start);copy.end=dateOnly_(copy.end);copy.roles=parseArray_(copy.roles);copy.dates=parseArray_(copy.dates).map(dateOnly_);return copy; }
function decodeParticipant_(row) { const copy=Object.assign({},row);copy.roles=parseArray_(copy.roles);copy.unavailable=parseArray_(copy.unavailable);copy.autoAssign=copy.autoAssign===""||copy.autoAssign===undefined?true:truthy_(copy.autoAssign);copy.submitted=true;return copy; }
function decodeAssignment_(row) { const copy=Object.assign({},row);copy.date=dateOnly_(copy.date);copy.locked=truthy_(copy.locked);return copy; }
function dateOnly_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, spreadsheetTimeZone_(), "yyyy-MM-dd");
  const text=String(value||"");
  return /^\d{4}-\d{2}-\d{2}/.test(text)?text.slice(0,10):text;
}
function spreadsheetTimeZone_() {
  if (SPREADSHEET_TIME_ZONE_CACHE_) return SPREADSHEET_TIME_ZONE_CACHE_;
  const id=PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  const ss=id?SpreadsheetApp.openById(id):SpreadsheetApp.getActive();
  SPREADSHEET_TIME_ZONE_CACHE_=ss.getSpreadsheetTimeZone()||Session.getScriptTimeZone();
  return SPREADSHEET_TIME_ZONE_CACHE_;
}
function parseArray_(value) { if(Array.isArray(value))return value;try{return JSON.parse(value||"[]");}catch(e){return [];} }
function publicChurch_(church) { return { id: church.id, name: church.name, city: church.city }; }
function withLock_(lock, callback) { lock.waitLock(10000);try{return callback();}finally{lock.releaseLock();} }
function clean_(value, max) { return String(value || "").replace(/[<>]/g, "").trim().slice(0, max); }
function truthy_(value) { return value === true || String(value).toLowerCase() === "true" || value === 1; }
function id_(prefix) { return `${prefix}_${Utilities.getUuid().replace(/-/g, "").slice(0, 16)}`; }
function token_(bytes) { const raw=Utilities.getUuid()+Utilities.getUuid()+Utilities.getUuid();return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,raw+Date.now())).replace(/=+$/g,"").slice(0,bytes); }
function hashPassword_(password) { const salt=PropertiesService.getScriptProperties().getProperty("PASSWORD_SALT")||createSalt_();const digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,salt+String(password),Utilities.Charset.UTF_8);return digest.map(b=>(b<0?b+256:b).toString(16).padStart(2,"0")).join(""); }
function createSalt_() { const salt=token_(32);PropertiesService.getScriptProperties().setProperty("PASSWORD_SALT",salt);return salt; }
function safeEqual_(a,b) { if(a.length!==b.length)return false;let result=0;for(let i=0;i<a.length;i++)result|=a.charCodeAt(i)^b.charCodeAt(i);return result===0; }
function ensureSuperAdmin_(name,email,password) { if(!rows_("Admins").some(a=>a.role==="super"))append_("Admins",{id:id_("admin"),role:"super",churchId:"",name,email:String(email).toLowerCase(),passwordHash:hashPassword_(password),active:true,createdAt:new Date().toISOString()}); }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }


