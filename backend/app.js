const path = require("node:path");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const helmet = require("helmet");
const jwt = require("jsonwebtoken");
const {
  validatePasswordChange,
  validateRegistration,
  validateUserUpdate
} = require("./account-validation");
const { validateProject } = require("./project-validation");

const FRONTEND_ROOT = path.resolve(__dirname, "..");
const FRONTEND_FILES = new Set([
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
]);
const SESSION_COOKIE = "despliegue_session";
const SESSION_MAX_AGE = 60 * 60 * 1000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function withUserWriteLock(pool, operation) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function publicUser(user) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt
  };
}

function createApp({
  pool,
  jwtSecret,
  nodeEnv = "development",
  bootstrapAdminEmail = ""
}) {
  if (!pool) {
    throw new Error("Se requiere una conexión a PostgreSQL para iniciar la API.");
  }
  if (typeof jwtSecret !== "string" || jwtSecret.length < 32) {
    throw new Error("JWT_SECRET debe tener al menos 32 caracteres.");
  }

  const app = express();
  const secureCookie = nodeEnv === "production";
  const cookieOptions = {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "strict",
    path: "/api",
    maxAge: SESSION_MAX_AGE
  };
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo." }
  });
  const registrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Se alcanzó el límite de registros. Inténtalo más tarde." }
  });

  app.disable("x-powered-by");
  app.set("trust proxy", nodeEnv === "production" ? 1 : false);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"]
      }
    }
  }));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "16kb" }));
  app.use(cookieParser());

  const requireAuth = asyncRoute(async (req, res, next) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) {
      return res.status(401).json({ error: "Inicia sesión para continuar." });
    }

    let claims;
    try {
      claims = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });
    } catch {
      return res.status(401).json({ error: "La sesión venció. Inicia sesión de nuevo." });
    }

    const userId = Number(claims.sub);
    if (!Number.isSafeInteger(userId) || userId < 1) {
      return res.status(401).json({ error: "La sesión no es válida." });
    }

    const result = await pool.query(
      `SELECT id, full_name AS "fullName", email, role,
              is_active AS "isActive", session_version AS "sessionVersion"
       FROM users WHERE id = $1`,
      [userId]
    );
    const user = result.rows[0];
    if (!user || !user.isActive || claims.sv !== user.sessionVersion) {
      return res.status(401).json({ error: "La sesión no es válida. Inicia sesión de nuevo." });
    }

    req.user = user;
    return next();
  });

  const requireAdmin = (req, res, next) => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Esta acción requiere permisos de administrador." });
    }
    return next();
  };

  function signSession(user) {
    const token = jwt.sign(
      { sub: String(user.id), sv: user.sessionVersion },
      jwtSecret,
      { expiresIn: "1h", algorithm: "HS256" }
    );
    return token;
  }

  app.get("/api/health", asyncRoute(async (req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  }));

  app.post("/api/auth/register", registrationLimiter, asyncRoute(async (req, res) => {
    const validation = validateRegistration(req.body);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    const { fullName, email, password } = validation.value;
    if (email === bootstrapAdminEmail) {
      return res.status(409).json({ error: "Ese correo está reservado para la cuenta administradora inicial." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, 'user')
       RETURNING id, full_name AS "fullName", email, role, is_active AS "isActive",
                 created_at AS "createdAt"`,
      [fullName, email, passwordHash]
    );
    return res.status(201).json({ user: publicUser(result.rows[0]) });
  }));

  app.post("/api/auth/login", loginLimiter, asyncRoute(async (req, res) => {
    const body = req.body || {};
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return res.status(400).json({ error: "Escribe tu correo y contraseña." });
    }

    const result = await pool.query(
      `SELECT id, full_name AS "fullName", email, password_hash AS "passwordHash",
              role, is_active AS "isActive", session_version AS "sessionVersion"
       FROM users WHERE email = $1`,
      [email]
    );
    const user = result.rows[0];
    const passwordMatches = user ? await bcrypt.compare(password, user.passwordHash) : false;

    if (!passwordMatches || !user.isActive) {
      return res.status(401).json({ error: "Correo o contraseña incorrectos." });
    }

    return res
      .cookie(SESSION_COOKIE, signSession(user), cookieOptions)
      .json({ user: publicUser(user) });
  }));

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      secure: secureCookie,
      sameSite: "strict",
      path: "/api"
    });
    res.status(204).end();
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  app.post("/api/auth/change-password", requireAuth, asyncRoute(async (req, res) => {
    const validation = validatePasswordChange(req.body);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    const result = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [req.user.id]
    );
    const matches = result.rows[0]
      ? await bcrypt.compare(validation.value.currentPassword, result.rows[0].password_hash)
      : false;
    if (!matches) {
      return res.status(401).json({ error: "La contraseña actual es incorrecta." });
    }

    const passwordHash = await bcrypt.hash(validation.value.newPassword, 12);
    const updated = await pool.query(
      `UPDATE users
       SET password_hash = $1, session_version = session_version + 1, updated_at = NOW()
       WHERE id = $2 AND is_active = TRUE
       RETURNING id, full_name AS "fullName", email, role, is_active AS "isActive",
                 session_version AS "sessionVersion", created_at AS "createdAt"`,
      [passwordHash, req.user.id]
    );
    const user = updated.rows[0];
    if (!user) {
      return res.status(401).json({ error: "La cuenta ya no está activa." });
    }

    return res
      .cookie(SESSION_COOKIE, signSession(user), cookieOptions)
      .json({ user: publicUser(user) });
  }));

  app.get("/api/users", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
    const result = await pool.query(
      `SELECT id, full_name AS "fullName", email, role, is_active AS "isActive",
              created_at AS "createdAt"
       FROM users ORDER BY created_at DESC, id DESC`
    );
    res.json({ users: result.rows.map(publicUser) });
  }));

  app.post("/api/users", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
    const validation = validateRegistration(req.body);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    const role = req.body.role === undefined ? "user" : req.body.role;
    if (!["user", "admin"].includes(role)) {
      return res.status(400).json({ error: "Selecciona un rol válido." });
    }
    if (validation.value.email === bootstrapAdminEmail && role !== "admin") {
      return res.status(400).json({ error: "La cuenta administradora inicial debe conservar su rol." });
    }

    const passwordHash = await bcrypt.hash(validation.value.password, 12);
    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name AS "fullName", email, role, is_active AS "isActive",
                 created_at AS "createdAt"`,
      [validation.value.fullName, validation.value.email, passwordHash, role]
    );
    return res.status(201).json({ user: publicUser(result.rows[0]) });
  }));

  app.put("/api/users/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isSafeInteger(userId) || userId < 1) {
      return res.status(400).json({ error: "El identificador de usuario no es válido." });
    }

    const validation = validateUserUpdate(req.body);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }
    const update = validation.value;
    if (userId === req.user.id
      && (update.role !== req.user.role || update.isActive !== req.user.isActive)) {
      return res.status(409).json({ error: "No puedes cambiar tu propio rol ni desactivar tu cuenta." });
    }
    if (userId === req.user.id && update.password) {
      return res.status(400).json({ error: "Usa la sección de cambio de contraseña de tu cuenta." });
    }
    if (update.email === bootstrapAdminEmail && update.role !== "admin") {
      return res.status(400).json({ error: "La cuenta administradora inicial debe conservar su rol." });
    }
    const passwordHash = update.password
      ? await bcrypt.hash(update.password, 12)
      : null;

    const updatedUser = await withUserWriteLock(pool, async (client) => {
      const currentResult = await client.query(
        `SELECT id, role, is_active AS "isActive"
         FROM users WHERE id = $1 FOR UPDATE`,
        [userId]
      );
      const current = currentResult.rows[0];
      if (!current) {
        throw new HttpError(404, "No se encontró esa cuenta.");
      }

      const remainsActiveAdmin = update.role === "admin" && update.isActive;
      if (current.role === "admin" && current.isActive && !remainsActiveAdmin) {
        const admins = await client.query(
          "SELECT COUNT(*)::INTEGER AS count FROM users WHERE role = 'admin' AND is_active = TRUE"
        );
        if (admins.rows[0].count <= 1) {
          throw new HttpError(409, "Debe quedar al menos un administrador activo.");
        }
      }

      const result = await client.query(
        `UPDATE users
         SET full_name = $1,
             email = $2,
             role = $3,
             is_active = $4,
             password_hash = COALESCE($5, password_hash),
             session_version = CASE
               WHEN $5::TEXT IS NOT NULL OR is_active <> $4 THEN session_version + 1
               ELSE session_version
             END,
             updated_at = NOW()
         WHERE id = $6
         RETURNING id, full_name AS "fullName", email, role, is_active AS "isActive",
                   created_at AS "createdAt"`,
        [update.fullName, update.email, update.role, update.isActive, passwordHash, userId]
      );
      return result.rows[0];
    });

    return res.json({ user: publicUser(updatedUser) });
  }));

  app.delete("/api/users/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isSafeInteger(userId) || userId < 1) {
      return res.status(400).json({ error: "El identificador de usuario no es válido." });
    }
    if (userId === req.user.id) {
      return res.status(409).json({ error: "No puedes eliminar la cuenta con la que iniciaste sesión." });
    }

    await withUserWriteLock(pool, async (client) => {
      const targetResult = await client.query(
        "SELECT id, role, is_active FROM users WHERE id = $1 FOR UPDATE",
        [userId]
      );
      const target = targetResult.rows[0];
      if (!target) {
        throw new HttpError(404, "No se encontró esa cuenta.");
      }

      if (target.role === "admin" && target.is_active) {
        const admins = await client.query(
          "SELECT COUNT(*)::INTEGER AS count FROM users WHERE role = 'admin' AND is_active = TRUE"
        );
        if (admins.rows[0].count <= 1) {
          throw new HttpError(409, "No puedes eliminar al último administrador activo.");
        }
      }

      await client.query("DELETE FROM users WHERE id = $1", [userId]);
    });
    return res.status(204).end();
  }));

  app.get("/api/projects", requireAuth, asyncRoute(async (req, res) => {
    const result = await pool.query(
      `SELECT id, name, framework, url, status, created_at, updated_at
       FROM projects
       WHERE owner_id = $1
       ORDER BY created_at DESC, id DESC`,
      [req.user.id]
    );
    res.json({ projects: result.rows });
  }));

  app.post("/api/projects", requireAuth, asyncRoute(async (req, res) => {
    const validation = validateProject(req.body);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    const { name, framework, url, status } = validation.value;
    const result = await pool.query(
      `INSERT INTO projects (owner_id, name, framework, url, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, framework, url, status, created_at, updated_at`,
      [req.user.id, name, framework, url, status]
    );
    return res.status(201).json({ project: result.rows[0] });
  }));

  app.put("/api/projects/:id", requireAuth, asyncRoute(async (req, res) => {
    const projectId = Number(req.params.id);
    if (!Number.isSafeInteger(projectId) || projectId < 1) {
      return res.status(400).json({ error: "El identificador del proyecto no es válido." });
    }

    const validation = validateProject(req.body);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    const { name, framework, url, status } = validation.value;
    const result = await pool.query(
      `UPDATE projects
       SET name = $1, framework = $2, url = $3, status = $4, updated_at = NOW()
       WHERE id = $5 AND owner_id = $6
       RETURNING id, name, framework, url, status, created_at, updated_at`,
      [name, framework, url, status, projectId, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "No se encontró ese proyecto." });
    }
    return res.json({ project: result.rows[0] });
  }));

  app.delete("/api/projects/:id", requireAuth, asyncRoute(async (req, res) => {
    const projectId = Number(req.params.id);
    if (!Number.isSafeInteger(projectId) || projectId < 1) {
      return res.status(400).json({ error: "El identificador del proyecto no es válido." });
    }

    const result = await pool.query(
      "DELETE FROM projects WHERE id = $1 AND owner_id = $2",
      [projectId, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "No se encontró ese proyecto." });
    }
    return res.status(204).end();
  }));

  app.get("/", (req, res, next) => {
    res.sendFile(path.join(FRONTEND_ROOT, "index.Html"), (error) => {
      if (error) next(error);
    });
  });

  app.get("/:asset", (req, res, next) => {
    if (!FRONTEND_FILES.has(req.params.asset)) {
      return next();
    }
    return res.sendFile(path.join(FRONTEND_ROOT, req.params.asset), (error) => {
      if (error) next(error);
    });
  });

  app.use((err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }

    if (err.code === "23505") {
      return res.status(409).json({ error: "Ese correo ya está registrado." });
    }
    if (err.type === "entity.parse.failed" || err.type === "entity.too.large") {
      const status = err.type === "entity.too.large" ? 413 : 400;
      return res.status(status).json({
        error: status === 413 ? "La solicitud supera el tamaño permitido." : "El JSON enviado no es válido."
      });
    }

    console.error(err);
    const status = err instanceof HttpError
      ? err.status
      : Number.isInteger(err.status) && err.status >= 400 && err.status < 500
        ? err.status
        : 500;
    const message = err instanceof HttpError
      ? err.message
      : status === 500
        ? "Error interno del servidor."
        : "La solicitud no es válida.";
    return res.status(status).json({ error: message });
  });

  return app;
}

module.exports = { createApp };
