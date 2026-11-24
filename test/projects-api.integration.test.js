const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { createApp } = require("../backend/app");
const {
  createPool,
  ensureBootstrapAdmin,
  initializeDatabase,
  migrateProjectOwners
} = require("../backend/database");

const testConfig = {
  DB_HOST: process.env.DB_HOST || "localhost",
  DB_PORT: process.env.DB_PORT || "5432",
  DB_NAME: process.env.DB_NAME || "despliegue_test",
  DB_USER: process.env.DB_USER || "postgres",
  DB_PASSWORD: process.env.DB_PASSWORD || "postgres",
  DB_SSL: "false"
};
const adminEmail = "admin@example.test";
const adminPassword = "integration-admin-password";
const memberEmail = "member@example.test";
let memberPassword = "integration-member-password";
const jwtSecret = "integration-test-secret-with-at-least-32-characters";

let pool;
let server;
let baseUrl;
let memberSessionCookie;

async function postJson(path, body, cookie) {
  const headers = { "content-type": "application/json" };
  if (cookie) {
    headers.cookie = cookie;
  }
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

async function login(email, password) {
  const response = await postJson("/api/auth/login", { email, password });
  assert.equal(response.status, 200);
  const setCookie = response.headers.get("set-cookie");
  assert.match(setCookie, /httponly/i);
  assert.match(setCookie, /samesite=strict/i);
  return setCookie.split(";")[0];
}

async function updateUser(cookie, id, updates) {
  return fetch(`${baseUrl}/api/users/${id}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      cookie
    },
    body: JSON.stringify(updates)
  });
}

test.before(async () => {
  if (!/(?:^|_)test$/i.test(testConfig.DB_NAME)) {
    throw new Error("Las pruebas de integración solo se ejecutan contra una base cuyo nombre termine en '_test'.");
  }

  pool = createPool(testConfig);
  await initializeDatabase(pool);
  await pool.query("TRUNCATE TABLE projects, users RESTART IDENTITY");
  const adminHash = await bcrypt.hash(adminPassword, 4);
  const admin = await ensureBootstrapAdmin(pool, {
    email: adminEmail,
    passwordHash: adminHash
  });
  await migrateProjectOwners(pool, admin.id);

  const app = createApp({
    pool,
    jwtSecret,
    nodeEnv: "test",
    bootstrapAdminEmail: "bootstrap@example.test"
  });
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

test("registers public users without admin privileges and protects sign-in", async () => {
  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);

  const unauthorized = await fetch(`${baseUrl}/api/projects`);
  assert.equal(unauthorized.status, 401);

  const shortPassword = await postJson("/api/auth/register", {
    fullName: "Member",
    email: memberEmail,
    password: "short"
  });
  assert.equal(shortPassword.status, 400);

  const reservedEmail = await postJson("/api/auth/register", {
    fullName: "Fake Admin",
    email: "bootstrap@example.test",
    password: memberPassword
  });
  assert.equal(reservedEmail.status, 409);

  const registration = await postJson("/api/auth/register", {
    fullName: "Member Test",
    email: ` ${memberEmail.toUpperCase()} `,
    password: memberPassword,
    role: "admin"
  });
  assert.equal(registration.status, 201);
  const member = (await registration.json()).user;
  assert.equal(member.role, "user");
  assert.equal(member.email, memberEmail);
  assert.equal(Object.hasOwn(member, "password_hash"), false);

  const duplicate = await postJson("/api/auth/register", {
    fullName: "Duplicate",
    email: memberEmail,
    password: memberPassword
  });
  assert.equal(duplicate.status, 409);

  const invalidLogin = await postJson("/api/auth/login", {
    email: memberEmail,
    password: "wrong-password"
  });
  assert.equal(invalidLogin.status, 401);
  assert.deepEqual(await invalidLogin.json(), {
    error: "Correo o contraseña incorrectos."
  });

  const adminCookie = await login(adminEmail, adminPassword);
  const adminList = await fetch(`${baseUrl}/api/users`, {
    headers: { cookie: adminCookie }
  });
  assert.equal(adminList.status, 200);
  const listedUsers = (await adminList.json()).users;
  assert.equal(listedUsers.length, 2);
  assert.ok(listedUsers.every((user) => !("passwordHash" in user)));
  return { adminCookie, member };
});

test("isolates projects by owner and completes project CRUD", async () => {
  const adminCookie = await login(adminEmail, adminPassword);
  const memberCookie = await login(memberEmail, memberPassword);
  memberSessionCookie = memberCookie;

  const forbiddenUsers = await fetch(`${baseUrl}/api/users`, {
    headers: { cookie: memberCookie }
  });
  assert.equal(forbiddenUsers.status, 403);

  const createMemberProject = await postJson("/api/projects", {
    name: "Proyecto privado",
    framework: "HTML/CSS/JS",
    url: "https://example.com",
    status: "planned"
  }, memberCookie);
  assert.equal(createMemberProject.status, 201);
  const memberProject = (await createMemberProject.json()).project;

  const adminProjects = await fetch(`${baseUrl}/api/projects`, {
    headers: { cookie: adminCookie }
  });
  assert.deepEqual((await adminProjects.json()).projects, []);

  const forbiddenUpdate = await fetch(`${baseUrl}/api/projects/${memberProject.id}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      cookie: adminCookie
    },
    body: JSON.stringify({
      name: "No autorizado",
      framework: "Vite",
      status: "deployed"
    })
  });
  assert.equal(forbiddenUpdate.status, 404);

  const update = await fetch(`${baseUrl}/api/projects/${memberProject.id}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      cookie: memberCookie
    },
    body: JSON.stringify({
      name: "Proyecto actualizado",
      framework: "Vite",
      url: "",
      status: "in_progress"
    })
  });
  assert.equal(update.status, 200);
  assert.equal((await update.json()).project.status, "in_progress");

  const deletion = await fetch(`${baseUrl}/api/projects/${memberProject.id}`, {
    method: "DELETE",
    headers: { cookie: memberCookie }
  });
  assert.equal(deletion.status, 204);

  const memberProjects = await fetch(`${baseUrl}/api/projects`, {
    headers: { cookie: memberCookie }
  });
  assert.deepEqual((await memberProjects.json()).projects, []);
});

test("users can change their password and revoke their earlier session", async () => {
  const cookie = memberSessionCookie || await login(memberEmail, memberPassword);
  const wrongCurrentPassword = await postJson("/api/auth/change-password", {
    currentPassword: "wrong-current-password",
    newPassword: "another-new-password"
  }, cookie);
  assert.equal(wrongCurrentPassword.status, 401);

  const changed = await postJson("/api/auth/change-password", {
    currentPassword: memberPassword,
    newPassword: "another-new-password"
  }, cookie);
  assert.equal(changed.status, 200);
  const changedCookie = changed.headers.get("set-cookie").split(";")[0];

  const oldSession = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { cookie }
  });
  assert.equal(oldSession.status, 401);

  const newSession = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { cookie: changedCookie }
  });
  assert.equal(newSession.status, 200);

  const oldPasswordLogin = await postJson("/api/auth/login", {
    email: memberEmail,
    password: memberPassword
  });
  assert.equal(oldPasswordLogin.status, 401);
  memberPassword = "another-new-password";
  memberSessionCookie = changedCookie;
});

test("admin creates, updates, deactivates, and deletes users safely", async () => {
  const adminCookie = await login(adminEmail, adminPassword);

  const createUser = await postJson("/api/users", {
    fullName: "Managed User",
    email: "managed@example.test",
    password: "managed-user-password",
    role: "user"
  }, adminCookie);
  assert.equal(createUser.status, 201);
  const managed = (await createUser.json()).user;
  const managedCookie = await login("managed@example.test", "managed-user-password");

  const updateManaged = await updateUser(adminCookie, managed.id, {
    fullName: "Updated User",
    email: "updated@example.test",
    role: "user",
    isActive: true,
    password: "updated-user-password"
  });
  assert.equal(updateManaged.status, 200);
  assert.equal((await updateManaged.json()).user.fullName, "Updated User");

  const revokedSession = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { cookie: managedCookie }
  });
  assert.equal(revokedSession.status, 401);

  const deactivate = await updateUser(adminCookie, managed.id, {
    fullName: "Updated User",
    email: "updated@example.test",
    role: "user",
    isActive: false
  });
  assert.equal(deactivate.status, 200);
  const disabledLogin = await postJson("/api/auth/login", {
    email: "updated@example.test",
    password: "updated-user-password"
  });
  assert.equal(disabledLogin.status, 401);

  const activate = await updateUser(adminCookie, managed.id, {
    fullName: "Updated User",
    email: "updated@example.test",
    role: "user",
    isActive: true
  });
  assert.equal(activate.status, 200);

  const memberProject = await postJson("/api/projects", {
    name: "Proyecto asociado",
    framework: "Vite",
    status: "planned"
  }, await login("updated@example.test", "updated-user-password"));
  assert.equal(memberProject.status, 201);

  const deleteUser = await fetch(`${baseUrl}/api/users/${managed.id}`, {
    method: "DELETE",
    headers: { cookie: adminCookie }
  });
  assert.equal(deleteUser.status, 204);

  const projectAfterDelete = await pool.query(
    "SELECT id FROM projects WHERE id = $1",
    [(await memberProject.json()).project.id]
  );
  assert.equal(projectAfterDelete.rowCount, 0);

  const selfDelete = await fetch(`${baseUrl}/api/users/1`, {
    method: "DELETE",
    headers: { cookie: adminCookie }
  });
  assert.equal(selfDelete.status, 409);

  const demoteLastAdmin = await updateUser(adminCookie, 1, {
    fullName: "Admin",
    email: adminEmail,
    role: "user",
    isActive: true
  });
  assert.equal(demoteLastAdmin.status, 409);
});
