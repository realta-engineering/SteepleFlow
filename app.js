/* Set this to the deployed Google Apps Script Web App URL for production. */
const API_URL = "https://script.google.com/macros/s/AKfycbxWPQXunidRwM6zB7EJi3-SE03IZLoTLnIbO5tAEBSvG6g2CAZcj4DkSol5ecmUDN0N/exec";

const app = document.querySelector("#app");
const BLOCKED_PARTICIPANT_ID = "__blocked__";

const STORAGE_KEY = "steepleflow_state_v2";
const emptyState = {
  session: null,
  activeCycleId: null,
  churches: [],
  cycles: [],
  participants: [],
  assignments: [],
};

const store = {
  state: loadState(),
  save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); },
  reset() { this.state = structuredClone(emptyState); this.save(); }
};

function loadState() {
  try {
    localStorage.removeItem("steepleflow_state");
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved && Array.isArray(saved.churches) ? Object.assign(structuredClone(emptyState), saved) : structuredClone(emptyState);
  } catch { return structuredClone(emptyState); }
}

const api = {
  async call(action, payload = {}) {
    if (!API_URL) throw new Error("The API URL is not configured.");
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, payload, token: store.state.session?.token || "" })
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "Request failed");
    return data;
  }
};

function icon(name, cls = "") { return `<i data-lucide="${name}" class="${cls}"></i>`; }
function initials(name = "") { return name.split(/\s+/).map(p => p[0]).join("").slice(0, 2).toUpperCase(); }
function esc(value = "") { return String(value).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function dateLabel(value, options = { month: "short", day: "numeric" }) { return new Date(`${value}T00:00:00`).toLocaleDateString("en-MY", options); }
function fullDate(value) { return dateLabel(value, { weekday: "short", month: "short", day: "numeric" }); }
function currentCycle() { const churchId = store.state.session?.role === "admin" ? store.state.session.churchId : null; const cycles = store.state.cycles.filter(c => !churchId || c.churchId === churchId); return cycles.find(c => c.id === store.state.activeCycleId) || cycles.find(c => c.status === "open") || cycles[0] || null; }
function church() { return store.state.churches.find(c => c.id === store.state.session?.churchId) || null; }
function participants() { const cycle = currentCycle(); return cycle ? store.state.participants.filter(p => p.churchId === cycle.churchId && (!p.cycleId || p.cycleId === cycle.id)) : []; }
function assignmentsFor(cycle) { return cycle ? store.state.assignments.filter(a => !a.cycleId || a.cycleId === cycle.id) : []; }
function isBlockedAssignment(assignment) { return assignment?.participantId === BLOCKED_PARTICIPANT_ID; }
function blockedPositionCount(cycle, assignments) { return new Set(assignments.filter(a => isBlockedAssignment(a) && cycle.dates.includes(a.date) && cycle.roles.includes(a.role)).map(a => `${a.date}:${a.role}`)).size; }
function totalPositionCount(cycle, assignments) { return Math.max(cycle.dates.length * cycle.roles.length - blockedPositionCount(cycle, assignments), 0); }
function filledPositionCount(cycle, assignments) { return new Set(assignments.filter(a => cycle.dates.includes(a.date) && cycle.roles.includes(a.role) && store.state.participants.some(p => p.id === a.participantId)).map(a => `${a.date}:${a.role}`)).size; }
function uniqueParticipantCount(churchId = null) { return new Set(store.state.participants.filter(p => !churchId || p.churchId === churchId).map(p => `${p.churchId}:${String(p.email).toLowerCase()}`)).size; }
function emptyView(glyph, title, message, action = "") { return `<div class="empty"><span class="empty-icon">${icon(glyph)}</span><h3>${esc(title)}</h3><p>${esc(message)}</p>${action}</div>`; }

function toast(message, kind = "check-circle-2") {
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `${icon(kind)}<span>${esc(message)}</span>`;
  document.querySelector("#toast-region").appendChild(el);
  refreshIcons();
  setTimeout(() => el.remove(), 3200);
}

function refreshIcons() { if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } }); }

function route() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [path = "dashboard", param] = hash.split("/");
  if (path === "join") return param ? renderParticipant(param) : renderPublicError("This submission link is incomplete.");
  if (path === "published") return param ? renderPublished(param) : renderPublicError("This roster link is incomplete.");
  if (!store.state.session) return renderLogin();
  if (path === "logout") { store.state.session = null; store.save(); location.hash = "login"; return renderLogin(); }
  if (path === "login") { location.hash = "dashboard"; return; }
  const valid = ["dashboard", "cycles", "participants", "roster", "churches", "settings"];
  renderShell(valid.includes(path) ? path : "dashboard");
}

function renderLogin() {
  app.innerHTML = `
    <div class="login-page">
      <section class="login-main">
        <div class="login-box">
          <div class="login-brand"><span class="brand-mark">${icon("church")}</span><span><span class="brand-word">SteepleFlow</span></span></div>
          <h1>Sign in</h1>
          <form class="login-form" id="login-form">
            <div class="field"><label for="email">Email address</label><input id="email" type="email" autocomplete="username" required></div>
            <div class="field"><label for="password">Password</label><input id="password" type="password" autocomplete="current-password" required></div>
            <div class="login-help"><span></span><a href="#" id="forgot">Forgot password?</a></div>
            <button class="btn btn-primary" type="submit">Sign in ${icon("arrow-right")}</button>
          </form>
        </div>
      </section>
      <aside class="login-visual" aria-hidden="true">
        <div class="visual-art"><span class="arch"></span><span class="arch"></span><span class="arch"></span></div>
        <div class="visual-copy"><h2>Church roster management</h2></div>
      </aside>
    </div>`;
  document.querySelector("#login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const email = document.querySelector("#email").value.trim().toLowerCase();
    const password = document.querySelector("#password").value;
    try {
      const result = await api.call("login", { email, password });
      if (!result.session) throw new Error("The server did not return a session.");
      if (result.data) {
        store.state.churches = result.data.churches || [];
        store.state.cycles = result.data.cycles || [];
        store.state.participants = result.data.participants || [];
        store.state.assignments = result.data.assignments || [];
      }
      store.state.activeCycleId = null;
      store.state.session = result.session;
      store.save();
      location.hash = result.session.role === "super" ? "churches" : "dashboard";
    } catch (err) { toast(err.message, "circle-alert"); }
  });
  document.querySelector("#forgot").addEventListener("click", e => { e.preventDefault(); toast("Contact your super-admin to reset access", "mail"); });
  refreshIcons();
}

function shellNav(active) {
  const superAdmin = store.state.session.role === "super";
  const items = superAdmin
    ? [["churches", "building-2", "Churches"], ["dashboard", "layout-dashboard", "Overview"], ["settings", "settings", "Settings"]]
    : [["dashboard", "layout-dashboard", "Overview"], ["cycles", "calendar-range", "Roster cycles"], ["participants", "users", "Participants"], ["roster", "table-properties", "Build roster"], ["settings", "settings", "Settings"]];
  return items.map(([path, glyph, label]) => `<button class="nav-item ${active === path ? "active" : ""}" data-route="${path}">${icon(glyph)}<span>${label}</span></button>`).join("");
}

function renderShell(view) {
  const user = store.state.session;
  const workspace = user.role === "admin" ? church() : null;
  const title = { dashboard: "Overview", cycles: "Roster cycles", participants: "Participants", roster: "Build roster", churches: "Churches", settings: "Settings" }[view];
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <div class="brand"><span class="brand-mark">${icon("church")}</span><span><span class="brand-word">SteepleFlow</span><small>Roster management</small></span></div>
        ${user.role === "admin" ? `<div class="church-switcher"><small>Current church</small><strong>${esc(workspace?.name || "Workspace unavailable")}</strong></div>` : ""}
        <nav class="nav"><div class="nav-label">Workspace</div>${shellNav(view)}</nav>
        <div class="sidebar-footer"><div class="user-block"><span class="avatar">${initials(user.name)}</span><span><strong>${esc(user.name)}</strong><small>${user.role === "super" ? "Super-admin" : "Church admin"}</small></span><button class="icon-btn" data-route="logout" title="Sign out">${icon("log-out")}</button></div></div>
      </aside>
      <section class="main">
        <header class="topbar"><div class="topbar-title"><button class="icon-btn mobile-menu" id="menu-toggle" title="Open navigation">${icon("menu")}</button><div><div class="crumb">${user.role === "super" ? "Administration" : esc(workspace?.name || "Workspace")}</div><h1>${title}</h1></div></div><div class="top-actions">${user.role === "admin" ? `<button class="btn btn-primary btn-sm" data-action="new-cycle" ${workspace ? "" : "disabled"}>${icon("plus")}<span>New cycle</span></button>` : `<button class="btn btn-primary btn-sm" data-action="new-church">${icon("plus")}<span>Add church</span></button>`}</div></header>
        <div class="content" id="view"></div>
      </section>
    </div>`;
  document.querySelectorAll("[data-route]").forEach(el => el.addEventListener("click", () => { location.hash = el.dataset.route; }));
  document.querySelector("#menu-toggle")?.addEventListener("click", () => document.querySelector("#sidebar").classList.toggle("open"));
  document.querySelectorAll("[data-action='new-cycle']").forEach(el => el.addEventListener("click", showCycleModal));
  document.querySelectorAll("[data-action='new-church']").forEach(el => el.addEventListener("click", () => showChurchModal()));
  if (view === "dashboard") renderDashboard();
  if (view === "cycles") renderCycles();
  if (view === "participants") renderParticipants();
  if (view === "roster") renderRoster();
  if (view === "churches") renderChurches();
  if (view === "settings") renderSettings();
  refreshIcons();
}

function renderDashboard() {
  const target = document.querySelector("#view");
  if (store.state.session.role === "super") {
    const activeChurches = store.state.churches.filter(c => c.active).length;
    const publishedRosters = store.state.cycles.filter(c => c.status === "published").length;
    target.innerHTML = `<div class="page-head"><div><h2>Network overview</h2></div></div>${stats([
      ["Churches", store.state.churches.length, "building-2", `${activeChurches} active`], ["Administrators", store.state.churches.length, "shield-check", ""], ["Participants", uniqueParticipantCount(), "users", ""], ["Published rosters", publishedRosters, "send", ""]
    ])}`;
    refreshIcons(); return;
  }
  const workspace = church();
  if (!workspace) {
    target.innerHTML = emptyView("building-2", "Workspace unavailable", "Your account is not assigned to an active church workspace.");
    refreshIcons(); return;
  }
  const cycle = currentCycle();
  const cycles = store.state.cycles.filter(c => c.churchId === workspace.id);
  if (!cycle) {
    target.innerHTML = `<div class="page-head"><div><h2>${esc(workspace.name)}</h2></div></div><section class="panel">${emptyView("calendar-plus", "No roster cycles", "Create a cycle to collect availability and build a roster.", `<button class="btn btn-primary" data-action="new-cycle">${icon("plus")} New cycle</button>`)}</section>`;
    target.querySelector("[data-action='new-cycle']").addEventListener("click", showCycleModal);
    refreshIcons(); return;
  }
  const people = participants();
  const submitted = people.filter(p => p.submitted).length;
  const assignments = assignmentsFor(cycle);
  const totalPositions = totalPositionCount(cycle, assignments);
  const filledPositions = filledPositionCount(cycle, assignments);
  const coverage = totalPositions ? Math.round(filledPositions / totalPositions * 100) : 0;
  target.innerHTML = `
    <div class="page-head"><div><h2>${esc(workspace.name)}</h2></div><div class="page-actions"><button class="btn btn-secondary" data-copy-link>${icon("link")} Copy submission link</button><button class="btn btn-primary" data-route="roster">${icon("table-properties")} Build roster</button></div></div>
    ${stats([["Active cycle", cycle.name, "calendar-range", `${cycle.dates.length} service dates`], ["Responses", submitted, "user-check", `${people.length - submitted} pending`], ["Open positions", Math.max(totalPositions - filledPositions, 0), "circle-dashed", `${totalPositions} total`], ["Coverage", `${coverage}%`, "chart-no-axes-column-increasing", `${filledPositions} filled`]])}
    <section class="panel" style="margin-top:16px"><div class="panel-head"><div><h3>Roster cycles</h3></div><button class="btn btn-ghost btn-sm" data-route="cycles">View all ${icon("arrow-right")}</button></div>${cycles.map(cycleRow).join("")}</section>`;
  bindRoutes(target);
  bindCycleRows();
  target.querySelector("[data-copy-link]").addEventListener("click", () => copyLink(`join/${cycle.token}`));
  refreshIcons();
}

function stats(rows) {
  return `<div class="stats-grid">${rows.map(([label,value,glyph,note]) => `<article class="stat"><div class="stat-top"><span>${esc(label)}</span><span class="stat-icon">${icon(glyph)}</span></div><div class="stat-value">${esc(value)}</div>${note ? `<div class="stat-note">${esc(note)}</div>` : ""}</article>`).join("")}</div>`;
}

function cycleRow(c) {
  const responseCount = store.state.participants.filter(p => p.cycleId === c.id).length;
  return `<div class="cycle-row"><div><div class="cycle-title"><strong>${esc(c.name)}</strong><span class="status ${esc(c.status)}">${esc(c.status)}</span></div><div class="cycle-meta"><span>${icon("calendar-days")} ${dateLabel(c.start)} - ${dateLabel(c.end)}</span><span>${icon("users")} ${responseCount} ${responseCount === 1 ? "response" : "responses"}</span></div></div><div class="cycle-actions"><button class="icon-btn btn-danger" title="Delete cycle" data-delete-cycle="${c.id}">${icon("trash-2")}</button><button class="icon-btn" title="Open cycle" data-cycle="${c.id}">${icon("chevron-right")}</button></div></div>`;
}

function renderCycles() {
  const workspace = church();
  if (!workspace) {
    document.querySelector("#view").innerHTML = emptyView("building-2", "Workspace unavailable", "Your account is not assigned to an active church workspace.");
    refreshIcons(); return;
  }
  const cycles = store.state.cycles.filter(c => c.churchId === workspace.id);
  document.querySelector("#view").innerHTML = `
    <div class="page-head"><div><h2>Roster cycles</h2></div><button class="btn btn-primary" data-action="new-cycle">${icon("plus")} New cycle</button></div>
    ${cycles.length ? `<div class="toolbar"><div class="search">${icon("search")}<input type="text" id="cycle-search" placeholder="Search cycles"></div><div class="toolbar-group"><select id="cycle-status" aria-label="Filter status" style="width:140px"><option value="">All statuses</option><option value="open">Open</option><option value="draft">Draft</option><option value="published">Published</option></select></div></div>` : ""}
    <section class="panel"><div id="cycle-list">${cycles.length ? cycles.map(cycleRow).join("") : emptyView("calendar-plus", "No roster cycles", "Create your first cycle to begin collecting availability.")}</div></section>`;
  const target = document.querySelector("#view");
  target.querySelector("[data-action='new-cycle']").addEventListener("click", showCycleModal);
  const filterCycles = () => {
    const q = target.querySelector("#cycle-search").value.toLowerCase();
    const status = target.querySelector("#cycle-status").value;
    const filtered = cycles.filter(c => c.name.toLowerCase().includes(q) && (!status || c.status === status));
    target.querySelector("#cycle-list").innerHTML = filtered.length ? filtered.map(cycleRow).join("") : emptyView("search-x", "No matching cycles", "Try a different search or status.");
    refreshIcons(); bindCycleRows();
  };
  target.querySelector("#cycle-search")?.addEventListener("input", filterCycles);
  target.querySelector("#cycle-status")?.addEventListener("change", filterCycles);
  bindCycleRows(); refreshIcons();
}

function bindCycleRows() {
  document.querySelectorAll("[data-cycle]").forEach(el => el.addEventListener("click", () => { store.state.activeCycleId = el.dataset.cycle; store.save(); location.hash = "roster"; }));
  document.querySelectorAll("[data-delete-cycle]").forEach(el => el.addEventListener("click", () => {
    const cycle = store.state.cycles.find(c => c.id === el.dataset.deleteCycle);
    if (cycle) showDeleteCycleModal(cycle);
  }));
}

function renderParticipants() {
  const cycle = currentCycle();
  if (!cycle) {
    document.querySelector("#view").innerHTML = `<div class="page-head"><div><h2>Participant availability</h2></div></div><section class="panel">${emptyView("calendar-plus", "No active cycle", "Create a roster cycle before collecting availability.", `<button class="btn btn-primary" data-route="cycles">${icon("plus")} Create cycle</button>`)}</section>`;
    bindRoutes(document.querySelector("#view")); refreshIcons(); return;
  }
  const people = participants();
  const submitted = people.filter(p=>p.submitted).length;
  document.querySelector("#view").innerHTML = `
    <div class="page-head"><div><h2>Participant availability</h2><p>${esc(cycle.name)} &middot; ${submitted} ${submitted === 1 ? "response" : "responses"}</p></div><div class="page-actions"><button class="btn btn-secondary" data-copy-link>${icon("link")} Copy submission link</button><button class="btn btn-primary" data-add-participant>${icon("user-plus")} Add participant</button></div></div>
    ${people.length ? `<div class="toolbar"><div class="search">${icon("search")}<input id="people-search" placeholder="Search participants"></div><div class="role-tags"><span class="tag primary">${submitted} submitted</span></div></div>` : ""}
    <section class="panel">${people.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Participant</th><th>Willing to serve</th><th>Unavailable</th><th>Availability</th><th>Status</th></tr></thead><tbody id="people-body">${people.map(p=>personRow(p,cycle)).join("")}</tbody></table></div>` : emptyView("users", "No responses yet", "Share the submission link with participants to collect availability.")}</section>`;
  const target = document.querySelector("#view");
  target.querySelector("#people-search")?.addEventListener("input", e => { const q=e.target.value.toLowerCase(); target.querySelector("#people-body").innerHTML=people.filter(p=>p.name.toLowerCase().includes(q)).map(p=>personRow(p,cycle)).join(""); refreshIcons(); });
  target.querySelector("[data-copy-link]").addEventListener("click", () => copyLink(`join/${cycle.token}`));
  target.querySelector("[data-add-participant]").addEventListener("click", () => showParticipantModal(cycle));
  refreshIcons();
}

function personRow(p, cycle) {
  const totalDates = cycle.dates.length;
  const available = Math.max(totalDates - p.unavailable.length, 0);
  const availability = totalDates ? available / totalDates * 100 : 0;
  return `<tr><td><div class="person"><span class="avatar">${initials(p.name)}</span><span><strong>${esc(p.name)}</strong><small>${esc(p.email)}</small></span></div></td><td><div class="role-tags">${p.roles.map(r=>`<span class="tag">${esc(r)}</span>`).join("")}</div></td><td>${p.unavailable.length ? p.unavailable.map(d=>dateLabel(d)).join(", ") : `<span style="color:var(--muted)">None</span>`}</td><td><div style="display:flex;align-items:center;gap:7px"><div class="progress"><span style="width:${availability}%"></span></div><small>${available}/${totalDates}</small></div></td><td><span class="status ${p.submitted ? "open" : "draft"}">${p.submitted ? "Submitted" : "Pending"}</span></td></tr>`;
}

function showParticipantModal(cycle) {
  showModal(`<div class="modal-head"><h2>Add participant</h2><button class="icon-btn" data-close title="Close">${icon("x")}</button></div><form id="participant-form"><div class="modal-body"><div class="field-grid"><div class="field"><label>Name</label><input name="name" autocomplete="name" required></div><div class="field"><label>Email address</label><input name="email" type="email" autocomplete="email" required></div></div><div class="form-section"><h3>Roles</h3><div class="role-options">${cycle.roles.map(role=>`<label class="role-option"><input type="checkbox" name="roles" value="${esc(role)}"><span><strong>${esc(role)}</strong></span></label>`).join("")}</div></div><div class="form-section"><h3>Unavailable dates</h3><div class="role-options">${cycle.dates.map(date=>`<label class="role-option"><input type="checkbox" name="unavailable" value="${date}"><span><strong>${fullDate(date)}</strong></span></label>`).join("")}</div></div></div><div class="modal-foot"><button class="btn btn-secondary" type="button" data-close>Cancel</button><button class="btn btn-primary" type="submit">${icon("user-plus")} Add participant</button></div></form>`);
  document.querySelector("#participant-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.target);
    const roles = form.getAll("roles");
    if (!roles.length) {
      toast("Choose at least one role", "circle-alert");
      return;
    }
    const payload = { cycleId: cycle.id, participant: { name: form.get("name"), email: form.get("email"), roles, unavailable: form.getAll("unavailable") } };
    let participant;
    try {
      const result = await api.call("addParticipant", payload);
      if (!result.participant) throw new Error("The server did not return the participant.");
      participant = result.participant;
    } catch (error) {
      toast(error.message, "circle-alert");
      return;
    }
    const email = String(participant.email).toLowerCase();
    store.state.participants = store.state.participants.filter(p => p.cycleId !== cycle.id || String(p.email).toLowerCase() !== email);
    store.state.participants.push(participant);
    store.save();
    closeModal();
    renderParticipants();
    toast("Participant added", "user-check");
  });
  refreshIcons();
}

function renderRoster() {
  const cycle = currentCycle();
  if (!cycle) {
    document.querySelector("#view").innerHTML = `<div class="page-head"><div><h2>Build roster</h2></div></div><section class="panel">${emptyView("calendar-plus", "No active cycle", "Create a roster cycle before building assignments.", `<button class="btn btn-primary" data-route="cycles">${icon("plus")} Create cycle</button>`)}</section>`;
    bindRoutes(document.querySelector("#view")); refreshIcons(); return;
  }
  const assignments = assignmentsFor(cycle);
  const people = participants();
  const blockedPositions = blockedPositionCount(cycle, assignments);
  const totalPositions = totalPositionCount(cycle, assignments);
  const filledPositions = filledPositionCount(cycle, assignments);
  const conflicts = assignments.filter(a => !isBlockedAssignment(a)).filter(a => {
    const person = store.state.participants.find(p => p.id === a.participantId);
    return !person || !person.roles.includes(a.role) || person.unavailable.includes(a.date) || assignments.some(other => other.id !== a.id && other.date === a.date && other.participantId === a.participantId);
  }).length;
  const loadCounts = Object.fromEntries(people.map(p => [p.id, assignments.filter(a => a.participantId === p.id).length]));
  const loads = Object.values(loadCounts);
  const loadSpread = loads.length ? Math.max(...loads) - Math.min(...loads) : 0;
  const coverage = totalPositions ? Math.round(filledPositions / totalPositions * 100) : 0;
  document.querySelector("#view").innerHTML = `
    <div class="page-head"><div><h2>${esc(cycle.name)}</h2><p>Assign participants, lock key placements, and optimize the remaining roster.</p></div><div class="page-actions roster-page-actions"><button class="btn btn-secondary" data-save>${icon("save")} Save draft</button><button class="btn btn-primary" data-publish>${icon("send")} Publish roster</button></div></div>
    <div class="steps"><div class="step complete">1. Cycle setup</div><div class="step complete">2. Availability</div><div class="step active">3. Assign roles</div><div class="step">4. Publish</div></div>
    <div class="roster-layout">
      <div class="roster-sidebar">
        <aside class="panel participant-pool-panel"><div class="panel-head"><div><h3>Participants</h3><p>Drag a person into an open role.</p></div><strong>${people.length}</strong></div><div class="participant-pool" data-participant-pool>${people.length ? people.map(p=>rosterParticipant(p,cycle,loadCounts[p.id])).join("") : `<p class="participant-pool-empty">No participants yet.</p>`}</div></aside>
        <aside class="panel optimizer-panel"><div class="panel-head"><div><h3>Roster health</h3><p>Balance and availability</p></div></div><div class="panel-body">
          <div class="score-ring" style="--score:${coverage}%"><div class="score-inner"><span><strong>${coverage}</strong><small>Coverage</small></span></div></div>
          <div><div class="metric"><span>Positions filled</span><strong>${filledPositions} / ${totalPositions}</strong></div><div class="metric"><span>Availability conflicts</span><strong class="${conflicts ? "warn" : "good"}">${conflicts}</strong></div><div class="metric"><span>Load spread</span><strong>${loadSpread}</strong></div><div class="metric"><span>Locked placements</span><strong>${assignments.filter(a=>a.locked&&!isBlockedAssignment(a)).length}</strong></div><div class="metric"><span>Blocked roles</span><strong>${blockedPositions}</strong></div></div>
          <div><button class="btn btn-primary" style="width:100%" data-optimize>${icon("wand-sparkles")} Optimize</button></div>
        </div></aside>
      </div>
      <section class="panel roster-board-panel"><div class="panel-head"><div><h3>Service assignments</h3><p>Drag participants or tap an empty role to assign someone.</p></div><span class="status ${esc(cycle.status)}">${esc(cycle.status)}</span></div><div class="table-wrap"><div class="roster-board" style="--role-count:${cycle.roles.length}">${cycle.dates.map(d=>rosterDate(d, cycle.roles, assignments)).join("")}</div></div></section>
    </div>`;
  bindRoster(); refreshIcons();
}

function rosterDate(date, roles, assignments) {
  return `<div class="roster-date"><div class="date-cell"><strong>${dateLabel(date,{weekday:"short",day:"numeric"})}</strong><small>${dateLabel(date,{month:"long",year:"numeric"})}</small></div>${roles.map(role => {
    const a=assignments.find(x=>x.date===date&&x.role===role),blocked=isBlockedAssignment(a),p=a&&!blocked&&store.state.participants.find(x=>x.id===a.participantId);
    return `<div class="assignment-cell dropzone ${blocked?"blocked":""} ${!a?"open-slot":""}" data-date="${date}" data-role="${esc(role)}" ${!a?'data-open-slot role="button" tabindex="0"':""}><div class="assignment-label"><span>${esc(role)}</span><span class="assignment-label-actions"><span>${blocked?"Blocked":p?"1 / 1":"0 / 1"}</span>${!a?`<button class="assignment-control block-slot" data-block-slot data-date="${date}" data-role="${esc(role)}" title="Block role for this date">${icon("ban")}</button>`:""}</span></div>${blocked?`<div class="blocked-assignment"><span>${icon("ban")} Not required</span><button class="assignment-control unblock-slot" data-unblock-slot="${a.id}" title="Make this role available">${icon("x")}</button></div>`:p?`<div class="assignment" data-id="${a.id}"><span class="avatar">${initials(p.name)}</span><strong>${esc(p.name)}</strong><span class="assignment-actions"><button class="assignment-control lock" data-lock="${a.id}" title="${a.locked ? "Unlock placement" : "Lock placement"}">${icon(a.locked ? "lock-keyhole" : "lock-keyhole-open")}</button><button class="assignment-control remove-assignment" data-remove-assignment="${a.id}" title="Remove assignment">${icon("trash-2")}</button></span></div>`:`<div class="empty-assignment-prompt">${icon("user-plus")} <span>Tap to assign</span></div>`}</div>`;
  }).join("")}</div>`;
}

function rosterParticipant(person, cycle, assignmentCount = 0) {
  const unavailable = person.unavailable.filter(date => cycle.dates.includes(date)).length;
  const manualOnly = person.autoAssign === false;
  return `<div class="roster-participant ${manualOnly?"manual-only":""}" data-participant-id="${esc(person.id)}"><span class="avatar">${initials(person.name)}</span><span class="roster-participant-info"><strong>${esc(person.name)}</strong><small>${person.roles.map(esc).join(" · ")}</small><small><span class="participant-load">${assignmentCount} assigned</span> · ${unavailable ? `${unavailable} unavailable ${unavailable === 1 ? "date" : "dates"}` : "Available all dates"}${manualOnly?` · <span class="manual-only-label">Manual only</span>`:""}</small></span><span class="roster-participant-controls"><button class="assignment-control participant-auto-toggle ${manualOnly?"excluded":""}" data-toggle-auto-assign="${esc(person.id)}" title="${manualOnly?"Allow Optimize to assign":"Exclude from Optimize"}">${icon(manualOnly?"lock":"lock-open")}</button>${icon("grip-vertical","drag-handle")}</span></div>`;
}

function placementConflict(person, date, role, assignments, ignoreIds = []) {
  if (!person) return "Participant not found.";
  if (!person.roles.includes(role)) return `${person.name} does not serve in ${role}.`;
  if (person.unavailable.includes(date)) return `${person.name} is unavailable on ${fullDate(date)}.`;
  if (assignments.some(a => !ignoreIds.includes(a.id) && a.date === date && a.participantId === person.id)) return `${person.name} already has an assignment on ${fullDate(date)}.`;
  return "";
}

function assignParticipantToSlot(participantId, date, role) {
  const cycle=currentCycle(),assignments=assignmentsFor(cycle),person=store.state.participants.find(p=>p.id===participantId);
  const conflict=placementConflict(person,date,role,assignments),occupied=assignments.find(a=>a.date===date&&a.role===role);
  if(conflict||occupied)return {ok:false,error:conflict||(isBlockedAssignment(occupied)?"That role is blocked for this date.":"That role already has an assignment.")};
  store.state.assignments.push({id:`a_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,cycleId:cycle.id,date,role,participantId,locked:false});
  store.save();
  return {ok:true,person};
}

function showAssignmentPicker(date, role) {
  const cycle=currentCycle(),assignments=assignmentsFor(cycle),people=participants();
  const loadCounts=Object.fromEntries(people.map(p=>[p.id,assignments.filter(a=>a.participantId===p.id).length]));
  const eligible=people.filter(p=>!placementConflict(p,date,role,assignments)).sort((a,b)=>(loadCounts[a.id]||0)-(loadCounts[b.id]||0)||a.name.localeCompare(b.name));
  showModal(`<div class="modal-head"><div><h2>Assign ${esc(role)}</h2><p>${fullDate(date)}</p></div><button class="icon-btn" data-close title="Close">${icon("x")}</button></div><div class="modal-body assignment-picker"><p class="assignment-picker-help">Choose an eligible participant. Manual-only participants remain available for manual assignment.</p><div class="participant-choices">${eligible.length?eligible.map(p=>`<button class="participant-choice" type="button" data-choose-participant="${esc(p.id)}"><span class="avatar">${initials(p.name)}</span><span><strong>${esc(p.name)}</strong><small>${p.roles.map(esc).join(" · ")}${p.autoAssign===false?" · Manual only":""}</small></span><span class="participant-choice-load">${loadCounts[p.id]||0} assigned</span></button>`).join(""):`<div class="empty"><span class="empty-icon">${icon("user-x")}</span><h3>No eligible participants</h3><p>Everyone is unavailable, already assigned that date, or does not serve this role.</p></div>`}</div></div>`,true,"assignment-picker");
  document.querySelectorAll("[data-choose-participant]").forEach(btn=>btn.addEventListener("click",()=>{const result=assignParticipantToSlot(btn.dataset.chooseParticipant,date,role);if(!result.ok){toast(result.error,"circle-alert");return}closeModal();renderRoster();toast(`${result.person.name} assigned`,"user-check")}));
  refreshIcons();
}

function optimizeRoster(showToast = true) {
  const cycle = currentCycle();
  const people = participants();
  const manualOnlyIds = new Set(people.filter(p => p.autoAssign === false).map(p => p.id));
  const preserved = assignmentsFor(cycle).filter(a => a.locked || manualOnlyIds.has(a.participantId));
  const result = [...preserved];
  const loads = Object.fromEntries(people.map(p => [p.id, preserved.filter(a=>a.participantId===p.id).length]));
  cycle.dates.forEach(date => cycle.roles.forEach(role => {
    if (result.some(a=>a.date===date&&a.role===role)) return;
    const candidates = people.filter(p => p.submitted && p.autoAssign !== false && p.roles.includes(role) && !p.unavailable.includes(date) && !result.some(a=>a.date===date&&a.participantId===p.id)).sort((a,b)=>(loads[a.id]||0)-(loads[b.id]||0));
    const chosen = candidates[0];
    if (chosen) { result.push({ id: `a_${date}_${role.replace(/\W/g,"")}`, cycleId: cycle.id, date, role, participantId: chosen.id, locked: false }); loads[chosen.id] = (loads[chosen.id]||0)+1; }
  }));
  store.state.assignments = store.state.assignments.filter(a => a.cycleId && a.cycleId !== cycle.id).concat(result); store.save();
  if (showToast) { renderRoster(); toast("Roster optimization complete", "wand-sparkles"); }
}

function bindRoster() {
  document.querySelector("[data-optimize]").addEventListener("click", () => optimizeRoster(true));
  document.querySelector("[data-save]").addEventListener("click", async () => { await api.call("saveAssignments", { cycleId: currentCycle().id, assignments: store.state.assignments.filter(a => !a.cycleId || a.cycleId === currentCycle().id) }); toast("Draft roster saved", "save"); });
  document.querySelector("[data-publish]").addEventListener("click", publishRoster);
  document.querySelectorAll("[data-lock]").forEach(btn => btn.addEventListener("click", e => { e.stopPropagation(); const a=store.state.assignments.find(x=>x.id===btn.dataset.lock); a.locked=!a.locked; store.save(); renderRoster(); toast(a.locked ? "Placement locked" : "Placement unlocked", a.locked ? "lock" : "lock-open"); }));
  document.querySelectorAll("[data-remove-assignment]").forEach(btn => btn.addEventListener("click", e => { e.stopPropagation(); const a=store.state.assignments.find(x=>x.id===btn.dataset.removeAssignment);if(!a)return;if(a.locked){toast("Unlock this placement before removing it","circle-alert");return}store.state.assignments=store.state.assignments.filter(x=>x.id!==a.id);store.save();renderRoster();toast("Assignment removed","user-minus") }));
  document.querySelectorAll("[data-block-slot]").forEach(btn => btn.addEventListener("click", e => { e.stopPropagation();const cycle=currentCycle(),assignments=assignmentsFor(cycle);if(assignments.some(a=>a.date===btn.dataset.date&&a.role===btn.dataset.role)){toast("Remove the assignment before blocking this role","circle-alert");return}store.state.assignments.push({id:`blocked_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,cycleId:cycle.id,date:btn.dataset.date,role:btn.dataset.role,participantId:BLOCKED_PARTICIPANT_ID,locked:true});store.save();renderRoster();toast("Role blocked for this date","ban") }));
  document.querySelectorAll("[data-unblock-slot]").forEach(btn => btn.addEventListener("click", e => { e.stopPropagation();store.state.assignments=store.state.assignments.filter(a=>a.id!==btn.dataset.unblockSlot);store.save();renderRoster();toast("Role available again","circle-check") }));
  document.querySelectorAll("[data-toggle-auto-assign]").forEach(btn => btn.addEventListener("click", async e => { e.stopPropagation();const person=store.state.participants.find(p=>p.id===btn.dataset.toggleAutoAssign);if(!person)return;const autoAssign=person.autoAssign===false;btn.disabled=true;try{const result=await api.call("setParticipantAutoAssign",{cycleId:currentCycle().id,participantId:person.id,autoAssign});person.autoAssign=result.participant?.autoAssign!==false;store.save();renderRoster();toast(person.autoAssign?"Participant available to Optimize":"Participant set to Manual only",person.autoAssign?"lock-open":"lock")}catch(error){btn.disabled=false;toast(error.message,"circle-alert")} }));
  document.querySelectorAll("[data-open-slot]").forEach(cell=>{const open=()=>showAssignmentPicker(cell.dataset.date,cell.dataset.role);cell.addEventListener("click",e=>{if(!e.target.closest("button"))open()});cell.addEventListener("keydown",e=>{if(e.target.closest("button"))return;if(e.key==="Enter"||e.key===" "){e.preventDefault();open()}})});
  if (!window.Sortable) return;
  const pool = document.querySelector("[data-participant-pool]");
  if (pool) new Sortable(pool, { group: { name: "roster", pull: "clone", put: false }, sort: false, draggable: ".roster-participant", animation: 140, revertOnSpill: true });
  document.querySelectorAll(".dropzone").forEach(zone => new Sortable(zone, {
    group: "roster", draggable: ".assignment", animation: 140,
    onAdd(evt) {
      const participantId = evt.item.dataset.participantId;
      if (!participantId) return;
      const target = evt.to;
      const result=assignParticipantToSlot(participantId,target.dataset.date,target.dataset.role);
      renderRoster();toast(result.ok?`${result.person.name} assigned`:result.error,result.ok?"user-check":"circle-alert");
    },
    onEnd(evt) {
      const id = evt.item.dataset.id;
      if (!id) return;
      const cycle = currentCycle(); const assignments = assignmentsFor(cycle);
      const a=store.state.assignments.find(x=>x.id===id); const target=evt.to;
      if (!a || !target.dataset.date || !target.dataset.role) { renderRoster(); return; }
      const occupied=assignments.find(x=>x.date===target.dataset.date&&x.role===target.dataset.role&&x.id!==id);
      if (isBlockedAssignment(occupied)) { renderRoster(); toast("That role is blocked for this date.","circle-alert"); return; }
      const source={date:evt.from.dataset.date,role:evt.from.dataset.role};
      const person=store.state.participants.find(p=>p.id===a.participantId);
      const targetConflict=placementConflict(person,target.dataset.date,target.dataset.role,assignments,[a.id]);
      if (a.locked || targetConflict) { renderRoster(); toast(a.locked ? "Unlock this placement before moving it" : targetConflict, "circle-alert"); return; }
      if (occupied) {
        const other=store.state.participants.find(p=>p.id===occupied.participantId);
        const swapConflict=placementConflict(other,source.date,source.role,assignments,[occupied.id,a.id]);
        if (occupied.locked || swapConflict) { renderRoster(); toast(occupied.locked ? "The target placement is locked" : swapConflict, "circle-alert"); return; }
        occupied.date=source.date;occupied.role=source.role;
      }
      a.date=target.dataset.date;a.role=target.dataset.role;store.save();renderRoster();toast(occupied?"Assignments swapped":"Assignment updated","move");
    }
  }));
}

async function publishRoster() {
  const cycle=currentCycle(); cycle.status="published"; store.save();
  await api.call("publishRoster", { cycleId: cycle.id, assignments: store.state.assignments.filter(a => !a.cycleId || a.cycleId === cycle.id) });
  showModal(`<div class="confirmation"><span class="confirmation-icon">${icon("check")}</span><h2>Roster published</h2><p>Your participants can now view the finalized schedule.</p><div class="page-actions" style="justify-content:center"><button class="btn btn-secondary" data-copy-public>${icon("link")} Copy public link</button><a class="btn btn-primary" href="#published/${cycle.publicToken}">${icon("eye")} View roster</a></div></div>`, false);
  document.querySelector("[data-copy-public]").addEventListener("click",()=>copyLink(`published/${cycle.publicToken}`)); refreshIcons();
}

function renderChurches() {
  if (store.state.session.role !== "super") { location.hash="dashboard"; return; }
  const churches=store.state.churches;
  const activeCycles=store.state.cycles.filter(c=>c.status==="open").length;
  document.querySelector("#view").innerHTML=`
    <div class="page-head"><div><h2>Church workspaces</h2></div><button class="btn btn-primary" data-action="new-church">${icon("plus")} Add church</button></div>
    ${stats([["Active churches",churches.filter(c=>c.active).length,"building-2",""],["Church admins",churches.length,"shield-check",""],["Participants",uniqueParticipantCount(),"users",""],["Open cycles",activeCycles,"calendar-range",""]])}
    <section class="panel" style="margin-top:16px">${churches.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Church</th><th>Location</th><th>Administrator</th><th>Participants</th><th>Status</th><th></th></tr></thead><tbody>${churches.map(c=>`<tr><td><div class="person"><span class="avatar">${initials(c.name)}</span><span><strong>${esc(c.name)}</strong><small>ID: ${esc(c.id)}</small></span></div></td><td>${esc(c.city)}</td><td><strong>${esc(c.adminName)}</strong><small style="display:block;color:var(--muted)">${esc(c.adminEmail)}</small></td><td>${uniqueParticipantCount(c.id)}</td><td><span class="status ${c.active?"open":"closed"}">${c.active?"Active":"Suspended"}</span></td><td><button class="icon-btn" data-edit-church="${c.id}" title="Edit church">${icon("pencil")}</button></td></tr>`).join("")}</tbody></table></div>` : emptyView("building-2", "No church workspaces", "Add a church to create its administrator account.")}</section>`;
  const target=document.querySelector("#view"); target.querySelector("[data-action='new-church']").addEventListener("click",()=>showChurchModal()); target.querySelectorAll("[data-edit-church]").forEach(b=>b.addEventListener("click",()=>showChurchModal(store.state.churches.find(c=>c.id===b.dataset.editChurch)))); refreshIcons();
}

function renderSettings() {
  const user=store.state.session;
  const c=user.role === "admin" ? church() : null;
  const fields=c
    ? `<div class="field-grid"><div class="field"><label>Church name</label><input value="${esc(c.name)}" readonly></div><div class="field"><label>City</label><input value="${esc(c.city)}" readonly></div><div class="field"><label>Administrator</label><input value="${esc(c.adminName)}" readonly></div><div class="field"><label>Email address</label><input type="email" value="${esc(c.adminEmail)}" readonly></div></div>`
    : `<div class="field-grid"><div class="field"><label>Name</label><input value="${esc(user.name)}" readonly></div><div class="field"><label>Email address</label><input type="email" value="${esc(user.email)}" readonly></div></div>`;
  document.querySelector("#view").innerHTML=`<div class="page-head"><div><h2>${c ? "Workspace" : "Account"} details</h2></div></div><section class="panel" style="max-width:720px"><div class="panel-head"><h3>General information</h3></div><div class="panel-body">${fields}</div></section>`;
  refreshIcons();
}

function showDeleteCycleModal(cycle) {
  const responseCount = store.state.participants.filter(p => p.cycleId === cycle.id).length;
  const assignmentCount = store.state.assignments.filter(a => a.cycleId === cycle.id).length;
  showModal(`<div class="modal-head"><h2>Delete cycle</h2><button class="icon-btn" data-close title="Close">${icon("x")}</button></div><div class="modal-body"><p><strong>${esc(cycle.name)}</strong> will be deleted with ${responseCount} ${responseCount === 1 ? "participant response" : "participant responses"} and ${assignmentCount} ${assignmentCount === 1 ? "assignment" : "assignments"}.</p></div><div class="modal-foot"><button class="btn btn-secondary" data-close>Cancel</button><button class="btn btn-danger" data-confirm-delete>${icon("trash-2")} Delete cycle</button></div>`);
  document.querySelector("[data-confirm-delete]").addEventListener("click", async () => {
    try {
      await api.call("deleteCycle", { cycleId: cycle.id });
    } catch (error) {
      toast(error.message, "circle-alert");
      return;
    }
    store.state.cycles = store.state.cycles.filter(c => c.id !== cycle.id);
    store.state.participants = store.state.participants.filter(p => p.cycleId !== cycle.id);
    store.state.assignments = store.state.assignments.filter(a => a.cycleId !== cycle.id);
    if (store.state.activeCycleId === cycle.id) store.state.activeCycleId = null;
    store.save();
    closeModal();
    route();
    toast("Cycle deleted", "trash-2");
  });
  refreshIcons();
}

function showCycleModal() {
  showModal(`<div class="modal-head"><div><h2>Create roster cycle</h2></div><button class="icon-btn" data-close title="Close">${icon("x")}</button></div><form id="cycle-form"><div class="modal-body"><div class="field"><label>Cycle name</label><input name="name" required></div><div class="field-grid" style="margin-top:14px"><div class="field"><label>Start date</label><input type="date" name="start" required></div><div class="field"><label>End date</label><input type="date" name="end" required></div></div><div class="field" style="margin-top:14px"><label>Repeats weekly on</label><select name="weekday"><option value="0" selected>Sunday</option><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option></select></div><div class="form-section"><h3>Required roles</h3><div class="role-builder" id="role-builder">${roleInput("")}</div><button class="btn btn-ghost btn-sm" type="button" data-add-role>${icon("plus")} Add role</button></div></div><div class="modal-foot"><button class="btn btn-secondary" type="button" data-close>Cancel</button><button class="btn btn-primary" type="submit">${icon("arrow-right")} Create and collect</button></div></form>`);
  const builder=document.querySelector("#role-builder");
  const addRoleInput=(afterRow=null)=>{if(afterRow)afterRow.insertAdjacentHTML("afterend",roleInput(""));else builder.insertAdjacentHTML("beforeend",roleInput(""));bindRoleRemove();refreshIcons();(afterRow?afterRow.nextElementSibling:builder.lastElementChild).querySelector("[name='role']").focus()};
  document.querySelector("[data-add-role]").addEventListener("click",()=>addRoleInput());
  builder.addEventListener("keydown",e=>{if(e.key!=="Enter"||!e.target.matches("[name='role']"))return;e.preventDefault();if(!e.target.value.trim())return;const row=e.target.closest(".role-row"),next=row.nextElementSibling?.querySelector("[name='role']");if(next)next.focus();else addRoleInput(row)});
  bindRoleRemove();
  document.querySelector("#cycle-form").addEventListener("submit",async e=>{e.preventDefault();const fd=new FormData(e.target);const roles=[...document.querySelectorAll("[name='role']")].map(i=>i.value.trim()).filter(Boolean);const start=fd.get("start"),end=fd.get("end"),weekday=Number(fd.get("weekday"));const dates=weeklyDatesBetween(start,end,weekday);if(!dates.length){toast("The date range does not include the selected weekday.","circle-alert");return}const payload={churchId:church().id,name:fd.get("name"),start,end,roles,dates};let c;try{const result=await api.call("createCycle",payload);if(!result.cycle)throw new Error("The server did not return the created cycle.");c=result.cycle}catch(error){toast(error.message,"circle-alert");return}store.state.activeCycleId=c.id;store.state.cycles.unshift(c);store.save();closeModal();location.hash="cycles";route();toast("Cycle created","calendar-check")}); refreshIcons();
}

function roleInput(value) { return `<div class="role-row"><input name="role" value="${esc(value)}" placeholder="Role name — press Enter for next" required><button class="icon-btn" type="button" data-remove-role title="Remove role">${icon("trash-2")}</button></div>`; }
function bindRoleRemove(){document.querySelectorAll("[data-remove-role]").forEach(b=>b.onclick=()=>{if(document.querySelectorAll(".role-row").length>1)b.closest(".role-row").remove()})}
function weeklyDatesBetween(start,end,weekday=0){const out=[];let d=new Date(`${start}T00:00:00`),last=new Date(`${end}T00:00:00`);if(Number.isNaN(d.getTime())||Number.isNaN(last.getTime())||d>last)return out;d.setDate(d.getDate()+(Number(weekday)-d.getDay()+7)%7);while(d<=last){out.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);d.setDate(d.getDate()+7)}return out}

function showChurchModal(existing=null) {
  showModal(`<div class="modal-head"><h2>${existing?"Edit":"Add"} church workspace</h2><button class="icon-btn" data-close title="Close">${icon("x")}</button></div><form id="church-form"><div class="modal-body"><div class="field-grid"><div class="field"><label>Church name</label><input name="name" value="${esc(existing?.name||"")}" required></div><div class="field"><label>City</label><input name="city" value="${esc(existing?.city||"")}" required></div><div class="field"><label>Admin name</label><input name="adminName" value="${esc(existing?.adminName||"")}" required></div><div class="field"><label>Admin email</label><input name="adminEmail" type="email" value="${esc(existing?.adminEmail||"")}" required></div></div>${existing?`<div class="form-section"><label class="checkbox-row"><input name="active" type="checkbox" ${existing.active?"checked":""}> Workspace is active</label></div>`:`<div class="calendar-note" style="margin-top:16px">A temporary password will be generated for the church administrator.</div>`}</div><div class="modal-foot"><button class="btn btn-secondary" type="button" data-close>Cancel</button><button class="btn btn-primary" type="submit">${icon("save")} Save church</button></div></form>`);
  document.querySelector("#church-form").addEventListener("submit", async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if (existing) {
      data.id = existing.id;
      data.active = e.target.active.checked;
    }
    let result;
    try {
      result = await api.call(existing ? "updateChurch" : "createChurch", data);
      if (!existing && !result.churchId) throw new Error("The server did not return the created church.");
    } catch (error) {
      toast(error.message, "circle-alert");
      return;
    }
    if (existing) Object.assign(existing, data);
    else store.state.churches.push({ id: result.churchId, name: data.name, city: data.city, adminName: data.adminName, adminEmail: data.adminEmail, active: true, members: 0 });
    store.save();
    closeModal();
    renderChurches();
    if (result.temporaryPassword) {
      showModal(`<div class="confirmation"><span class="confirmation-icon">${icon("key-round")}</span><h2>Church workspace created</h2><p>Share this one-time password securely with ${esc(data.adminName)}.</p><div class="field" style="max-width:340px;margin:18px auto;text-align:left"><label>Temporary password</label><input id="temp-password" value="${esc(result.temporaryPassword)}" readonly></div><button class="btn btn-primary" data-copy-password>${icon("copy")} Copy password</button></div>`, false);
      document.querySelector("[data-copy-password]").addEventListener("click", async () => { await navigator.clipboard.writeText(result.temporaryPassword); toast("Temporary password copied", "copy"); });
    } else toast(existing ? "Church updated" : "Church workspace created", "building-2");
  });
  refreshIcons();
}

async function renderParticipant(token, remote = null) {
  if (API_URL && !remote) {
    renderPublicLoading();
    try { return renderParticipant(token, await api.call("getCycleByToken", { token })); }
    catch (error) { return renderPublicError(error.message); }
  }
  const cycle=remote?.cycle || store.state.cycles.find(c=>c.token===token);
  if(!cycle)return renderPublicError("This submission link is invalid or has expired.");
  const c=remote?.church || store.state.churches.find(x=>x.id===cycle.churchId);
  app.innerHTML=`<div class="public-shell"><header class="public-nav"><div class="public-brand"><span class="brand-mark">${icon("church")}</span><span class="brand-word">SteepleFlow</span></div><span style="color:var(--muted);font-size:11px">${esc(c.name)}</span></header><main class="public-content"><div class="public-head"><span class="eyebrow">Availability request</span><h1>${esc(cycle.name)}</h1><p>Submit the roles and dates that work for you.</p></div><section class="public-card"><form id="availability-form"><div class="panel-body" style="padding:22px"><div class="field-grid"><div class="field"><label>Your name</label><input name="name" autocomplete="name" required></div><div class="field"><label>Email address</label><input name="email" type="email" autocomplete="email" required></div></div><div class="form-section"><h3>Roles you are willing to serve</h3><div class="role-options">${cycle.roles.map(r=>`<label class="role-option"><input type="checkbox" name="roles" value="${esc(r)}"><span><strong>${esc(r)}</strong></span></label>`).join("")}</div></div><div class="form-section"><h3>Dates you are unavailable</h3><p style="color:var(--muted);font-size:11px">Select every date that does not work for you.</p><div class="role-options">${cycle.dates.map(d=>`<label class="role-option"><input type="checkbox" name="unavailable" value="${d}"><span><strong>${fullDate(d)}</strong></span></label>`).join("")}</div></div></div><div class="modal-foot"><small style="color:var(--muted)">${icon("shield-check")} Visible to the church roster admin.</small><button class="btn btn-primary" type="submit">Submit availability ${icon("arrow-right")}</button></div></form></section></main></div>`;
  document.querySelector("#availability-form").addEventListener("submit",async e=>{e.preventDefault();const fd=new FormData(e.target);const roles=fd.getAll("roles");if(!roles.length)return toast("Choose at least one role","circle-alert");const data={churchId:cycle.churchId,name:fd.get("name"),email:fd.get("email"),roles,unavailable:fd.getAll("unavailable"),submitted:true};try{await api.call("submitAvailability",{token,participant:data})}catch(error){toast(error.message,"circle-alert");return}document.querySelector(".public-card").innerHTML=`<div class="confirmation"><span class="confirmation-icon">${icon("check")}</span><h2>Availability received</h2><p>${esc(data.name)}, your response was submitted.</p><button class="btn btn-secondary" onclick="location.reload()">${icon("pencil")} Update response</button></div>`;refreshIcons()}); refreshIcons();
}

async function renderPublished(token, remote = null) {
  if (API_URL && !remote) {
    renderPublicLoading();
    try { return renderPublished(token, await api.call("getPublishedRoster", { token })); }
    catch (error) { return renderPublicError(error.message); }
  }
  const cycle=remote?.cycle || store.state.cycles.find(c=>c.publicToken===token);if(!cycle)return renderPublicError("This roster link is invalid or unavailable.");
  const c=remote?.church || store.state.churches.find(x=>x.id===cycle.churchId);
  if (remote) {
    store.state.assignments = remote.assignments || [];
    store.state.participants = remote.participants || [];
  }
  app.innerHTML=`<div class="public-shell"><header class="public-nav"><div class="public-brand"><span class="brand-mark">${icon("church")}</span><span class="brand-word">SteepleFlow</span></div><span style="color:var(--muted);font-size:11px">${esc(c.name)}</span></header><main class="public-content"><div class="public-head"><span class="eyebrow">Published roster</span><h1>${esc(cycle.name)}</h1></div><section class="public-card">${cycle.dates.map(date=>`<div class="published-date"><div class="published-date-head"><strong>${fullDate(date)}</strong></div><div class="published-roles">${cycle.roles.map(role=>{const a=store.state.assignments.find(x=>x.date===date&&x.role===role),blocked=isBlockedAssignment(a),p=a&&!blocked&&store.state.participants.find(x=>x.id===a.participantId);return `<div class="published-role ${blocked?"blocked":""}"><small>${esc(role)}</small><strong>${blocked?"Not required":esc(p?.name||"Unassigned")}</strong></div>`}).join("")}</div></div>`).join("")}</section></main></div>`;refreshIcons();
}

function renderPublicLoading(){app.innerHTML=`<div class="public-shell"><main class="public-content"><section class="public-card confirmation"><span class="confirmation-icon">${icon("loader-circle")}</span><h2>Loading schedule</h2><p>Checking this secure link...</p></section></main></div>`;refreshIcons()}
function renderPublicError(message){app.innerHTML=`<div class="public-shell"><main class="public-content"><section class="public-card confirmation"><span class="confirmation-icon" style="background:var(--danger)">${icon("link-2-off")}</span><h1>Link unavailable</h1><p>${esc(message)}</p></section></main></div>`;refreshIcons()}
function showModal(content, wrap=true, variant=""){const el=document.createElement("div"),suffix=variant?`-${variant}`:"";el.className=`modal-backdrop${suffix?` modal-backdrop${suffix}`:""}`;el.id="modal";el.innerHTML=wrap?`<section class="modal${suffix?` modal${suffix}`:""}">${content}</section>`:`<section class="modal${suffix?` modal${suffix}`:""}">${content}</section>`;document.body.appendChild(el);el.addEventListener("click",e=>{if(e.target===el||e.target.closest("[data-close]"))closeModal()});refreshIcons()}
function closeModal(){document.querySelector("#modal")?.remove()}
function bindRoutes(root=document){root.querySelectorAll("[data-route]").forEach(el=>el.addEventListener("click",()=>location.hash=el.dataset.route))}
async function copyLink(path){const url=`${location.href.split("#")[0]}#${path}`;try{await navigator.clipboard.writeText(url);toast("Link copied to clipboard","copy")}catch{prompt("Copy this link",url)}}

window.addEventListener("hashchange",route);
window.addEventListener("DOMContentLoaded",route);
