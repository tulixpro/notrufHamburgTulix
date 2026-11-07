const fs = require("node:fs");
const path = require("node:path");
const { AsyncLocalStorage } = require("node:async_hooks");
const Database = require("better-sqlite3");
const { Client, Pool, types } = require("pg");

types.setTypeParser(20, value => Number(value));

const idTables = new Set([
  "users",
  "tickets",
  "ticket_messages",
  "news",
  "logs",
  "security_alerts",
  "security_login_attempts"
]);

function secureConnectionString(connectionString) {
  return connectionString.replace(/([?&])sslmode=require(?=&|$)/i, "$1sslmode=verify-full");
}

function postgresSql(sql, returningId = false) {
  let query = sql.trim();
  let parameterIndex = 0;
  const ignoreConflicts = /^\s*INSERT OR IGNORE INTO/i.test(query);
  const replacePasswordReset = /^\s*INSERT OR REPLACE INTO password_resets/i.test(query);

  query = query.replace(/^\s*INSERT OR (?:IGNORE|REPLACE) INTO/i, "INSERT INTO");
  query = query.replace(
    /username\s*=\s*\?\s*COLLATE\s+NOCASE\s+OR\s+email\s*=\s*\?\s*COLLATE\s+NOCASE/i,
    "LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)"
  );
  query = query.replace(/datetime\('now','-7 days'\)/gi, "CURRENT_TIMESTAMP - INTERVAL '7 days'");
  query = query.replace(/datetime\('now','-10 minutes'\)/gi, "CURRENT_TIMESTAMP - INTERVAL '10 minutes'");
  query = query.replace(/\?/g, () => `$${++parameterIndex}`);

  if (replacePasswordReset) {
    query += " ON CONFLICT(user_id) DO UPDATE SET token_hash=EXCLUDED.token_hash, expires_at=EXCLUDED.expires_at";
  } else if (ignoreConflicts) {
    query += " ON CONFLICT DO NOTHING";
  }

  if (returningId && /^\s*INSERT INTO/i.test(query) && !/\bRETURNING\b/i.test(query)) {
    const table = query.match(/^\s*INSERT INTO\s+([a-z_]+)/i)?.[1]?.toLowerCase();
    if (table && idTables.has(table)) query += " RETURNING id";
  }

  return query;
}

function createPostgresDatabase(connectionString) {
  const secureUrl = secureConnectionString(connectionString);
  const pool = new Pool({
    connectionString: secureUrl,
    max: Number(process.env.DB_POOL_MAX) || 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000
  });

  function prepare(sql, client = pool) {
    const query = postgresSql(sql, true);
    return {
      get: async (...params) => (await client.query(query, params)).rows[0],
      all: async (...params) => (await client.query(query, params)).rows,
      run: async (...params) => {
        const result = await client.query(query, params);
        return {
          changes: result.rowCount,
          lastInsertRowid: result.rows[0]?.id
        };
      }
    };
  }

  return {
    isPostgres: true,
    prepare,
    exec: sql => pool.query(sql),
    async transaction(callback) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const value = await callback({ prepare: sql => prepare(sql, client) });
        await client.query("COMMIT");
        return value;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async initialize(sql) {
      const directUrl = secureConnectionString(process.env.DATABASE_URL_UNPOOLED || connectionString);
      const client = new Client({ connectionString: directUrl, connectionTimeoutMillis: 30000 });
      await client.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        await client.end();
      }
    },
    close: () => pool.end()
  };
}

function createSqliteDatabase() {
  const dataDirectory = process.env.DATA_DIRECTORY || path.join(__dirname, "data");
  fs.mkdirSync(dataDirectory, { recursive: true });
  const database = new Database(path.join(dataDirectory, "rlp-rp.sqlite"));
  const transactionContext = new AsyncLocalStorage();
  let queue = Promise.resolve();

  async function runLocked(callback) {
    if (transactionContext.getStore() === database) return callback();
    const previous = queue;
    let release;
    queue = new Promise(resolve => { release = resolve; });
    await previous;
    try {
      return callback();
    } finally {
      release();
    }
  }

  function prepare(sql) {
    const statement = database.prepare(sql);
    return {
      get: (...params) => runLocked(() => statement.get(...params)),
      all: (...params) => runLocked(() => statement.all(...params)),
      run: (...params) => runLocked(() => statement.run(...params))
    };
  }

  return {
    isPostgres: false,
    prepare,
    exec: sql => runLocked(() => database.exec(sql)),
    pragma: value => database.pragma(value),
    async transaction(callback) {
      return runLocked(async () => {
        database.exec("BEGIN IMMEDIATE");
        try {
          const value = await transactionContext.run(database, () => callback({ prepare }));
          database.exec("COMMIT");
          return value;
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      });
    },
    initialize: async sql => database.exec(sql),
    close: () => database.close()
  };
}

function createDatabase() {
  const connectionString = process.env.DATABASE_URL;
  return connectionString ? createPostgresDatabase(connectionString) : createSqliteDatabase();
}

module.exports = { createDatabase, postgresSql, secureConnectionString };
