const API_BASE_URL = (window.API_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const COLOMBIA_TIMEZONE = "America/Bogota";
const FIELD_LABELS = {
  nombre: "Nombre",
  email: "Correo electrónico",
  password: "Contraseña",
  houseId: "Casa",
  name: "Nombre",
  code: "Código",
  address: "Dirección",
  owner_name: "Responsable",
  contact_phone: "Teléfono",
  status: "Estado",
  location: "Ubicación",
  role: "Rol"
};

const parseJsonSafely = async (response) => {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return {};
  }

  try {
    return await response.json();
  } catch {
    return {};
  }
};

const normalizeErrors = (errors) =>
  Array.isArray(errors)
    ? errors.map((item) => ({
        field: item.field || item.param || "",
        msg: item.msg || "Dato inválido"
      }))
    : [];

const buildErrorMessage = (data, details) => {
  if (details.length) {
    const detailLines = details.map((item) => `${FIELD_LABELS[item.field] || item.field}: ${item.msg}`);
    if (data.msg && data.msg !== "Error API") {
      return `${data.msg}\n${detailLines.join("\n")}`;
    }
    return detailLines.join("\n");
  }

  return data.msg || "Error API";
};

const api = async (url, options = {}) => {
  const headers = { ...(options.headers || {}) };
  const token = localStorage.getItem("token") || "";
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const finalUrl = API_BASE_URL ? `${API_BASE_URL}${url}` : url;
  let response;
  try {
    response = await fetch(finalUrl, { cache: "no-store", ...options, headers });
  } catch {
    const error = new Error("No fue posible conectar con el servidor. Intenta de nuevo en unos segundos.");
    error.status = 0;
    error.details = [];
    throw error;
  }

  const data = await parseJsonSafely(response);

  if (!response.ok) {
    const details = normalizeErrors(data.errors);
    const error = new Error(buildErrorMessage(data, details));
    error.status = response.status;
    error.details = details;
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
