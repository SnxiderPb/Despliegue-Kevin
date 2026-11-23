require("dotenv").config();

const bcrypt = require("bcryptjs");
const { createApp } = require("./app");
const { createPool, initializeDatabase } = require("./database");

function readConfig(env = process.env) {
  const required = ["JWT_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD"];
  const missing = required.filter((name) => !env[name]);

  if (missing.length > 0) {
    throw new Error(`Faltan variables de configuración: ${missing.join(", ")}`);
  }
  if (env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET debe tener al menos 32 caracteres.");
  }
  if (env.ADMIN_PASSWORD.length < 12) {
    throw new Error("ADMIN_PASSWORD debe tener al menos 12 caracteres.");
  }

  return {
    adminEmail: env.ADMIN_EMAIL.trim().toLowerCase(),
    adminPassword: env.ADMIN_PASSWORD,
    jwtSecret: env.JWT_SECRET,
    nodeEnv: env.NODE_ENV || "development",
    port: Number(env.PORT || 3000)
  };
}

async function start() {
  const config = readConfig();
  const pool = createPool();
  await initializeDatabase(pool);

  const passwordHash = await bcrypt.hash(config.adminPassword, 12);
  await pool.query(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [config.adminEmail, passwordHash]
  );

  const app = createApp({
    pool,
    jwtSecret: config.jwtSecret,
    nodeEnv: config.nodeEnv
  });
  const server = app.listen(config.port, "0.0.0.0", () => {
    console.log(`Aplicación disponible en el puerto ${config.port}.`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

start().catch((error) => {
  console.error("No se pudo iniciar la aplicación:", error);
  process.exitCode = 1;
});
