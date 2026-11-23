const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { createApp } = require("../backend/app");
const { createPool, initializeDatabase } = require("../backend/database");

const testConfig = {
  DB_HOST: process.env.DB_HOST || "localhost",
  DB_PORT: process.env.DB_PORT || "5432",
  DB_NAME: process.env.DB_NAME || "despliegue_test",
  DB_USER: process.env.DB_USER || "postgres",
  DB_PASSWORD: process.env.DB_PASSWORD || "postgres",
  DB_SSL: "false"
};
const testEmail = "integration@example.test";
const testPassword = "integration-password-123";
const jwtSecret = "integration-test-secret-with-at-least-32-characters";

let pool;
let server;
let baseUrl;

test.before(async () => {
  if (!/(?:^|_)test$/i.test(testConfig.DB_NAME)) {
    throw new Error("Las pruebas de integración solo se ejecutan contra una base cuyo nombre termine en '_test'.");
  }

  pool = createPool(testConfig);
  await initializeDatabase(pool);
  await pool.query("TRUNCATE TABLE projects, users RESTART IDENTITY");
  const passwordHash = await bcrypt.hash(testPassword, 4);
  await pool.query(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2)",
    [testEmail, passwordHash]
  );

  const app = createApp({ pool, jwtSecret, nodeEnv: "test" });
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
  if (pool) {
    await pool.end();
  }
});

test("authenticates and completes project create, list, update, and delete", async () => {
  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);

  const unauthorized = await fetch(`${baseUrl}/api/projects`);
  assert.equal(unauthorized.status, 401);

  const invalidLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: testEmail, password: "wrong-password" })
  });
  assert.equal(invalidLogin.status, 401);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: testEmail, password: testPassword })
  });
  assert.equal(login.status, 200);
  const sessionCookie = login.headers.get("set-cookie");
  assert.match(sessionCookie, /httponly/i);
  assert.match(sessionCookie, /samesite=strict/i);
  const cookie = sessionCookie.split(";")[0];

  const create = await fetch(`${baseUrl}/api/projects`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie
    },
    body: JSON.stringify({
      name: "Portal de pruebas",
      framework: "HTML/CSS/JS",
      url: "https://example.com",
      status: "planned"
    })
  });
  assert.equal(create.status, 201);
  const created = (await create.json()).project;
  assert.equal(created.name, "Portal de pruebas");

  const list = await fetch(`${baseUrl}/api/projects`, {
    headers: { cookie }
  });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).projects.length, 1);

  const invalidUpdate = await fetch(`${baseUrl}/api/projects/${created.id}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      cookie
    },
    body: JSON.stringify({
      name: "Portal de pruebas",
      framework: "HTML",
      url: "javascript:alert(1)",
      status: "deployed"
    })
  });
  assert.equal(invalidUpdate.status, 400);

  const update = await fetch(`${baseUrl}/api/projects/${created.id}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      cookie
    },
    body: JSON.stringify({
      name: "Portal actualizado",
      framework: "Vite",
      url: "",
      status: "in_progress"
    })
  });
  assert.equal(update.status, 200);
  assert.equal((await update.json()).project.status, "in_progress");

  const deletion = await fetch(`${baseUrl}/api/projects/${created.id}`, {
    method: "DELETE",
    headers: { cookie }
  });
  assert.equal(deletion.status, 204);

  const emptyList = await fetch(`${baseUrl}/api/projects`, {
    headers: { cookie }
  });
  assert.deepEqual((await emptyList.json()).projects, []);
});
