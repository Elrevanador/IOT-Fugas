// En local usa el backend de desarrollo.
// En despliegue separado inyecta PUBLIC_API_BASE_URL durante la build.
const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const isFileProtocol = window.location.protocol === "file:" || !window.location.hostname;
const injectedApiBaseUrl = "__API_BASE_URL__";
const hasInjectedApiBaseUrl =
  injectedApiBaseUrl.startsWith("https://") || injectedApiBaseUrl.startsWith("http://");

window.API_BASE_URL =
  window.API_BASE_URL ||
  (hasInjectedApiBaseUrl ? injectedApiBaseUrl.replace(/\/+$/, "") : "") ||
  (isLocalhost || isFileProtocol ? "http://localhost:3000" : "");
