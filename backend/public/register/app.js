const registerEls = {
  registerForm: document.getElementById("registerForm"),
  nombre: document.getElementById("nombre"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  registerMessage: document.getElementById("registerMessage")
};

const initRegisterPage = () => {
  const token = localStorage.getItem("token") || "";
  if (token) {
    window.location.href = "../dashboard/";
    return;
  }

  if (!registerEls.registerForm) return;

  registerEls.registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const response = await api("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: registerEls.nombre.value.trim(),
          email: registerEls.email.value.trim(),
          password: registerEls.password.value
        })
      });

      if (registerEls.registerMessage) {
        registerEls.registerMessage.textContent = "Registro exitoso. Redirigiendo al login...";
      }
      registerEls.password.value = "";
      setTimeout(() => {
        window.location.href = "../login/";
      }, 800);
    } catch (error) {
      if (registerEls.registerMessage) {
        registerEls.registerMessage.textContent = error.message;
      }
    }
  });
};

window.addEventListener("load", initRegisterPage);
