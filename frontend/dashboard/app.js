let dashboardTimer = null;
let dashboardStream = null;
let flowChart;
let pressureChart;
let token = localStorage.getItem("token") || "";
let floatingAlertDismissedState = "";
let alertsFilter = "ALL";
let lastLeakNotificationKey = "";
let dashboardTransportMode = "Polling";
let dashboardTransportHealthy = false;
let dashboardAudioContext = null;
let latestDashboardPayload = null;
let currentUserProfile = null;

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
  metricHouse: document.getElementById("metricHouse"),
  simulationState: document.getElementById("simulationState"),
  simulationUpdatedAt: document.getElementById("simulationUpdatedAt"),
  simulationSamples: document.getElementById("simulationSamples"),
  simulationAlerts: document.getElementById("simulationAlerts"),
  simulationConnection: document.getElementById("simulationConnection"),
  simulationLastAlert: document.getElementById("simulationLastAlert"),
  simulationPayload: document.getElementById("simulationPayload"),
  deviceHealthMode: document.getElementById("deviceHealthMode"),
  healthChannel: document.getElementById("healthChannel"),
  healthBackend: document.getElementById("healthBackend"),
  healthLastPacket: document.getElementById("healthLastPacket"),
  healthAlarm: document.getElementById("healthAlarm"),
  operatorBadge: document.getElementById("operatorBadge"),
  authMessage: document.getElementById("authMessage"),
  operatorName: document.getElementById("operatorName"),
  operatorRole: document.getElementById("operatorRole"),
  operatorEmail: document.getElementById("operatorEmail"),
  operatorHouse: document.getElementById("operatorHouse"),
  adminNavLink: document.getElementById("adminNavLink"),
  alertsList: document.getElementById("alertsList"),
  alertFilters: document.getElementById("alertFilters"),
  readingsTable: document.getElementById("readingsTable"),
  logoutBtn: document.getElementById("logoutBtn"),
  ledGreen: document.getElementById("ledGreen"),
  ledAmber: document.getElementById("ledAmber"),
  ledRed: document.getElementById("ledRed"),
  buzzerState: document.getElementById("buzzerState"),
  buzzerText: document.getElementById("buzzerText"),
  floatingAlert: document.getElementById("floatingAlert"),
  floatingAlertBackdrop: document.getElementById("floatingAlertBackdrop"),
  floatingAlertEyebrow: document.getElementById("floatingAlertEyebrow"),
  floatingAlertTitle: document.getElementById("floatingAlertTitle"),
  floatingAlertMessage: document.getElementById("floatingAlertMessage"),
  floatingAlertState: document.getElementById("floatingAlertState"),
  floatingAlertRisk: document.getElementById("floatingAlertRisk"),
  floatingAlertPressure: document.getElementById("floatingAlertPressure"),
  floatingAlertFlow: document.getElementById("floatingAlertFlow"),
  floatingAlertTimestamp: document.getElementById("floatingAlertTimestamp"),
  floatingAlertClose: document.getElementById("floatingAlertClose")
};

const clearSession = () => {
  localStorage.removeItem("token");
  token = "";
  currentUserProfile = null;
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

const circuitStatusText = (deviceOnline, lastSeenAt) => {
  if (deviceOnline) {
    return {
      headline: "Circuito activo",
      detail: "Monitoreo en tiempo real"
    };
  }

  if (lastSeenAt) {
    return {
      headline: "Circuito inactivo",
      detail: `Última activación: ${formatTs(lastSeenAt)}`
    };
  }

  return {
    headline: "Circuito sin datos",
    detail: "Aún no se registra activación"
  };
};

const relativeLastPacketText = (lastSeenAt) => {
  if (!lastSeenAt) return "--";
  const deltaMs = Math.max(0, Date.now() - new Date(lastSeenAt).getTime());
  const seconds = Math.round(deltaMs / 1000);
  if (seconds < 2) return "Hace instantes";
  if (seconds < 60) return `Hace ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `Hace ${minutes} min`;
};

const filterAlerts = (recentAlerts) => {
  switch (alertsFilter) {
    case "ACTIVE":
      return recentAlerts.filter((alert) => !alert.acknowledged);
    case "ACK":
      return recentAlerts.filter((alert) => alert.acknowledged);
    case "FUGA":
    case "ALERTA":
      return recentAlerts.filter((alert) => alert.severity === alertsFilter);
    case "ALL":
    default:
      return recentAlerts;
  }
};

const syncAlertFilterUI = () => {
  if (!dashboardEls.alertFilters) return;
  dashboardEls.alertFilters.querySelectorAll("[data-filter]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.filter === alertsFilter);
  });
};

const ensureAudioContext = () => {
  if (dashboardAudioContext) return dashboardAudioContext;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  dashboardAudioContext = new AudioCtx();
  return dashboardAudioContext;
};

const playLeakTone = async () => {
  const ctx = ensureAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch (error) {
      return;
    }
  }

  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, now);
  oscillator.frequency.setValueAtTime(660, now + 0.18);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.13, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.45);
};

const maybeSendLeakNotification = async (payload) => {
  const latestAlert = (payload.recentAlerts || [])[0];
  const latestReading = payload.latestReading;

  if (payload.currentState !== "FUGA" || !latestAlert || latestAlert.severity !== "FUGA") {
    return;
  }

  const notificationKey = `${latestAlert.id}:${latestAlert.ts}:${payload.currentState}`;
  if (notificationKey === lastLeakNotificationKey) {
    return;
  }
  lastLeakNotificationKey = notificationKey;

  playLeakTone().catch(() => {});

  if (!("Notification" in window)) return;

  try {
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
    if (Notification.permission === "granted") {
      const body = latestReading
        ? `Riesgo ${latestReading.risk}% · ${Number(latestReading.pressure_kpa).toFixed(1)} kPa · ${Number(latestReading.flow_lmin).toFixed(2)} L/min`
        : "El sistema reportó una fuga confirmada.";
      new Notification("Fuga detectada en AquaSense", { body });
    }
  } catch (error) {
    console.warn("No se pudo mostrar la notificación de fuga.", error);
  }
};

const hideFloatingAlert = () => {
  if (!dashboardEls.floatingAlert) return;
  dashboardEls.floatingAlert.hidden = true;
  if (dashboardEls.floatingAlertBackdrop) {
    dashboardEls.floatingAlertBackdrop.hidden = true;
  }
};

const updateFloatingAlert = (currentState, latestReading, latestAlert, lastSeenAt) => {
  if (!dashboardEls.floatingAlert) return;

  if (currentState !== "ALERTA" && currentState !== "FUGA") {
    floatingAlertDismissedState = "";
    hideFloatingAlert();
    return;
  }

  if (floatingAlertDismissedState && floatingAlertDismissedState === currentState) {
    return;
  }

  const isLeak = currentState === "FUGA";
  const risk = latestReading ? `${latestReading.risk}%` : "--";
  const pressure = latestReading ? `${Number(latestReading.pressure_kpa).toFixed(1)} kPa` : "--";
  const flow = latestReading ? `${Number(latestReading.flow_lmin).toFixed(2)} L/min` : "--";
  const timestampText = lastSeenAt ? `Actualizado ${formatTs(lastSeenAt)}` : "Esperando telemetría";
  const alertMessage = latestAlert?.message;

  dashboardEls.floatingAlert.dataset.severity = currentState;
  dashboardEls.floatingAlert.hidden = false;
  if (dashboardEls.floatingAlertBackdrop) {
    dashboardEls.floatingAlertBackdrop.hidden = false;
  }
  if (dashboardEls.floatingAlertEyebrow) {
    dashboardEls.floatingAlertEyebrow.textContent = isLeak ? "Fuga confirmada" : "Alerta activa";
  }
  if (dashboardEls.floatingAlertTitle) {
    dashboardEls.floatingAlertTitle.textContent = isLeak
      ? "Intervención inmediata recomendada"
      : "Revisar condiciones del circuito";
  }
  if (dashboardEls.floatingAlertMessage) {
    dashboardEls.floatingAlertMessage.textContent = alertMessage || (
      isLeak
        ? "El sistema detectó una fuga y activó la alarma sonora. Verifica la línea de agua y confirma la alerta desde la consola."
        : "Se detectó una condición anómala de flujo o presión. Revisa el circuito antes de que evolucione a una fuga."
    );
  }
  if (dashboardEls.floatingAlertState) dashboardEls.floatingAlertState.textContent = currentState;
  if (dashboardEls.floatingAlertRisk) dashboardEls.floatingAlertRisk.textContent = risk;
  if (dashboardEls.floatingAlertPressure) dashboardEls.floatingAlertPressure.textContent = pressure;
  if (dashboardEls.floatingAlertFlow) dashboardEls.floatingAlertFlow.textContent = flow;
  if (dashboardEls.floatingAlertTimestamp) dashboardEls.floatingAlertTimestamp.textContent = timestampText;
};

const renderSimulationState = (payload) => {
  const { latestReading, currentState, lastSeenAt, deviceOnline, recentReadings, recentAlerts } = payload;
  const latestAlert = recentAlerts[0] || null;
  const circuitStatus = circuitStatusText(deviceOnline, lastSeenAt);

  if (dashboardEls.simulationConnection) {
    dashboardEls.simulationConnection.textContent = circuitStatus.headline;
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
            houseName: latestReading.houseName,
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

const renderDeviceHealth = (payload) => {
  if (dashboardEls.deviceHealthMode) {
    dashboardEls.deviceHealthMode.textContent = dashboardTransportMode;
  }
  if (dashboardEls.healthChannel) {
    dashboardEls.healthChannel.textContent = payload.deviceOnline ? "Telemetría activa" : "Sin telemetría";
  }
  if (dashboardEls.healthBackend) {
    dashboardEls.healthBackend.textContent = dashboardTransportHealthy ? "Conectado" : "Con errores";
  }
  if (dashboardEls.healthLastPacket) {
    dashboardEls.healthLastPacket.textContent = relativeLastPacketText(payload.lastSeenAt);
  }
  if (dashboardEls.healthAlarm) {
    dashboardEls.healthAlarm.textContent = payload.currentState === "FUGA" ? "Activa" : "Inactiva";
  }
};

const updateAuthUI = (isAuthenticated = Boolean(token)) => {
  if (dashboardEls.operatorBadge) {
    if (!isAuthenticated || !currentUserProfile?.role) {
      dashboardEls.operatorBadge.textContent = "Acceso requerido";
    } else {
      dashboardEls.operatorBadge.textContent = `Rol ${String(currentUserProfile.role).toUpperCase()}`;
    }
  }
  if (dashboardEls.authMessage) {
    dashboardEls.authMessage.textContent = isAuthenticated
      ? "Estás autenticado. Puedes confirmar alertas desde el dashboard."
      : "Inicia sesión para habilitar el dashboard y gestionar alertas.";
  }
  if (dashboardEls.logoutBtn) {
    dashboardEls.logoutBtn.style.display = isAuthenticated ? "inline-flex" : "none";
  }
  if (dashboardEls.operatorName) {
    dashboardEls.operatorName.textContent = isAuthenticated && currentUserProfile ? currentUserProfile.nombre : "Sin sesión";
  }
  if (dashboardEls.operatorEmail) {
    dashboardEls.operatorEmail.textContent = isAuthenticated && currentUserProfile ? currentUserProfile.email : "--";
  }
  if (dashboardEls.operatorRole) {
    dashboardEls.operatorRole.textContent = isAuthenticated && currentUserProfile?.role
      ? String(currentUserProfile.role).toUpperCase()
      : "--";
  }
  if (dashboardEls.operatorHouse) {
    dashboardEls.operatorHouse.textContent =
      isAuthenticated && currentUserProfile?.house
        ? `${currentUserProfile.house.name} (${currentUserProfile.house.code})`
        : "Sin casa";
  }
  if (dashboardEls.adminNavLink) {
    dashboardEls.adminNavLink.hidden = !(isAuthenticated && currentUserProfile?.role === "admin");
  }
};

const validateSession = async () => {
  if (!token) {
    setAuthGateMessage("Inicia sesión o regístrate para acceder al monitor.", "info");
    return false;
  }

  try {
    const response = await api("/api/auth/me");
    currentUserProfile = response.user || null;
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
  const circuitStatus = circuitStatusText(deviceOnline, lastSeenAt);
  applyTone(dashboardEls.statePill, currentState);
  if (dashboardEls.stateHeadline) dashboardEls.stateHeadline.textContent = currentState;
  if (dashboardEls.stateSummary) dashboardEls.stateSummary.textContent = stateSummaryMap[currentState] || stateSummaryMap.SIN_DATOS;
  if (dashboardEls.deviceStatus) dashboardEls.deviceStatus.textContent = circuitStatus.headline;
  if (dashboardEls.lastSeen) dashboardEls.lastSeen.textContent = circuitStatus.detail;

  if (!latestReading) {
    if (dashboardEls.metricFlow) dashboardEls.metricFlow.textContent = "--";
    if (dashboardEls.metricPressure) dashboardEls.metricPressure.textContent = "--";
    if (dashboardEls.metricRisk) dashboardEls.metricRisk.textContent = "--";
    if (dashboardEls.metricDevice) dashboardEls.metricDevice.textContent = "--";
    if (dashboardEls.metricHouse) dashboardEls.metricHouse.textContent = "--";
    syncCircuit("SIN_DATOS");
    return;
  }

  if (dashboardEls.metricFlow) dashboardEls.metricFlow.textContent = Number(latestReading.flow_lmin).toFixed(2);
  if (dashboardEls.metricPressure) dashboardEls.metricPressure.textContent = Number(latestReading.pressure_kpa).toFixed(1);
  if (dashboardEls.metricRisk) dashboardEls.metricRisk.textContent = `${latestReading.risk}%`;
  if (dashboardEls.metricDevice) dashboardEls.metricDevice.textContent = latestReading.deviceName || `ID ${latestReading.deviceId}`;
  if (dashboardEls.metricHouse) dashboardEls.metricHouse.textContent = latestReading.houseName || "Sin casa";
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
  const filteredAlerts = filterAlerts(recentAlerts);

  if (!filteredAlerts.length) {
    dashboardEls.alertsList.innerHTML = '<li class="empty">No hay alertas registradas.</li>';
    return;
  }

  filteredAlerts.forEach((alert) => {
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
      <span class="alert-house">${alert.houseName || "Casa sin asignar"}</span>
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
    dashboardEls.readingsTable.innerHTML = '<tr><td colspan="7" class="empty-cell">Sin lecturas disponibles.</td></tr>';
    return;
  }

  recentReadings
    .slice()
    .reverse()
    .forEach((reading) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${formatTs(reading.ts)}</td>
        <td>${reading.houseName || "--"}</td>
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
  latestDashboardPayload = payload;
  dashboardTransportHealthy = true;
  renderLatestReading(payload.latestReading, payload.deviceOnline, payload.lastSeenAt, payload.currentState);
  renderSimulationState(payload);
  renderDeviceHealth(payload);
  renderCharts(payload.recentReadings || []);
  renderAlerts(payload.recentAlerts || []);
  renderReadings(payload.recentReadings || []);
  updateFloatingAlert(payload.currentState, payload.latestReading, (payload.recentAlerts || [])[0] || null, payload.lastSeenAt);
  maybeSendLeakNotification(payload).catch(() => {});
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
  if (typeof window.EventSource !== "function" || !token) {
    ensureDashboardPolling(1000);
    return;
  }

  closeDashboardStream();
  const streamUrl = new URL(`${API_BASE_URL}/api/public/dashboard/stream`, window.location.origin);
  streamUrl.searchParams.set("token", token);
  dashboardStream = new EventSource(streamUrl.toString());
  dashboardStream.addEventListener("open", () => {
    dashboardTransportMode = "SSE";
    clearDashboardPolling();
  });
  dashboardStream.addEventListener("dashboard", handleDashboardStreamPayload);
  dashboardStream.addEventListener("error", () => {
    dashboardTransportMode = "Polling";
    ensureDashboardPolling(1000);
  });
};

const loadDashboard = async () => {
  try {
    dashboardTransportHealthy = true;
    const payload = await api("/api/public/dashboard");
    applyDashboardPayload(payload);
  } catch (error) {
    dashboardTransportHealthy = false;
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
    renderDeviceHealth({
      deviceOnline: false,
      lastSeenAt: null,
      currentState: "SIN_DATOS"
    });
    renderAlerts([]);
    renderReadings([]);
  }
};

const createChart = (canvasId, color, label) => {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  if (typeof window.Chart !== "function") {
    console.warn("Chart.js no esta disponible. El dashboard seguira cargando sin graficos.");
    return null;
  }

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
  token = localStorage.getItem("token") || "";
  setDashboardVisibility(false);

  const isAuthenticated = await validateSession();
  updateAuthUI(isAuthenticated);
  setDashboardVisibility(isAuthenticated);

  if (!isAuthenticated) {
    return;
  }

  flowChart = createChart("flowChart", "#00c2a8", "Flujo");
  pressureChart = createChart("pressureChart", "#f59e0b", "Presión");

  syncAlertFilterUI();

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

  if (dashboardEls.floatingAlertClose) {
    dashboardEls.floatingAlertClose.addEventListener("click", () => {
      const activeState = dashboardEls.floatingAlert?.dataset.severity || "";
      floatingAlertDismissedState = activeState;
      hideFloatingAlert();
    });
  }

  if (dashboardEls.alertFilters) {
    dashboardEls.alertFilters.addEventListener("click", (event) => {
      const button = event.target.closest("[data-filter]");
      if (!button) return;
      alertsFilter = button.dataset.filter || "ALL";
      syncAlertFilterUI();
      if (latestDashboardPayload) {
        renderAlerts(latestDashboardPayload.recentAlerts || []);
      }
    });
  }

  await loadDashboard();
  ensureDashboardPolling(1000);
  startDashboardStream();
};

window.addEventListener("load", () => {
  const page = document.body.dataset.page || "dashboard";
  if (page !== "dashboard") return;

  initDashboardPage().catch((error) => {
    console.error("No se pudo inicializar el dashboard.", error);
    setDashboardVisibility(false);
    setAuthGateMessage("No fue posible abrir el monitor. Recarga la página o vuelve a iniciar sesión.", "error");
  });
});

window.addEventListener("beforeunload", () => {
  clearDashboardPolling();
  closeDashboardStream();
});
