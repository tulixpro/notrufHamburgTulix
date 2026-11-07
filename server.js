const nodeMajorVersion = Number(process.versions.node.split(".")[0]);
if (nodeMajorVersion !== 22) {
  throw new Error(`Dieses Portal benötigt Node.js 22.x (installiert: ${process.versions.node}). Bitte Node.js 22 verwenden.`);
}

const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const Database = require("better-sqlite3");
const { rateLimit } = require("express-rate-limit");
const { doubleCsrf } = require("csrf-csrf");

const app = express();
const port = Number(process.env.PORT) || 3000;
const production = process.env.NODE_ENV === "production";
const jwtSecret = process.env.JWT_SECRET;
if (production && (!jwtSecret || jwtSecret.length < 32)) {
  throw new Error("JWT_SECRET muss in Produktion gesetzt sein und mindestens 32 Zeichen enthalten.");
}
const robloxUniverseId = process.env.ROBLOX_UNIVERSE_ID || "";
if (robloxUniverseId && !/^\d+$/.test(robloxUniverseId)) {
  throw new Error("ROBLOX_UNIVERSE_ID darf nur Ziffern enthalten.");
}
const robloxPlaceId = process.env.ROBLOX_PLACE_ID || "";
if (robloxPlaceId && !/^\d+$/.test(robloxPlaceId)) {
  throw new Error("ROBLOX_PLACE_ID darf nur Ziffern enthalten.");
}
function requireRobloxVerified(req, res, next) {
  if (["admin", "superadmin", "support"].includes(req.user.role) || req.user.roblox_verified_at) return next();
  return res.status(403).json({
    error: "Bitte verifiziere zuerst dein Roblox-Konto, bevor du diese Funktion nutzt.",
    robloxVerificationRequired: true
  });
}
const signingSecret = jwtSecret || crypto.randomBytes(48).toString("hex");
if (process.env.SMTP_URL && production && !process.env.MAIL_FROM) {
  throw new Error("MAIL_FROM muss in Produktion gesetzt sein, wenn SMTP_URL verwendet wird.");
}
const mailTransport = process.env.SMTP_URL
  ? nodemailer.createTransport(process.env.SMTP_URL, { connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000 })
  : null;
let mailStatus = mailTransport ? "checking" : "not_configured";
if (mailTransport) {
  mailTransport.verify()
    .then(() => {
      mailStatus = "ready";
      console.log("SMTP-Verbindung erfolgreich geprüft.");
    })
    .catch(error => {
      mailStatus = "error";
      console.error("SMTP-Verbindung konnte nicht geprüft werden.", error);
    });
}
const dataDirectory = path.join(__dirname, "data");
require("node:fs").mkdirSync(dataDirectory, { recursive: true });
const db = new Database(path.join(dataDirectory, "rlp-rp.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','support','admin','superadmin')),
    avatar TEXT NOT NULL DEFAULT '',
    roblox_user_id INTEGER,
    roblox_username TEXT,
    roblox_verified_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS ticket_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    image_url TEXT NOT NULL DEFAULT '',
    author_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS security_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    details TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at TEXT
  );
  CREATE TABLE IF NOT EXISTS security_login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fingerprint TEXT NOT NULL,
    success INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_security_login_attempts_fingerprint_created
    ON security_login_attempts(fingerprint, created_at);
  CREATE TABLE IF NOT EXISTS security_login_cooldowns (
    fingerprint TEXT PRIMARY KEY,
    alerted_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS admin_login_origins (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, address_hash)
  );
  CREATE TABLE IF NOT EXISTS department_counters (
    department TEXT PRIMARY KEY,
    last_number INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS service_assignments (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    department TEXT NOT NULL CHECK(department IN ('police','fire','ems')),
    service_number TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','rejected')),
    requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS password_resets (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS roblox_verification_challenges (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    roblox_user_id INTEGER NOT NULL,
    roblox_username TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  INSERT OR IGNORE INTO settings(key, value) VALUES ('maintenance', 'false');
`);
const existingUserColumns = new Set(db.pragma("table_info(users)").map(column => column.name));
for (const [name, type] of [["roblox_user_id", "INTEGER"], ["roblox_username", "TEXT"], ["roblox_verified_at", "TEXT"], ["session_version", "INTEGER NOT NULL DEFAULT 0"]]) {
  if (!existingUserColumns.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
}
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_roblox_user_id ON users(roblox_user_id) WHERE roblox_user_id IS NOT NULL");

const categories = ["Allgemeine Fragen", "Support", "Beschwerden", "Bewerbungen", "Entbannungsanträge"];
const validRoles = ["user", "support", "admin", "superadmin"];
const departments = {
  police: { label: "Polizei", prefix: "POL" },
  fire: { label: "Feuerwehr", prefix: "FW" },
  ems: { label: "Rettungsdienst", prefix: "RD" }
};
const accountProjection = "id,username,email,role,avatar,roblox_user_id,roblox_username,roblox_verified_at,created_at";

function getSetting(key, fallback = "") {
  return db.prepare("SELECT value FROM settings WHERE key=?").get(key)?.value ?? fallback;
}

function logAction(actorId, action, details = "") {
  db.prepare("INSERT INTO logs(actor_id, action, details) VALUES (?, ?, ?)")
    .run(actorId || null, action, String(details).slice(0, 500));
}

function hashSecurityValue(value) {
  return crypto.createHmac("sha256", signingSecret).update(String(value)).digest("hex");
}

function notifyAdmins(title, details) {
  db.prepare("INSERT INTO security_alerts(title,details) VALUES(?,?)").run(title, details);
  if (!mailTransport) return;
  const recipients = db.prepare("SELECT email FROM users WHERE role IN ('admin','superadmin')").all().map(row => row.email);
  if (!recipients.length) return;
  mailTransport.sendMail({
    from: process.env.MAIL_FROM || "RLP RP <noreply@rlp-rp.local>",
    to: recipients,
    subject: `RLP RP Sicherheitshinweis: ${title}`,
    text: `${title}\n\n${details}\n\nBitte prüfe die Sicherheitsmeldungen im Admin-Dashboard.`
  }).catch(error => console.error("Sicherheitsbenachrichtigung konnte nicht per E-Mail versendet werden.", error));
}

function signalSecurityOnce(key, title, details, cooldownMs = 15 * 60 * 1000) {
  const fingerprint = hashSecurityValue(`security:${key}`);
  const now = Date.now();
  const changed = db.prepare(`INSERT INTO security_login_cooldowns(fingerprint,alerted_at) VALUES(?,?)
    ON CONFLICT(fingerprint) DO UPDATE SET alerted_at=excluded.alerted_at
    WHERE security_login_cooldowns.alerted_at < ?`).run(fingerprint, now, now - cooldownMs);
  if (!changed.changes) return false;
  notifyAdmins(title, details);
  logAction(null, "security.suspicious_activity", title);
  return true;
}

function recordFailedLogin(email, address) {
  const fingerprint = hashSecurityValue(`${email.toLowerCase()}|${address}`);
  const attempts = db.prepare("INSERT INTO security_login_attempts(fingerprint,success) VALUES(?,0)");
  attempts.run(fingerprint);
  db.prepare("DELETE FROM security_login_attempts WHERE created_at < datetime('now','-7 days')").run();
  const count = db.prepare(`SELECT COUNT(*) AS count FROM security_login_attempts
    WHERE fingerprint=? AND success=0 AND created_at >= datetime('now','-10 minutes')`).get(fingerprint).count;
  if (count < 5) return;
  const now = Date.now();
  const changed = db.prepare(`INSERT INTO security_login_cooldowns(fingerprint,alerted_at) VALUES(?,?)
    ON CONFLICT(fingerprint) DO UPDATE SET alerted_at=excluded.alerted_at
    WHERE security_login_cooldowns.alerted_at < ?`).run(fingerprint, now, now - 15 * 60 * 1000);
  if (changed.changes) {
    notifyAdmins("Viele fehlgeschlagene Anmeldungen", "Mindestens fünf Anmeldeversuche für dasselbe Konto und denselben Netzwerk-Ursprung innerhalb von zehn Minuten. E-Mail-Adresse und IP werden nicht in der Meldung gespeichert.");
    logAction(null, "security.login_failures", "Schwellenwert für fehlgeschlagene Anmeldungen erreicht");
  }
}

function trackAdminLogin(userId, address) {
  const addressHash = hashSecurityValue(address);
  const existing = db.prepare("SELECT 1 FROM admin_login_origins WHERE user_id=? LIMIT 1").get(userId);
  const inserted = db.prepare("INSERT OR IGNORE INTO admin_login_origins(user_id,address_hash) VALUES(?,?)")
    .run(userId, addressHash);
  if (existing && inserted.changes) {
    notifyAdmins("Admin-Anmeldung von neuem Netzwerk", "Ein Admin-Konto hat sich von einem bisher unbekannten Netzwerk-Ursprung angemeldet. Die IP-Adresse wird nicht gespeichert; prüfe, ob die Anmeldung erwartet war.");
    logAction(userId, "security.admin_new_origin");
  }
}

function seedData() {
  if (!db.prepare("SELECT id FROM news LIMIT 1").get()) {
    const insertNews = db.prepare("INSERT INTO news(title, body, author_id) VALUES (?, ?, ?)");
    insertNews.run("Willkommen bei RLP RP", "Dein neues Roblox-Rollenspiel wartet auf dich. Lerne die Community kennen und schreib deine eigene Geschichte.", null);
    insertNews.run("Unser nächstes Community-Event", "Schau regelmäßig vorbei – bald gibt es neue gemeinsame Events und spannende Geschichten in RLP RP.", null);
  }
  if (!db.prepare("SELECT id FROM users WHERE role IN ('admin','superadmin') LIMIT 1").get()) {
    const email = process.env.ADMIN_EMAIL || (production ? "" : "admin@rlp-rp.local");
    const password = process.env.ADMIN_PASSWORD || (production ? "" : "RLP-RP-Demo-2026!");
    if (email && password.length >= 12) {
      const username = process.env.ADMIN_USERNAME || "RLPAdmin";
      const hash = bcrypt.hashSync(password, 12);
      const result = db.prepare("INSERT OR IGNORE INTO users(username,email,password_hash,role) VALUES(?,?,?,'superadmin')")
        .run(username, email.toLowerCase(), hash);
      if (result.changes) console.log(`Administrator angelegt: ${email}${production ? "" : " (Demo-Passwort siehe README)"}`);
      else if (!db.prepare("SELECT id FROM users WHERE role IN ('admin','superadmin') LIMIT 1").get()) {
        throw new Error("Admin konnte nicht angelegt werden. ADMIN_EMAIL oder ADMIN_USERNAME wird bereits verwendet.");
      }
    } else if (production) {
      console.warn("Kein Admin angelegt. Setze ADMIN_EMAIL und ADMIN_PASSWORD (mindestens 12 Zeichen).");
    }
  }
}
seedData();

app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: production ? [] : null
    }
  }
}));
app.use(express.json({ limit: "64kb" }));
app.use(cookieParser());

const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
  getSecret: () => signingSecret,
  getSessionIdentifier: (req) => req.cookies.rlp_session || "anonymous",
  cookieName: production ? "__Host-rlp-csrf" : "rlp-csrf",
  cookieOptions: { sameSite: "strict", secure: production, httpOnly: true, path: "/" },
  getCsrfTokenFromRequest: (req) => req.headers["x-csrf-token"]
});

function authenticate(req, res, next) {
  const token = req.cookies.rlp_session;
  if (!token) return next();
  try {
    const claims = jwt.verify(token, signingSecret);
    const user = db.prepare(`SELECT ${accountProjection},session_version FROM users WHERE id = ?`).get(claims.sub);
    if (user && Number(claims.ver || 0) === user.session_version) {
      delete user.session_version;
      req.user = user;
    }
    else res.clearCookie("rlp_session", { httpOnly: true, sameSite: "strict", secure: production, path: "/" });
  } catch {
    res.clearCookie("rlp_session", { httpOnly: true, sameSite: "strict", secure: production, path: "/" });
  }
  next();
}
app.use(authenticate);

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Bitte melde dich zuerst an." });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.user || !["admin", "superadmin"].includes(req.user.role)) {
    signalSecurityOnce(
      `admin-route:${req.ip || req.socket.remoteAddress || "unknown"}`,
      "Nicht autorisierter Admin-Zugriff",
      "Ein nicht berechtigtes Konto hat versucht, einen geschützten Admin-Bereich aufzurufen. Netzwerkdaten werden nicht in der Meldung gespeichert."
    );
    return res.status(403).json({ error: "Dafür fehlen dir die Berechtigungen." });
  }
  next();
}
function requireSuperadmin(req, res, next) {
  if (!req.user || req.user.role !== "superadmin") {
    signalSecurityOnce(
      `superadmin-route:${req.ip || req.socket.remoteAddress || "unknown"}`,
      "Geschützte Superadmin-Aktion blockiert",
      "Ein Konto ohne Superadmin-Berechtigung hat eine geschützte Systemeinstellung aufzurufen versucht. Netzwerkdaten werden nicht in der Meldung gespeichert."
    );
    return res.status(403).json({ error: "Diese Aktion ist höchsten Administratoren vorbehalten." });
  }
  next();
}
function validateText(value, maxLength, minLength = 1) {
  return typeof value === "string" && value.trim().length >= minLength && value.trim().length <= maxLength;
}
function maintenanceEnabled() {
  return db.prepare("SELECT value FROM settings WHERE key='maintenance'").get()?.value === "true";
}

app.use("/api", (req, res, next) => {
  const allowedDuringMaintenance = ["/auth/login", "/auth/me", "/auth/logout", "/status", "/csrf"];
  if (maintenanceEnabled() && !allowedDuringMaintenance.includes(req.path) &&
      !(req.user && ["admin", "superadmin"].includes(req.user.role))) {
    return res.status(503).json({ error: "Wartungsarbeiten – wir sind bald wieder für dich da.", maintenance: true });
  }
  next();
});
app.use("/api", (req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return doubleCsrfProtection(req, res, next);
  next();
});

function handleRateLimit(req, res, next, options) {
  signalSecurityOnce(
    `rate-limit:${req.ip || req.socket.remoteAddress || "unknown"}`,
    "Ungewöhnlich viele Anfragen blockiert",
    "Das Schutzlimit hat eine ungewöhnlich hohe Zahl von Anfragen gebremst. Netzwerkdaten werden nicht in der Meldung gespeichert."
  );
  res.status(options.statusCode).json({ error: "Zu viele Anfragen. Bitte warte kurz und versuche es erneut." });
}
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false, handler: handleRateLimit });
const writeLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false, handler: handleRateLimit });
app.use("/api/auth", authLimiter);
app.use("/api", (req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  writeLimiter(req, res, next);
});
app.use("/api/admin", (req, res, next) => {
  if (!req.user || !["admin", "superadmin"].includes(req.user.role)) {
    signalSecurityOnce(
      `admin-api:${req.ip || req.socket.remoteAddress || "unknown"}`,
      "Nicht autorisierter Admin-API-Zugriff",
      "Ein nicht berechtigtes Konto hat einen geschützten Admin-Endpunkt aufgerufen. Netzwerkdaten werden nicht in der Meldung gespeichert."
    );
    return res.status(403).json({ error: "Dafür fehlen dir die Berechtigungen." });
  }
  next();
});

app.get("/api/csrf", (req, res) => res.json({ csrfToken: generateCsrfToken(req, res) }));
app.get("/api/status", async (req, res, next) => {
 try {
  const placeId = getSetting("roblox_place_id", robloxPlaceId);
  const universeId = getSetting("roblox_universe_id", robloxUniverseId);
  const status = {
    online: null,
    state: universeId ? "unavailable" : "not_configured",
    maintenance: maintenanceEnabled(),
    players: null,
    capacity: null,
    serverName: "RLP RP | Roblox",
    gameUrl: placeId ? `https://www.roblox.com/games/${placeId}` : "https://www.roblox.com/games/",
    discordUrl: getSetting("discord_url", "https://discord.gg/"),
    announcement: getSetting("announcement"),
    emailConfigured: mailStatus === "ready",
    debugMode: !production
  };
  if (universeId) {
    try {
      const response = await fetch(`https://games.roblox.com/v1/games?universeIds=${universeId}`, {
        signal: AbortSignal.timeout(3000)
      });
      if (!response.ok) throw new Error(`Roblox-Status antwortete mit HTTP ${response.status}.`);
      const result = await response.json();
      const server = result.data?.[0];
      if (server) {
        status.online = true;
        status.state = "online";
        status.players = Number(server.playing) || 0;
        status.capacity = Number(server.maxPlayers) || null;
      } else {
        status.online = false;
        status.state = "offline";
        status.players = 0;
      }
    } catch (error) {
      console.error("Roblox-Spielstatus konnte nicht abgerufen werden.", error);
      status.online = false;
      status.state = "unavailable";
    }
  }
  res.json(status);
 } catch (error) {
   next(error);
 }
});
app.get("/api/auth/me", (req, res) => res.json({ user: req.user || null }));

app.post("/api/auth/register", (req, res) => {
  const { username, email, password } = req.body || {};
  if (!validateText(username, 24, 3) || !/^[\p{L}\p{N}_-]+$/u.test(username.trim())) {
    return res.status(400).json({ error: "Der Benutzername muss 3–24 Zeichen lang sein und darf Buchstaben, Zahlen, _ oder - enthalten." });
  }
  if (!validateText(email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Bitte gib eine gültige E-Mail-Adresse ein." });
  if (!validateText(password, 128, 12)) return res.status(400).json({ error: "Dein Passwort muss mindestens 12 Zeichen lang sein." });
  try {
    const result = db.prepare("INSERT INTO users(username,email,password_hash) VALUES(?,?,?)")
      .run(username.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 12));
    logAction(result.lastInsertRowid, "user.register", username.trim());
    const user = db.prepare(`SELECT ${accountProjection} FROM users WHERE id=?`).get(result.lastInsertRowid);
    const token = jwt.sign({ ver: 0 }, signingSecret, { subject: String(user.id), expiresIn: "12h", issuer: "rlp-rp" });
    res.cookie("rlp_session", token, { httpOnly: true, secure: production, sameSite: "strict", maxAge: 12 * 60 * 60 * 1000, path: "/" });
    res.status(201).json({ user });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "Benutzername oder E-Mail-Adresse wird bereits verwendet." });
    throw error;
  }
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!validateText(email, 254) || typeof password !== "string" || password.length > 128) return res.status(400).json({ error: "Bitte prüfe deine Anmeldedaten." });
  const userRow = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase());
  if (!userRow || !bcrypt.compareSync(password, userRow.password_hash)) {
    recordFailedLogin(email.trim().toLowerCase(), req.ip || req.socket.remoteAddress || "unknown");
    return res.status(401).json({ error: "E-Mail-Adresse oder Passwort ist falsch." });
  }
  const user = db.prepare(`SELECT ${accountProjection} FROM users WHERE id=?`).get(userRow.id);
  const token = jwt.sign({ ver: userRow.session_version || 0 }, signingSecret, { subject: String(user.id), expiresIn: "12h", issuer: "rlp-rp" });
  res.cookie("rlp_session", token, { httpOnly: true, secure: production, sameSite: "strict", maxAge: 12 * 60 * 60 * 1000, path: "/" });
  const fingerprint = hashSecurityValue(`${email.trim().toLowerCase()}|${req.ip || req.socket.remoteAddress || "unknown"}`);
  db.prepare("DELETE FROM security_login_attempts WHERE fingerprint=?").run(fingerprint);
  if (["admin", "superadmin"].includes(user.role)) trackAdminLogin(user.id, req.ip || req.socket.remoteAddress || "unknown");
  logAction(user.id, "user.login");
  res.json({ user });
});
app.post("/api/auth/logout", requireAuth, (req, res) => {
  logAction(req.user.id, "user.logout");
  res.clearCookie("rlp_session", { httpOnly: true, secure: production, sameSite: "strict", path: "/" });
  res.json({ ok: true });
});
app.post("/api/auth/forgot-password", async (req, res, next) => {
 try {
  const email = req.body?.email;
  if (!validateText(email, 254)) return res.status(400).json({ error: "Bitte gib eine gültige E-Mail-Adresse ein." });
  const configuredPublicUrl = process.env.PUBLIC_URL;
  if (production && (!mailTransport || !configuredPublicUrl)) return res.status(503).json({ error: "Passwort-Zurücksetzen ist derzeit nicht verfügbar. Bitte kontaktiere den Support." });
  let publicOrigin;
  try {
    const resetOrigin = new URL(configuredPublicUrl || `${req.protocol}://${req.get("host")}`);
    if (resetOrigin.protocol !== "https:" && (production || resetOrigin.protocol !== "http:")) {
      throw new Error("PUBLIC_URL muss HTTP oder HTTPS verwenden.");
    }
    publicOrigin = resetOrigin.origin;
  } catch {
    return res.status(503).json({ error: "Passwort-Zurücksetzen ist derzeit nicht verfügbar. Bitte kontaktiere den Support." });
  }
  const user = db.prepare("SELECT id FROM users WHERE email=?").get(email.trim().toLowerCase());
  if (user) {
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetHash = crypto.createHash("sha256").update(resetToken).digest("hex");
    db.prepare("INSERT OR REPLACE INTO password_resets(user_id,token_hash,expires_at) VALUES(?,?,?)").run(user.id, resetHash, Date.now() + 30 * 60 * 1000);
    const resetUrl = `${publicOrigin}/?token=${encodeURIComponent(resetToken)}`;
    if (mailTransport) {
      await mailTransport.sendMail({
        from: process.env.MAIL_FROM || "RLP RP <noreply@rlp-rp.local>",
        to: email.trim().toLowerCase(),
        subject: "RLP RP – Passwort zurücksetzen",
        text: `Du hast das Zurücksetzen deines Passworts angefordert. Öffne diesen Link innerhalb von 30 Minuten:\n\n${resetUrl}\n\nFalls du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren.`
      });
    } else {
      console.log(`Demo-Passwort-Reset für ${email}: ${resetUrl}`);
    }
  }
  res.json({ message: "Falls ein Konto existiert, wurde ein Link zum Zurücksetzen angefordert." });
 } catch (error) {
   next(error);
 }
});
app.post("/api/auth/reset-password", (req, res) => {
  const { token, password } = req.body || {};
  if (!validateText(token, 128) || !validateText(password, 128, 12)) return res.status(400).json({ error: "Der Link ist ungültig oder das Passwort zu kurz." });
  const resetHash = crypto.createHash("sha256").update(token).digest("hex");
  const reset = db.prepare(`SELECT p.user_id,u.role FROM password_resets p JOIN users u ON u.id=p.user_id
    WHERE p.token_hash=? AND p.expires_at>?`).get(resetHash, Date.now());
  if (!reset) return res.status(400).json({ error: "Der Link ist ungültig oder abgelaufen." });
  db.prepare("UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?").run(bcrypt.hashSync(password, 12), reset.user_id);
  db.prepare("DELETE FROM password_resets WHERE user_id=?").run(reset.user_id);
  logAction(reset.user_id, "user.password_reset");
  if (["admin", "superadmin"].includes(reset.role)) notifyAdmins("Admin-Passwort zurückgesetzt", "Das Passwort eines Admin-Kontos wurde über den Passwort-Reset geändert. Prüfe, ob dies erwartet war.");
  res.json({ message: "Dein Passwort wurde geändert. Du kannst dich jetzt anmelden." });
});

app.post("/api/roblox/verification/start", requireAuth, async (req, res, next) => {
  try {
    const rawUsername = req.body?.username;
    if (typeof rawUsername !== "string") {
      return res.status(400).json({ error: "Bitte gib einen gültigen Roblox-Benutzernamen ein." });
    }
    const username = rawUsername.trim();
    if (!validateText(username, 20, 3) || !/^[a-zA-Z0-9_]+$/.test(username) ||
        username.startsWith("_") || username.endsWith("_") || username.includes("__")) {
      return res.status(400).json({ error: "Bitte gib einen gültigen Roblox-Benutzernamen ein (3–20 Zeichen, Buchstaben, Zahlen und einzelne Unterstriche)." });
    }
    if (req.user.roblox_verified_at) return res.status(409).json({ error: "Dein Konto ist bereits mit Roblox verifiziert." });
    const response = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error(`Roblox-Kontoabfrage antwortete mit HTTP ${response.status}.`);
    const result = await response.json();
    const account = result.data?.find(user => user.name.toLowerCase() === username.toLowerCase());
    if (!account) return res.status(404).json({ error: "Dieser Roblox-Benutzername wurde nicht gefunden." });
    const code = `RLP-RP-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
    const expiresAt = Date.now() + 15 * 60 * 1000;
    db.prepare(`INSERT INTO roblox_verification_challenges(user_id,roblox_user_id,roblox_username,token_hash,expires_at)
      VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET roblox_user_id=excluded.roblox_user_id,
      roblox_username=excluded.roblox_username,token_hash=excluded.token_hash,expires_at=excluded.expires_at`)
      .run(req.user.id, account.id, account.name, crypto.createHash("sha256").update(code).digest("hex"), expiresAt);
    res.json({
      username: account.name,
      profileUrl: `https://www.roblox.com/users/${account.id}/profile`,
      code,
      expiresAt
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/roblox/verification/confirm", requireAuth, async (req, res, next) => {
  try {
    const challenge = db.prepare("SELECT * FROM roblox_verification_challenges WHERE user_id=? AND expires_at>?").get(req.user.id, Date.now());
    if (!challenge) return res.status(400).json({ error: "Kein gültiger Prüfcode vorhanden. Starte die Roblox-Verifizierung erneut." });
    const response = await fetch(`https://users.roblox.com/v1/users/${challenge.roblox_user_id}`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error(`Roblox-Profilabfrage antwortete mit HTTP ${response.status}.`);
    const profile = await response.json();
    if (profile.id !== challenge.roblox_user_id || profile.name !== challenge.roblox_username) {
      return res.status(409).json({ error: "Das Roblox-Profil konnte nicht eindeutig zugeordnet werden. Bitte starte die Verifizierung erneut." });
    }
    const expectedCode = db.prepare("SELECT token_hash FROM roblox_verification_challenges WHERE user_id=?")
      .get(req.user.id).token_hash;
    const suppliedHash = crypto.createHash("sha256").update(String(req.body?.code || "")).digest("hex");
    if (!/^[\w-]{12,40}$/.test(String(req.body?.code || "")) ||
        !crypto.timingSafeEqual(Buffer.from(expectedCode, "hex"), Buffer.from(suppliedHash, "hex"))) {
      return res.status(400).json({ error: "Der Prüfcode ist ungültig. Bitte kopiere den angezeigten Code unverändert." });
    }
    if (!profile.description?.includes(req.body.code)) {
      return res.status(400).json({ error: "Der Prüfcode steht noch nicht in der Profilbeschreibung. Speichere ihn dort und versuche es erneut." });
    }
    try {
      db.transaction(() => {
        db.prepare("UPDATE users SET roblox_user_id=?,roblox_username=?,roblox_verified_at=CURRENT_TIMESTAMP WHERE id=?")
          .run(challenge.roblox_user_id, challenge.roblox_username, req.user.id);
        db.prepare("DELETE FROM roblox_verification_challenges WHERE user_id=?").run(req.user.id);
      })();
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "Dieses Roblox-Konto ist bereits mit einem anderen RLP-RP-Konto verknüpft." });
      throw error;
    }
    logAction(req.user.id, "roblox.account_verified", challenge.roblox_username);
    res.json({ user: db.prepare(`SELECT ${accountProjection} FROM users WHERE id=?`).get(req.user.id) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/profile", requireAuth, (req, res) => {
  const { username, avatar } = req.body || {};
  if (!validateText(username, 24, 3) || !/^[\p{L}\p{N}_-]+$/u.test(username.trim())) return res.status(400).json({ error: "Bitte gib einen gültigen Benutzernamen ein." });
  if (typeof avatar !== "string" || avatar.length > 500 || (avatar && !/^https:\/\/[^\s]+$/i.test(avatar))) {
    return res.status(400).json({ error: "Das Profilbild muss eine HTTPS-Bildadresse sein." });
  }
  try {
    db.prepare("UPDATE users SET username=?,avatar=? WHERE id=?").run(username.trim(), avatar, req.user.id);
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "Der Benutzername ist bereits vergeben." });
    throw error;
  }
  logAction(req.user.id, "user.profile_update");
  res.json({ user: db.prepare(`SELECT ${accountProjection} FROM users WHERE id=?`).get(req.user.id) });
});
app.get("/api/profile/department", requireAuth, (req, res) => {
  const assignment = db.prepare(`SELECT department,service_number,status,requested_at,updated_at
    FROM service_assignments WHERE user_id=?`).get(req.user.id);
  res.json({ assignment: assignment ? { ...assignment, label: departments[assignment.department].label } : null });
});
app.put("/api/profile/department", requireAuth, requireRobloxVerified, (req, res) => {
  const { department } = req.body || {};
  if (typeof department !== "string" || !Object.hasOwn(departments, department)) {
    return res.status(400).json({ error: "Bitte wähle Polizei, Feuerwehr oder Rettungsdienst." });
  }
  const existing = db.prepare("SELECT status FROM service_assignments WHERE user_id=?").get(req.user.id);
  if (existing && existing.status !== "rejected") {
    return res.status(409).json({ error: existing.status === "active"
      ? "Du bist bereits einer Abteilung zugeordnet."
      : "Deine Bewerbung wird bereits geprüft." });
  }
  const assignment = db.transaction(() => {
    db.prepare(`INSERT INTO department_counters(department,last_number) VALUES(?,100)
      ON CONFLICT(department) DO NOTHING`).run(department);
    db.prepare("UPDATE department_counters SET last_number=last_number+1 WHERE department=?").run(department);
    const number = db.prepare("SELECT last_number FROM department_counters WHERE department=?").get(department).last_number;
    const serviceNumber = `${departments[department].prefix}-${String(number).padStart(4, "0")}`;
    db.prepare(`INSERT INTO service_assignments(user_id,department,service_number,status,requested_at,updated_at)
      VALUES(?,?,?,'pending',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET department=excluded.department,service_number=excluded.service_number,
      status='pending',requested_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`)
      .run(req.user.id, department, serviceNumber);
    return { department, service_number: serviceNumber, status: "pending", label: departments[department].label };
  })();
  logAction(req.user.id, "department.application_created", `${assignment.label} · ${assignment.service_number}`);
  res.status(201).json({ assignment });
});
app.patch("/api/profile/password", requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== "string" || currentPassword.length > 128 ||
      typeof newPassword !== "string" || newPassword.length < 14 || newPassword.length > 128) {
    return res.status(400).json({ error: "Das neue Passwort muss mindestens 14 Zeichen lang sein." });
  }
  const user = db.prepare("SELECT password_hash,role FROM users WHERE id=?").get(req.user.id);
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: "Dein aktuelles Passwort ist falsch." });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ error: "Das neue Passwort muss sich vom aktuellen unterscheiden." });
  }
  db.prepare("UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?")
    .run(bcrypt.hashSync(newPassword, 12), req.user.id);
  db.prepare("DELETE FROM password_resets WHERE user_id=?").run(req.user.id);
  logAction(req.user.id, "user.password_changed");
  if (["admin", "superadmin"].includes(user.role)) {
    notifyAdmins("Admin-Passwort geändert", "Das Passwort eines Admin-Kontos wurde im Profil geändert.");
  }
  res.clearCookie("rlp_session", { httpOnly: true, secure: production, sameSite: "strict", path: "/" });
  res.json({ ok: true, message: "Passwort geändert. Bitte melde dich mit deinem neuen Passwort erneut an." });
});

app.get("/api/news", (req, res) => {
  res.json({ news: db.prepare(`SELECT n.id,n.title,n.body,n.image_url,n.created_at,u.username AS author
    FROM news n LEFT JOIN users u ON n.author_id=u.id ORDER BY n.created_at DESC LIMIT 8`).all() });
});
app.get("/api/tickets", requireAuth, requireRobloxVerified, (req, res) => {
  const isAdmin = ["admin", "superadmin", "support"].includes(req.user.role);
  const tickets = isAdmin
    ? db.prepare(`SELECT t.*,u.username AS owner FROM tickets t JOIN users u ON u.id=t.user_id ORDER BY t.updated_at DESC`).all()
    : db.prepare("SELECT * FROM tickets WHERE user_id=? ORDER BY updated_at DESC").all(req.user.id);
  res.json({ tickets });
});
app.post("/api/tickets", requireAuth, requireRobloxVerified, (req, res) => {
  const { category, title, body } = req.body || {};
  if (!categories.includes(category) || !validateText(title, 100, 4) || !validateText(body, 3000, 10)) {
    return res.status(400).json({ error: "Bitte prüfe Kategorie, Titel und Nachricht (mindestens 10 Zeichen)." });
  }
  const created = db.transaction(() => {
    const ticket = db.prepare("INSERT INTO tickets(user_id,category,title) VALUES(?,?,?)").run(req.user.id, category, title.trim());
    db.prepare("INSERT INTO ticket_messages(ticket_id,user_id,body) VALUES(?,?,?)").run(ticket.lastInsertRowid, req.user.id, body.trim());
    return ticket.lastInsertRowid;
  })();
  logAction(req.user.id, "ticket.created", `Ticket #${created}`);
  res.status(201).json({ ticket: db.prepare("SELECT * FROM tickets WHERE id=?").get(created) });
});
app.get("/api/tickets/:id/messages", requireAuth, requireRobloxVerified, (req, res) => {
  const ticket = db.prepare("SELECT * FROM tickets WHERE id=?").get(Number(req.params.id));
  if (!ticket) return res.status(404).json({ error: "Ticket nicht gefunden." });
  if (ticket.user_id !== req.user.id && !["admin", "superadmin", "support"].includes(req.user.role)) return res.status(403).json({ error: "Kein Zugriff auf dieses Ticket." });
  res.json({ messages: db.prepare(`SELECT m.id,m.body,m.created_at,u.username,u.role FROM ticket_messages m
    JOIN users u ON u.id=m.user_id WHERE m.ticket_id=? ORDER BY m.created_at`).all(ticket.id) });
});
app.post("/api/tickets/:id/messages", requireAuth, requireRobloxVerified, (req, res) => {
  const ticket = db.prepare("SELECT * FROM tickets WHERE id=?").get(Number(req.params.id));
  if (!ticket) return res.status(404).json({ error: "Ticket nicht gefunden." });
  if (ticket.user_id !== req.user.id && !["admin", "superadmin", "support"].includes(req.user.role)) return res.status(403).json({ error: "Kein Zugriff auf dieses Ticket." });
  if (ticket.status === "closed") return res.status(409).json({ error: "Dieses Ticket ist geschlossen." });
  if (!validateText(req.body?.body, 3000, 2)) return res.status(400).json({ error: "Die Nachricht muss mindestens 2 Zeichen enthalten." });
  db.transaction(() => {
    db.prepare("INSERT INTO ticket_messages(ticket_id,user_id,body) VALUES(?,?,?)").run(ticket.id, req.user.id, req.body.body.trim());
    db.prepare("UPDATE tickets SET updated_at=CURRENT_TIMESTAMP WHERE id=?").run(ticket.id);
  })();
  logAction(req.user.id, "ticket.reply", `Ticket #${ticket.id}`);
  res.status(201).json({ ok: true });
});
app.patch("/api/tickets/:id", requireAuth, requireRobloxVerified, (req, res) => {
  const ticket = db.prepare("SELECT * FROM tickets WHERE id=?").get(Number(req.params.id));
  if (!ticket) return res.status(404).json({ error: "Ticket nicht gefunden." });
  if (ticket.user_id !== req.user.id && !["admin", "superadmin", "support"].includes(req.user.role)) return res.status(403).json({ error: "Kein Zugriff auf dieses Ticket." });
  if (req.body?.status !== "closed") return res.status(400).json({ error: "Ungültiger Ticketstatus." });
  db.prepare("UPDATE tickets SET status='closed',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(ticket.id);
  logAction(req.user.id, "ticket.closed", `Ticket #${ticket.id}`);
  res.json({ ok: true });
});

app.get("/api/admin/dashboard", requireAdmin, (req, res) => {
  res.json({
    users: db.prepare("SELECT COUNT(*) AS count FROM users").get().count,
    verifiedUsers: db.prepare("SELECT COUNT(*) AS count FROM users WHERE roblox_verified_at IS NOT NULL").get().count,
    openTickets: db.prepare("SELECT COUNT(*) AS count FROM tickets WHERE status='open'").get().count,
    pendingDepartments: db.prepare("SELECT COUNT(*) AS count FROM service_assignments WHERE status='pending'").get().count,
    activeDepartments: db.prepare("SELECT COUNT(*) AS count FROM service_assignments WHERE status='active'").get().count,
    news: db.prepare("SELECT COUNT(*) AS count FROM news").get().count,
    totalTickets: db.prepare("SELECT COUNT(*) AS count FROM tickets").get().count,
    maintenance: maintenanceEnabled(),
    emailConfigured: mailStatus === "ready",
    emailStatus: mailStatus,
    recentLogs: db.prepare(`SELECT l.id,l.action,l.details,l.created_at,u.username FROM logs l
      LEFT JOIN users u ON u.id=l.actor_id ORDER BY l.id DESC LIMIT 30`).all()
  });
});
app.get("/api/admin/security-alerts", requireAdmin, (req, res) => {
  res.json({
    alerts: db.prepare(`SELECT id,title,details,created_at,read_at FROM security_alerts
      ORDER BY (read_at IS NULL) DESC,id DESC LIMIT 50`).all()
  });
});
app.patch("/api/admin/security-alerts/:id/read", requireAdmin, (req, res) => {
  const result = db.prepare("UPDATE security_alerts SET read_at=CURRENT_TIMESTAMP WHERE id=? AND read_at IS NULL")
    .run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Meldung nicht gefunden oder bereits bestätigt." });
  logAction(req.user.id, "security.alert_acknowledged", `Meldung #${req.params.id}`);
  res.json({ ok: true });
});
app.get("/api/admin/users", requireAdmin, (req, res) => {
  res.json({ users: db.prepare("SELECT id,username,email,role,roblox_user_id,roblox_username,roblox_verified_at,created_at FROM users ORDER BY id DESC LIMIT 200").all() });
});
app.get("/api/admin/users/export.csv", requireAdmin, (req, res) => {
  const users = db.prepare(`SELECT u.id,u.username,u.email,u.role,u.roblox_username,u.roblox_verified_at,u.created_at,
      s.department,s.service_number,s.status AS service_status
    FROM users u LEFT JOIN service_assignments s ON s.user_id=u.id ORDER BY u.id DESC`).all();
  const csvCell = value => {
    const text = String(value ?? "");
    const safeText = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replaceAll('"', '""')}"`;
  };
  const header = ["ID", "Benutzername", "E-Mail", "Rolle", "Roblox-Konto", "Roblox-verifiziert", "Registriert", "Abteilung", "Dienstnummer", "Dienststatus"];
  const rows = users.map(user => [
    user.id, user.username, user.email, user.role, user.roblox_username,
    user.roblox_verified_at ? "Ja" : "Nein", user.created_at,
    user.department, user.service_number, user.service_status
  ]);
  logAction(req.user.id, "admin.users_exported", `${users.length} Benutzer als CSV exportiert`);
  res.set({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="rlp-rp-benutzer.csv"',
    "Cache-Control": "no-store"
  });
  res.send(`\uFEFF${[header, ...rows].map(row => row.map(csvCell).join(";")).join("\r\n")}`);
});
app.get("/api/admin/departments", requireAdmin, (req, res) => {
  res.json({
    assignments: db.prepare(`SELECT s.user_id,s.department,s.service_number,s.status,s.requested_at,s.updated_at,
      u.username,u.email,u.roblox_username FROM service_assignments s
      JOIN users u ON u.id=s.user_id ORDER BY CASE s.status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
      s.requested_at DESC LIMIT 200`).all()
  });
});
app.patch("/api/admin/departments/:userId", requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!["active", "rejected"].includes(status)) return res.status(400).json({ error: "Status muss aktiv oder abgelehnt sein." });
  const userId = Number(req.params.userId);
  const assignment = db.prepare(`SELECT s.*,u.username,u.email FROM service_assignments s
    JOIN users u ON u.id=s.user_id WHERE s.user_id=?`).get(userId);
  if (!assignment) return res.status(404).json({ error: "Bewerbung nicht gefunden." });
  if (assignment.status !== "pending") return res.status(409).json({ error: "Diese Bewerbung wurde bereits bearbeitet." });
  db.prepare("UPDATE service_assignments SET status=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?")
    .run(status, userId);
  logAction(req.user.id, `department.application_${status}`, `${assignment.username} · ${assignment.service_number}`);
  if (mailTransport) {
    const departmentName = departments[assignment.department].label;
    mailTransport.sendMail({
      from: process.env.MAIL_FROM || "RLP RP <noreply@rlp-rp.local>",
      to: assignment.email,
      subject: `RLP RP – Bewerbung ${status === "active" ? "angenommen" : "abgelehnt"}`,
      text: status === "active"
        ? `Deine Bewerbung für den ${departmentName} wurde angenommen. Deine fiktive RP-Dienstnummer lautet ${assignment.service_number}.`
        : `Deine Bewerbung für den ${departmentName} wurde abgelehnt. Du kannst dich später im Portal erneut bewerben.`
    }).catch(error => console.error("Abteilungs-Benachrichtigung konnte nicht per E-Mail versendet werden.", error));
  }
  res.json({ ok: true });
});
app.patch("/api/admin/users/:id/role", requireSuperadmin, (req, res) => {
  const { role } = req.body || {};
  const targetId = Number(req.params.id);
  const target = db.prepare("SELECT id,role FROM users WHERE id=?").get(targetId);
  if (!target) return res.status(404).json({ error: "Benutzer nicht gefunden." });
  if (!validRoles.includes(role)) return res.status(400).json({ error: "Ungültige Rolle." });
  if (target.role === "superadmin" && target.id !== req.user.id) return res.status(403).json({ error: "Die Rolle eines anderen Superadmins kann nicht geändert werden." });
  if (target.id === req.user.id && role !== "superadmin") return res.status(400).json({ error: "Du kannst deine eigene Superadmin-Rolle nicht entfernen." });
  db.prepare("UPDATE users SET role=? WHERE id=?").run(role, targetId);
  logAction(req.user.id, "admin.role_changed", `Benutzer #${targetId}: ${role}`);
  if (["admin", "superadmin"].includes(role) && !["admin", "superadmin"].includes(target.role)) {
    const targetUser = db.prepare("SELECT username FROM users WHERE id=?").get(targetId);
    notifyAdmins("Admin-Rolle vergeben", `${req.user.username} hat dem Konto ${targetUser.username} die Rolle ${role} zugewiesen.`);
  }
  res.json({ ok: true });
});
app.post("/api/admin/news", requireAdmin, (req, res) => {
  const { title, body, imageUrl = "" } = req.body || {};
  if (!validateText(title, 120, 4) || !validateText(body, 5000, 10)) return res.status(400).json({ error: "Titel und Beitrag sind erforderlich." });
  if (typeof imageUrl !== "string" || imageUrl.length > 500 || (imageUrl && !/^https:\/\/[^\s]+$/i.test(imageUrl))) return res.status(400).json({ error: "Das Bild muss eine HTTPS-Bildadresse sein." });
  const result = db.prepare("INSERT INTO news(title,body,image_url,author_id) VALUES(?,?,?,?)").run(title.trim(), body.trim(), imageUrl, req.user.id);
  logAction(req.user.id, "admin.news_created", title.trim());
  res.status(201).json({ id: result.lastInsertRowid });
});
app.delete("/api/admin/news/:id", requireAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM news WHERE id=?").run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Beitrag nicht gefunden." });
  logAction(req.user.id, "admin.news_deleted", `Beitrag #${req.params.id}`);
  res.json({ ok: true });
});
app.get("/api/admin/settings", requireAdmin, (req, res) => {
  res.json({
    settings: {
      discordUrl: getSetting("discord_url", "https://discord.gg/"),
      robloxPlaceId: getSetting("roblox_place_id", robloxPlaceId),
      robloxUniverseId: getSetting("roblox_universe_id", robloxUniverseId),
      announcement: getSetting("announcement")
    }
  });
});
app.put("/api/admin/settings", requireSuperadmin, (req, res) => {
  const { discordUrl, robloxPlaceId: placeId, robloxUniverseId: universeId, announcement } = req.body || {};
  const validDiscordUrl = typeof discordUrl === "string" &&
    (discordUrl === "" || /^https:\/\/(discord\.gg\/[A-Za-z0-9-]+|discord\.com\/invite\/[A-Za-z0-9-]+)\/?$/i.test(discordUrl));
  if (!validDiscordUrl) return res.status(400).json({ error: "Bitte gib einen gültigen Discord-Einladungslink ein." });
  if (typeof placeId !== "string" || (placeId && !/^\d{1,20}$/.test(placeId))) return res.status(400).json({ error: "Die Roblox Place-ID darf nur aus Ziffern bestehen." });
  if (typeof universeId !== "string" || (universeId && !/^\d{1,20}$/.test(universeId))) return res.status(400).json({ error: "Die Roblox Universe-ID darf nur aus Ziffern bestehen." });
  if (typeof announcement !== "string" || announcement.length > 220) return res.status(400).json({ error: "Der Hinweis darf höchstens 220 Zeichen enthalten." });
  const settings = { discord_url: discordUrl, roblox_place_id: placeId, roblox_universe_id: universeId, announcement: announcement.trim() };
  db.transaction(() => {
    const set = db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
    Object.entries(settings).forEach(([key, value]) => set.run(key, value));
  })();
  logAction(req.user.id, "admin.settings_updated", "Website-Einstellungen aktualisiert");
  res.json({
    settings: {
      discordUrl: settings.discord_url,
      robloxPlaceId: settings.roblox_place_id,
      robloxUniverseId: settings.roblox_universe_id,
      announcement: settings.announcement
    }
  });
});
app.post("/api/admin/maintenance", requireSuperadmin, (req, res) => {
  if (req.body?.enabled !== true && req.body?.enabled !== false) return res.status(400).json({ error: "Ungültiger Wartungsstatus." });
  db.prepare("UPDATE settings SET value=? WHERE key='maintenance'").run(String(req.body.enabled));
  logAction(req.user.id, req.body.enabled ? "emergency.maintenance_enabled" : "emergency.maintenance_disabled");
  if (req.body.enabled) notifyAdmins("Wartungsmodus aktiviert", `${req.user.username} hat den Wartungsmodus eingeschaltet.`);
  res.json({ maintenance: req.body.enabled });
});

app.use((req, res, next) => {
  if (!req.path.startsWith("/api") && req.path !== "/styles.css" && maintenanceEnabled() &&
      !(req.user && ["admin", "superadmin"].includes(req.user.role))) {
    return res.status(503).send(`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wartung — RLP RP</title><link rel="stylesheet" href="/styles.css"><main class="maintenance-screen"><img class="maintenance-logo" src="/icon.svg" alt="RLP RP"><span class="eyebrow">KURZ OFFLINE</span><h1>Wir sind gleich<br><span>zurück.</span></h1><p>RLP RP wird gerade gewartet. Wir arbeiten daran, bald wieder für dich da zu sein.</p><a class="button button-primary" href="https://discord.gg/" target="_blank" rel="noreferrer">Auf Discord bleiben ↗</a></main></html>`);
  }
  next();
});
app.use("/api", (req, res) => res.status(404).json({ error: "API-Endpunkt nicht gefunden." }));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  if (error.code === "EBADCSRFTOKEN") {
    signalSecurityOnce(
      `csrf:${req.ip || req.socket.remoteAddress || "unknown"}`,
      "Ungültige Sicherheitsanfrage blockiert",
      "Eine Anfrage ohne gültigen CSRF-Schutz wurde abgewiesen. Netzwerkdaten werden nicht in der Meldung gespeichert."
    );
  }
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
  res.status(status).json({ error: status === 403 ? "Ungültiger oder abgelaufener CSRF-Token." : "Ein unerwarteter Fehler ist aufgetreten." });
});

app.listen(port, () => console.log(`RLP RP Portal läuft auf http://localhost:${port}`));
