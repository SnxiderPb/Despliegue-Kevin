const path = require("node:path");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const helmet = require("helmet");
const jwt = require("jsonwebtoken");
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

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function createApp({ pool, jwtSecret, nodeEnv = "development" }) {
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
      claims = jwt.verify(token, jwtSecret);
    } catch {
      return res.status(401).json({ error: "La sesión venció. Inicia sesión de nuevo." });
    }

    const userId = Number(claims.sub);
    if (!Number.isSafeInteger(userId) || userId < 1) {
      return res.status(401).json({ error: "La sesión no es válida." });
    }

    const result = await pool.query(
      "SELECT id, email FROM users WHERE id = $1",
      [userId]
    );
    if (result.rowCount === 0) {
      return res.status(401).json({ error: "La sesión no es válida." });
    }

    req.user = result.rows[0];
    return next();
  });

  app.get("/api/health", asyncRoute(async (req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  }));

  app.post("/api/auth/login", loginLimiter, asyncRoute(async (req, res) => {
    const body = req.body || {};
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return res.status(400).json({ error: "Escribe tu correo y contraseña." });
    }

    const result = await pool.query(
      "SELECT id, email, password_hash FROM users WHERE email = $1",
      [email]
    );
    const user = result.rows[0];
    const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;

    if (!passwordMatches) {
      return res.status(401).json({ error: "Correo o contraseña incorrectos." });
    }

    const token = jwt.sign({ sub: String(user.id) }, jwtSecret, { expiresIn: "1h" });
    return res
      .cookie(SESSION_COOKIE, token, cookieOptions)
      .json({ user: { id: user.id, email: user.email } });
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
    res.json({ user: req.user });
  });

  app.get("/api/projects", requireAuth, asyncRoute(async (req, res) => {
    const result = await pool.query(
      `SELECT id, name, framework, url, status, created_at, updated_at
       FROM projects
       ORDER BY created_at DESC, id DESC`
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
      `INSERT INTO projects (name, framework, url, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, framework, url, status, created_at, updated_at`,
      [name, framework, url, status]
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
       WHERE id = $5
       RETURNING id, name, framework, url, status, created_at, updated_at`,
      [name, framework, url, status, projectId]
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

    const result = await pool.query("DELETE FROM projects WHERE id = $1", [projectId]);
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
    console.error(err);
    if (res.headersSent) {
      return next(err);
    }
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500
      ? err.status
      : 500;
    return res.status(status).json({
      error: status === 500 ? "Error interno del servidor." : "La solicitud no es válida."
    });
  });

  return app;
}

module.exports = { createApp };
