const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
const assets = [
  "index.Html",
  "Basico.Html",
  "Ramas.Html",
  "Frameworks.Html",
  "Dominios.Html",
  "Proyectos.Html",
  "Styles.Css",
  "Scripts.Js",
  "ChecklistProgress.Js",
  "Projects.Js"
];

async function buildFrontend() {
  await fs.mkdir(output, { recursive: true });

  for (const asset of assets) {
    await fs.copyFile(path.join(root, asset), path.join(output, asset));
  }
  await fs.copyFile(path.join(root, "index.Html"), path.join(output, "index.html"));
  console.log(`Sitio estático preparado en ${output}.`);
}

buildFrontend().catch((error) => {
  console.error("No se pudo preparar el sitio estático:", error);
  process.exitCode = 1;
});
