const loginEls = {
  loginForm: document.getElementById("loginForm"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  authMessage: document.getElementById("authMessage")
};

const initLoginPage = () => {
  const token = localStorage.getItem("token") || "";
  if (token) {
    window.location.href = "../dashboard/";
    return;
  }

  if (!loginEls.loginForm) return;

  loginEls.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
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
      if (loginEls.authMessage) loginEls.authMessage.textContent = "Sesión iniciada. Redirigiendo al dashboard...";
      loginEls.password.value = "";
      setTimeout(() => {
        window.location.href = "../dashboard/";
      }, 400);
    } catch (error) {
      if (loginEls.authMessage) loginEls.authMessage.textContent = error.message;
    }
  });
};

window.addEventListener("load", initLoginPage);
