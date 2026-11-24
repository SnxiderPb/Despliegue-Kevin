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

async function ensureBootstrapAdmin(pool, { email, passwordHash }) {
  const result = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email) DO UPDATE
       SET role = 'admin', updated_at = NOW()
     RETURNING id, email, role, is_active, session_version`,
    [email.split("@")[0], email, passwordHash]
  );
  return result.rows[0];
}

async function migrateProjectOwners(pool, bootstrapAdminId) {
  await pool.query(
    "UPDATE projects SET owner_id = $1 WHERE owner_id IS NULL",
    [bootstrapAdminId]
  );
  await pool.query("ALTER TABLE projects ALTER COLUMN owner_id SET NOT NULL");
}

module.exports = {
  createPool,
  ensureBootstrapAdmin,
  initializeDatabase,
  migrateProjectOwners
};
