const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validatePasswordChange,
  validateRegistration,
  validateUserUpdate
} = require("../backend/account-validation");

test("normalizes registration and never accepts a caller-selected role", () => {
  const result = validateRegistration({
    fullName: "  Ana Pérez ",
    email: "  ANA@example.com ",
    password: "a-strong-password",
    role: "admin"
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      fullName: "Ana Pérez",
      email: "ana@example.com",
      password: "a-strong-password"
    }
  });
  assert.equal(Object.hasOwn(result.value, "role"), false);
});

test("rejects short passwords and invalid email or name", () => {
  assert.equal(validateRegistration({
    fullName: "Ana",
    email: "ana@example.com",
    password: "short"
  }).ok, false);
  assert.equal(validateRegistration({
    fullName: "Ana",
    email: "not-an-email",
    password: "a-strong-password"
  }).ok, false);
  assert.equal(validateRegistration({
    fullName: " ",
    email: "ana@example.com",
    password: "a-strong-password"
  }).ok, false);
});

test("validates administrative account changes and optional password", () => {
  const result = validateUserUpdate({
    fullName: "Ana",
    email: "ANA@example.com",
    role: "admin",
    isActive: true,
    password: ""
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.email, "ana@example.com");
  assert.equal(result.value.password, null);
  assert.equal(validateUserUpdate({
    fullName: "Ana",
    email: "ana@example.com",
    role: "owner",
    isActive: true
  }).ok, false);
  assert.equal(validateUserUpdate({
    fullName: "Ana",
    email: "ana@example.com",
    role: "user",
    isActive: "false"
  }).ok, false);
});

test("requires the current password and a different strong replacement", () => {
  assert.equal(validatePasswordChange({
    currentPassword: "old-password",
    newPassword: "new-password-123"
  }).ok, true);
  assert.equal(validatePasswordChange({
    currentPassword: "same-password",
    newPassword: "same-password"
  }).ok, false);
});
