const state = { user: null, csrfToken: "", tickets: [], selectedTicket: null, news: [], maintenance: false, debugMode: false, installPrompt: null, easterEggUnlocked: false, easterEggMode: false, robloxVerificationCode: "", robloxExpiresAt: 0, verificationTimer: null };
const easterEggSequence = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
let easterEggProgress = 0;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const roleNames = { user: "MITGLIED", support: "SUPPORT", admin: "ADMIN", superadmin: "SUPERADMIN" };
const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

async function api(url, options = {}) {
  const method = options.method || "GET";
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (!["GET", "HEAD"].includes(method)) {
    if (!state.csrfToken) await refreshCsrf();
    headers["X-CSRF-Token"] = state.csrfToken;
  }
  const response = await fetch(url, { ...options, method, headers, credentials: "same-origin" });
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) {
    const error = new Error(data.error || "Die Anfrage konnte nicht abgeschlossen werden.");
    error.status = response.status;
    throw error;
  }
  return data;
}
async function refreshCsrf() {
  const response = await fetch("/api/csrf", { credentials: "same-origin" });
  const data = await response.json();
  state.csrfToken = data.csrfToken;
}
function toast(message, error = false) {
  const element = document.createElement("div");
  element.className = `toast${error ? " error" : ""}`;
  element.textContent = message;
  $("#toast-region").append(element);
  setTimeout(() => element.remove(), 4200);
}
function setFormMessage(element, message, error = false) {
  element.textContent = message;
  element.classList.remove("hidden", "error");
  if (error) element.classList.add("error");
}
function showPage(name) {
  if ((name === "tickets" || name === "profile" || name === "admin") && !state.user) {
    name = "auth";
    history.replaceState(null, "", "#auth");
  }
  if (name === "admin" && !["admin", "superadmin"].includes(state.user?.role)) {
    toast("Dieser Bereich ist nur für Administratoren zugänglich.", true);
    name = "home";
    history.replaceState(null, "", "#home");
  }
  $$(".page").forEach(page => page.classList.toggle("active", page.id === `page-${name}`));
  $$(".nav-link").forEach(link => link.classList.toggle("active", link.dataset.page === name));
  $("#main-nav").classList.remove("open");
  $("#mobile-menu").setAttribute("aria-expanded", "false");
  if (name === "profile") renderProfile();
  if (name === "tickets") loadTickets();
  if (name === "admin") loadAdmin();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function navigate() {
  const requested = location.hash.slice(1) || "home";
  showPage(["home", "info", "news", "auth", "profile", "tickets", "admin"].includes(requested) ? requested : "home");
}
function updateHeader() {
  $("#account-button").classList.toggle("hidden", !!state.user);
  $("#user-menu").classList.toggle("hidden", !state.user);
  $$(".auth-nav").forEach(element => element.classList.toggle("hidden", !state.user));
  $$(".admin-nav").forEach(element => element.classList.toggle("hidden", !["admin", "superadmin"].includes(state.user?.role)));
  if (state.user) {
    $("#user-name").textContent = state.user.username;
    $("#user-avatar-letter").textContent = state.user.username.slice(0, 1).toUpperCase();
    $("#user-avatar-image").classList.toggle("hidden", !state.user.avatar);
    if (state.user.avatar) $("#user-avatar-image").src = state.user.avatar;
  } else {
    $("#user-avatar-image").classList.add("hidden");
    $("#user-avatar-image").removeAttribute("src");
  }
}
function renderProfile() {
  if (!state.user) return;
  $("#profile-heading").textContent = state.user.username;
  $("#profile-email").textContent = state.user.email;
  $("#profile-role").textContent = roleNames[state.user.role] || "MITGLIED";
  $("#profile-admin-link").classList.toggle("hidden", !["admin", "superadmin"].includes(state.user.role));
  $("#profile-name").value = state.user.username;
  $("#profile-image").value = state.user.avatar || "";
  $("#profile-since").textContent = `Mitglied seit ${formatDate(state.user.created_at, false)}`;
  $("#profile-avatar-letter").textContent = state.user.username.slice(0, 1).toUpperCase();
  $("#profile-avatar-image").classList.toggle("hidden", !state.user.avatar);
  if (state.user.avatar) $("#profile-avatar-image").src = state.user.avatar;
  else $("#profile-avatar-image").removeAttribute("src");
  const canUseTickets = !!state.user.roblox_verified_at || ["admin", "superadmin", "support"].includes(state.user.role);
  const isRobloxVerified = !!state.user.roblox_verified_at;
  const verificationStatus = $("#verification-status");
  verificationStatus.textContent = isRobloxVerified
    ? `Verifiziert: ${state.user.roblox_username}`
    : "Noch nicht verifiziert";
  verificationStatus.classList.toggle("verified", isRobloxVerified);
  $("#roblox-verify-form").classList.toggle("hidden", isRobloxVerified);
  $("#verification-steps").classList.toggle("hidden", isRobloxVerified);
  $("#verification-challenge").classList.add("hidden");
  $("#roblox-verification-message").classList.add("hidden");
  const profileLink = $("#verified-roblox-link");
  profileLink.classList.toggle("hidden", !isRobloxVerified);
  profileLink.href = isRobloxVerified ? `https://www.roblox.com/users/${state.user.roblox_user_id}/profile` : "#";
  $("#ticket-verification-required").classList.toggle("hidden", canUseTickets);
  $("#tickets-content").classList.toggle("hidden", !canUseTickets);
  loadDepartment();
}
function filterAdminUsers() {
  const query = $("#user-search").value.trim().toLocaleLowerCase("de");
  const rows = $$("#users-table tr");
  let visibleRows = 0;
  rows.forEach(row => {
    row.hidden = !row.dataset.search.includes(query);
    if (!row.hidden) visibleRows += 1;
  });
  $("#user-search-count").textContent = query
    ? `${visibleRows} von ${rows.length} angezeigten Konten passen zur Suche.`
    : `${rows.length} Konten werden angezeigt.`;
}
async function loadDepartment() {
  if (!state.user) return;
  const form = $("#department-form");
  const assignmentElement = $("#department-assignment");
  const message = $("#department-message");
  message.classList.add("hidden");
  try {
    const { assignment } = await api("/api/profile/department");
    assignmentElement.replaceChildren();
    assignmentElement.classList.toggle("hidden", !assignment);
    if (assignment) {
      const title = document.createElement("strong");
      title.textContent = `${assignment.label} · ${assignment.service_number}`;
      const status = document.createElement("span");
      status.className = `department-status status-${assignment.status}`;
      status.textContent = { pending: "Bewerbung wird geprüft", active: "Im Dienst", rejected: "Bewerbung abgelehnt" }[assignment.status];
      assignmentElement.append(title, status);
    }
    const canApply = !assignment || assignment.status === "rejected";
    form.classList.toggle("hidden", !canApply);
    const canUseDepartment = !!state.user.roblox_verified_at || ["admin", "superadmin", "support"].includes(state.user.role);
    form.querySelector("select").disabled = !canUseDepartment;
    form.querySelector("button").disabled = !canUseDepartment;
    if (!canUseDepartment) setFormMessage(message, "Verifiziere zuerst dein Roblox-Konto, um dich für einen Dienst zu bewerben.", true);
  } catch (error) {
    setFormMessage(message, error.message, true);
  }
}
function formatDate(value, withTime = true) {
  const date = new Date(`${String(value).replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value || "";
  return withTime ? dateFormat.format(date) : new Intl.DateTimeFormat("de-DE", { dateStyle: "long" }).format(date);
}
function renderNews() {
  const grid = $("#news-grid");
  grid.replaceChildren();
  $("#news-empty").classList.toggle("hidden", state.news.length > 0);
  state.news.forEach(item => {
    const article = document.createElement("article");
    article.className = "news-card";
    if (item.image_url) {
      const image = document.createElement("img");
      image.className = "news-image";
      image.src = item.image_url;
      image.alt = "";
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      article.append(image);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "news-image-placeholder";
      placeholder.textContent = "R·RP";
      article.append(placeholder);
    }
    const copy = document.createElement("div");
    copy.className = "news-copy";
    const meta = document.createElement("span");
    meta.className = "news-meta";
    meta.textContent = `${formatDate(item.created_at, false)}${item.author ? ` · ${item.author}` : " · RLP RP Team"}`;
    const title = document.createElement("h2");
    title.textContent = item.title;
    const body = document.createElement("p");
    body.textContent = item.body;
    copy.append(meta, title, body);
    article.append(copy);
    grid.append(article);
  });
}
async function loadNews() {
  try {
    state.news = (await api("/api/news")).news;
    renderNews();
  } catch (error) { toast(error.message, true); }
}
function ticketCard(ticket, isAdmin = false) {
  const card = document.createElement("article");
  card.className = "ticket-item";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  const top = document.createElement("div");
  top.className = "ticket-item-top";
  const info = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = ticket.title;
  const details = document.createElement("p");
  details.textContent = `${ticket.category}${isAdmin ? ` · ${ticket.owner}` : ""}`;
  info.append(title, details);
  const status = document.createElement("span");
  status.className = `ticket-status${ticket.status === "closed" ? " closed" : ""}`;
  status.textContent = ticket.status === "closed" ? "Geschlossen" : "Offen";
  top.append(info, status);
  const date = document.createElement("div");
  date.className = "ticket-date";
  date.textContent = `#${ticket.id} · ${formatDate(ticket.updated_at)}`;
  card.append(top, date);
  card.addEventListener("click", () => openTicket(ticket));
  card.addEventListener("keydown", event => { if (event.key === "Enter") openTicket(ticket); });
  return card;
}
async function loadTickets() {
  if (!state.user || (!state.user.roblox_verified_at && !["admin", "superadmin", "support"].includes(state.user.role))) {
    $("#ticket-verification-required").classList.remove("hidden");
    $("#tickets-content").classList.add("hidden");
    return;
  }
  try {
    state.tickets = (await api("/api/tickets")).tickets;
    $("#ticket-count").textContent = state.tickets.length;
    const list = $("#ticket-list");
    list.replaceChildren();
    if (!state.tickets.length) {
      const empty = document.createElement("div");
      empty.className = "ticket-empty";
      empty.innerHTML = "<span>✦</span><b>Noch keine Tickets</b>Wenn du Hilfe brauchst, erstelle einfach dein erstes Ticket.";
      list.append(empty);
    } else state.tickets.forEach(ticket => list.append(ticketCard(ticket)));
  } catch (error) { toast(error.message, true); }
}
async function openTicket(ticket) {
  state.selectedTicket = ticket;
  $("#dialog-ticket-title").textContent = `#${ticket.id} · ${ticket.title}`;
  $("#reply-form").classList.toggle("hidden", ticket.status === "closed");
  $("#close-ticket-action").classList.toggle("hidden", ticket.status === "closed");
  const messagesContainer = $("#dialog-messages");
  messagesContainer.replaceChildren();
  $("#ticket-dialog").showModal();
  try {
    const { messages } = await api(`/api/tickets/${ticket.id}/messages`);
    messages.forEach(message => {
      const bubble = document.createElement("div");
      bubble.className = `message-bubble${message.username === state.user.username ? " mine" : ""}`;
      const username = document.createElement("strong");
      username.textContent = `${message.username}${["admin", "superadmin", "support"].includes(message.role) ? " · TEAM" : ""}`;
      const body = document.createElement("p");
      body.textContent = message.body;
      const date = document.createElement("small");
      date.textContent = formatDate(message.created_at);
      bubble.append(username, body, date);
      messagesContainer.append(bubble);
    });
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  } catch (error) { toast(error.message, true); }
}
async function loadAdmin() {
  try {
    const [stats, { users }, { tickets }, { news }, { settings }, { alerts }, { assignments }] = await Promise.all([
      api("/api/admin/dashboard"), api("/api/admin/users"), api("/api/tickets"), api("/api/news"), api("/api/admin/settings"),
      api("/api/admin/security-alerts"), api("/api/admin/departments")
    ]);
    state.maintenance = stats.maintenance;
    $("#debug-panel").classList.toggle("hidden", !state.debugMode);
    $("#security-email-state").textContent = ({
      ready: "SMTP-Verbindung geprüft. E-Mail-Versand bereit; die Zustellung hängt auch vom Anbieter ab.",
      checking: "SMTP wird geprüft. Bis dahin bleiben Meldungen im Dashboard sichtbar.",
      error: "SMTP-Verbindung fehlgeschlagen: E-Mail-Versand prüfen; Meldungen bleiben im Dashboard.",
      not_configured: "SMTP nicht eingerichtet: Meldungen erscheinen nur hier im Dashboard."
    })[stats.emailStatus] || "E-Mail-Status unbekannt.";
    const statEntries = [["MITGLIEDER", stats.users], ["VERIFIZIERT", stats.verifiedUsers], ["OFFENE TICKETS", stats.openTickets], ["BEWERBUNGEN", stats.pendingDepartments], ["IM DIENST", stats.activeDepartments], ["NEWS-BEITRÄGE", stats.news]];
    const statsContainer = $("#dashboard-stats");
    statsContainer.replaceChildren();
    statEntries.forEach(([label, count]) => {
      const card = document.createElement("div"); card.className = "dashboard-stat";
      const text = document.createElement("span"); text.textContent = label;
      const value = document.createElement("strong"); value.textContent = count;
      card.append(text, value); statsContainer.append(card);
    });
    $("#settings-discord").value = settings.discordUrl;
    $("#settings-place-id").value = settings.robloxPlaceId;
    $("#settings-universe-id").value = settings.robloxUniverseId;
    $("#settings-announcement").value = settings.announcement;
    const canEditSettings = state.user.role === "superadmin";
    ["#settings-discord", "#settings-place-id", "#settings-universe-id", "#settings-announcement", "#save-settings-button"]
      .forEach(selector => { $(selector).disabled = !canEditSettings; });
    $("#settings-access-note").classList.toggle("hidden", canEditSettings);
    const alertList = $("#security-alert-list");
    alertList.replaceChildren();
    const unreadAlerts = alerts.filter(alert => !alert.read_at).length;
    $("#security-alert-count").textContent = unreadAlerts;
    if (!alerts.length) {
      const empty = document.createElement("p");
      empty.className = "security-alert-empty";
      empty.textContent = "Keine Sicherheitsmeldungen. Neue Auffälligkeiten erscheinen hier.";
      alertList.append(empty);
    } else alerts.forEach(alert => {
      const item = document.createElement("article");
      item.className = `security-alert${alert.read_at ? " acknowledged" : ""}`;
      const content = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = alert.title;
      const details = document.createElement("p");
      details.textContent = alert.details;
      const date = document.createElement("time");
      date.textContent = formatDate(alert.created_at);
      content.append(title, details, date);
      item.append(content);
      if (!alert.read_at) {
        const acknowledge = document.createElement("button");
        acknowledge.className = "text-button";
        acknowledge.type = "button";
        acknowledge.textContent = "Gesehen";
        acknowledge.addEventListener("click", async () => {
          try {
            await api(`/api/admin/security-alerts/${alert.id}/read`, { method: "PATCH", body: JSON.stringify({}) });
            await loadAdmin();
          } catch (error) {
            toast(error.message, true);
          }
        });
        item.append(acknowledge);
      } else {
        const read = document.createElement("span");
        read.className = "security-alert-read";
        read.textContent = "Bestätigt";
        item.append(read);
      }
      alertList.append(item);
    });
    const table = $("#users-table");
    table.replaceChildren();
    users.forEach(user => {
      const row = document.createElement("tr");
      row.dataset.search = [user.username, user.email, user.roblox_username, roleNames[user.role] || user.role]
        .filter(Boolean).join(" ").toLocaleLowerCase("de");
      const name = document.createElement("td"); name.className = "user-cell"; name.textContent = user.username;
      const email = document.createElement("td"); email.textContent = user.email;
      const robloxCell = document.createElement("td");
      if (user.roblox_verified_at) {
        const accountLink = document.createElement("a");
        accountLink.className = "admin-roblox-link";
        accountLink.href = `https://www.roblox.com/users/${user.roblox_user_id}/profile`;
        accountLink.target = "_blank";
        accountLink.rel = "noreferrer";
        accountLink.textContent = `✓ ${user.roblox_username}`;
        robloxCell.append(accountLink);
      } else {
        robloxCell.textContent = "Nicht verifiziert";
        robloxCell.className = "admin-unverified";
      }
      const roleCell = document.createElement("td");
      if (state.user.role === "superadmin" && user.role !== "superadmin") {
        const select = document.createElement("select");
        ["user", "support", "admin"].forEach(role => {
          const option = document.createElement("option"); option.value = role; option.textContent = roleNames[role]; option.selected = user.role === role; select.append(option);
        });
        select.addEventListener("change", async () => {
          try { await api(`/api/admin/users/${user.id}/role`, { method: "PATCH", body: JSON.stringify({ role: select.value }) }); toast("Rolle aktualisiert."); }
          catch (error) { toast(error.message, true); loadAdmin(); }
        });
        roleCell.append(select);
      } else roleCell.textContent = roleNames[user.role] || user.role;
      const since = document.createElement("td"); since.textContent = formatDate(user.created_at, false);
      row.append(name, email, robloxCell, roleCell, since); table.append(row);
    });
    filterAdminUsers();
    const departmentList = $("#department-admin-list");
    departmentList.replaceChildren();
    const pendingAssignments = assignments.filter(assignment => assignment.status === "pending");
    $("#department-pending-count").textContent = pendingAssignments.length;
    if (!assignments.length) {
      const empty = document.createElement("p");
      empty.className = "department-admin-empty";
      empty.textContent = "Noch keine Dienstbewerbungen.";
      departmentList.append(empty);
    } else assignments.forEach(assignment => {
      const row = document.createElement("article");
      row.className = "department-admin-row";
      const details = document.createElement("div");
      const member = document.createElement("strong");
      member.textContent = assignment.username;
      const service = document.createElement("span");
      service.textContent = `${{ police: "Polizei", fire: "Feuerwehr", ems: "Rettungsdienst" }[assignment.department]} · ${assignment.service_number}`;
      const status = document.createElement("small");
      status.textContent = { pending: "Offen", active: "Aktiv", rejected: "Abgelehnt" }[assignment.status];
      details.append(member, service, status);
      row.append(details);
      if (assignment.status === "pending") {
        const actions = document.createElement("div");
        actions.className = "department-admin-actions";
        [["active", "Annehmen"], ["rejected", "Ablehnen"]].forEach(([statusValue, label]) => {
          const button = document.createElement("button");
          button.className = statusValue === "active" ? "button button-primary" : "button button-outline";
          button.type = "button";
          button.textContent = label;
          button.addEventListener("click", async () => {
            button.disabled = true;
            try {
              await api(`/api/admin/departments/${assignment.user_id}`, {
                method: "PATCH",
                body: JSON.stringify({ status: statusValue })
              });
              toast(statusValue === "active" ? "Dienstbewerbung angenommen." : "Dienstbewerbung abgelehnt.");
              await loadAdmin();
            } catch (error) {
              toast(error.message, true);
              button.disabled = false;
            }
          });
          actions.append(button);
        });
        row.append(actions);
      }
      departmentList.append(row);
    });
    const managedNews = $("#managed-news");
    managedNews.replaceChildren();
    news.forEach(item => {
      const row = document.createElement("div"); row.className = "managed-news-row";
      const content = document.createElement("div");
      const title = document.createElement("b"); title.textContent = item.title;
      const date = document.createElement("small"); date.textContent = formatDate(item.created_at, false);
      content.append(title, date);
      const remove = document.createElement("button"); remove.className = "text-button"; remove.type = "button"; remove.textContent = "Löschen";
      remove.addEventListener("click", async () => {
        if (!confirm(`Möchtest du „${item.title}“ wirklich löschen?`)) return;
        try {
          await api(`/api/admin/news/${item.id}`, { method: "DELETE" });
          toast("Beitrag gelöscht."); await loadNews(); loadAdmin();
        } catch (error) { toast(error.message, true); }
      });
      row.append(content, remove); managedNews.append(row);
    });
    const ticketList = $("#admin-ticket-list"); ticketList.replaceChildren();
    if (!tickets.length) {
      const empty = document.createElement("div"); empty.className = "ticket-empty"; empty.textContent = "Noch keine Tickets."; ticketList.append(empty);
    } else tickets.forEach(ticket => ticketList.append(ticketCard(ticket, true)));
    const activityList = $("#activity-list"); activityList.replaceChildren();
    if (!stats.recentLogs.length) {
      const empty = document.createElement("div"); empty.className = "ticket-empty"; empty.textContent = "Noch keine Aktivitäten."; activityList.append(empty);
    } else stats.recentLogs.forEach(log => {
      const item = document.createElement("div"); item.className = "activity-item";
      const dot = document.createElement("span"); dot.className = "activity-dot";
      const content = document.createElement("div");
      const title = document.createElement("b"); title.textContent = `${log.username || "System"} · ${log.action}`;
      const detail = document.createElement("small"); detail.textContent = `${log.details || "Aktion protokolliert"} · ${formatDate(log.created_at)}`;
      content.append(title, detail); item.append(dot, content); activityList.append(item);
    });
    $("#emergency-panel").classList.toggle("hidden", state.user.role !== "superadmin");
    $("#maintenance-state").textContent = state.maintenance
      ? "Aktiv · normale Nutzer werden ausgesperrt."
      : "Inaktiv · Website ist für alle verfügbar.";
    $("#emergency-button").innerHTML = state.maintenance ? 'Wartung beenden <span>↗</span>' : 'Wartungsmodus aktivieren <span>⏻</span>';
    return true;
  } catch (error) {
    toast(error.message, true);
    return false;
  }
}
async function loadStatus() {
  try {
    const status = await api("/api/status");
    state.debugMode = status.debugMode === true;
    const labels = { online: "Online", offline: "Offline", unavailable: "Nicht erreichbar", not_configured: "Spiel-ID fehlt" };
    $("#server-status").textContent = status.maintenance ? "Wartung" : labels[status.state] || "Unbekannt";
    $("#players-online").textContent = status.players ?? "—";
    $("#players-capacity").textContent = status.capacity ?? "—";
    $("#game-link").href = status.gameUrl;
    $("#info-game-link").href = status.gameUrl;
    $$('a[href="https://discord.gg/"]').forEach(link => { link.href = status.discordUrl || "https://discord.gg/"; });
    const announcement = $("#announcement-bar");
    const dismissedAnnouncement = sessionStorage.getItem("dismissed-announcement");
    $("#announcement-text").textContent = status.announcement || "";
    announcement.classList.toggle("hidden", !status.announcement || dismissedAnnouncement === status.announcement);
    $(".stat-indicator").classList.toggle("maintenance", status.maintenance);
    $(".stat-indicator").classList.toggle("offline", status.online === false);
    if (status.maintenance && !["admin", "superadmin"].includes(state.user?.role)) {
      document.body.innerHTML = `<main class="maintenance-screen"><img class="maintenance-logo" src="/icon.svg" alt="RLP RP"><span class="eyebrow">KURZ OFFLINE</span><h1>Wir sind gleich<br><span>zurück.</span></h1><p>RLP RP wird gerade gewartet. Wir arbeiten daran, bald wieder für dich da zu sein.</p><a class="button button-primary" href="https://discord.gg/" target="_blank" rel="noreferrer">Auf Discord bleiben ↗</a></main>`;
      document.querySelector(".maintenance-screen a").href = status.discordUrl || "https://discord.gg/";
    }
    return true;
  } catch (error) {
    console.error("Serverstatus konnte nicht geladen werden.", error);
    $("#server-status").textContent = "Status unbekannt";
    return false;
  }
}
function showAuthForm(name) {
  ["login", "register", "forgot", "reset"].forEach(id => $(`#${id}-form`).classList.toggle("hidden", id !== name));
  $$(".auth-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.auth === name));
  $("#auth-message").classList.add("hidden");
}
function setUser(user) {
  state.user = user;
  updateHeader();
}
function unlockEasterEgg() {
  if (!state.easterEggUnlocked) {
    state.easterEggUnlocked = true;
    $("#easter-egg-toggle").classList.remove("hidden");
    toast("Geheimnis entdeckt: Hamburg-Nachtmodus freigeschaltet!");
  }
  setEasterEggMode(true);
}
function setEasterEggMode(enabled) {
  state.easterEggMode = enabled;
  document.body.classList.toggle("easter-egg-mode", enabled);
  const toggle = $("#easter-egg-toggle");
  toggle.setAttribute("aria-pressed", String(enabled));
  toggle.textContent = enabled ? "✦ Nachtmodus: an" : "✦ Nachtmodus: aus";
}
function appendDebugLine(text, kind = "info") {
  const line = document.createElement("div");
  line.className = `debug-line${kind === "error" ? " debug-error" : ""}`;
  line.textContent = text;
  $("#debug-output").append(line);
  $("#debug-output").scrollTop = $("#debug-output").scrollHeight;
}
async function runDebugCommand(rawCommand) {
  const command = rawCommand.trim().toLowerCase();
  if (!command) return;
  appendDebugLine(`rlp › ${rawCommand}`);
  try {
    let result;
    if (command === "help") {
      result = "Befehle: help, status, user, page, health, easteregg, clear";
    } else if (command === "clear") {
      $("#debug-output").replaceChildren();
      return;
    } else if (command === "status") {
      const status = await api("/api/status");
      result = JSON.stringify({ state: status.state, maintenance: status.maintenance, players: status.players, debugMode: status.debugMode }, null, 2);
    } else if (command === "user") {
      result = JSON.stringify(state.user ? {
        username: state.user.username,
        role: state.user.role,
        robloxVerified: !!state.user.roblox_verified_at
      } : null, null, 2);
    } else if (command === "page") {
      result = JSON.stringify({ hash: location.hash || "#home", activePage: $(".page.active")?.id || null }, null, 2);
    } else if (command === "health") {
      const [status, news] = await Promise.all([api("/api/status"), api("/api/news")]);
      result = JSON.stringify({ api: "online", status: status.state, newsItems: news.news.length, emailConfigured: status.emailConfigured }, null, 2);
    } else if (command === "easteregg") {
      unlockEasterEgg();
      result = "Hamburg-Nachtmodus freigeschaltet.";
    } else {
      result = "Unbekannter Befehl. `help` zeigt die erlaubten Diagnosebefehle.";
    }
    appendDebugLine(result);
  } catch (error) {
    appendDebugLine(`Fehler: ${error.message}`, "error");
  }
}

$("#mobile-menu").addEventListener("click", () => {
  const open = $("#main-nav").classList.toggle("open");
  $("#mobile-menu").setAttribute("aria-expanded", String(open));
});
$$("[data-page]").forEach(link => link.addEventListener("click", event => {
  const page = link.dataset.page;
  if (!page) return;
  event.preventDefault();
  history.pushState(null, "", `#${page}`);
  showPage(page);
}));
window.addEventListener("hashchange", navigate);
window.addEventListener("popstate", navigate);
window.addEventListener("keydown", event => {
  if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  easterEggProgress = key === easterEggSequence[easterEggProgress]
    ? easterEggProgress + 1
    : key === easterEggSequence[0] ? 1 : 0;
  if (easterEggProgress === easterEggSequence.length) {
    easterEggProgress = 0;
    unlockEasterEgg();
  }
});
$("#easter-egg-toggle").addEventListener("click", () => setEasterEggMode(!state.easterEggMode));
$("#account-button").addEventListener("click", () => { history.pushState(null, "", "#auth"); showPage("auth"); showAuthForm("login"); });
$("#profile-button").addEventListener("click", () => $("#user-dropdown").classList.toggle("hidden"));
document.addEventListener("click", event => {
  if (!event.target.closest("#user-menu")) $("#user-dropdown").classList.add("hidden");
});
$("#logout-button").addEventListener("click", async () => {
  try { await api("/api/auth/logout", { method: "POST" }); await refreshCsrf(); setUser(null); history.pushState(null, "", "#home"); showPage("home"); toast("Du wurdest abgemeldet."); }
  catch (error) { toast(error.message, true); }
});
$$(".auth-tab").forEach(tab => tab.addEventListener("click", () => showAuthForm(tab.dataset.auth)));
$("#forgot-button").addEventListener("click", () => showAuthForm("forgot"));
$$(".back-login").forEach(button => button.addEventListener("click", () => showAuthForm("login")));
$("#login-form").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: $("#login-email").value, password: $("#login-password").value }) });
    await refreshCsrf(); setUser(data.user); toast("Willkommen zurück!"); history.pushState(null, "", "#home"); showPage("home");
  } catch (error) { setFormMessage($("#auth-message"), error.message, true); }
});
$("#register-form").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const data = await api("/api/auth/register", { method: "POST", body: JSON.stringify({ username: $("#register-name").value, email: $("#register-email").value, password: $("#register-password").value }) });
    await refreshCsrf(); setUser(data.user); toast("Konto erstellt – verifiziere jetzt dein Roblox-Konto."); history.pushState(null, "", "#profile"); showPage("profile");
  } catch (error) { setFormMessage($("#auth-message"), error.message, true); }
});
$("#forgot-form").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const data = await api("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: $("#forgot-email").value }) });
    setFormMessage($("#auth-message"), data.message);
    if (location.hostname === "localhost" && data.message) toast("Entwicklungsmodus: Reset-Token steht im Server-Terminal.");
  } catch (error) { setFormMessage($("#auth-message"), error.message, true); }
});
$("#reset-form").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const data = await api("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token: new URLSearchParams(location.search).get("token"), password: $("#reset-password").value }) });
    setFormMessage($("#auth-message"), data.message);
    setTimeout(() => showAuthForm("login"), 1800);
  } catch (error) { setFormMessage($("#auth-message"), error.message, true); }
});
$("#profile-form").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const { user } = await api("/api/profile", { method: "PATCH", body: JSON.stringify({ username: $("#profile-name").value, avatar: $("#profile-image").value }) });
    setUser(user); renderProfile(); setFormMessage($("#profile-message"), "Dein Profil wurde gespeichert.");
  } catch (error) { setFormMessage($("#profile-message"), error.message, true); }
});
$("#department-form").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const { assignment } = await api("/api/profile/department", {
      method: "PUT",
      body: JSON.stringify({ department: $("#department-select").value })
    });
    setFormMessage($("#department-message"), `Bewerbung gesendet. Deine RP-Dienstnummer: ${assignment.service_number}`);
    $("#department-form").reset();
    await loadDepartment();
  } catch (error) {
    setFormMessage($("#department-message"), error.message, true);
  }
});
$("#password-change-form").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const result = await api("/api/profile/password", {
      method: "PATCH",
      body: JSON.stringify({
        currentPassword: $("#current-password").value,
        newPassword: $("#new-password").value
      })
    });
    $("#password-change-form").reset();
    await refreshCsrf();
    setUser(null);
    history.pushState(null, "", "#auth");
    showPage("auth");
    showAuthForm("login");
    toast(result.message);
  } catch (error) {
    setFormMessage($("#password-change-message"), error.message, true);
  }
});
$("#roblox-verify-form").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const challenge = await api("/api/roblox/verification/start", {
      method: "POST",
      body: JSON.stringify({ username: $("#roblox-username").value.trim() })
    });
    state.robloxVerificationCode = challenge.code;
    state.robloxExpiresAt = challenge.expiresAt;
    $("#roblox-verification-code").textContent = challenge.code;
    $("#roblox-verification-profile").href = challenge.profileUrl;
    $("#verification-challenge").classList.remove("hidden");
    $("#roblox-verification-message").classList.add("hidden");
    if (state.verificationTimer) clearInterval(state.verificationTimer);
    const updateExpiry = () => {
      const remaining = Math.max(0, state.robloxExpiresAt - Date.now());
      $("#verification-expiry").textContent = remaining
        ? `Noch ${Math.ceil(remaining / 60000)} Min. gültig. Nach erfolgreicher Prüfung kannst du den Code aus deiner Beschreibung entfernen.`
        : "Der Code ist abgelaufen. Erstelle einen neuen Prüfcode.";
    };
    updateExpiry();
    state.verificationTimer = setInterval(updateExpiry, 1000);
  } catch (error) {
    setFormMessage($("#roblox-verification-message"), error.message, true);
  }
});
$("#copy-verification-code").addEventListener("click", async () => {
  if (!state.robloxVerificationCode) return;
  try {
    await navigator.clipboard.writeText(state.robloxVerificationCode);
    toast("Prüfcode kopiert.");
  } catch (error) {
    setFormMessage($("#roblox-verification-message"), "Kopieren nicht möglich. Markiere den Code und kopiere ihn manuell.", true);
  }
});
$("#confirm-roblox-verification").addEventListener("click", async () => {
  if (!state.robloxVerificationCode) {
    setFormMessage($("#roblox-verification-message"), "Erstelle zuerst einen Prüfcode.", true);
    return;
  }
  try {
    const { user } = await api("/api/roblox/verification/confirm", {
      method: "POST",
      body: JSON.stringify({ code: state.robloxVerificationCode })
    });
    if (state.verificationTimer) clearInterval(state.verificationTimer);
    state.robloxVerificationCode = "";
    setUser(user);
    renderProfile();
    toast("Dein Roblox-Konto wurde erfolgreich verifiziert.");
  } catch (error) {
    setFormMessage($("#roblox-verification-message"), error.message, true);
  }
});
$("#settings-form").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const { settings } = await api("/api/admin/settings", {
      method: "PUT",
      body: JSON.stringify({
        discordUrl: $("#settings-discord").value.trim(),
        robloxPlaceId: $("#settings-place-id").value.trim(),
        robloxUniverseId: $("#settings-universe-id").value.trim(),
        announcement: $("#settings-announcement").value.trim()
      })
    });
    setFormMessage($("#settings-message"), "Einstellungen gespeichert und veröffentlicht.");
    $("#settings-discord").value = settings.discordUrl;
    await loadStatus();
  } catch (error) {
    setFormMessage($("#settings-message"), error.message, true);
  }
});
$("#admin-refresh-button").addEventListener("click", async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const results = await Promise.all([loadAdmin(), loadStatus()]);
    if (results.every(Boolean)) toast("Dashboard wurde aktualisiert.");
  } finally {
    button.disabled = false;
  }
});
$("#user-search").addEventListener("input", filterAdminUsers);
$("#export-users-button").addEventListener("click", async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const response = await fetch("/api/admin/users/export.csv", { credentials: "same-origin" });
    if (!response.ok) {
      let message = "Der CSV-Export ist fehlgeschlagen.";
      try { message = (await response.json()).error || message; } catch {}
      throw new Error(message);
    }
    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = "rlp-rp-benutzer.csv";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    toast("Benutzerliste als CSV exportiert.");
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
  }
});
$("#dismiss-announcement").addEventListener("click", () => {
  sessionStorage.setItem("dismissed-announcement", $("#announcement-text").textContent);
  $("#announcement-bar").classList.add("hidden");
});
$("#debug-form").addEventListener("submit", async event => {
  event.preventDefault();
  const input = $("#debug-input");
  const command = input.value;
  input.value = "";
  await runDebugCommand(command);
});
$("#app-install-button").addEventListener("click", () => $("#install-dialog").showModal());
$("#install-app-home").addEventListener("click", () => $("#install-dialog").showModal());
$("#close-install-dialog").addEventListener("click", () => $("#install-dialog").close());
$("#install-dialog").addEventListener("click", event => {
  if (event.target === $("#install-dialog")) $("#install-dialog").close();
});
$$("[data-install-platform]").forEach(button => button.addEventListener("click", async () => {
  const platform = button.dataset.installPlatform;
  const help = $("#install-help");
  if (state.installPrompt) {
    await state.installPrompt.prompt();
    const choice = await state.installPrompt.userChoice;
    state.installPrompt = null;
    help.textContent = choice.outcome === "accepted"
      ? "Installation gestartet. Du findest RLP RP jetzt bei deinen Apps."
      : "Installation abgebrochen. Du kannst sie jederzeit erneut starten.";
  } else if (platform === "android") {
    help.textContent = "Android: Öffne diese Seite in Chrome, tippe oben auf ⋮ und wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“. Die Installation funktioniert über HTTPS oder lokal auf diesem Gerät.";
  } else {
    help.textContent = "Windows 10/11: Öffne die Seite in Edge oder Chrome. In Edge: ⋯ → Apps → Diese Website als App installieren. In Chrome: ⋮ → Streamen, speichern und teilen → Seite als App installieren. Es wird keine separate EXE benötigt.";
  }
  help.classList.remove("hidden");
}));
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  state.installPrompt = event;
});
window.addEventListener("appinstalled", () => {
  state.installPrompt = null;
  if ($("#install-dialog").open) $("#install-dialog").close();
  toast("RLP RP wurde als App installiert.");
});
$("#ticket-form").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    await api("/api/tickets", { method: "POST", body: JSON.stringify({ category: $("#ticket-category").value, title: $("#ticket-title").value, body: $("#ticket-body").value }) });
    $("#ticket-form").reset(); toast("Dein Ticket wurde erstellt."); loadTickets();
  } catch (error) { setFormMessage($("#ticket-message"), error.message, true); }
});
$("#reply-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!state.selectedTicket) return;
  try {
    await api(`/api/tickets/${state.selectedTicket.id}/messages`, { method: "POST", body: JSON.stringify({ body: $("#reply-body").value }) });
    $("#reply-body").value = "";
    state.selectedTicket.updated_at = new Date().toISOString();
    await openTicket(state.selectedTicket);
    loadTickets();
  } catch (error) { toast(error.message, true); }
});
$("#close-ticket-action").addEventListener("click", async () => {
  if (!state.selectedTicket || !confirm("Möchtest du dieses Ticket wirklich schließen?")) return;
  try {
    await api(`/api/tickets/${state.selectedTicket.id}`, { method: "PATCH", body: JSON.stringify({ status: "closed" }) });
    $("#ticket-dialog").close(); toast("Das Ticket wurde geschlossen."); loadTickets(); if (state.user && ["admin", "superadmin", "support"].includes(state.user.role)) loadAdmin();
  } catch (error) { toast(error.message, true); }
});
$("#close-ticket-dialog").addEventListener("click", () => $("#ticket-dialog").close());
$("#ticket-dialog").addEventListener("click", event => { if (event.target === $("#ticket-dialog")) $("#ticket-dialog").close(); });
$("#news-form").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    await api("/api/admin/news", { method: "POST", body: JSON.stringify({ title: $("#news-title").value, imageUrl: $("#news-image").value, body: $("#news-body").value }) });
    $("#news-form").reset(); setFormMessage($("#admin-news-message"), "Der Beitrag wurde veröffentlicht."); await loadNews(); loadAdmin();
  } catch (error) { setFormMessage($("#admin-news-message"), error.message, true); }
});
$("#emergency-button").addEventListener("click", async () => {
  const enabling = !state.maintenance;
  const confirmation = enabling
    ? "Möchtest du den Wartungsmodus aktivieren? Normale Nutzer werden ausgesperrt; das Portal wird nicht ausgeschaltet."
    : "Möchtest du den Wartungsmodus wirklich beenden?";
  if (!confirm(confirmation)) return;
  const button = $("#emergency-button");
  button.disabled = true;
  try {
    await api("/api/admin/maintenance", { method: "POST", body: JSON.stringify({ enabled: enabling }) });
    state.maintenance = enabling; toast(enabling ? "Wartungsmodus aktiviert." : "Wartungsmodus beendet.");
    await Promise.all([loadAdmin(), loadStatus()]);
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
  }
});

async function initialize() {
  $("#year").textContent = new Date().getFullYear();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(error => {
      console.error("Offline-Unterstützung konnte nicht aktiviert werden.", error);
    });
  }
  await refreshCsrf();
  try { setUser((await api("/api/auth/me")).user); } catch (error) { toast(error.message, true); }
  await Promise.all([loadNews(), loadStatus()]);
  if (new URLSearchParams(location.search).has("token")) {
    history.replaceState(null, "", "#auth");
    showPage("auth");
    showAuthForm("reset");
  } else navigate();
}
initialize();
