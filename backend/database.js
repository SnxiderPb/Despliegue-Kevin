const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

function createPool(env = process.env) {
  const required = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"];
  const missing = required.filter((name) => !env[name]);

  if (missing.length > 0) {
    throw new Error(`Faltan variables de base de datos: ${missing.join(", ")}`);
  }

  let ssl = false;
  if (env.DB_SSL === "true") {
    if (!env.DB_SSL_CA_PATH) {
      throw new Error("DB_SSL_CA_PATH es obligatorio cuando DB_SSL=true.");
    }

    ssl = {
      ca: fs.readFileSync(env.DB_SSL_CA_PATH, "utf8"),
      rejectUnauthorized: true
    };
  }

  return new Pool({
    host: env.DB_HOST,
    port: Number(env.DB_PORT || 5432),
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    ssl,
    max: Number(env.DB_POOL_MAX || 10)
  });
}

async function initializeDatabase(pool) {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(schema);
}

module.exports = { createPool, initializeDatabase };
