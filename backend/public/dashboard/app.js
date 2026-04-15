let dashboardTimer = null;
let dashboardStream = null;
let flowChart;
let pressureChart;
let token = localStorage.getItem("token") || "";

const stateToneMap = {
  NORMAL: "normal",
  ALERTA: "alert",
  FUGA: "danger",
  ERROR: "error",
  SIN_DATOS: "muted"
};

const stateSummaryMap = {
  NORMAL: "Sin anomalías detectadas en la última lectura.",
  ALERTA: "Hay una condición anómala que requiere atención.",
  FUGA: "El circuito reporta una fuga confirmada.",
  ERROR: "El dispositivo reportó falla de sensor.",
  SIN_DATOS: "Aún no hay lecturas registradas."
};

const dashboardEls = {
  dashboardContent: document.getElementById("dashboardContent"),
  authGate: document.getElementById("authGate"),
  authGateMessage: document.getElementById("authGateMessage"),
  deviceStatus: document.getElementById("deviceStatus"),
  lastSeen: document.getElementById("lastSeen"),
  stateHeadline: document.getElementById("stateHeadline"),
  stateSummary: document.getElementById("stateSummary"),
  statePill: document.getElementById("statePill"),
  metricFlow: document.getElementById("metricFlow"),
  metricPressure: document.getElementById("metricPressure"),
  metricRisk: document.getElementById("metricRisk"),
  metricDevice: document.getElementById("metricDevice"),
  simulationState: document.getElementById("simulationState"),
  simulationUpdatedAt: document.getElementById("simulationUpdatedAt"),
  simulationSamples: document.getElementById("simulationSamples"),
  simulationAlerts: document.getElementById("simulationAlerts"),
  simulationConnection: document.getElementById("simulationConnection"),
  simulationLastAlert: document.getElementById("simulationLastAlert"),
  simulationPayload: document.getElementById("simulationPayload"),
  operatorBadge: document.getElementById("operatorBadge"),
  authMessage: document.getElementById("authMessage"),
  alertsList: document.getElementById("alertsList"),
  readingsTable: document.getElementById("readingsTable"),
  logoutBtn: document.getElementById("logoutBtn"),
  ledGreen: document.getElementById("ledGreen"),
  ledAmber: document.getElementById("ledAmber"),
  ledRed: document.getElementById("ledRed"),
  buzzerState: document.getElementById("buzzerState"),
  buzzerText: document.getElementById("buzzerText")
};

const clearSession = () => {
  localStorage.removeItem("token");
  token = "";
};

const setDashboardVisibility = (isAuthenticated) => {
  if (dashboardEls.dashboardContent) {
    dashboardEls.dashboardContent.hidden = !isAuthenticated;
  }
  if (dashboardEls.authGate) {
    dashboardEls.authGate.hidden = isAuthenticated;
  }
};

const setAuthGateMessage = (message, state = "info") => {
  if (!dashboardEls.authGateMessage) return;
  dashboardEls.authGateMessage.textContent = message;
  dashboardEls.authGateMessage.dataset.state = state;
};

const applyTone = (element, state) => {
  if (!element) return;
  const tone = stateToneMap[state] || "muted";
  element.dataset.tone = tone;
  element.textContent = state;
};

const syncCircuit = (state) => {
  if (dashboardEls.ledGreen) dashboardEls.ledGreen.dataset.active = state === "NORMAL";
  if (dashboardEls.ledAmber) dashboardEls.ledAmber.dataset.active = state === "ALERTA";
  if (dashboardEls.ledRed) dashboardEls.ledRed.dataset.active = state === "FUGA" || state === "ERROR";
  if (dashboardEls.buzzerState) dashboardEls.buzzerState.dataset.active = state === "FUGA";
  if (dashboardEls.buzzerText) dashboardEls.buzzerText.textContent = state === "FUGA" ? "Activo por fuga confirmada" : "Apagado";
};

const renderSimulationState = (payload) => {
  const { latestReading, currentState, lastSeenAt, deviceOnline, recentReadings, recentAlerts } = payload;
  const latestAlert = recentAlerts[0] || null;

  if (dashboardEls.simulationConnection) {
    dashboardEls.simulationConnection.textContent = deviceOnline ? "Telemetría activa" : "Sin telemetría reciente";
  }
  if (dashboardEls.simulationState) {
    dashboardEls.simulationState.textContent = currentState || "SIN_DATOS";
    dashboardEls.simulationState.dataset.tone = stateToneMap[currentState] || "muted";
  }
  if (dashboardEls.simulationUpdatedAt) {
    dashboardEls.simulationUpdatedAt.textContent = lastSeenAt ? formatTs(lastSeenAt) : "--";
  }
  if (dashboardEls.simulationSamples) {
    dashboardEls.simulationSamples.textContent = String((recentReadings || []).length);
  }
  if (dashboardEls.simulationAlerts) {
    dashboardEls.simulationAlerts.textContent = String((recentAlerts || []).length);
  }
  if (dashboardEls.simulationLastAlert) {
    dashboardEls.simulationLastAlert.textContent = latestAlert
      ? `${latestAlert.severity} · ${formatTs(latestAlert.ts)}`
      : "Sin alertas";
  }
  if (dashboardEls.simulationPayload) {
    dashboardEls.simulationPayload.textContent = latestReading
      ? JSON.stringify(
          {
            deviceName: latestReading.deviceName,
            ts: latestReading.ts,
            flow_lmin: latestReading.flow_lmin,
            pressure_kpa: latestReading.pressure_kpa,
            risk: latestReading.risk,
            state: latestReading.state
          },
          null,
          2
        )
      : "Sin payload disponible.";
  }
};

const updateAuthUI = (isAuthenticated = Boolean(token)) => {
  if (dashboardEls.operatorBadge) {
    dashboardEls.operatorBadge.textContent = isAuthenticated ? "Modo operador" : "Acceso requerido";
  }
  if (dashboardEls.authMessage) {
    dashboardEls.authMessage.textContent = isAuthenticated
      ? "Estás autenticado. Puedes confirmar alertas desde el dashboard."
      : "Inicia sesión para habilitar el dashboard y gestionar alertas.";
  }
  if (dashboardEls.logoutBtn) {
    dashboardEls.logoutBtn.style.display = isAuthenticated ? "inline-flex" : "none";
  }
};

const validateSession = async () => {
  if (!token) {
    setAuthGateMessage("Inicia sesión o regístrate para acceder al monitor.", "info");
    return false;
  }

  try {
    await api("/api/auth/me");
    return true;
  } catch (error) {
    if (error.status === 401) {
      clearSession();
      setAuthGateMessage("Tu sesión expiró o no es válida. Inicia sesión o regístrate para continuar.", "error");
      return false;
    }

    setAuthGateMessage(error.message, "error");
    return false;
  }
};

const renderLatestReading = (latestReading, deviceOnline, lastSeenAt, currentState) => {
  applyTone(dashboardEls.statePill, currentState);
  if (dashboardEls.stateHeadline) dashboardEls.stateHeadline.textContent = currentState;
  if (dashboardEls.stateSummary) dashboardEls.stateSummary.textContent = stateSummaryMap[currentState] || stateSummaryMap.SIN_DATOS;
  if (dashboardEls.deviceStatus) dashboardEls.deviceStatus.textContent = deviceOnline ? "ESP32 en línea" : "Sin telemetría reciente";
  if (dashboardEls.lastSeen) dashboardEls.lastSeen.textContent = lastSeenAt ? `Última lectura: ${formatTs(lastSeenAt)}` : "Esperando lectura";

  if (!latestReading) {
    if (dashboardEls.metricFlow) dashboardEls.metricFlow.textContent = "--";
    if (dashboardEls.metricPressure) dashboardEls.metricPressure.textContent = "--";
    if (dashboardEls.metricRisk) dashboardEls.metricRisk.textContent = "--";
    if (dashboardEls.metricDevice) dashboardEls.metricDevice.textContent = "--";
    syncCircuit("SIN_DATOS");
    return;
  }

  if (dashboardEls.metricFlow) dashboardEls.metricFlow.textContent = Number(latestReading.flow_lmin).toFixed(2);
  if (dashboardEls.metricPressure) dashboardEls.metricPressure.textContent = Number(latestReading.pressure_kpa).toFixed(1);
  if (dashboardEls.metricRisk) dashboardEls.metricRisk.textContent = `${latestReading.risk}%`;
  if (dashboardEls.metricDevice) dashboardEls.metricDevice.textContent = latestReading.deviceName || `ID ${latestReading.deviceId}`;
  syncCircuit(currentState);
};

const renderCharts = (recentReadings) => {
  if (!flowChart || !pressureChart) return;

  const labels = recentReadings.map((reading) =>
    new Date(reading.ts).toLocaleTimeString("es-CO", {
      timeZone: COLOMBIA_TIMEZONE,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
  );

  const flowValues = recentReadings.map((reading) => reading.flow_lmin);
  const pressureValues = recentReadings.map((reading) => reading.pressure_kpa);

  flowChart.data.labels = labels;
  flowChart.data.datasets[0].data = flowValues;
  flowChart.update("none");

  pressureChart.data.labels = labels;
  pressureChart.data.datasets[0].data = pressureValues;
  pressureChart.update("none");
};

const renderAlerts = (recentAlerts) => {
  if (!dashboardEls.alertsList) return;
  dashboardEls.alertsList.innerHTML = "";

  if (!recentAlerts.length) {
    dashboardEls.alertsList.innerHTML = '<li class="empty">No hay alertas registradas.</li>';
    return;
  }

  recentAlerts.forEach((alert) => {
    const item = document.createElement("li");
    item.className = "alert-item";
    item.dataset.severity = alert.severity;

    const meta = document.createElement("div");
    meta.className = "alert-copy";
    meta.innerHTML = `
      <div class="alert-headline">
        <strong>${alert.severity}</strong>
        <span class="alert-time">${formatTs(alert.ts)}</span>
      </div>
      <span class="alert-device">${alert.deviceName || `ID ${alert.deviceId}`}</span>
      <p class="alert-message">${alert.message}</p>
    `;

    const button = document.createElement("button");
    button.className = "ack-btn";
    button.textContent = alert.acknowledged ? "Confirmada" : token ? "Confirmar" : "Acceso requerido";
    button.disabled = alert.acknowledged || !token;

    if (!alert.acknowledged && token) {
      button.addEventListener("click", async () => {
        try {
          await api(`/api/alerts/${alert.id}/ack`, { method: "PATCH" });
          if (dashboardEls.authMessage) dashboardEls.authMessage.textContent = "Alerta confirmada correctamente.";
          await loadDashboard();
        } catch (error) {
          if (error.status === 401) {
            clearSession();
            clearDashboardPolling();
            closeDashboardStream();
            updateAuthUI(false);
            setDashboardVisibility(false);
            setAuthGateMessage("Tu sesión expiró. Inicia sesión o regístrate para continuar.", "error");
            if (dashboardEls.authMessage) dashboardEls.authMessage.textContent = "Sesión expirada. Inicia sesión de nuevo.";
            window.location.href = "../login/";
          }
        }
      });
    }

    item.append(meta, button);
    dashboardEls.alertsList.appendChild(item);
  });
};

const renderReadings = (recentReadings) => {
  if (!dashboardEls.readingsTable) return;
  dashboardEls.readingsTable.innerHTML = "";

  if (!recentReadings.length) {
    dashboardEls.readingsTable.innerHTML = '<tr><td colspan="6" class="empty-cell">Sin lecturas disponibles.</td></tr>';
    return;
  }

  recentReadings
    .slice()
    .reverse()
    .forEach((reading) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${formatTs(reading.ts)}</td>
        <td>${reading.deviceName || `ID ${reading.deviceId}`}</td>
        <td>${Number(reading.flow_lmin).toFixed(2)}</td>
        <td>${Number(reading.pressure_kpa).toFixed(1)}</td>
        <td>${reading.risk}%</td>
        <td><span class="table-pill" data-tone="${stateToneMap[reading.state] || "muted"}">${reading.state}</span></td>
      `;
      dashboardEls.readingsTable.appendChild(row);
    });
};

const applyDashboardPayload = (payload) => {
  renderLatestReading(payload.latestReading, payload.deviceOnline, payload.lastSeenAt, payload.currentState);
  renderSimulationState(payload);
  renderCharts(payload.recentReadings || []);
  renderAlerts(payload.recentAlerts || []);
  renderReadings(payload.recentReadings || []);
};

const clearDashboardPolling = () => {
  if (!dashboardTimer) return;
  clearInterval(dashboardTimer);
  dashboardTimer = null;
};

const ensureDashboardPolling = (intervalMs = 2000) => {
  if (dashboardTimer) return;
  dashboardTimer = setInterval(loadDashboard, intervalMs);
};

const closeDashboardStream = () => {
  if (!dashboardStream) return;
  dashboardStream.close();
  dashboardStream = null;
};

const handleDashboardStreamPayload = (event) => {
  try {
    const payload = JSON.parse(event.data);
    applyDashboardPayload(payload);
  } catch (error) {
    console.error("No se pudo leer la actualizacion en vivo del dashboard.", error);
  }
};

const startDashboardStream = () => {
  // El dashboard ahora exige Authorization y EventSource no envia ese header
  // de forma nativa, por eso mantenemos refresco autenticado por polling.
  ensureDashboardPolling(2000);
};

const loadDashboard = async () => {
  try {
    const payload = await api("/api/public/dashboard");
    applyDashboardPayload(payload);
  } catch (error) {
    if (dashboardEls.authMessage) dashboardEls.authMessage.textContent = error.message;
    renderLatestReading(null, false, null, "SIN_DATOS");
    renderSimulationState({
      latestReading: null,
      currentState: "SIN_DATOS",
      lastSeenAt: null,
      deviceOnline: false,
      recentReadings: [],
      recentAlerts: []
    });
    renderAlerts([]);
    renderReadings([]);
  }
};

const createChart = (canvasId, color, label) => {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  return new Chart(canvas, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label,
          data: [],
          borderColor: color,
          backgroundColor: `${color}22`,
          borderWidth: 2,
          fill: true,
          tension: 0.28,
          pointRadius: 0
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          ticks: { color: "#7f8ea3", maxTicksLimit: 8 },
          grid: { color: "rgba(255,255,255,0.05)" }
        },
        y: {
          ticks: { color: "#7f8ea3" },
          grid: { color: "rgba(255,255,255,0.05)" }
        }
      }
    }
  });
};

const initDashboardPage = async () => {
  flowChart = createChart("flowChart", "#00c2a8", "Flujo");
  pressureChart = createChart("pressureChart", "#f59e0b", "Presión");
  token = localStorage.getItem("token") || "";
  setDashboardVisibility(false);

  const isAuthenticated = await validateSession();
  updateAuthUI(isAuthenticated);
  setDashboardVisibility(isAuthenticated);

  if (!isAuthenticated) {
    return;
  }

  if (dashboardEls.logoutBtn) {
    dashboardEls.logoutBtn.addEventListener("click", () => {
      clearSession();
      clearDashboardPolling();
      closeDashboardStream();
      updateAuthUI(false);
      setDashboardVisibility(false);
      setAuthGateMessage("Has cerrado sesión. Inicia nuevamente o regístrate si necesitas una cuenta.", "info");
      window.location.href = "../login/";
    });
  }

  await loadDashboard();
  ensureDashboardPolling(2000);
  startDashboardStream();
};

window.addEventListener("load", async () => {
  const page = document.body.dataset.page || "dashboard";
  if (page === "dashboard") {
    await initDashboardPage();
  }
});

window.addEventListener("beforeunload", () => {
  clearDashboardPolling();
  closeDashboardStream();
});
