const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pages = [
  "index.Html",
  "Basico.Html",
  "Ramas.Html",
  "Frameworks.Html",
  "Dominios.Html",
  "Proyectos.Html"
];

test("all local page, stylesheet, and script links resolve with exact casing", () => {
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    const references = [...html.matchAll(/(?:href|src)="([^"]+)"/g)];

    assert.ok(references.length > 0, `${page} should contain local references`);

    for (const [, reference] of references) {
      if (/^(?:[a-z]+:|#|\/)/i.test(reference)) {
        continue;
      }

      const target = path.resolve(root, path.dirname(page), reference);
      assert.ok(fs.existsSync(target), `${page} references missing file: ${reference}`);
      assert.ok(
        fs.readdirSync(path.dirname(target)).includes(path.basename(target)),
        `${page} reference has incorrect filename casing: ${reference}`
      );
    }
  }
});

test("the home page loads checklist logic before the app script", () => {
  const html = fs.readFileSync(path.join(root, "index.Html"), "utf8");

  assert.match(html, /id="deploy-checklist"/);
  assert.ok(
    html.indexOf('src="ChecklistProgress.Js"') < html.indexOf('src="Scripts.Js"'),
    "ChecklistProgress.Js must load before Scripts.Js"
  );
});
