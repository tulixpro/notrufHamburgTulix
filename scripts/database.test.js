const assert = require("node:assert/strict");
const { test } = require("node:test");
const { postgresSql, secureConnectionString } = require("../database");

test("translates SQLite login matching and positional parameters for Postgres", () => {
  assert.equal(
    postgresSql("SELECT * FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE"),
    "SELECT * FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)"
  );
});

test("preserves conflict handling and generated IDs in Postgres inserts", () => {
  assert.equal(
    postgresSql("INSERT OR IGNORE INTO users(username,email) VALUES(?,?)", true),
    "INSERT INTO users(username,email) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id"
  );
  assert.equal(
    postgresSql("INSERT OR REPLACE INTO password_resets(user_id,token_hash,expires_at) VALUES(?,?,?)"),
    "INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET token_hash=EXCLUDED.token_hash, expires_at=EXCLUDED.expires_at"
  );
});

test("translates SQLite date arithmetic to Postgres intervals", () => {
  assert.equal(
    postgresSql("SELECT * FROM logs WHERE created_at < datetime('now','-7 days')"),
    "SELECT * FROM logs WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '7 days'"
  );
});

test("keeps Postgres TLS certificate verification explicit", () => {
  assert.equal(
    secureConnectionString("postgres://user:password@db.example/neondb?sslmode=require"),
    "postgres://user:password@db.example/neondb?sslmode=verify-full"
  );
});
