document.addEventListener("DOMContentLoaded", () => {
  const authPanel = document.getElementById("auth-panel");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const dashboard = document.getElementById("projects-dashboard");
  const projectForm = document.getElementById("project-form");
  const userForm = document.getElementById("user-form");
  const passwordForm = document.getElementById("password-form");
  const feedback = document.getElementById("project-feedback");
  const projectList = document.getElementById("projects-list");
  const usersList = document.getElementById("users-list");
  const projectCount = document.getElementById("project-count");
  const emptyProjects = document.getElementById("empty-projects");
  const emptyUsers = document.getElementById("empty-users");
  const projectId = document.getElementById("project-id");
  const userId = document.getElementById("user-id");
  const saveProjectButton = document.getElementById("save-project");
  const saveUserButton = document.getElementById("save-user");
  const cancelProjectEditButton = document.getElementById("cancel-edit");
  const cancelUserEditButton = document.getElementById("cancel-user-edit");
  const loginTitle = document.getElementById("login-title");
  const authDescription = document.getElementById("auth-description");
  const projectsPanel = document.getElementById("projects-panel");
  const usersPanel = document.getElementById("users-panel");
  const showProjectsButton = document.getElementById("show-projects");
  const showUsersButton = document.getElementById("show-users");
  const statusLabels = {
    planned: "Planeado",
    in_progress: "En progreso",
    deployed: "Publicado"
  };
  let currentUser = null;
  let projects = [];
  let users = [];

  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  }

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body) {
      headers.set("Content-Type", "application/json");
    }

    let response;
    try {
      response = await fetch(`/api${path}`, {
        ...options,
        headers,
        credentials: "same-origin"
      });
    } catch {
      throw new Error("No se pudo conectar con la API. Comprueba que Docker esté iniciado.");
    }

    if (response.status === 204) {
      return null;
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error("La API no respondió en JSON. Inicia el backend con Docker o configura su dominio en Vercel.");
    }

    if (!response.ok) {
      throw new ApiError(payload.error || "No se pudo completar la solicitud.", response.status);
    }
    return payload;
  }

  function showFeedback(message, isError = false) {
    feedback.textContent = message;
    feedback.classList.toggle("is-error", isError);
    feedback.classList.toggle("is-success", Boolean(message) && !isError);
    feedback.setAttribute("role", isError ? "alert" : "status");
  }

  function showAuthMode(mode) {
    const registering = mode === "register";
    loginForm.hidden = registering;
    registerForm.hidden = !registering;
    document.getElementById("show-login").classList.toggle("active", !registering);
    document.getElementById("show-register").classList.toggle("active", registering);
    document.getElementById("show-login").setAttribute("aria-selected", String(!registering));
    document.getElementById("show-register").setAttribute("aria-selected", String(registering));
    loginTitle.textContent = registering ? "Crea tu cuenta" : "Bienvenido de nuevo";
    authDescription.textContent = registering
      ? "Regístrate para administrar tus propios proyectos."
      : "Ingresa con tu correo y contraseña para administrar tus proyectos.";
    showFeedback("");
  }

  function setAuthenticated(user) {
    currentUser = user;
    const isAuthenticated = Boolean(user);
    authPanel.hidden = isAuthenticated;
    dashboard.hidden = !isAuthenticated;
    if (!isAuthenticated) {
      loginForm.reset();
      registerForm.reset();
      showAuthMode("login");
      return;
    }

    document.getElementById("account-name").textContent = user.fullName;
    document.getElementById("account-email").textContent = user.email;
    const roleBadge = document.getElementById("account-role");
    roleBadge.textContent = user.role === "admin" ? "Administrador" : "Usuario";
    roleBadge.classList.toggle("is-admin", user.role === "admin");
    showUsersButton.hidden = user.role !== "admin";
    showDashboardPanel("projects");
  }

  function showDashboardPanel(panel) {
    const showUserManagement = panel === "users" && currentUser?.role === "admin";
    projectsPanel.hidden = showUserManagement;
    usersPanel.hidden = !showUserManagement;
    showProjectsButton.classList.toggle("active", !showUserManagement);
    showUsersButton.classList.toggle("active", showUserManagement);
    showProjectsButton.setAttribute("aria-selected", String(!showUserManagement));
    showUsersButton.setAttribute("aria-selected", String(showUserManagement));
    if (showUserManagement) {
      loadUsers();
    }
  }

  function appendCell(row, value) {
    const cell = document.createElement("td");
    cell.textContent = value;
    row.appendChild(cell);
    return cell;
  }

  function createActionButton(label, action, id, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset.action = action;
    button.dataset.id = String(id);
    button.textContent = label;
    return button;
  }

  function renderProjects() {
    projectList.replaceChildren();
    projectCount.textContent = String(projects.length);
    emptyProjects.hidden = projects.length > 0;

    for (const project of projects) {
      const row = document.createElement("tr");
      row.dataset.id = String(project.id);
      row.dataset.project = JSON.stringify(project);
      appendCell(row, project.name);
      appendCell(row, project.framework);

      const statusCell = appendCell(row, statusLabels[project.status] || project.status);
      statusCell.classList.add("project-status", `status-${project.status}`);

      const urlCell = document.createElement("td");
      if (project.url) {
        const link = document.createElement("a");
        link.href = project.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = project.url;
        urlCell.appendChild(link);
      } else {
        urlCell.textContent = "—";
      }
      row.appendChild(urlCell);

      const createdDate = new Date(project.created_at);
      appendCell(row, Number.isNaN(createdDate.getTime())
        ? "—"
        : new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(createdDate));

      const actions = document.createElement("td");
      actions.className = "project-actions";
      actions.append(
        createActionButton("Editar", "edit", project.id, "btn-secondary"),
        createActionButton("Eliminar", "delete", project.id, "btn-danger")
      );
      row.appendChild(actions);
      projectList.appendChild(row);
    }
  }

  async function loadProjects() {
    const result = await request("/projects");
    projects = result.projects;
    renderProjects();
  }

  async function loadUsers() {
    try {
      const result = await request("/users");
      users = result.users;
      renderUsers();
    } catch (error) {
      showFeedback(error.message, true);
    }
  }

  function renderUsers() {
    usersList.replaceChildren();
    const otherUsers = users.filter((user) => user.id !== currentUser.id);
    emptyUsers.hidden = otherUsers.length > 0;

    for (const user of users) {
      const row = document.createElement("tr");
      row.dataset.user = JSON.stringify(user);
      appendCell(row, user.fullName);
      appendCell(row, user.email);
      appendCell(row, user.role === "admin" ? "Administrador" : "Usuario");
      appendCell(row, user.isActive ? "Activa" : "Inactiva");

      const createdDate = new Date(user.createdAt);
      appendCell(row, Number.isNaN(createdDate.getTime())
        ? "—"
        : new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(createdDate));

      const actions = document.createElement("td");
      actions.className = "project-actions";
      actions.appendChild(createActionButton("Editar", "edit", user.id, "btn-secondary"));
      if (user.id !== currentUser.id) {
        actions.appendChild(createActionButton("Eliminar", "delete", user.id, "btn-danger"));
      }
      row.appendChild(actions);
      usersList.appendChild(row);
    }
  }

  function resetProjectForm() {
    projectForm.reset();
    projectId.value = "";
    saveProjectButton.textContent = "Guardar proyecto";
    cancelProjectEditButton.hidden = true;
  }

  function resetUserForm() {
    userForm.reset();
    userId.value = "";
    document.getElementById("user-active").value = "true";
    document.getElementById("user-role").disabled = false;
    document.getElementById("user-active").disabled = false;
    document.getElementById("user-password").disabled = false;
    document.getElementById("user-password").required = true;
    document.getElementById("user-password-hint").textContent = "(obligatoria al crear)";
    saveUserButton.textContent = "Crear usuario";
    cancelUserEditButton.hidden = true;
  }

  async function login(email, password) {
    const result = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    setAuthenticated(result.user);
    await loadProjects();
    showFeedback("Sesión iniciada correctamente.");
  }

  document.getElementById("show-login").addEventListener("click", () => showAuthMode("login"));
  document.getElementById("show-register").addEventListener("click", () => showAuthMode("register"));
  showProjectsButton.addEventListener("click", () => showDashboardPanel("projects"));
  showUsersButton.addEventListener("click", () => showDashboardPanel("users"));

  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      const showPassword = input.type === "password";
      input.type = showPassword ? "text" : "password";
      button.textContent = showPassword ? "Ocultar" : "Mostrar";
      button.setAttribute("aria-label", showPassword ? "Ocultar contraseña" : "Mostrar contraseña");
      button.setAttribute("aria-pressed", String(showPassword));
    });
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const submitButton = loginForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    showFeedback("");
    try {
      await login(formData.get("email"), formData.get("password"));
    } catch (error) {
      showFeedback(error.message, true);
    } finally {
      submitButton.disabled = false;
    }
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(registerForm);
    const submitButton = registerForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    showFeedback("");
    try {
      await request("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          fullName: formData.get("fullName"),
          email: formData.get("email"),
          password: formData.get("password")
        })
      });
      await login(formData.get("email"), formData.get("password"));
    } catch (error) {
      showFeedback(error.message, true);
    } finally {
      submitButton.disabled = false;
    }
  });

  projectForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(projectForm);
    const id = projectId.value;
    const project = {
      name: formData.get("name"),
      framework: formData.get("framework"),
      url: formData.get("url"),
      status: formData.get("status")
    };
    saveProjectButton.disabled = true;
    showFeedback("");
    try {
      await request(id ? `/projects/${id}` : "/projects", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(project)
      });
      resetProjectForm();
      await loadProjects();
      showFeedback(id ? "Proyecto actualizado." : "Proyecto creado.");
    } catch (error) {
      showFeedback(error.message, true);
    } finally {
      saveProjectButton.disabled = false;
    }
  });

  projectList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }
    const project = projects.find((item) => String(item.id) === button.dataset.id);
    if (!project) {
      await loadProjects();
      return;
    }
    if (button.dataset.action === "edit") {
      projectId.value = String(project.id);
      projectForm.elements.name.value = project.name;
      projectForm.elements.framework.value = project.framework;
      projectForm.elements.url.value = project.url || "";
      projectForm.elements.status.value = project.status;
      saveProjectButton.textContent = "Guardar cambios";
      cancelProjectEditButton.hidden = false;
      document.getElementById("project-name").focus();
      return;
    }
    if (!window.confirm(`¿Eliminar el proyecto "${project.name}"?`)) {
      return;
    }

    button.disabled = true;
    try {
      await request(`/projects/${project.id}`, { method: "DELETE" });
      if (projectId.value === String(project.id)) {
        resetProjectForm();
      }
      await loadProjects();
      showFeedback("Proyecto eliminado.");
    } catch (error) {
      showFeedback(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  cancelProjectEditButton.addEventListener("click", resetProjectForm);

  userForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = userId.value;
    const password = userForm.elements.password.value;
    const user = {
      fullName: userForm.elements.fullName.value,
      email: userForm.elements.email.value,
      role: userForm.elements.role.value,
      isActive: userForm.elements.isActive.value === "true"
    };
    if (password) {
      user.password = password;
    }
    saveUserButton.disabled = true;
    showFeedback("");
    try {
      await request(id ? `/users/${id}` : "/users", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(user)
      });
      resetUserForm();
      await loadUsers();
      showFeedback(id ? "Cuenta actualizada." : "Usuario creado.");
    } catch (error) {
      showFeedback(error.message, true);
    } finally {
      saveUserButton.disabled = false;
    }
  });

  usersList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }
    const user = users.find((item) => String(item.id) === button.dataset.id);
    if (!user) {
      await loadUsers();
      return;
    }
    if (button.dataset.action === "edit") {
      userId.value = String(user.id);
      userForm.elements.fullName.value = user.fullName;
      userForm.elements.email.value = user.email;
      userForm.elements.password.value = "";
      userForm.elements.role.value = user.role;
      userForm.elements.isActive.value = String(user.isActive);
      userForm.elements.password.required = false;
      document.getElementById("user-password-hint").textContent = "(opcional; déjala vacía para conservarla)";
      saveUserButton.textContent = "Guardar cambios";
      cancelUserEditButton.hidden = false;

      const isEditingSelf = user.id === currentUser.id;
      userForm.elements.role.disabled = isEditingSelf;
      userForm.elements.isActive.disabled = isEditingSelf;
      userForm.elements.password.disabled = isEditingSelf;
      document.getElementById("user-name").focus();
      return;
    }

    if (!window.confirm(`¿Eliminar a ${user.fullName} (${user.email})? También se eliminarán sus proyectos.`)) {
      return;
    }
    button.disabled = true;
    try {
      await request(`/users/${user.id}`, { method: "DELETE" });
      resetUserForm();
      await loadUsers();
      showFeedback("Usuario y sus proyectos eliminados.");
    } catch (error) {
      showFeedback(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  cancelUserEditButton.addEventListener("click", resetUserForm);

  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(passwordForm);
    const submitButton = passwordForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    showFeedback("");
    try {
      const result = await request("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: formData.get("currentPassword"),
          newPassword: formData.get("newPassword")
        })
      });
      setAuthenticated(result.user);
      passwordForm.reset();
      showFeedback("Contraseña actualizada. Las otras sesiones se cerraron.");
    } catch (error) {
      showFeedback(error.message, true);
    } finally {
      submitButton.disabled = false;
    }
  });

  document.getElementById("logout-button").addEventListener("click", async () => {
    try {
      await request("/auth/logout", { method: "POST" });
      setAuthenticated(null);
      projects = [];
      users = [];
      renderProjects();
      showFeedback("Sesión cerrada.");
    } catch (error) {
      showFeedback(error.message, true);
    }
  });

  async function initialize() {
    try {
      const result = await request("/auth/me");
      setAuthenticated(result.user);
      await loadProjects();
    } catch (error) {
      if (error.status === 401) {
        setAuthenticated(null);
      } else {
        showFeedback(error.message, true);
      }
    }
  }

  initialize();
});
