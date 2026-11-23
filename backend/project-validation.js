const PROJECT_STATUSES = ["planned", "in_progress", "deployed"];

function validateProject(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Envía los datos del proyecto." };
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const framework = typeof input.framework === "string" ? input.framework.trim() : "";
  const status = input.status === undefined ? "planned" : input.status;
  const rawUrl = typeof input.url === "string" ? input.url.trim() : "";

  if (input.url !== undefined && input.url !== null && typeof input.url !== "string") {
    return { ok: false, error: "La URL debe ser texto." };
  }

  if (!name || name.length > 120) {
    return { ok: false, error: "El nombre es obligatorio y debe tener hasta 120 caracteres." };
  }

  if (!framework || framework.length > 80) {
    return { ok: false, error: "El framework es obligatorio y debe tener hasta 80 caracteres." };
  }

  if (!PROJECT_STATUSES.includes(status)) {
    return { ok: false, error: "Selecciona un estado válido." };
  }

  let url = null;
  if (rawUrl) {
    if (rawUrl.length > 2048) {
      return { ok: false, error: "La URL no puede superar 2048 caracteres." };
    }

    try {
      const parsedUrl = new URL(rawUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return { ok: false, error: "La URL debe comenzar con http:// o https://." };
      }
      url = parsedUrl.toString();
    } catch {
      return { ok: false, error: "Escribe una URL válida." };
    }
  }

  return { ok: true, value: { name, framework, url, status } };
}

module.exports = { PROJECT_STATUSES, validateProject };
