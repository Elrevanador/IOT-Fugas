const loginEls = {
  loginForm: document.getElementById("loginForm"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  authMessage: document.getElementById("authMessage")
};

const loginFieldMap = {
  email: loginEls.email,
  password: loginEls.password
};

const setLoginMessage = (message, state = "info") => {
  if (!loginEls.authMessage) return;
  loginEls.authMessage.textContent = message;
  loginEls.authMessage.dataset.state = state;
};

const clearLoginFieldState = () => {
  Object.values(loginFieldMap).forEach((field) => {
    if (!field) return;
    field.removeAttribute("aria-invalid");
    field.removeAttribute("data-error");
    field.removeAttribute("title");
  });
};

const applyLoginFieldErrors = (details = []) => {
  details.forEach(({ field, msg }) => {
    const input = loginFieldMap[field];
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

const initLoginPage = async () => {
  const hasValidSession = await resolveExistingSession();
  if (hasValidSession) return;

  if (!loginEls.loginForm) return;

  Object.values(loginFieldMap).forEach((field) => {
    if (!field) return;
    field.addEventListener("input", () => {
      field.removeAttribute("aria-invalid");
      field.removeAttribute("data-error");
      field.removeAttribute("title");
      if (loginEls.authMessage?.dataset.state === "error") {
        setLoginMessage("Introduce tu correo y contraseña para entrar al monitor.", "info");
      }
    });
  });

  loginEls.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearLoginFieldState();
    setLoginMessage("Verificando credenciales...", "info");

    try {
      const response = await api("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginEls.email.value.trim(),
          password: loginEls.password.value
        })
      });

      localStorage.setItem("token", response.token);
      setLoginMessage("Sesión iniciada. Redirigiendo al dashboard...", "success");
      loginEls.password.value = "";
      setTimeout(() => {
        window.location.href = "../dashboard/";
      }, 400);
    } catch (error) {
      applyLoginFieldErrors(error.details || []);
      setLoginMessage(error.message, "error");
    }
  });
};

window.addEventListener("load", () => {
  initLoginPage().catch((error) => {
    console.error("No se pudo inicializar la pantalla de login.", error);
  });
});
