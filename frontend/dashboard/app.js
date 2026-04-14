let dashboardTimer = null;
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
  deviceStatus: document.getElementById("deviceStatus"),
  lastSeen: document.getElementById("lastSeen"),
  stateHeadline: document.getElementById("stateHeadline"),
  stateSummary: document.getElementById("stateSummary"),
  statePill: document.getElementById("statePill"),
  metricFlow: document.getElementById("metricFlow"),
  metricPressure: document.getElementById("metricPressure"),
  metricRisk: document.getElementById("metricRisk"),
  metricDevice: document.getElementById("metricDevice"),
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

const updateAuthUI = () => {
  const isAuthenticated = Boolean(token);
  if (dashboardEls.operatorBadge) {
    dashboardEls.operatorBadge.textContent = isAuthenticated ? "Modo operador" : "Lectura pública";
  }
  if (dashboardEls.authMessage) {
    dashboardEls.authMessage.textContent = isAuthenticated
      ? "Estás autenticado. Puedes confirmar alertas desde el dashboard."
      : "Accede desde la página de inicio de sesión para confirmar alertas.";
  }
  if (dashboardEls.logoutBtn) {
    dashboardEls.logoutBtn.style.display = isAuthenticated ? "inline-flex" : "none";
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
      <strong>${alert.severity}</strong>
      <span>${alert.deviceName || `ID ${alert.deviceId}`} · ${formatTs(alert.ts)}</span>
      <p>${alert.message}</p>
    `;

    const button = document.createElement("button");
    button.className = "ack-btn";
    button.textContent = alert.acknowledged ? "Confirmada" : token ? "Confirmar" : "Login requerido";
    button.disabled = alert.acknowledged || !token;

    if (!alert.acknowledged && token) {
      button.addEventListener("click", async () => {
        try {
          await api(`/api/alerts/${alert.id}/ack`, { method: "PATCH" });
          if (dashboardEls.authMessage) dashboardEls.authMessage.textContent = "Alerta confirmada correctamente.";
          await loadDashboard();
        } catch (error) {
          if (error.status === 401) {
            localStorage.removeItem("token");
            token = "";
            updateAuthUI();
            if (dashboardEls.authMessage) dashboardEls.authMessage.textContent = "Sesión expirada. Inicia sesión de nuevo.";
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
    .slice(0, 12)
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

const loadDashboard = async () => {
  try {
    const payload = await api("/api/public/dashboard");
    renderLatestReading(payload.latestReading, payload.deviceOnline, payload.lastSeenAt, payload.currentState);
    renderCharts(payload.recentReadings || []);
    renderAlerts(payload.recentAlerts || []);
    renderReadings(payload.recentReadings || []);
  } catch (error) {
    if (dashboardEls.authMessage) dashboardEls.authMessage.textContent = error.message;
    renderLatestReading(null, false, null, "SIN_DATOS");
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
  updateAuthUI();

  if (dashboardEls.logoutBtn) {
    dashboardEls.logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("token");
      token = "";
      updateAuthUI();
      window.location.href = "../login/";
    });
  }

  await loadDashboard();
  dashboardTimer = setInterval(loadDashboard, 2000);
};

window.addEventListener("load", async () => {
  const page = document.body.dataset.page || "dashboard";
  if (page === "dashboard") {
    await initDashboardPage();
  }
});
