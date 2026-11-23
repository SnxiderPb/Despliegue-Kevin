const test = require("node:test");
const assert = require("node:assert/strict");
const { validateProject } = require("../backend/project-validation");

test("normalizes valid project fields and supplies the default status", () => {
  const result = validateProject({
    name: "  Sitio Kevin  ",
    framework: " HTML/CSS/JS ",
    url: "https://example.com"
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      name: "Sitio Kevin",
      framework: "HTML/CSS/JS",
      url: "https://example.com/",
      status: "planned"
    }
  });
});

test("rejects invalid URLs and unsupported protocols", () => {
  assert.equal(validateProject({
    name: "Sitio",
    framework: "HTML",
    url: "not a url"
  }).ok, false);

  assert.equal(validateProject({
    name: "Sitio",
    framework: "HTML",
    url: "javascript:alert(1)"
  }).ok, false);

  assert.equal(validateProject({
    name: "Sitio",
    framework: "HTML",
    url: 123
  }).ok, false);
});

test("rejects missing names and invalid statuses", () => {
  assert.equal(validateProject({ name: "", framework: "HTML" }).ok, false);
  assert.equal(validateProject({
    name: "Sitio",
    framework: "HTML",
    status: "unknown"
  }).ok, false);
});
