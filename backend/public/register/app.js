const registerEls = {
  registerForm: document.getElementById("registerForm"),
  nombre: document.getElementById("nombre"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  registerMessage: document.getElementById("registerMessage")
};

const registerFieldMap = {
  nombre: registerEls.nombre,
  email: registerEls.email,
  password: registerEls.password
};

const setRegisterMessage = (message, state = "info") => {
  if (!registerEls.registerMessage) return;
  registerEls.registerMessage.textContent = message;
  registerEls.registerMessage.dataset.state = state;
};

const clearRegisterFieldState = () => {
  Object.values(registerFieldMap).forEach((field) => {
    if (!field) return;
    field.removeAttribute("aria-invalid");
    field.removeAttribute("data-error");
    field.removeAttribute("title");
  });
};

const applyRegisterFieldErrors = (details = []) => {
  details.forEach(({ field, msg }) => {
    const input = registerFieldMap[field];
    if (!input) return;
    input.setAttribute("aria-invalid", "true");
    input.dataset.error = "true";
    input.title = msg;
  });
};

const resolveExistingSession = async () => {
  const token = localStorage.getItem("token") || "";
  if (!token) {
    return false;
  }

  try {
    await api("/api/auth/me");
    window.location.href = "../dashboard/";
    return true;
  } catch (error) {
    if (error.status === 401) {
      localStorage.removeItem("token");
    }
    return false;
  }
};

const initRegisterPage = async () => {
  const hasValidSession = await resolveExistingSession();
  if (hasValidSession) return;

  if (!registerEls.registerForm) return;

  Object.values(registerFieldMap).forEach((field) => {
    if (!field) return;
    field.addEventListener("input", () => {
      field.removeAttribute("aria-invalid");
      field.removeAttribute("data-error");
      field.removeAttribute("title");
      if (registerEls.registerMessage?.dataset.state === "error") {
        setRegisterMessage("Crea una cuenta para entrar al monitor y gestionar alertas.", "info");
      }
    });
  });

  registerEls.registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearRegisterFieldState();
    setRegisterMessage("Validando datos...", "info");

    try {
      await api("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: registerEls.nombre.value.trim(),
          email: registerEls.email.value.trim(),
          password: registerEls.password.value
        })
      });

      setRegisterMessage("Registro exitoso. Redirigiendo al login...", "success");
      registerEls.password.value = "";
      setTimeout(() => {
        window.location.href = "../login/";
      }, 800);
    } catch (error) {
      applyRegisterFieldErrors(error.details || []);
      setRegisterMessage(error.message, "error");
    }
  });
};

window.addEventListener("load", () => {
  initRegisterPage().catch((error) => {
    console.error("No se pudo inicializar la pantalla de registro.", error);
  });
});
