const API_BASE_URL = (window.API_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const COLOMBIA_TIMEZONE = "America/Bogota";

const api = async (url, options = {}) => {
  const headers = { ...(options.headers || {}) };
  const token = localStorage.getItem("token") || "";
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const finalUrl = API_BASE_URL ? `${API_BASE_URL}${url}` : url;
  const response = await fetch(finalUrl, { ...options, headers });
  const data = await response.json();

  if (!response.ok) {
    const message =
      data.msg || data.errors?.map((item) => `${item.field}: ${item.msg}`).join(" | ") || "Error API";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
};

const formatTs = (value) => {
  if (!value) return "--";
  return new Date(value).toLocaleString("es-CO", {
    timeZone: COLOMBIA_TIMEZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
};
