const makeConfigError = (message) => {
  const error = new Error(message);
  error.status = 500;
  return error;
};

const readEnv = (name) => {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
};

const assertConfiguredSecret = (value, name) => {
  if (!value) {
    throw makeConfigError(`${name} no esta configurada`);
  }

  if (value === "change_me") {
    throw makeConfigError(`${name} no puede usar el valor inseguro "change_me"`);
  }

  return value;
};

const getJwtSecret = () => assertConfiguredSecret(readEnv("JWT_SECRET"), "JWT_SECRET");

const getIngestApiKey = () => {
  const value = readEnv("INGEST_API_KEY");
  if (!value) return "";
  return assertConfiguredSecret(value, "INGEST_API_KEY");
};

const validateRuntimeConfig = () => {
  getJwtSecret();
  getIngestApiKey();
};

module.exports = {
  getJwtSecret,
  getIngestApiKey,
  validateRuntimeConfig
};
