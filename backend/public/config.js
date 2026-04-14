// En local usa el backend de desarrollo.
// En producción o Railway usa la URL relativa de la misma app.
const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const isFileProtocol = window.location.protocol === "file:" || !window.location.hostname;
const injectedApiBaseUrl = "__API_BASE_URL__";
const hasInjectedApiBaseUrl =
  injectedApiBaseUrl &&
  injectedApiBaseUrl !== "__API_BASE_URL__" &&
  !injectedApiBaseUrl.includes("__API_BASE_URL__");

window.API_BASE_URL =
  window.API_BASE_URL ||
  (hasInjectedApiBaseUrl ? injectedApiBaseUrl.replace(/\/+$/, "") : "") ||
  (isLocalhost || isFileProtocol ? "http://localhost:3000" : "");
