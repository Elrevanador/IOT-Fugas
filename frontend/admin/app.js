const adminEls = {
  adminGate: document.getElementById("adminGate"),
  adminContent: document.getElementById("adminContent"),
  adminGateMessage: document.getElementById("adminGateMessage"),
  adminOperator: document.getElementById("adminOperator"),
  adminHouse: document.getElementById("adminHouse"),
  adminStatus: document.getElementById("adminStatus"),
  adminSummary: document.getElementById("adminSummary"),
  logoutBtn: document.getElementById("logoutBtn"),
  houseForm: document.getElementById("houseForm"),
  houseId: document.getElementById("houseId"),
  houseName: document.getElementById("houseName"),
  houseAddress: document.getElementById("houseAddress"),
  houseOwner: document.getElementById("houseOwner"),
  housePhone: document.getElementById("housePhone"),
  houseStatus: document.getElementById("houseStatus"),
  houseSubmitBtn: document.getElementById("houseSubmitBtn"),
  houseCancelBtn: document.getElementById("houseCancelBtn"),
  houseMessage: document.getElementById("houseMessage"),
  userForm: document.getElementById("userForm"),
  userId: document.getElementById("userId"),
  userName: document.getElementById("userName"),
  userEmail: document.getElementById("userEmail"),
  userPassword: document.getElementById("userPassword"),
  userHouseId: document.getElementById("userHouseId"),
  userRole: document.getElementById("userRole"),
  userSubmitBtn: document.getElementById("userSubmitBtn"),
  userCancelBtn: document.getElementById("userCancelBtn"),
  userMessage: document.getElementById("userMessage"),
  deviceForm: document.getElementById("deviceForm"),
  deviceId: document.getElementById("deviceId"),
  deviceName: document.getElementById("deviceName"),
  deviceHouseId: document.getElementById("deviceHouseId"),
  deviceLocation: document.getElementById("deviceLocation"),
  deviceStatus: document.getElementById("deviceStatus"),
  deviceSubmitBtn: document.getElementById("deviceSubmitBtn"),
  deviceCancelBtn: document.getElementById("deviceCancelBtn"),
  deviceMessage: document.getElementById("deviceMessage"),
  housesTable: document.getElementById("housesTable"),
  usersTable: document.getElementById("usersTable"),
  devicesTable: document.getElementById("devicesTable"),
  housesCount: document.getElementById("housesCount"),
  usersCount: document.getElementById("usersCount"),
  devicesCount: document.getElementById("devicesCount")
};

let adminUser = null;
let housesCache = [];
let devicesCache = [];
let usersCache = [];

const setMessage = (element, message, state = "info") => {
  if (!element) return;
  element.textContent = message;
  element.dataset.state = state;
};

const clearSession = () => {
  localStorage.removeItem("token");
  adminUser = null;
};

const resetHouseForm = () => {
  if (!adminEls.houseForm) return;
  adminEls.houseForm.reset();
  if (adminEls.houseId) adminEls.houseId.value = "";
  if (adminEls.houseSubmitBtn) adminEls.houseSubmitBtn.textContent = "Crear casa";
  if (adminEls.houseCancelBtn) adminEls.houseCancelBtn.hidden = true;
};

const resetDeviceForm = () => {
  if (!adminEls.deviceForm) return;
  adminEls.deviceForm.reset();
  if (adminEls.deviceId) adminEls.deviceId.value = "";
  if (adminEls.deviceSubmitBtn) adminEls.deviceSubmitBtn.textContent = "Crear dispositivo";
  if (adminEls.deviceCancelBtn) adminEls.deviceCancelBtn.hidden = true;
};

const resetUserForm = () => {
  if (!adminEls.userForm) return;
  adminEls.userForm.reset();
  if (adminEls.userId) adminEls.userId.value = "";
  if (adminEls.userSubmitBtn) adminEls.userSubmitBtn.textContent = "Crear cliente";
  if (adminEls.userCancelBtn) adminEls.userCancelBtn.hidden = true;
};

const setVisibility = (isAuthenticated) => {
  if (adminEls.adminGate) adminEls.adminGate.hidden = isAuthenticated;
  if (adminEls.adminContent) adminEls.adminContent.hidden = !isAuthenticated;
};

const renderAdminIdentity = () => {
  if (adminEls.adminOperator) {
    adminEls.adminOperator.textContent = adminUser ? adminUser.nombre : "Sin sesión";
  }
  if (adminEls.adminHouse) {
    adminEls.adminHouse.textContent = adminUser?.house
      ? `${adminUser.house.name} (${adminUser.house.code})`
      : "Sin casa asignada";
  }
};

const fillHouseOptions = () => {
  if (!adminEls.deviceHouseId) return;

  const currentDeviceValue = adminEls.deviceHouseId.value;
  const currentUserValue = adminEls.userHouseId ? adminEls.userHouseId.value : "";
  adminEls.deviceHouseId.innerHTML = '<option value="">Selecciona una casa</option>';
  if (adminEls.userHouseId) {
    adminEls.userHouseId.innerHTML = '<option value="">Selecciona una casa</option>';
  }

  housesCache.forEach((house) => {
    const option = document.createElement("option");
    option.value = String(house.id);
    option.textContent = `${house.id} · ${house.name} (${house.code})`;
    adminEls.deviceHouseId.appendChild(option);

    if (adminEls.userHouseId) {
      const userOption = document.createElement("option");
      userOption.value = String(house.id);
      userOption.textContent = `${house.id} · ${house.name} (${house.code})`;
      adminEls.userHouseId.appendChild(userOption);
    }
  });

  if (currentDeviceValue) {
    adminEls.deviceHouseId.value = currentDeviceValue;
  }
  if (adminEls.userHouseId && currentUserValue) {
    adminEls.userHouseId.value = currentUserValue;
  }
};

const renderHouses = (houses) => {
  housesCache = houses;
  fillHouseOptions();

  if (adminEls.housesCount) adminEls.housesCount.textContent = String(houses.length);
  if (!adminEls.housesTable) return;

  adminEls.housesTable.innerHTML = "";
  if (!houses.length) {
    adminEls.housesTable.innerHTML =
      '<tr><td colspan="6" class="empty-cell">No hay casas registradas todavía.</td></tr>';
    return;
  }

  houses.forEach((house) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${house.id}</td>
      <td>${house.name}</td>
      <td>${house.code}</td>
      <td>${house.address || "--"}</td>
      <td>${house.owner_name || "--"}</td>
      <td>${house.contact_phone || "--"}</td>
      <td>${house.status || "--"}</td>
      <td>${house.Users?.length || 0}</td>
      <td>${house.Devices?.length || 0}</td>
      <td>
        <div class="table-actions">
          <button type="button" class="table-action" data-house-edit="${house.id}">Editar</button>
          <button type="button" class="table-action table-action--danger" data-house-delete="${house.id}">Eliminar</button>
        </div>
      </td>
    `;
    adminEls.housesTable.appendChild(row);
  });
};

const renderDevices = (devices) => {
  devicesCache = devices;
  if (adminEls.devicesCount) adminEls.devicesCount.textContent = String(devices.length);
  if (!adminEls.devicesTable) return;

  adminEls.devicesTable.innerHTML = "";
  if (!devices.length) {
    adminEls.devicesTable.innerHTML =
      '<tr><td colspan="5" class="empty-cell">No hay dispositivos registrados todavía.</td></tr>';
    return;
  }

  devices.forEach((device) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${device.id}</td>
      <td>${device.name}</td>
      <td>${device.House ? `${device.House.name} (${device.House.code})` : "--"}</td>
      <td>${device.location || "--"}</td>
      <td><span class="table-pill" data-tone="${device.status === "FUGA" ? "danger" : device.status === "ALERTA" ? "alert" : "normal"}">${device.status || "--"}</span></td>
      <td>
        <div class="table-actions">
          <button type="button" class="table-action" data-device-edit="${device.id}">Editar</button>
          <button type="button" class="table-action table-action--danger" data-device-delete="${device.id}">Eliminar</button>
        </div>
      </td>
    `;
    adminEls.devicesTable.appendChild(row);
  });
};

const renderUsers = (users) => {
  usersCache = users;
  if (adminEls.usersCount) adminEls.usersCount.textContent = String(users.length);
  if (!adminEls.usersTable) return;

  adminEls.usersTable.innerHTML = "";
  if (!users.length) {
    adminEls.usersTable.innerHTML =
      '<tr><td colspan="5" class="empty-cell">No hay clientes registrados todavía.</td></tr>';
    return;
  }

  users.forEach((user) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${user.id}</td>
      <td>${user.nombre}</td>
      <td>${user.email}</td>
      <td>${String(user.role || "").toUpperCase()}</td>
      <td>${user.House ? `${user.House.name} (${user.House.code})` : "--"}</td>
      <td>
        <div class="table-actions">
          <button type="button" class="table-action" data-user-edit="${user.id}">Editar</button>
          <button type="button" class="table-action table-action--danger" data-user-delete="${user.id}">Eliminar</button>
        </div>
      </td>
    `;
    adminEls.usersTable.appendChild(row);
  });
};

const loadAdminData = async () => {
  const [housesResponse, usersResponse, devicesResponse] = await Promise.all([
    api("/api/houses"),
    api("/api/users"),
    api("/api/devices")
  ]);
  renderHouses(housesResponse.houses || []);
  renderUsers(usersResponse.users || []);
  renderDevices(devicesResponse.devices || []);
};

const validateSession = async () => {
  const token = localStorage.getItem("token") || "";
  if (!token) {
    setMessage(adminEls.adminGateMessage, "Inicia sesión para administrar casas y dispositivos.", "info");
    return false;
  }

  try {
    const response = await api("/api/auth/me");
    adminUser = response.user || null;
    if (adminUser?.role !== "admin") {
      setMessage(adminEls.adminGateMessage, "Este panel solo está disponible para usuarios con rol admin.", "error");
      if (adminEls.adminStatus) adminEls.adminStatus.textContent = "Acceso denegado";
      if (adminEls.adminSummary) adminEls.adminSummary.textContent = "Tu rol actual no puede usar el panel de administración";
      renderAdminIdentity();
      return false;
    }
    renderAdminIdentity();
    if (adminEls.adminStatus) adminEls.adminStatus.textContent = "Acceso concedido";
    if (adminEls.adminSummary) adminEls.adminSummary.textContent = "Backend local listo para administrar";
    return true;
  } catch (error) {
    clearSession();
    setMessage(adminEls.adminGateMessage, error.message, "error");
    if (adminEls.adminStatus) adminEls.adminStatus.textContent = "Sin acceso";
    if (adminEls.adminSummary) adminEls.adminSummary.textContent = "Necesitas iniciar sesión";
    renderAdminIdentity();
    return false;
  }
};

const bindForms = () => {
  if (adminEls.houseForm) {
    adminEls.houseForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const houseId = adminEls.houseId.value ? Number(adminEls.houseId.value) : null;
      const name = adminEls.houseName.value.trim();
      const address = adminEls.houseAddress.value.trim();
      const ownerName = adminEls.houseOwner.value.trim();
      const contactPhone = adminEls.housePhone.value.trim();
      const status = adminEls.houseStatus.value;

      if (name.length < 3) {
        setMessage(adminEls.houseMessage, "El nombre de la casa debe tener al menos 3 caracteres.", "error");
        return;
      }

      if (address.length < 5) {
        setMessage(adminEls.houseMessage, "La dirección debe tener al menos 5 caracteres.", "error");
        return;
      }

      if (ownerName.length < 3) {
        setMessage(adminEls.houseMessage, "El responsable debe tener al menos 3 caracteres.", "error");
        return;
      }

      if (contactPhone.length < 7) {
        setMessage(adminEls.houseMessage, "El teléfono debe tener al menos 7 caracteres.", "error");
        return;
      }

      setMessage(adminEls.houseMessage, houseId ? "Actualizando casa..." : "Creando casa...", "info");

      try {
        const response = await api(houseId ? `/api/houses/${houseId}` : "/api/houses", {
          method: houseId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, address, owner_name: ownerName, contact_phone: contactPhone, status })
        });

        resetHouseForm();
        setMessage(
          adminEls.houseMessage,
          houseId
            ? `Casa actualizada correctamente. Código actual: ${response.house.code}`
            : `Casa creada correctamente. Código asignado: ${response.house.code}`,
          "success"
        );
        await loadAdminData();
      } catch (error) {
        setMessage(adminEls.houseMessage, error.message, "error");
      }
    });
  }

  if (adminEls.userForm) {
    adminEls.userForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const userId = adminEls.userId.value ? Number(adminEls.userId.value) : null;
      const nombre = adminEls.userName.value.trim();
      const email = adminEls.userEmail.value.trim();
      const password = adminEls.userPassword.value;
      const houseId = adminEls.userHouseId.value ? Number(adminEls.userHouseId.value) : undefined;
      const role = adminEls.userRole.value;

      if (nombre.length < 3) {
        setMessage(adminEls.userMessage, "El nombre del cliente debe tener al menos 3 caracteres.", "error");
        return;
      }

      if (!email.includes("@")) {
        setMessage(adminEls.userMessage, "Ingresa un correo válido.", "error");
        return;
      }

      if (!userId && password.length < 6) {
        setMessage(adminEls.userMessage, "La contraseña debe tener al menos 6 caracteres.", "error");
        return;
      }
      if (userId && password && password.length < 6) {
        setMessage(adminEls.userMessage, "La nueva contraseña debe tener al menos 6 caracteres.", "error");
        return;
      }

      if (!houseId) {
        setMessage(adminEls.userMessage, "Selecciona la casa a la que pertenecerá este cliente.", "error");
        return;
      }

      setMessage(adminEls.userMessage, userId ? "Actualizando cliente..." : "Creando cliente...", "info");

      try {
        await api(userId ? `/api/users/${userId}` : "/api/users", {
          method: userId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre, email, password, houseId, role })
        });

        resetUserForm();
        setMessage(adminEls.userMessage, userId ? "Cliente actualizado correctamente." : "Cliente creado correctamente.", "success");
        await loadAdminData();
      } catch (error) {
        setMessage(adminEls.userMessage, error.message, "error");
      }
    });
  }

  if (adminEls.deviceForm) {
    adminEls.deviceForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const deviceId = adminEls.deviceId.value ? Number(adminEls.deviceId.value) : null;
      const name = adminEls.deviceName.value.trim();
      const location = adminEls.deviceLocation.value.trim();
      const houseId = adminEls.deviceHouseId.value ? Number(adminEls.deviceHouseId.value) : undefined;
      const status = adminEls.deviceStatus.value;

      if (name.length < 3) {
        setMessage(adminEls.deviceMessage, "El nombre del dispositivo debe tener al menos 3 caracteres.", "error");
        return;
      }

      if (!houseId) {
        setMessage(adminEls.deviceMessage, "Selecciona una casa para asociar el dispositivo.", "error");
        return;
      }

      if (location.length < 3) {
        setMessage(adminEls.deviceMessage, "La ubicación debe tener al menos 3 caracteres.", "error");
        return;
      }

      setMessage(adminEls.deviceMessage, deviceId ? "Actualizando dispositivo..." : "Creando dispositivo...", "info");

      try {
        const response = await api(deviceId ? `/api/devices/${deviceId}` : "/api/devices", {
          method: deviceId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, houseId, location, status })
        });

        resetDeviceForm();
        setMessage(
          adminEls.deviceMessage,
          deviceId
            ? `Dispositivo actualizado correctamente: ${response.device.name}`
            : `Dispositivo creado correctamente: ${response.device.name}`,
          "success"
        );
        fillHouseOptions();
        await loadAdminData();
      } catch (error) {
        setMessage(adminEls.deviceMessage, error.message, "error");
      }
    });
  }

  if (adminEls.houseCancelBtn) {
    adminEls.houseCancelBtn.addEventListener("click", () => {
      resetHouseForm();
      setMessage(adminEls.houseMessage, "Edición cancelada.", "info");
    });
  }

  if (adminEls.deviceCancelBtn) {
    adminEls.deviceCancelBtn.addEventListener("click", () => {
      resetDeviceForm();
      setMessage(adminEls.deviceMessage, "Edición cancelada.", "info");
    });
  }

  if (adminEls.userCancelBtn) {
    adminEls.userCancelBtn.addEventListener("click", () => {
      resetUserForm();
      setMessage(adminEls.userMessage, "Edición cancelada.", "info");
    });
  }

  if (adminEls.housesTable) {
    adminEls.housesTable.addEventListener("click", async (event) => {
      const editButton = event.target.closest("[data-house-edit]");
      const deleteButton = event.target.closest("[data-house-delete]");

      if (editButton) {
        const house = housesCache.find((item) => item.id === Number(editButton.dataset.houseEdit));
        if (!house) return;
        adminEls.houseId.value = String(house.id);
        adminEls.houseName.value = house.name || "";
        adminEls.houseAddress.value = house.address || "";
        adminEls.houseOwner.value = house.owner_name || "";
        adminEls.housePhone.value = house.contact_phone || "";
        adminEls.houseStatus.value = house.status || "ACTIVA";
        adminEls.houseSubmitBtn.textContent = "Actualizar casa";
        adminEls.houseCancelBtn.hidden = false;
        setMessage(adminEls.houseMessage, `Editando ${house.name}. El código ${house.code} se conserva automáticamente.`, "info");
        return;
      }

      if (deleteButton) {
        const houseId = Number(deleteButton.dataset.houseDelete);
        const house = housesCache.find((item) => item.id === houseId);
        if (!house) return;
        if (!window.confirm(`¿Eliminar la casa "${house.name}"?`)) return;

        try {
          await api(`/api/houses/${houseId}`, { method: "DELETE" });
          resetHouseForm();
          setMessage(adminEls.houseMessage, "Casa eliminada correctamente.", "success");
          await loadAdminData();
        } catch (error) {
          setMessage(adminEls.houseMessage, error.message, "error");
        }
      }
    });
  }

  if (adminEls.devicesTable) {
    adminEls.devicesTable.addEventListener("click", async (event) => {
      const editButton = event.target.closest("[data-device-edit]");
      const deleteButton = event.target.closest("[data-device-delete]");

      if (editButton) {
        const device = devicesCache.find((item) => item.id === Number(editButton.dataset.deviceEdit));
        if (!device) return;
        adminEls.deviceId.value = String(device.id);
        adminEls.deviceName.value = device.name || "";
        adminEls.deviceHouseId.value = device.house_id ? String(device.house_id) : "";
        adminEls.deviceLocation.value = device.location || "";
        adminEls.deviceStatus.value = device.status || "ACTIVO";
        adminEls.deviceSubmitBtn.textContent = "Actualizar dispositivo";
        adminEls.deviceCancelBtn.hidden = false;
        setMessage(adminEls.deviceMessage, `Editando dispositivo ${device.name}.`, "info");
        return;
      }

      if (deleteButton) {
        const deviceId = Number(deleteButton.dataset.deviceDelete);
        const device = devicesCache.find((item) => item.id === deviceId);
        if (!device) return;
        if (!window.confirm(`¿Eliminar el dispositivo "${device.name}"?`)) return;

        try {
          await api(`/api/devices/${deviceId}`, { method: "DELETE" });
          resetDeviceForm();
          setMessage(adminEls.deviceMessage, "Dispositivo eliminado correctamente.", "success");
          await loadAdminData();
        } catch (error) {
          setMessage(adminEls.deviceMessage, error.message, "error");
        }
      }
    });
  }

  if (adminEls.usersTable) {
    adminEls.usersTable.addEventListener("click", async (event) => {
      const editButton = event.target.closest("[data-user-edit]");
      const deleteButton = event.target.closest("[data-user-delete]");

      if (editButton) {
        const user = usersCache.find((item) => item.id === Number(editButton.dataset.userEdit));
        if (!user) return;
        adminEls.userId.value = String(user.id);
        adminEls.userName.value = user.nombre || "";
        adminEls.userEmail.value = user.email || "";
        adminEls.userPassword.value = "";
        adminEls.userHouseId.value = user.house_id ? String(user.house_id) : "";
        adminEls.userRole.value = user.role || "resident";
        adminEls.userSubmitBtn.textContent = "Actualizar cliente";
        adminEls.userCancelBtn.hidden = false;
        setMessage(adminEls.userMessage, `Editando cliente ${user.nombre}. Deja la contraseña vacía si no deseas cambiarla.`, "info");
        return;
      }

      if (deleteButton) {
        const userId = Number(deleteButton.dataset.userDelete);
        const user = usersCache.find((item) => item.id === userId);
        if (!user) return;
        if (!window.confirm(`¿Eliminar el cliente "${user.nombre}"?`)) return;

        try {
          await api(`/api/users/${userId}`, { method: "DELETE" });
          resetUserForm();
          setMessage(adminEls.userMessage, "Cliente eliminado correctamente.", "success");
          await loadAdminData();
        } catch (error) {
          setMessage(adminEls.userMessage, error.message, "error");
        }
      }
    });
  }
};

const initAdminPage = async () => {
  setVisibility(false);
  renderAdminIdentity();

  const isAuthenticated = await validateSession();
  setVisibility(isAuthenticated);
  if (!isAuthenticated) return;

  bindForms();
  resetHouseForm();
  resetUserForm();
  resetDeviceForm();
  await loadAdminData();

  if (adminEls.logoutBtn) {
    adminEls.logoutBtn.addEventListener("click", () => {
      clearSession();
      window.location.href = "../login/";
    });
  }
};

window.addEventListener("load", () => {
  if ((document.body.dataset.page || "") !== "admin") return;

  initAdminPage().catch((error) => {
    console.error("No se pudo inicializar el panel de administracion.", error);
    setMessage(adminEls.adminGateMessage, "No fue posible cargar la administración local.", "error");
    setVisibility(false);
  });
});
