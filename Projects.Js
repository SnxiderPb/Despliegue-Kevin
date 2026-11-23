document.addEventListener("DOMContentLoaded", () => {
  const authPanel = document.getElementById("auth-panel");
  const loginForm = document.getElementById("login-form");
  const dashboard = document.getElementById("projects-dashboard");
  const projectForm = document.getElementById("project-form");
  const feedback = document.getElementById("project-feedback");
  const projectList = document.getElementById("projects-list");
  const projectCount = document.getElementById("project-count");
  const emptyState = document.getElementById("empty-projects");
  const projectId = document.getElementById("project-id");
  const saveButton = document.getElementById("save-project");
  const cancelEditButton = document.getElementById("cancel-edit");
  const statusLabels = {
    planned: "Planeado",
    in_progress: "En progreso",
    deployed: "Publicado"
  };

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

    const response = await fetch(`/api${path}`, {
      ...options,
      headers,
      credentials: "same-origin"
    });

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

  function setAuthenticated(isAuthenticated) {
    authPanel.hidden = isAuthenticated;
    dashboard.hidden = !isAuthenticated;
    if (!isAuthenticated) {
      loginForm.reset();
    }
  }

  function appendCell(row, value) {
    const cell = document.createElement("td");
    cell.textContent = value;
    row.appendChild(cell);
    return cell;
  }

  function createActionButton(label, action, projectIdValue, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset.action = action;
    button.dataset.id = String(projectIdValue);
    button.textContent = label;
    return button;
  }

  function renderProjects(projects) {
    projectList.replaceChildren();
    projectCount.textContent = String(projects.length);
    emptyState.hidden = projects.length > 0;

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
    renderProjects(result.projects);
  }

  function resetProjectForm() {
    projectForm.reset();
    projectId.value = "";
    saveButton.textContent = "Guardar proyecto";
    cancelEditButton.hidden = true;
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const submitButton = loginForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    showFeedback("");

    try {
      await request("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password")
        })
      });
      setAuthenticated(true);
      await loadProjects();
      showFeedback("Sesión iniciada correctamente.");
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
    saveButton.disabled = true;
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
      saveButton.disabled = false;
    }
  });

  projectList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const project = [...projectList.querySelectorAll("tr")]
      .map((row) => row.dataset.project)
      .filter(Boolean)
      .map((serialized) => JSON.parse(serialized))
      .find((item) => String(item.id) === button.dataset.id);

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
      saveButton.textContent = "Guardar cambios";
      cancelEditButton.hidden = false;
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

  cancelEditButton.addEventListener("click", resetProjectForm);

  document.getElementById("logout-button").addEventListener("click", async () => {
    try {
      await request("/auth/logout", { method: "POST" });
      setAuthenticated(false);
      renderProjects([]);
      showFeedback("Sesión cerrada.");
    } catch (error) {
      showFeedback(error.message, true);
    }
  });

  async function initialize() {
    try {
      await request("/auth/me");
      setAuthenticated(true);
      await loadProjects();
    } catch (error) {
      if (error.status === 401) {
        setAuthenticated(false);
      } else {
        showFeedback(error.message, true);
      }
    }
  }

  initialize();
});
