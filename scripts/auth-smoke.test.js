const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const root = path.resolve(__dirname, "..");
const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rlp-rp-auth-test-"));
const username = `test_${require("node:crypto").randomBytes(8).toString("hex")}`;
const password = "Smoke-Test-Password-26!";
let port;
let server;
let serverOutput = "";
let cookieJar = new Map();
let csrfToken = "";

async function getFreePort() {
  const listener = net.createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const { port: freePort } = listener.address();
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return freePort;
}

function updateCookies(response) {
  for (const header of response.headers.getSetCookie()) {
    const cookie = header.split(";", 1)[0];
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;
    const name = cookie.slice(0, separator);
    const value = cookie.slice(separator + 1);
    if (value) cookieJar.set(name, value);
    else cookieJar.delete(name);
  }
}

async function request(endpoint, options = {}) {
  const headers = new Headers(options.headers || {});
  if (cookieJar.size) {
    headers.set("Cookie", [...cookieJar].map(([name, value]) => `${name}=${value}`).join("; "));
  }
  const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
    ...options,
    headers,
    signal: AbortSignal.timeout(10000)
  });
  updateCookies(response);
  return response;
}

async function refreshCsrf() {
  const response = await request("/api/csrf");
  assert.equal(response.status, 200);
  csrfToken = (await response.json()).csrfToken;
  assert.ok(csrfToken);
}

async function sendJson(endpoint, body) {
  return request(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken
    },
    body: JSON.stringify(body)
  });
}

async function startServer() {
  serverOutput = "";
  server = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      DATA_DIRECTORY: dataDirectory,
      JWT_SECRET: require("node:crypto").randomBytes(48).toString("hex")
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  server.stdout.setEncoding("utf8").on("data", chunk => { serverOutput += chunk; });
  server.stderr.setEncoding("utf8").on("data", chunk => { serverOutput += chunk; });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server startup timed out.\n${serverOutput}`)), 20000);
    const onOutput = chunk => {
      if (!serverOutput.includes("Portal läuft auf")) return;
      clearTimeout(timeout);
      server.stdout.off("data", onOutput);
      server.stderr.off("data", onOutput);
      resolve();
    };
    server.stdout.on("data", onOutput);
    server.stderr.on("data", onOutput);
    server.once("error", error => {
      clearTimeout(timeout);
      reject(error);
    });
    server.once("exit", code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited during startup with code ${code}.\n${serverOutput}`));
    });
  });
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const exit = once(server, "exit");
  server.kill();
  await exit;
  server = null;
}

before(async () => {
  port = await getFreePort();
  await startServer();
});

after(async () => {
  await stopServer();
  fs.rmSync(dataDirectory, { recursive: true, force: true });
});

test("registers without email, persists the account, and logs in by username after restart", async () => {
  await refreshCsrf();
  const registration = await sendJson("/api/auth/register", { username, password });
  const registeredBody = await registration.json();
  assert.equal(registration.status, 201, JSON.stringify(registeredBody));
  const registeredUser = registeredBody.user;
  assert.equal(registeredUser.username, username);
  assert.equal(registeredUser.email, null);

  const authenticated = await request("/api/auth/me");
  assert.equal(authenticated.status, 200);
  assert.equal((await authenticated.json()).user.username, username);

  await refreshCsrf();
  const logout = await sendJson("/api/auth/logout", {});
  assert.equal(logout.status, 200);

  await stopServer();
  cookieJar = new Map();
  csrfToken = "";
  await startServer();
  await refreshCsrf();

  const login = await sendJson("/api/auth/login", { username, password });
  const loginBody = await login.json();
  assert.equal(login.status, 200, JSON.stringify(loginBody));
  assert.equal(loginBody.user.username, username);
});
