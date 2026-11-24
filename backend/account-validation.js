const ROLES = ["admin", "user"];
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_BYTES = 72;

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validateEmail(email) {
  return email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  return typeof password === "string"
    && password.length >= MIN_PASSWORD_LENGTH
    && Buffer.byteLength(password, "utf8") <= MAX_PASSWORD_BYTES;
}

function validateRegistration(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Completa los datos de registro." };
  }

  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  const email = normalizeEmail(input.email);

  if (!fullName || fullName.length > 100) {
    return { ok: false, error: "El nombre es obligatorio y debe tener hasta 100 caracteres." };
  }
  if (!validateEmail(email)) {
    return { ok: false, error: "Escribe un correo electrónico válido." };
  }
  if (!validatePassword(input.password)) {
    return {
      ok: false,
      error: `La contraseña debe tener entre ${MIN_PASSWORD_LENGTH} y ${MAX_PASSWORD_BYTES} bytes UTF-8.`
    };
  }

  return { ok: true, value: { fullName, email, password: input.password } };
}

function validateUserUpdate(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Envía los datos de la cuenta." };
  }

  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  const email = normalizeEmail(input.email);
  const role = input.role;

  if (!fullName || fullName.length > 100) {
    return { ok: false, error: "El nombre es obligatorio y debe tener hasta 100 caracteres." };
  }
  if (!validateEmail(email)) {
    return { ok: false, error: "Escribe un correo electrónico válido." };
  }
  if (!ROLES.includes(role)) {
    return { ok: false, error: "Selecciona un rol válido." };
  }
  if (typeof input.isActive !== "boolean") {
    return { ok: false, error: "El estado de la cuenta debe ser activo o inactivo." };
  }
  if (input.password !== undefined && input.password !== "" && !validatePassword(input.password)) {
    return {
      ok: false,
      error: `La contraseña nueva debe tener entre ${MIN_PASSWORD_LENGTH} y ${MAX_PASSWORD_BYTES} bytes UTF-8.`
    };
  }

  return {
    ok: true,
    value: {
      fullName,
      email,
      role,
      isActive: input.isActive,
      password: input.password || null
    }
  };
}

function validatePasswordChange(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Completa las contraseñas." };
  }

  if (typeof input.currentPassword !== "string" || !input.currentPassword) {
    return { ok: false, error: "Escribe tu contraseña actual." };
  }
  if (!validatePassword(input.newPassword)) {
    return {
      ok: false,
      error: `La contraseña nueva debe tener entre ${MIN_PASSWORD_LENGTH} y ${MAX_PASSWORD_BYTES} bytes UTF-8.`
    };
  }
  if (input.currentPassword === input.newPassword) {
    return { ok: false, error: "La contraseña nueva debe ser diferente a la actual." };
  }

  return {
    ok: true,
    value: {
      currentPassword: input.currentPassword,
      newPassword: input.newPassword
    }
  };
}

module.exports = {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  ROLES,
  validatePasswordChange,
  validateRegistration,
  validateUserUpdate
};
