document.addEventListener("DOMContentLoaded", () => {
  const codeBlocks = document.querySelectorAll("pre");

  codeBlocks.forEach((pre) => {
    const wrapper = document.createElement("div");
    wrapper.className = "code-wrapper";
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn";
    copyBtn.type = "button";
    copyBtn.textContent = "Copiar";

    copyBtn.addEventListener("click", async () => {
      const code = pre.querySelector("code");
      if (!code) {
        copyBtn.textContent = "Error";
        return;
      }

      try {
        await navigator.clipboard.writeText(code.innerText);
        copyBtn.textContent = "¡Copiado!";
        copyBtn.classList.add("copied");
        setTimeout(() => {
          copyBtn.textContent = "Copiar";
          copyBtn.classList.remove("copied");
        }, 2000);
      } catch (error) {
        copyBtn.textContent = "Error";
      }
    });

    wrapper.appendChild(copyBtn);
  });

  const navContainer = document.querySelector(".nav-container");
  const navMenu = document.querySelector(".nav-menu");

  if (navContainer && navMenu) {
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "menu-toggle";
    toggleBtn.type = "button";
    toggleBtn.setAttribute("aria-label", "Abrir menú");
    toggleBtn.setAttribute("aria-expanded", "false");
    toggleBtn.textContent = "☰ Menú";

    toggleBtn.addEventListener("click", () => {
      const isOpen = navMenu.classList.toggle("open");
      toggleBtn.textContent = isOpen ? "✕ Cerrar" : "☰ Menú";
      toggleBtn.setAttribute("aria-label", isOpen ? "Cerrar menú" : "Abrir menú");
      toggleBtn.setAttribute("aria-expanded", String(isOpen));
    });

    navContainer.insertBefore(toggleBtn, navMenu);
  }

  const checklistContainer = document.getElementById("deploy-checklist");
  if (checklistContainer) {
    const tasks = [
      { id: "task-git", label: "Crear repositorio en GitHub y hacer Push del código local" },
      { id: "task-vercel", label: "Importar repositorio en Vercel y configurar Root Directory" },
      { id: "task-env", label: "Agregar variables de entorno (.env) si uso un framework" },
      { id: "task-domain", label: "Conectar dominio personalizado o verificar URL .vercel.app" },
      { id: "task-analytics", label: "Activar Vercel Analytics y verificar despliegue en main" }
    ];

    const savedState = JSON.parse(localStorage.getItem("despliegueKevinProgress")) || {};

    const renderChecklist = () => {
      const { percentage } = DespliegueKevinProgress.calculateProgress(tasks, savedState);

      checklistContainer.innerHTML = `
        <div class="checklist-header">
          <div>
            <h2>Tu Progreso de Despliegue</h2>
            <p>Marca cada paso a medida que publiques tu proyecto</p>
          </div>
          <span class="progress-badge">${percentage}% Completado</span>
        </div>
        <div class="progress-bar-bg" role="progressbar" aria-valuenow="${percentage}" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-bar-fill" style="width: ${percentage}%"></div>
        </div>
        <ul class="checklist-items">
          ${tasks.map((task) => `
            <li class="${savedState[task.id] ? "done" : ""}">
              <label>
                <input type="checkbox" data-id="${task.id}" ${savedState[task.id] ? "checked" : ""}>
                <span>${task.label}</span>
              </label>
            </li>
          `).join("")}
        </ul>
      `;

      checklistContainer.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        checkbox.addEventListener("change", (event) => {
          const input = event.currentTarget;
          const id = input.getAttribute("data-id");
          savedState[id] = input.checked;
          localStorage.setItem("despliegueKevinProgress", JSON.stringify(savedState));
          renderChecklist();
        });
      });
    };

    renderChecklist();
  }
});
