/* Set this to the deployed Google Apps Script Web App URL for production. */
const API_URL = "https://script.google.com/macros/s/AKfycbxNeYTAzmy9H5nYTIH92AA2B7qk_a1QP_ZJt_iUOLN29gP5u4HrsX5oyGF-SQg2280p/exec";

const app = document.querySelector("#app");

const seed = {
  session: null,
  churches: [
    { id: "church_grace", name: "Grace Community Church", city: "Kuala Lumpur", adminName: "Sarah Lim", adminEmail: "grace@demo.com", active: true, members: 38 },
    { id: "church_hope", name: "Hope City Chapel", city: "Petaling Jaya", adminName: "Daniel Tan", adminEmail: "hope@demo.com", active: true, members: 24 },
    { id: "church_newlife", name: "New Life Fellowship", city: "Subang Jaya", adminName: "Miriam Lee", adminEmail: "newlife@demo.com", active: true, members: 31 }
  ],
  cycles: [
    { id: "cycle_aug", churchId: "church_grace", name: "August 2026 Services", start: "2026-08-02", end: "2026-08-30", status: "open", token: "join-GR8AUG26", publicToken: "roster-GR8AUG26", roles: ["Worship Lead", "Keys", "Guitar", "Vocals"], dates: ["2026-08-02", "2026-08-09", "2026-08-16", "2026-08-23", "2026-08-30"] },
    { id: "cycle_jul", churchId: "church_grace", name: "July 2026 Services", start: "2026-07-05", end: "2026-07-26", status: "published", token: "join-GR7JUL26", publicToken: "roster-GR7JUL26", roles: ["Worship Lead", "Keys", "Guitar", "Vocals"], dates: ["2026-07-05", "2026-07-12", "2026-07-19", "2026-07-26"] },
    { id: "cycle_sep", churchId: "church_grace", name: "September 2026 Services", start: "2026-09-06", end: "2026-09-27", status: "draft", token: "join-GR9SEP26", publicToken: "roster-GR9SEP26", roles: ["Worship Lead", "Keys", "Guitar", "Vocals"], dates: ["2026-09-06", "2026-09-13", "2026-09-20", "2026-09-27"] }
  ],
  participants: [
    { id: "p1", churchId: "church_grace", name: "Alicia Wong", email: "alicia@example.com", roles: ["Worship Lead", "Vocals"], unavailable: ["2026-08-16"], submitted: true },
    { id: "p2", churchId: "church_grace", name: "Marcus Lee", email: "marcus@example.com", roles: ["Keys", "Guitar"], unavailable: ["2026-08-23"], submitted: true },
    { id: "p3", churchId: "church_grace", name: "Jon Tan", email: "jon@example.com", roles: ["Guitar", "Vocals"], unavailable: ["2026-08-09"], submitted: true },
    { id: "p4", churchId: "church_grace", name: "Rachel Ng", email: "rachel@example.com", roles: ["Keys", "Vocals"], unavailable: ["2026-08-02", "2026-08-30"], submitted: true },
    { id: "p5", churchId: "church_grace", name: "David Chen", email: "david@example.com", roles: ["Worship Lead", "Guitar"], unavailable: [], submitted: true },
    { id: "p6", churchId: "church_grace", name: "Chloe Goh", email: "chloe@example.com", roles: ["Vocals"], unavailable: ["2026-08-23"], submitted: true },
    { id: "p7", churchId: "church_grace", name: "Isaac Koh", email: "isaac@example.com", roles: ["Keys", "Guitar"], unavailable: ["2026-08-16"], submitted: true },
    { id: "p8", churchId: "church_grace", name: "Mei Lin", email: "mei@example.com", roles: ["Worship Lead", "Vocals"], unavailable: ["2026-08-02"], submitted: true },
    { id: "p9", churchId: "church_grace", name: "Samuel Ong", email: "samuel@example.com", roles: ["Guitar"], unavailable: [], submitted: false }
  ],
  assignments: [],
  activities: [
    { icon: "user-check", text: "Chloe Goh submitted availability", time: "18 minutes ago" },
    { icon: "calendar-plus", text: "September cycle saved as draft", time: "Yesterday" },
    { icon: "send", text: "July roster was published", time: "4 days ago" },
    { icon: "lock", text: "Marcus Lee was locked to Keys", time: "5 days ago" }
  ]
};

const store = {
  state: loadState(),
  save() { localStorage.setItem("steepleflow_state", JSON.stringify(this.state)); },
  reset() { this.state = structuredClone(seed); this.save(); }
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem("steepleflow_state"));
    return saved && saved.churches ? saved : structuredClone(seed);
  } catch { return structuredClone(seed); }
}

const api = {
  async call(action, payload = {}) {
    if (!API_URL) return { ok: true, demo: true };
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
function currentCycle() { return store.state.cycles.find(c => c.id === "cycle_aug") || store.state.cycles.find(c => c.status === "open") || store.state.cycles[0]; }
function church() { return store.state.churches.find(c => c.id === (store.state.session?.churchId || "church_grace")) || store.state.churches[0]; }
function participants() { const cycle = currentCycle(); return store.state.participants.filter(p => p.churchId === church().id && (!p.cycleId || p.cycleId === cycle.id)); }

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
  if (path === "join") return renderParticipant(param || currentCycle().token);
  if (path === "published") return renderPublished(param || currentCycle().publicToken);
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
          <h1>Welcome back.</h1>
          <p>Sign in to plan, coordinate, and publish your church rosters.</p>
          <form class="login-form" id="login-form">
            <div class="field"><label for="email">Email address</label><input id="email" type="email" value="grace@demo.com" autocomplete="username" required></div>
            <div class="field"><label for="password">Password</label><input id="password" type="password" value="grace123" autocomplete="current-password" required></div>
            <div class="login-help"><label class="checkbox-row"><input type="checkbox" checked> Remember me</label><a href="#" id="forgot">Forgot password?</a></div>
            <button class="btn btn-primary" type="submit">Sign in ${icon("arrow-right")}</button>
          </form>
          <div class="demo-note"><strong>Demo access</strong><br>Church admin: grace@demo.com / grace123<br>Super-admin: super@demo.com / admin123</div>
        </div>
      </section>
      <aside class="login-visual" aria-hidden="true">
        <div class="visual-art"><span class="arch"></span><span class="arch"></span><span class="arch"></span></div>
        <div class="visual-copy"><span class="eyebrow">Serve with clarity</span><h2>Every person in the right place, at the right time.</h2><p>One calm workspace for availability, fair assignments, and rosters your team can trust.</p></div>
      </aside>
    </div>`;
  document.querySelector("#login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const email = document.querySelector("#email").value.trim().toLowerCase();
    const password = document.querySelector("#password").value;
    const isSuper = email === "super@demo.com" && password === "admin123";
    const isAdmin = email === "grace@demo.com" && password === "grace123";
    if (!isSuper && !isAdmin && !API_URL) return toast("Email or password is incorrect", "circle-alert");
    try {
      const result = await api.call("login", { email, password });
      if (result.data) {
        store.state.churches = result.data.churches || [];
        store.state.cycles = result.data.cycles || [];
        store.state.participants = result.data.participants || [];
        store.state.assignments = result.data.assignments || [];
      }
      store.state.session = result.session || { token: crypto.randomUUID(), role: isSuper ? "super" : "admin", name: isSuper ? "Jordan Admin" : "Sarah Lim", email, churchId: isSuper ? null : "church_grace" };
      store.save();
      location.hash = isSuper ? "churches" : "dashboard";
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
  const title = { dashboard: "Overview", cycles: "Roster cycles", participants: "Participants", roster: "Build roster", churches: "Churches", settings: "Settings" }[view];
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <div class="brand"><span class="brand-mark">${icon("church")}</span><span><span class="brand-word">SteepleFlow</span><small>Roster management</small></span></div>
        ${user.role === "admin" ? `<div class="church-switcher"><small>Current church</small><strong>${esc(church().name)} ${icon("chevrons-up-down")}</strong></div>` : ""}
        <nav class="nav"><div class="nav-label">Workspace</div>${shellNav(view)}</nav>
        <div class="sidebar-footer"><div class="user-block"><span class="avatar">${initials(user.name)}</span><span><strong>${esc(user.name)}</strong><small>${user.role === "super" ? "Super-admin" : "Church admin"}</small></span><button class="icon-btn" data-route="logout" title="Sign out">${icon("log-out")}</button></div></div>
      </aside>
      <section class="main">
        <header class="topbar"><div class="topbar-title"><button class="icon-btn mobile-menu" id="menu-toggle" title="Open navigation">${icon("menu")}</button><div><div class="crumb">${user.role === "super" ? "Administration" : esc(church().name)}</div><h1>${title}</h1></div></div><div class="top-actions"><button class="icon-btn" title="Notifications">${icon("bell")}</button>${user.role === "admin" ? `<button class="btn btn-primary btn-sm" data-action="new-cycle">${icon("plus")}<span>New cycle</span></button>` : `<button class="btn btn-primary btn-sm" data-action="new-church">${icon("plus")}<span>Add church</span></button>`}</div></header>
        <div class="content" id="view"></div>
      </section>
    </div>`;
  document.querySelectorAll("[data-route]").forEach(el => el.addEventListener("click", () => { location.hash = el.dataset.route; }));
  document.querySelector("#menu-toggle")?.addEventListener("click", () => document.querySelector("#sidebar").classList.toggle("open"));
  document.querySelectorAll("[data-action='new-cycle']").forEach(el => el.addEventListener("click", showCycleModal));
  document.querySelectorAll("[data-action='new-church']").forEach(el => el.addEventListener("click", showChurchModal));
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
    target.innerHTML = `<div class="page-head"><div><h2>Network overview</h2><p>Current activity across every church workspace.</p></div></div>${stats([
      ["Churches", store.state.churches.length, "building-2", "All workspaces active"], ["Administrators", store.state.churches.length, "shield-check", "One per church"], ["Participants", store.state.churches.reduce((a,c)=>a+c.members,0), "users", "+12 this quarter"], ["Published rosters", 14, "send", "Across 3 churches"]
    ])}`;
    refreshIcons(); return;
  }
  const cycle = currentCycle();
  target.innerHTML = `
    <div class="page-head"><div><h2>Good morning, ${esc(store.state.session.name.split(" ")[0])}</h2><p>Here is what needs your attention for ${esc(church().name)}.</p></div><div class="page-actions"><button class="btn btn-secondary" data-copy-link>${icon("link")} Copy submission link</button><button class="btn btn-primary" data-route="roster">${icon("wand-sparkles")} Build roster</button></div></div>
    ${stats([["Active cycle", "August", "calendar-range", "Responses close Jul 26"], ["Responses", "8 / 9", "user-check", "89% submitted"], ["Open positions", "20", "circle-dashed", "Across 5 services"], ["Coverage", "92%", "chart-no-axes-column-increasing", "+7% from last cycle"]])}
    <div class="grid-2" style="margin-top:16px">
      <section class="panel"><div class="panel-head"><div><h3>Roster cycles</h3><p>Plan and publish upcoming service schedules</p></div><button class="btn btn-ghost btn-sm" data-route="cycles">View all ${icon("arrow-right")}</button></div>${store.state.cycles.filter(c=>c.churchId===church().id).map(cycleRow).join("")}</section>
      <section class="panel"><div class="panel-head"><div><h3>Recent activity</h3><p>Latest updates in your workspace</p></div></div><div class="panel-body">${store.state.activities.map(a => `<div class="activity"><span class="activity-icon">${icon(a.icon)}</span><span><p>${esc(a.text)}</p><time>${esc(a.time)}</time></span></div>`).join("")}</div></section>
    </div>`;
  bindRoutes(target);
  target.querySelector("[data-copy-link]").addEventListener("click", () => copyLink(`join/${cycle.token}`));
  refreshIcons();
}

function stats(rows) {
  return `<div class="stats-grid">${rows.map(([label,value,glyph,note]) => `<article class="stat"><div class="stat-top"><span>${esc(label)}</span><span class="stat-icon">${icon(glyph)}</span></div><div class="stat-value">${esc(value)}</div><div class="stat-note">${esc(note)}</div></article>`).join("")}</div>`;
}

function cycleRow(c) {
  return `<div class="cycle-row"><div><div class="cycle-title"><strong>${esc(c.name)}</strong><span class="status ${c.status}">${esc(c.status)}</span></div><div class="cycle-meta"><span>${icon("calendar-days")} ${dateLabel(c.start)} - ${dateLabel(c.end)}</span><span>${icon("users")} ${c.id === "cycle_aug" ? "8 responses" : c.status === "draft" ? "Not opened" : "9 responses"}</span></div></div><button class="icon-btn" title="Open cycle" data-cycle="${c.id}">${icon("chevron-right")}</button></div>`;
}

function renderCycles() {
  const cycles = store.state.cycles.filter(c => c.churchId === church().id);
  document.querySelector("#view").innerHTML = `
    <div class="page-head"><div><h2>Roster cycles</h2><p>Create collection windows, review responses, and publish schedules.</p></div><button class="btn btn-primary" data-action="new-cycle">${icon("plus")} New cycle</button></div>
    <div class="toolbar"><div class="search">${icon("search")}<input type="text" id="cycle-search" placeholder="Search cycles"></div><div class="toolbar-group"><select aria-label="Filter status" style="width:140px"><option>All statuses</option><option>Open</option><option>Draft</option><option>Published</option></select></div></div>
    <section class="panel"><div id="cycle-list">${cycles.map(cycleRow).join("")}</div></section>`;
  const target = document.querySelector("#view");
  target.querySelector("[data-action='new-cycle']").addEventListener("click", showCycleModal);
  target.querySelector("#cycle-search").addEventListener("input", e => { const q=e.target.value.toLowerCase(); target.querySelector("#cycle-list").innerHTML=cycles.filter(c=>c.name.toLowerCase().includes(q)).map(cycleRow).join(""); refreshIcons(); bindCycleRows(); });
  bindCycleRows(); refreshIcons();
}

function bindCycleRows() {
  document.querySelectorAll("[data-cycle]").forEach(el => el.addEventListener("click", () => { location.hash = el.dataset.cycle === "cycle_aug" ? "roster" : "cycles"; if (el.dataset.cycle !== "cycle_aug") toast("Cycle selected", "calendar-check"); }));
}

function renderParticipants() {
  const people = participants();
  document.querySelector("#view").innerHTML = `
    <div class="page-head"><div><h2>Participant availability</h2><p>${esc(currentCycle().name)} &middot; ${people.filter(p=>p.submitted).length} of ${people.length} responses received</p></div><div class="page-actions"><button class="btn btn-secondary" data-remind>${icon("mail")} Send reminder</button><button class="btn btn-primary" data-copy-link>${icon("link")} Copy submission link</button></div></div>
    <div class="toolbar"><div class="search">${icon("search")}<input id="people-search" placeholder="Search participants"></div><div class="role-tags"><span class="tag primary">${people.filter(p=>p.submitted).length} submitted</span><span class="tag">${people.filter(p=>!p.submitted).length} pending</span></div></div>
    <section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Participant</th><th>Willing to serve</th><th>Unavailable</th><th>Availability</th><th>Status</th><th></th></tr></thead><tbody id="people-body">${people.map(personRow).join("")}</tbody></table></div></section>`;
  const target = document.querySelector("#view");
  target.querySelector("#people-search").addEventListener("input", e => { const q=e.target.value.toLowerCase(); target.querySelector("#people-body").innerHTML=people.filter(p=>p.name.toLowerCase().includes(q)).map(personRow).join(""); refreshIcons(); });
  target.querySelector("[data-copy-link]").addEventListener("click", () => copyLink(`join/${currentCycle().token}`));
  target.querySelector("[data-remind]").addEventListener("click", () => toast("Reminder queued for 1 participant", "mail-check"));
  refreshIcons();
}

function personRow(p) {
  const available = currentCycle().dates.length - p.unavailable.length;
  return `<tr><td><div class="person"><span class="avatar">${initials(p.name)}</span><span><strong>${esc(p.name)}</strong><small>${esc(p.email)}</small></span></div></td><td><div class="role-tags">${p.roles.map(r=>`<span class="tag">${esc(r)}</span>`).join("")}</div></td><td>${p.unavailable.length ? p.unavailable.map(d=>dateLabel(d)).join(", ") : `<span style="color:var(--muted)">None</span>`}</td><td><div style="display:flex;align-items:center;gap:7px"><div class="progress"><span style="width:${available/currentCycle().dates.length*100}%"></span></div><small>${available}/${currentCycle().dates.length}</small></div></td><td><span class="status ${p.submitted ? "open" : "draft"}">${p.submitted ? "Submitted" : "Pending"}</span></td><td><button class="icon-btn" title="More options">${icon("ellipsis")}</button></td></tr>`;
}

function renderRoster() {
  const cycle = currentCycle();
  if (!store.state.assignments.some(a => !a.cycleId || a.cycleId === cycle.id)) optimizeRoster(false);
  const assignments = store.state.assignments.filter(a => !a.cycleId || a.cycleId === cycle.id);
  document.querySelector("#view").innerHTML = `
    <div class="page-head"><div><h2>${esc(cycle.name)}</h2><p>Assign participants, lock key placements, and optimize the remaining roster.</p></div><div class="page-actions"><button class="btn btn-secondary" data-save>${icon("save")} Save draft</button><button class="btn btn-primary" data-publish>${icon("send")} Publish roster</button></div></div>
    <div class="steps"><div class="step complete">1. Cycle setup</div><div class="step complete">2. Availability</div><div class="step active">3. Assign roles</div><div class="step">4. Publish</div></div>
    <div class="roster-layout">
      <aside class="panel optimizer-panel"><div class="panel-head"><div><h3>Roster health</h3><p>Balance and availability</p></div></div><div class="panel-body">
        <div class="score-ring"><div class="score-inner"><span><strong>92</strong><small>Score</small></span></div></div>
        <div><div class="metric"><span>Positions filled</span><strong class="good">20 / 20</strong></div><div class="metric"><span>Availability conflicts</span><strong class="good">0</strong></div><div class="metric"><span>Load balance</span><strong class="warn">Good</strong></div><div class="metric"><span>Locked placements</span><strong>${assignments.filter(a=>a.locked).length}</strong></div></div>
        <div><button class="btn btn-primary" style="width:100%" data-optimize>${icon("wand-sparkles")} Optimize</button></div>
      </div></aside>
      <section class="panel"><div class="panel-head"><div><h3>Service assignments</h3><p>Drag participants between matching roles. Click the lock to preserve a placement.</p></div><span class="status draft">Draft</span></div><div class="table-wrap"><div class="roster-board">${cycle.dates.map(d=>rosterDate(d, cycle.roles, assignments)).join("")}</div></div></section>
    </div>`;
  bindRoster(); refreshIcons();
}

function rosterDate(date, roles, assignments) {
  return `<div class="roster-date"><div class="date-cell"><strong>${dateLabel(date,{weekday:"short",day:"numeric"})}</strong><small>${dateLabel(date,{month:"long",year:"numeric"})}</small><small>10:00 AM</small></div>${roles.map(role => { const a=assignments.find(x=>x.date===date&&x.role===role); const p=a&&store.state.participants.find(x=>x.id===a.participantId); return `<div class="assignment-cell dropzone" data-date="${date}" data-role="${esc(role)}"><div class="assignment-label"><span>${esc(role)}</span><span>${p ? "1 / 1" : "0 / 1"}</span></div>${p ? `<div class="assignment" data-id="${a.id}"><span class="avatar">${initials(p.name)}</span><strong>${esc(p.name)}</strong><button class="btn btn-ghost btn-sm lock" data-lock="${a.id}" title="${a.locked ? "Unlock placement" : "Lock placement"}">${icon(a.locked ? "lock-keyhole" : "lock-keyhole-open")}</button></div>` : ""}</div>`; }).join("")}</div>`;
}

function optimizeRoster(showToast = true) {
  const cycle = currentCycle();
  const locked = store.state.assignments.filter(a => a.locked && (!a.cycleId || a.cycleId === cycle.id));
  const result = [...locked];
  const loads = Object.fromEntries(participants().map(p => [p.id, locked.filter(a=>a.participantId===p.id).length]));
  cycle.dates.forEach(date => cycle.roles.forEach(role => {
    if (result.some(a=>a.date===date&&a.role===role)) return;
    const candidates = participants().filter(p => p.submitted && p.roles.includes(role) && !p.unavailable.includes(date) && !result.some(a=>a.date===date&&a.participantId===p.id)).sort((a,b)=>(loads[a.id]||0)-(loads[b.id]||0));
    const chosen = candidates[0];
    if (chosen) { result.push({ id: `a_${date}_${role.replace(/\W/g,"")}`, cycleId: cycle.id, date, role, participantId: chosen.id, locked: false }); loads[chosen.id] = (loads[chosen.id]||0)+1; }
  }));
  store.state.assignments = store.state.assignments.filter(a => a.cycleId && a.cycleId !== cycle.id).concat(result); store.save();
  if (showToast) { renderRoster(); toast("Roster optimized with no availability conflicts", "wand-sparkles"); }
}

function bindRoster() {
  document.querySelector("[data-optimize]").addEventListener("click", () => optimizeRoster(true));
  document.querySelector("[data-save]").addEventListener("click", async () => { await api.call("saveAssignments", { cycleId: currentCycle().id, assignments: store.state.assignments.filter(a => !a.cycleId || a.cycleId === currentCycle().id) }); toast("Draft roster saved", "save"); });
  document.querySelector("[data-publish]").addEventListener("click", publishRoster);
  document.querySelectorAll("[data-lock]").forEach(btn => btn.addEventListener("click", e => { e.stopPropagation(); const a=store.state.assignments.find(x=>x.id===btn.dataset.lock); a.locked=!a.locked; store.save(); renderRoster(); toast(a.locked ? "Placement locked" : "Placement unlocked", a.locked ? "lock" : "lock-open"); }));
  if (window.Sortable) document.querySelectorAll(".dropzone").forEach(zone => new Sortable(zone, {
    group: "roster", draggable: ".assignment", animation: 140,
    onEnd(evt) {
      const id = evt.item.dataset.id; const a=store.state.assignments.find(x=>x.id===id); const target=evt.to;
      const occupied=store.state.assignments.find(x=>x.date===target.dataset.date&&x.role===target.dataset.role&&x.id!==id);
      const source={date:evt.from.dataset.date,role:evt.from.dataset.role};
      const person=store.state.participants.find(p=>p.id===a.participantId);
      const targetValid=person.roles.includes(target.dataset.role)&&!person.unavailable.includes(target.dataset.date);
      if (a.locked || !targetValid) { renderRoster(); toast(a.locked ? "Unlock this placement before moving it" : "Participant is not available for that role or date", "circle-alert"); return; }
      if (occupied) {
        const other=store.state.participants.find(p=>p.id===occupied.participantId);
        const swapValid=!occupied.locked&&other.roles.includes(source.role)&&!other.unavailable.includes(source.date);
        if (!swapValid) { renderRoster(); toast(occupied.locked ? "The target placement is locked" : "Those assignments cannot be swapped", "circle-alert"); return; }
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
  document.querySelector("#view").innerHTML=`
    <div class="page-head"><div><h2>Church workspaces</h2><p>Create and manage church accounts and their assigned administrators.</p></div><button class="btn btn-primary" data-action="new-church">${icon("plus")} Add church</button></div>
    ${stats([["Active churches",churches.filter(c=>c.active).length,"building-2","All systems operational"],["Church admins",churches.length,"shield-check","Unique access assigned"],["Total participants",churches.reduce((a,c)=>a+c.members,0),"users","Across all workspaces"],["Active cycles",5,"calendar-range","2 collecting responses"]])}
    <section class="panel" style="margin-top:16px"><div class="table-wrap"><table class="data-table"><thead><tr><th>Church</th><th>Location</th><th>Administrator</th><th>Participants</th><th>Status</th><th></th></tr></thead><tbody>${churches.map(c=>`<tr><td><div class="person"><span class="avatar">${initials(c.name)}</span><span><strong>${esc(c.name)}</strong><small>ID: ${esc(c.id)}</small></span></div></td><td>${esc(c.city)}</td><td><strong>${esc(c.adminName)}</strong><small style="display:block;color:var(--muted)">${esc(c.adminEmail)}</small></td><td>${c.members}</td><td><span class="status ${c.active?"open":"closed"}">${c.active?"Active":"Suspended"}</span></td><td><button class="icon-btn" data-edit-church="${c.id}" title="Edit church">${icon("pencil")}</button></td></tr>`).join("")}</tbody></table></div></section>`;
  const target=document.querySelector("#view"); target.querySelector("[data-action='new-church']").addEventListener("click",showChurchModal); target.querySelectorAll("[data-edit-church]").forEach(b=>b.addEventListener("click",()=>showChurchModal(store.state.churches.find(c=>c.id===b.dataset.editChurch)))); refreshIcons();
}

function renderSettings() {
  const c=church();
  document.querySelector("#view").innerHTML=`<div class="page-head"><div><h2>Workspace settings</h2><p>Manage your organization details and scheduling defaults.</p></div></div><section class="panel" style="max-width:720px"><div class="panel-head"><h3>General information</h3></div><form class="panel-body" id="settings-form"><div class="field-grid"><div class="field"><label>Church name</label><input value="${esc(c.name)}"></div><div class="field"><label>City</label><input value="${esc(c.city)}"></div><div class="field"><label>Default service time</label><input type="text" value="10:00 AM"></div><div class="field"><label>Time zone</label><select><option>Asia/Kuala Lumpur</option></select></div></div><div class="form-section"><h3>Scheduling defaults</h3><label class="checkbox-row"><input type="checkbox" checked> Prevent participants from serving in two roles on the same date</label><label class="checkbox-row" style="margin-top:10px"><input type="checkbox" checked> Prefer balanced assignments across the cycle</label></div><div class="form-section"><button class="btn btn-primary">${icon("save")} Save settings</button></div></form></section>`;
  document.querySelector("#settings-form").addEventListener("submit",e=>{e.preventDefault();toast("Settings saved","save")}); refreshIcons();
}

function showCycleModal() {
  showModal(`<div class="modal-head"><div><h2>Create roster cycle</h2><p style="margin:2px 0 0;color:var(--muted);font-size:11px">Define the collection window and roles needed.</p></div><button class="icon-btn" data-close title="Close">${icon("x")}</button></div><form id="cycle-form"><div class="modal-body"><div class="field"><label>Cycle name</label><input name="name" value="October 2026 Services" required></div><div class="field-grid" style="margin-top:14px"><div class="field"><label>Start date</label><input type="date" name="start" value="2026-10-04" required></div><div class="field"><label>End date</label><input type="date" name="end" value="2026-10-25" required></div></div><div class="form-section"><h3>Required roles</h3><div class="role-builder" id="role-builder">${["Worship Lead","Keys","Guitar","Vocals"].map(r=>roleInput(r)).join("")}</div><button class="btn btn-ghost btn-sm" type="button" data-add-role>${icon("plus")} Add role</button></div></div><div class="modal-foot"><button class="btn btn-secondary" type="button" data-close>Cancel</button><button class="btn btn-primary" type="submit">${icon("arrow-right")} Create and collect</button></div></form>`);
  document.querySelector("[data-add-role]").addEventListener("click",()=>{document.querySelector("#role-builder").insertAdjacentHTML("beforeend",roleInput(""));bindRoleRemove();refreshIcons()}); bindRoleRemove();
  document.querySelector("#cycle-form").addEventListener("submit",async e=>{e.preventDefault();const fd=new FormData(e.target);const roles=[...document.querySelectorAll("[name='role']")].map(i=>i.value.trim()).filter(Boolean);const start=fd.get("start"),end=fd.get("end");const dates=sundaysBetween(start,end);let c={id:`cycle_${Date.now()}`,churchId:church().id,name:fd.get("name"),start,end,status:"open",token:`join-${crypto.randomUUID().slice(0,8)}`,publicToken:`roster-${crypto.randomUUID().slice(0,8)}`,roles,dates};const result=await api.call("createCycle",c);if(result.cycle)c=result.cycle;store.state.cycles.unshift(c);store.save();closeModal();location.hash="cycles";route();toast("Cycle created and submission link ready","calendar-check")}); refreshIcons();
}

function roleInput(value) { return `<div class="role-row"><input name="role" value="${esc(value)}" placeholder="Role name" required><button class="icon-btn" type="button" data-remove-role title="Remove role">${icon("trash-2")}</button></div>`; }
function bindRoleRemove(){document.querySelectorAll("[data-remove-role]").forEach(b=>b.onclick=()=>{if(document.querySelectorAll(".role-row").length>1)b.closest(".role-row").remove()})}
function sundaysBetween(start,end){const out=[];let d=new Date(`${start}T00:00:00`),last=new Date(`${end}T00:00:00`);while(d.getDay()!==0)d.setDate(d.getDate()+1);while(d<=last){out.push(d.toISOString().slice(0,10));d.setDate(d.getDate()+7)}return out}

function showChurchModal(existing=null) {
  showModal(`<div class="modal-head"><h2>${existing?"Edit":"Add"} church workspace</h2><button class="icon-btn" data-close title="Close">${icon("x")}</button></div><form id="church-form"><div class="modal-body"><div class="field-grid"><div class="field"><label>Church name</label><input name="name" value="${esc(existing?.name||"")}" required></div><div class="field"><label>City</label><input name="city" value="${esc(existing?.city||"")}" required></div><div class="field"><label>Admin name</label><input name="adminName" value="${esc(existing?.adminName||"")}" required></div><div class="field"><label>Admin email</label><input name="adminEmail" type="email" value="${esc(existing?.adminEmail||"")}" required></div></div>${existing?`<div class="form-section"><label class="checkbox-row"><input name="active" type="checkbox" ${existing.active?"checked":""}> Workspace is active</label></div>`:`<div class="calendar-note" style="margin-top:16px">A temporary password will be generated for the church administrator.</div>`}</div><div class="modal-foot"><button class="btn btn-secondary" type="button" data-close>Cancel</button><button class="btn btn-primary" type="submit">${icon("save")} Save church</button></div></form>`);
  document.querySelector("#church-form").addEventListener("submit", async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    let localChurch = existing;
    if (existing) {
      data.id = existing.id;
      data.active = e.target.active.checked;
      Object.assign(existing, data);
    } else {
      localChurch = { id: `church_${Date.now()}`, name: data.name, city: data.city, adminName: data.adminName, adminEmail: data.adminEmail, active: true, members: 0 };
      store.state.churches.push(localChurch);
    }
    const result = await api.call(existing ? "updateChurch" : "createChurch", data);
    if (result.churchId) localChurch.id = result.churchId;
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
  app.innerHTML=`<div class="public-shell"><header class="public-nav"><div class="public-brand"><span class="brand-mark">${icon("church")}</span><span class="brand-word">SteepleFlow</span></div><span style="color:var(--muted);font-size:11px">${esc(c.name)}</span></header><main class="public-content"><div class="public-head"><span class="eyebrow">Availability request</span><h1>${esc(cycle.name)}</h1><p>Tell the planning team where you can serve. You can update this response until the collection window closes.</p></div><section class="public-card"><form id="availability-form"><div class="panel-body" style="padding:22px"><div class="field-grid"><div class="field"><label>Your name</label><input name="name" placeholder="Full name" required></div><div class="field"><label>Email address</label><input name="email" type="email" placeholder="you@example.com" required></div></div><div class="form-section"><h3>Roles you are willing to serve</h3><div class="role-options">${cycle.roles.map(r=>`<label class="role-option"><input type="checkbox" name="roles" value="${esc(r)}"><span><strong>${esc(r)}</strong><small style="display:block;color:var(--muted)">Available to be assigned</small></span></label>`).join("")}</div></div><div class="form-section"><h3>Dates you are unavailable</h3><div class="field"><label for="unavailable">Select all dates that do not work</label><input id="unavailable" name="unavailable" placeholder="Choose dates" readonly><small>Only service dates in this cycle can be selected.</small></div><div class="date-pills" style="margin-top:10px">${cycle.dates.map(d=>`<span class="date-pill">${icon("calendar")} ${fullDate(d)}</span>`).join("")}</div></div></div><div class="modal-foot"><small style="color:var(--muted)">${icon("shield-check")} Your response is only visible to the church roster admin.</small><button class="btn btn-primary" type="submit">Submit availability ${icon("arrow-right")}</button></div></form></section></main></div>`;
  if(window.flatpickr) flatpickr("#unavailable",{mode:"multiple",dateFormat:"Y-m-d",enable:cycle.dates,conjunction:", "});
  document.querySelector("#availability-form").addEventListener("submit",async e=>{e.preventDefault();const fd=new FormData(e.target);const roles=fd.getAll("roles");if(!roles.length)return toast("Choose at least one role","circle-alert");const data={id:`p_${Date.now()}`,churchId:cycle.churchId,name:fd.get("name"),email:fd.get("email"),roles,unavailable:String(fd.get("unavailable")||"").split(", ").filter(Boolean),submitted:true};store.state.participants.push(data);store.save();await api.call("submitAvailability",{token,participant:data});document.querySelector(".public-card").innerHTML=`<div class="confirmation"><span class="confirmation-icon">${icon("check")}</span><h2>Availability received</h2><p>Thanks, ${esc(data.name)}. Your response has been shared with the roster admin.</p><button class="btn btn-secondary" onclick="location.reload()">${icon("pencil")} Update response</button></div>`;refreshIcons()}); refreshIcons();
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
  } else if(!store.state.assignments.length) optimizeRoster(false);
  app.innerHTML=`<div class="public-shell"><header class="public-nav"><div class="public-brand"><span class="brand-mark">${icon("church")}</span><span class="brand-word">SteepleFlow</span></div><span style="color:var(--muted);font-size:11px">${esc(c.name)}</span></header><main class="public-content"><div class="public-head"><span class="eyebrow">Published roster</span><h1>${esc(cycle.name)}</h1><p>Service assignments for ${esc(c.name)}. Please contact your team lead if anything changes.</p></div><section class="public-card">${cycle.dates.map(date=>`<div class="published-date"><div class="published-date-head"><strong>${fullDate(date)}</strong><span>10:00 AM service</span></div><div class="published-roles">${cycle.roles.map(role=>{const a=store.state.assignments.find(x=>x.date===date&&x.role===role);const p=a&&store.state.participants.find(x=>x.id===a.participantId);return `<div class="published-role"><small>${esc(role)}</small><strong>${esc(p?.name||"To be confirmed")}</strong></div>`}).join("")}</div></div>`).join("")}</section><p style="margin-top:16px;text-align:center;color:var(--muted);font-size:11px">Last updated ${new Date().toLocaleDateString("en-MY",{day:"numeric",month:"long",year:"numeric"})}</p></main></div>`;refreshIcons();
}

function renderPublicLoading(){app.innerHTML=`<div class="public-shell"><main class="public-content"><section class="public-card confirmation"><span class="confirmation-icon">${icon("loader-circle")}</span><h2>Loading schedule</h2><p>Checking this secure link...</p></section></main></div>`;refreshIcons()}
function renderPublicError(message){app.innerHTML=`<div class="public-shell"><main class="public-content"><section class="public-card confirmation"><span class="confirmation-icon" style="background:var(--danger)">${icon("link-2-off")}</span><h1>Link unavailable</h1><p>${esc(message)}</p></section></main></div>`;refreshIcons()}
function showModal(content, wrap=true){const el=document.createElement("div");el.className="modal-backdrop";el.id="modal";el.innerHTML=wrap?`<section class="modal">${content}</section>`:`<section class="modal">${content}</section>`;document.body.appendChild(el);el.addEventListener("click",e=>{if(e.target===el||e.target.closest("[data-close]"))closeModal()});refreshIcons()}
function closeModal(){document.querySelector("#modal")?.remove()}
function bindRoutes(root=document){root.querySelectorAll("[data-route]").forEach(el=>el.addEventListener("click",()=>location.hash=el.dataset.route))}
async function copyLink(path){const url=`${location.href.split("#")[0]}#${path}`;try{await navigator.clipboard.writeText(url);toast("Link copied to clipboard","copy")}catch{prompt("Copy this link",url)}}

window.addEventListener("hashchange",route);
window.addEventListener("DOMContentLoaded",route);









