/* ═══════════════════════════════════════════════════════════════════════
   admin.js — Asset Tracking System — Admin Panel Logic
   ═══════════════════════════════════════════════════════════════════════ */

// ─── Constants ───────────────────────────────────────────────────────
const AUTH_TOKEN_KEY = "ats.auth_token";
const STORAGE_FLAG   = "ats.remember_master_key";
const STORAGE_VALUE  = "ats.master_key";

const COLUMN_ALIASES = {
  original_id:   ["id", "asset id", "asset_id", "original id", "original_id"],
  max_scans:     ["max scans", "max_scans", "maximum scans", "scan limit"],
  lat:           ["lat", "latitude"],
  lon:           ["lon", "lng", "longitude", "long"],
  radius_meters: ["radius", "radius meters", "radius_meters", "radius m", "radius (m)"],
};

const DEFAULT_COLUMN_INDEXES = {
  original_id: 0,
  max_scans: 1,
  lat: 2,
  lon: 3,
  radius_meters: 4,
};

// ─── DOM References ──────────────────────────────────────────────────
// Login
const loginScreen    = document.getElementById("login-screen");
const loginForm      = document.getElementById("login-form");
const loginUsername   = document.getElementById("login-username");
const loginPassword   = document.getElementById("login-password");
const loginBtn       = document.getElementById("login-btn");
const loginBtnText   = document.getElementById("login-btn-text");
const loginBtnSpinner = document.getElementById("login-btn-spinner");
const loginError     = document.getElementById("login-error");

// App Shell
const appShell       = document.getElementById("app-shell");
const pageTitle      = document.getElementById("page-title");
const userAvatar     = document.getElementById("user-avatar");
const userDisplayName = document.getElementById("user-display-name");
const logoutBtn      = document.getElementById("logout-btn");

// Navigation
const navItems       = document.querySelectorAll(".nav-item[data-page]");
const pageViews      = document.querySelectorAll(".page-view");

// Dashboard — Master Key
const masterKeyInput         = document.getElementById("master-key");
const rememberKeyToggle      = document.getElementById("remember-key");
const toggleKeyVisibilityBtn = document.getElementById("toggle-key-visibility");

// Dashboard — Tabs
const tabButtons   = document.querySelectorAll(".tab-btn");
const manualPanel  = document.getElementById("manual-panel");
const bulkPanel    = document.getElementById("bulk-panel");

// Dashboard — Rows
const rowsBody     = document.getElementById("rows-body");
const addRowBtn    = document.getElementById("add-row");
const clearRowsBtn = document.getElementById("clear-rows");

// Dashboard — Bulk Upload
const dropZone      = document.getElementById("drop-zone");
const selectFileBtn = document.getElementById("select-file-btn");
const fileInput     = document.getElementById("file-input");
const fileFeedback  = document.getElementById("file-feedback");

// Dashboard — Generate
const idCount       = document.getElementById("id-count");
const generateBtn   = document.getElementById("generate-btn");
const loadingText   = document.getElementById("loading-text");
const banner        = document.getElementById("banner");
const resultsSection = document.getElementById("results-section");
const resultsBody   = document.getElementById("results-body");
const downloadAllPdfBtn = document.getElementById("download-all-pdf-btn");
const downloadSourcePdfBtn = document.getElementById("download-source-pdf-btn");

// Modal
const qrModal       = document.getElementById("qr-modal");
const modalId       = document.getElementById("modal-id");
const modalImage    = document.getElementById("modal-image");
const closeModalBtn = document.getElementById("close-modal");
const modalDownloadBtn = document.getElementById("modal-download-btn");

// Settings
const settingsForm          = document.getElementById("settings-form");
const settingsBanner        = document.getElementById("settings-banner");
const settingsCurrentPwd    = document.getElementById("settings-current-password");
const settingsNewUsername   = document.getElementById("settings-new-username");
const settingsNewPassword   = document.getElementById("settings-new-password");
const settingsConfirmPwd    = document.getElementById("settings-confirm-password");

// ID Manager
const assetSearchForm       = document.getElementById("asset-search-form");
const assetSearchInput      = document.getElementById("asset-search-input");
const assetSearchClearBtn   = document.getElementById("asset-search-clear");
const idManagerBanner       = document.getElementById("id-manager-banner");
const recentIdsCount        = document.getElementById("recent-ids-count");
const recentIdsBody         = document.getElementById("recent-ids-body");

// DB Reset
const resetDbBtn            = document.getElementById("reset-db-btn");
const resetDbModal          = document.getElementById("reset-db-modal");
const closeResetModalBtn    = document.getElementById("close-reset-modal");
const cancelResetBtn        = document.getElementById("cancel-reset-btn");
const confirmResetBtn       = document.getElementById("confirm-reset-btn");

// ─── State ───────────────────────────────────────────────────────────
const state = {
  loading: false,
  results: [],
  currentUser: null,
  managedAssets: [],
  modalPreviewItem: null,
};

// ═══════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════

function getToken() {
  return sessionStorage.getItem(AUTH_TOKEN_KEY) || "";
}

function setToken(token) {
  sessionStorage.setItem(AUTH_TOKEN_KEY, token);
}

function clearToken() {
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
}

function authHeaders() {
  return { Authorization: "Bearer " + getToken() };
}

function showLoginScreen() {
  loginScreen.classList.remove("hidden");
  appShell.classList.remove("visible");
  loginUsername.value = "";
  loginPassword.value = "";
  loginError.classList.remove("visible");
  loginUsername.focus();
}

function showApp(username) {
  state.currentUser = username;
  loginScreen.classList.add("hidden");
  appShell.classList.add("visible");

  userDisplayName.textContent = username;
  userAvatar.textContent = (username[0] || "A").toUpperCase();
}

async function checkAuth() {
  const token = getToken();
  if (!token) {
    showLoginScreen();
    return;
  }

  try {
    const res = await fetch("/api/me", { headers: authHeaders() });
    if (!res.ok) throw new Error("Invalid session");
    const data = await res.json();
    showApp(data.username);
  } catch {
    clearToken();
    showLoginScreen();
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.classList.remove("visible");

  const username = loginUsername.value.trim();
  const password = loginPassword.value;

  if (!username || !password) {
    loginError.textContent = "Please enter both username and password.";
    loginError.classList.add("visible");
    return;
  }

  loginBtn.disabled = true;
  loginBtnText.textContent = "Signing in…";
  loginBtnSpinner.classList.add("visible");

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.detail || "Invalid credentials.");
    }

    setToken(data.token);
    showApp(data.username);
  } catch (err) {
    loginError.textContent = err.message || "Login failed.";
    loginError.classList.add("visible");
  } finally {
    loginBtn.disabled = false;
    loginBtnText.textContent = "Sign In";
    loginBtnSpinner.classList.remove("visible");
  }
});

logoutBtn.addEventListener("click", () => {
  clearToken();
  showLoginScreen();
});

// ═══════════════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════════════

const PAGE_TITLES = {
  dashboard: "Dashboard",
  "id-manager": "ID Manager",
  settings: "Settings",
};

function navigateTo(page) {
  navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.page === page);
  });

  pageViews.forEach((view) => {
    view.classList.toggle("active", view.id === "page-" + page);
  });

  pageTitle.textContent = PAGE_TITLES[page] || "Dashboard";

  if (page === "id-manager") {
    refreshManagedAssets(assetSearchInput.value);
  }
}

navItems.forEach((item) => {
  item.addEventListener("click", () => navigateTo(item.dataset.page));
});

// ═══════════════════════════════════════════════════════════════════════
// BANNER HELPERS
// ═══════════════════════════════════════════════════════════════════════

function showBanner(message, tone) {
  if (!message) {
    banner.className = "banner";
    banner.textContent = "";
    return;
  }

  const cls = tone === "success" ? "banner-success" : tone === "info" ? "banner-info" : "banner-error";
  banner.textContent = message;
  banner.className = "banner visible " + cls;
}

function showSettingsBanner(message, tone) {
  if (!message) {
    settingsBanner.className = "settings-banner";
    settingsBanner.textContent = "";
    return;
  }

  const cls = tone === "success" ? "banner-success" : tone === "info" ? "banner-info" : "banner-error";
  settingsBanner.textContent = message;
  settingsBanner.className = "settings-banner visible " + cls;
}

function showIdManagerBanner(message, tone) {
  if (!message) {
    idManagerBanner.className = "banner";
    idManagerBanner.textContent = "";
    return;
  }

  const cls = tone === "success" ? "banner-success" : tone === "info" ? "banner-info" : "banner-error";
  idManagerBanner.textContent = message;
  idManagerBanner.className = "banner visible " + cls;
}

// ═══════════════════════════════════════════════════════════════════════
// LOADING STATE
// ═══════════════════════════════════════════════════════════════════════

function setLoading(value) {
  state.loading = value;
  loadingText.classList.toggle("visible", value);
  updateGenerateState();
}

// ═══════════════════════════════════════════════════════════════════════
// TABLE ROWS
// ═══════════════════════════════════════════════════════════════════════

function renumberRows() {
  Array.from(rowsBody.querySelectorAll("tr")).forEach((row, i) => {
    const cell = row.querySelector("[data-row-index]");
    if (cell) cell.textContent = String(i + 1);
  });
}

function collectIds() {
  return Array.from(rowsBody.querySelectorAll("input[data-role='asset-id']"))
    .map((input) => input.value.trim())
    .filter(Boolean);
}

function updateGenerateState() {
  const ids = collectIds();
  idCount.textContent = ids.length + " ID(s) ready";

  generateBtn.disabled = state.loading || ids.length === 0;
}

function normalizeRowInput(rowData) {
  const source = typeof rowData === "string" ? { original_id: rowData } : rowData || {};
  const maxScansValue = String(source.max_scans ?? source.maxScans ?? "1").trim();
  const radiusValue = String(source.radius_meters ?? source.radius ?? "100").trim();

  return {
    original_id: String(source.original_id ?? source.id ?? "").trim(),
    max_scans: maxScansValue || "1",
    lat: source.lat == null ? "" : String(source.lat).trim(),
    lon: source.lon == null ? "" : String(source.lon).trim(),
    radius_meters: radiusValue || "100",
  };
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => {
        if (err.code === err.PERMISSION_DENIED)
          reject(new Error("Location permission denied."));
        else reject(new Error("Unable to retrieve location."));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

function createRow(rowData) {
  const n = normalizeRowInput(rowData);
  const row = document.createElement("tr");

  // Index cell
  const indexCell = document.createElement("td");
  indexCell.setAttribute("data-row-index", "");
  indexCell.setAttribute("data-label", "#");
  indexCell.style.fontWeight = "600";
  indexCell.style.color = "var(--text-tertiary)";
  indexCell.style.fontSize = "13px";

  // Asset ID
  const idCell = document.createElement("td");
  idCell.setAttribute("data-label", "Asset ID");
  const idInput = document.createElement("input");
  idInput.type = "text";
  idInput.value = n.original_id;
  idInput.setAttribute("data-role", "asset-id");
  idInput.className = "table-input mono";
  idInput.placeholder = "ASSET-0001";
  idInput.addEventListener("input", updateGenerateState);
  idCell.appendChild(idInput);

  // Max Scans
  const maxScansCell = document.createElement("td");
  maxScansCell.setAttribute("data-label", "Max Scans");
  const maxScansInput = document.createElement("input");
  maxScansInput.type = "number";
  maxScansInput.min = "1";
  maxScansInput.step = "1";
  maxScansInput.value = n.max_scans;
  maxScansInput.setAttribute("data-role", "max-scans");
  maxScansInput.className = "table-input";
  maxScansCell.appendChild(maxScansInput);

  // Geofence
  const geofenceCell = document.createElement("td");
  geofenceCell.setAttribute("data-label", "Geofence");

  const geofenceGrid = document.createElement("div");
  geofenceGrid.className = "geofence-grid";

  const setLocationBtn = document.createElement("button");
  setLocationBtn.type = "button";
  setLocationBtn.className = "btn-locate";
  setLocationBtn.innerHTML = '<i data-lucide="locate-fixed" style="width:14px;height:14px"></i>Set GPS';

  const latInput = document.createElement("input");
  latInput.type = "number"; latInput.step = "any"; latInput.min = "-90"; latInput.max = "90";
  latInput.value = n.lat; latInput.placeholder = "Latitude";
  latInput.setAttribute("data-role", "lat");
  latInput.className = "table-input";

  const lonInput = document.createElement("input");
  lonInput.type = "number"; lonInput.step = "any"; lonInput.min = "-180"; lonInput.max = "180";
  lonInput.value = n.lon; lonInput.placeholder = "Longitude";
  lonInput.setAttribute("data-role", "lon");
  lonInput.className = "table-input";

  const radiusInput = document.createElement("input");
  radiusInput.type = "number"; radiusInput.step = "1"; radiusInput.min = "1";
  radiusInput.value = n.radius_meters; radiusInput.placeholder = "Radius (m)";
  radiusInput.setAttribute("data-role", "radius-meters");
  radiusInput.className = "table-input";

  setLocationBtn.addEventListener("click", async () => {
    const orig = setLocationBtn.innerHTML;
    setLocationBtn.disabled = true;
    setLocationBtn.textContent = "Locating…";
    try {
      const coords = await getCurrentPosition();
      latInput.value = Number(coords.latitude).toFixed(8);
      lonInput.value = Number(coords.longitude).toFixed(8);
      showBanner("GPS captured for this row.", "success");
    } catch (err) {
      showBanner(err.message, "error");
    } finally {
      setLocationBtn.disabled = false;
      setLocationBtn.innerHTML = orig;
      lucide.createIcons();
    }
  });

  geofenceGrid.append(setLocationBtn, latInput, lonInput, radiusInput);

  const hint = document.createElement("p");
  hint.className = "geofence-hint";
  hint.textContent = "Leave Lat/Lon empty to skip geofence.";

  geofenceCell.append(geofenceGrid, hint);

  // Action
  const actionCell = document.createElement("td");
  actionCell.setAttribute("data-label", "Action");
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "icon-btn";
  removeBtn.innerHTML = '<i data-lucide="trash-2"></i>';
  removeBtn.addEventListener("click", () => {
    if (rowsBody.children.length === 1) {
      idInput.value = "";
      maxScansInput.value = "1";
      latInput.value = "";
      lonInput.value = "";
      radiusInput.value = "100";
    } else {
      row.remove();
    }
    renumberRows();
    lucide.createIcons();
    updateGenerateState();
  });
  actionCell.appendChild(removeBtn);

  row.append(indexCell, idCell, maxScansCell, geofenceCell, actionCell);
  return row;
}

function setRows(values) {
  rowsBody.innerHTML = "";
  const src = values.length ? values : [{}];
  src.forEach((v) => rowsBody.appendChild(createRow(v)));
  renumberRows();
  lucide.createIcons();
  updateGenerateState();
}

function addRow(value) {
  rowsBody.appendChild(createRow(value || {}));
  renumberRows();
  lucide.createIcons();
  updateGenerateState();
}

// ═══════════════════════════════════════════════════════════════════════
// TAB SWITCHING
// ═══════════════════════════════════════════════════════════════════════

function setActiveTab(name) {
  const isManual = name === "manual";
  manualPanel.classList.toggle("hidden", !isManual);
  bulkPanel.classList.toggle("hidden", isManual);

  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === name);
  });
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
});

// ═══════════════════════════════════════════════════════════════════════
// FILE PARSING
// ═══════════════════════════════════════════════════════════════════════

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function resolveHeaderMap(headerRow) {
  const map = {};
  headerRow.forEach((cell, index) => {
    const normalized = normalizeHeader(cell);
    if (!normalized) return;
    Object.entries(COLUMN_ALIASES).forEach(([field, aliases]) => {
      if (typeof map[field] === "undefined" && aliases.includes(normalized)) {
        map[field] = index;
      }
    });
  });
  return map;
}

function getCellValue(row, index) {
  if (typeof index !== "number") return "";
  return String((row && row[index]) ?? "").trim();
}

function mapRawRow(row, indexes) {
  return {
    original_id: getCellValue(row, indexes.original_id),
    max_scans: getCellValue(row, indexes.max_scans) || "1",
    lat: getCellValue(row, indexes.lat),
    lon: getCellValue(row, indexes.lon),
    radius_meters: getCellValue(row, indexes.radius_meters) || "100",
  };
}

function parseRowsFromGrid(rawRows) {
  const rows = rawRows.filter((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim()));
  if (!rows.length) return [];

  const headerMap = resolveHeaderMap(rows[0]);
  const hasHeader = typeof headerMap.original_id === "number";
  const indexes = hasHeader ? { ...DEFAULT_COLUMN_INDEXES, ...headerMap } : DEFAULT_COLUMN_INDEXES;
  const startAt = hasHeader ? 1 : 0;
  const mapped = [];

  for (let i = startAt; i < rows.length; i++) {
    const m = mapRawRow(rows[i], indexes);
    if (m.original_id) mapped.push(m);
  }
  return mapped;
}

function parseClipboardRows(rawText) {
  const rows = rawText.split(/\r?\n/).map((line) => line.split("\t").map((c) => c.trim()));
  return parseRowsFromGrid(rows);
}

async function extractRowsFromFile(file) {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".xls") && !name.endsWith(".csv")) {
    throw new Error("Invalid format. Upload .xlsx, .xls, or .csv.");
  }

  let workbook;
  if (name.endsWith(".csv")) {
    workbook = XLSX.read(await file.text(), { type: "string" });
  } else {
    workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, raw: false, defval: "" });
  const parsed = parseRowsFromGrid(rows);

  if (!parsed.length) throw new Error("No asset rows found in file.");
  return parsed;
}

async function handleFile(file) {
  try {
    const rows = await extractRowsFromFile(file);
    setRows(rows);
    setActiveTab("manual");
    fileFeedback.textContent = "Imported " + rows.length + " rows from " + file.name + ".";
    showBanner("Bulk upload: " + rows.length + " rows loaded.", "success");
  } catch (err) {
    fileFeedback.textContent = "";
    showBanner(err.message || "Unable to read file.", "error");
  }
}

// ═══════════════════════════════════════════════════════════════════════
// RECORD COLLECTION & VALIDATION
// ═══════════════════════════════════════════════════════════════════════

function parseIntDef(raw, fallback) {
  const s = String(raw ?? "").trim();
  if (!s) return fallback;
  if (!/^-?\d+$/.test(s)) return NaN;
  return parseInt(s, 10);
}

function parseFloatOrNull(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function collectRecordsForSubmission() {
  const rowEls = Array.from(rowsBody.querySelectorAll("tr"));
  const records = [];

  rowEls.forEach((row, i) => {
    const origId = row.querySelector("input[data-role='asset-id']").value.trim();
    if (!origId) return;

    const maxScans = parseIntDef(row.querySelector("input[data-role='max-scans']").value, 1);
    if (!Number.isInteger(maxScans) || maxScans < 1)
      throw new Error("Row " + (i + 1) + ": Max Scans must be a positive integer.");

    const radius = parseIntDef(row.querySelector("input[data-role='radius-meters']").value, 100);
    if (!Number.isInteger(radius) || radius < 1)
      throw new Error("Row " + (i + 1) + ": Radius must be a positive integer.");

    const lat = parseFloatOrNull(row.querySelector("input[data-role='lat']").value);
    const lon = parseFloatOrNull(row.querySelector("input[data-role='lon']").value);

    if ((lat !== null) !== (lon !== null))
      throw new Error("Row " + (i + 1) + ": Lat and Lon must both be provided.");

    if (lat !== null) {
      if (isNaN(lat) || lat < -90 || lat > 90)
        throw new Error("Row " + (i + 1) + ": Latitude must be between -90 and 90.");
      if (isNaN(lon) || lon < -180 || lon > 180)
        throw new Error("Row " + (i + 1) + ": Longitude must be between -180 and 180.");
    }

    records.push({
      original_id: origId,
      max_scans: maxScans,
      lat: lat,
      lon: lon,
      radius_meters: radius,
    });
  });

  return records;
}

// ═══════════════════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════════════════

function renderResults() {
  resultsBody.innerHTML = "";

  if (!state.results.length) {
    resultsSection.classList.add("hidden");
    return;
  }

  state.results.forEach((item, index) => {
    const row = document.createElement("tr");

    const statusCell = document.createElement("td");
    statusCell.setAttribute("data-label", "Status");
    statusCell.innerHTML =
      '<span class="badge badge-emerald"><i data-lucide="check-circle-2" style="width:14px;height:14px"></i>Success</span>';

    const idCell = document.createElement("td");
    idCell.setAttribute("data-label", "Original ID");
    idCell.className = "mono";
    idCell.style.fontSize = "13px";
    idCell.textContent = item.original_id;

    const viewCell = document.createElement("td");
    viewCell.setAttribute("data-label", "View");
    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.dataset.action = "preview";
    viewBtn.dataset.index = String(index);
    viewBtn.className = "btn btn-secondary btn-xs";
    viewBtn.innerHTML = '<i data-lucide="eye" style="width:13px;height:13px"></i>View QR';
    viewCell.appendChild(viewBtn);

    const pdfCell = document.createElement("td");
    pdfCell.setAttribute("data-label", "Download PDF");
    const pdfBtn = document.createElement("button");
    pdfBtn.type = "button";
    pdfBtn.dataset.action = "pdf";
    pdfBtn.dataset.index = String(index);
    pdfBtn.className = "btn btn-primary btn-xs";
    pdfBtn.innerHTML = '<i data-lucide="file-down" style="width:13px;height:13px"></i>Download';
    pdfCell.appendChild(pdfBtn);

    row.append(statusCell, idCell, viewCell, pdfCell);
    resultsBody.appendChild(row);
  });

  resultsSection.classList.remove("hidden");
  lucide.createIcons();
}

// ═══════════════════════════════════════════════════════════════════════
// QR MODAL
// ═══════════════════════════════════════════════════════════════════════

function openQrModal(item) {
  state.modalPreviewItem = item;
  modalId.textContent = item.original_id;
  modalImage.src = item.qr_path;
  modalDownloadBtn.disabled = false;
  qrModal.classList.add("visible");
}

function closeQrModal() {
  qrModal.classList.remove("visible");
  modalImage.src = "";
  state.modalPreviewItem = null;
  modalDownloadBtn.disabled = true;
}

closeModalBtn.addEventListener("click", closeQrModal);
qrModal.addEventListener("click", (e) => { if (e.target === qrModal) closeQrModal(); });

modalDownloadBtn.addEventListener("click", async () => {
  const item = state.modalPreviewItem;
  if (!item || !item.qr_path) {
    showBanner("No QR is available to download.", "error");
    return;
  }

  const originalLabel = modalDownloadBtn.innerHTML;
  modalDownloadBtn.disabled = true;
  modalDownloadBtn.textContent = "Downloading...";

  try {
    const response = await fetch(item.qr_path);
    if (!response.ok) throw new Error("Could not load QR image.");

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = safeFileName(item.original_id || "asset-id") + "-qr.png";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (err) {
    showBanner(err.message || "Failed to download QR image.", "error");
  } finally {
    modalDownloadBtn.disabled = false;
    modalDownloadBtn.innerHTML = originalLabel;
    lucide.createIcons();
  }
});

// ═══════════════════════════════════════════════════════════════════════
// PDF GENERATION
// ═══════════════════════════════════════════════════════════════════════

async function imageToDataUrl(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error("Could not load QR image.");
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to convert QR image."));
    reader.readAsDataURL(blob);
  });
}

function safeFileName(val) {
  return String(val).trim().replace(/[^a-zA-Z0-9_-]+/g, "-") || "asset-tag";
}

function uniqueValues(values) {
  const seen = new Set();
  return values.filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

async function fetchAssetsByIds(ids) {
  const response = await fetch("/api/assets/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ ids }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || "Asset lookup failed.");
  return payload;
}

async function downloadAssetTag(item) {
  const imageData = await imageToDataUrl(item.qr_path);
  const { jsPDF } = window.jspdf;

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [120, 180], compress: true, putOnlyUsedFonts: true });

  pdf.setFillColor(248, 250, 252);
  pdf.rect(0, 0, 120, 180, "F");

  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(0.7);
  pdf.roundedRect(8, 8, 104, 164, 3, 3, "S");

  pdf.setFillColor(241, 245, 249);
  pdf.roundedRect(20, 16, 80, 20, 2, 2, "F");

  pdf.setTextColor(71, 85, 105);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("CLIENT LOGO", 60, 27, { align: "center" });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text("Secure Asset Tag", 60, 35, { align: "center" });

  pdf.addImage(imageData, "PNG", 30, 46, 60, 60, undefined, "FAST");

  pdf.setTextColor(15, 23, 42);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text(pdf.splitTextToSize(item.original_id, 90), 60, 120, { align: "center" });

  pdf.setTextColor(100, 116, 139);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text("Encrypted and verified by Asset Tracking System", 60, 162, { align: "center" });

  pdf.save(safeFileName(item.original_id) + "-asset-tag.pdf");
}

async function downloadAllAssetTagsPdf(items) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error("No generated QRs are available for batch download.");
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    throw new Error("PDF generator library is not loaded.");
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true, putOnlyUsedFonts: true });

  const pageWidth = 210;
  const pageHeight = 297;
  const columns = 2;
  const rows = 3;
  const perPage = columns * rows;
  const marginX = 10;
  const marginY = 12;
  const gapX = 6;
  const gapY = 8;
  const cellWidth = (pageWidth - marginX * 2 - gapX * (columns - 1)) / columns;
  const cellHeight = (pageHeight - marginY * 2 - gapY * (rows - 1)) / rows;

  for (let i = 0; i < items.length; i++) {
    if (i > 0 && i % perPage === 0) {
      pdf.addPage();
    }

    const slotIndex = i % perPage;
    const col = slotIndex % columns;
    const row = Math.floor(slotIndex / columns);
    const x = marginX + col * (cellWidth + gapX);
    const y = marginY + row * (cellHeight + gapY);
    const item = items[i] || {};

    pdf.setDrawColor(203, 213, 225);
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(x, y, cellWidth, cellHeight, 2, 2, "FD");

    let qrRendered = false;
    try {
      const imageData = await imageToDataUrl(item.qr_path);
      const maxQrWidth = cellWidth - 18;
      const maxQrHeight = cellHeight - 26;
      const qrSize = Math.max(26, Math.min(maxQrWidth, maxQrHeight));
      const qrX = x + (cellWidth - qrSize) / 2;
      const qrY = y + 8;
      pdf.addImage(imageData, "PNG", qrX, qrY, qrSize, qrSize, undefined, "FAST");
      qrRendered = true;
    } catch {
      qrRendered = false;
    }

    if (!qrRendered) {
      const fallbackSize = Math.min(cellWidth - 22, 36);
      const fallbackX = x + (cellWidth - fallbackSize) / 2;
      const fallbackY = y + 12;
      pdf.setDrawColor(148, 163, 184);
      pdf.rect(fallbackX, fallbackY, fallbackSize, fallbackSize);
      pdf.setTextColor(148, 163, 184);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.text("QR missing", x + cellWidth / 2, fallbackY + fallbackSize + 5, { align: "center" });
    }

    const label = String(item.original_id || item.public_id || ("ASSET-" + (i + 1))).trim();
    const labelLines = pdf.splitTextToSize(label, cellWidth - 12).slice(0, 2);

    pdf.setTextColor(15, 23, 42);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);

    const labelY = y + cellHeight - (labelLines.length > 1 ? 9 : 7);
    pdf.text(labelLines, x + cellWidth / 2, labelY, { align: "center" });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  pdf.save("encrypted-qrs-" + stamp + ".pdf");
}

// ═══════════════════════════════════════════════════════════════════════
// INGESTION
// ═══════════════════════════════════════════════════════════════════════

async function submitIngestion() {
  showBanner();

  const masterKey = masterKeyInput.value.trim();
  let records;

  if (!masterKey) {
    showBanner("Master Encryption Key is required.", "error");
    return;
  }
  if (masterKey.length < 8) {
    showBanner("Master Key must be at least 8 characters.", "error");
    return;
  }

  try {
    records = collectRecordsForSubmission();
  } catch (err) {
    showBanner(err.message, "error");
    return;
  }

  if (records.length < 1) {
    showBanner("Provide at least 1 ID.", "error");
    return;
  }

  try {
    setLoading(true);

    const res = await fetch("/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ master_key: masterKey, records }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.detail || "Ingestion failed.");

    state.results = payload.items || [];
    renderResults();
    showBanner("Success: " + state.results.length + " assets encrypted.", "success");
  } catch (err) {
    showBanner(err.message || "Processing error.", "error");
  } finally {
    setLoading(false);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ID MANAGER
// ═══════════════════════════════════════════════════════════════════════

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderManagedAssets(items, queryText) {
  recentIdsBody.innerHTML = "";
  recentIdsCount.textContent = items.length + " ID(s)";

  if (!items.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "manager-empty";
    cell.textContent = queryText ? "No IDs matched your search." : "No IDs found in the database yet.";
    row.appendChild(cell);
    recentIdsBody.appendChild(row);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("tr");
    row.dataset.publicId = item.public_id;
    row.dataset.originalId = item.original_id;
    row.dataset.qrPath = item.qr_path || ("/static/qrs/" + item.public_id + ".png");

    const createdAtCell = document.createElement("td");
    createdAtCell.setAttribute("data-label", "Added At");
    createdAtCell.textContent = formatDateTime(item.created_at);

    const publicIdCell = document.createElement("td");
    publicIdCell.setAttribute("data-label", "Public ID");
    publicIdCell.className = "mono public-id-cell";
    publicIdCell.textContent = item.public_id;

    const originalIdCell = document.createElement("td");
    originalIdCell.setAttribute("data-label", "Asset ID");
    originalIdCell.className = "mono public-id-cell";
    originalIdCell.textContent = item.original_id;

    const scansCell = document.createElement("td");
    scansCell.setAttribute("data-label", "Scans");
    const scanWrap = document.createElement("div");
    scanWrap.className = "manager-scan-wrap";

    const scanUsed = document.createElement("div");
    scanUsed.className = "manager-scan-used";
    scanUsed.textContent = "Used: " + String(item.scan_count);

    const scanInput = document.createElement("input");
    scanInput.type = "number";
    scanInput.min = "1";
    scanInput.step = "1";
    scanInput.value = String(item.max_scans);
    scanInput.setAttribute("data-role", "managed-max-scans");
    scanInput.className = "table-input manager-scan-input";
    scanInput.title = "Maximum allowed scans";

    scanWrap.append(scanUsed, scanInput);
    scansCell.appendChild(scanWrap);

    const actionsCell = document.createElement("td");
    actionsCell.setAttribute("data-label", "Actions");
    const actionsWrap = document.createElement("div");
    actionsWrap.className = "manager-actions";

    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "btn btn-primary btn-xs";
    viewBtn.dataset.action = "view-qr";
    viewBtn.innerHTML = '<i data-lucide="qr-code" style="width:13px;height:13px"></i>View QR';

    const saveScansBtn = document.createElement("button");
    saveScansBtn.type = "button";
    saveScansBtn.className = "btn btn-secondary btn-xs";
    saveScansBtn.dataset.action = "save-scans";
    saveScansBtn.innerHTML = '<i data-lucide="save" style="width:13px;height:13px"></i>Save Scans';

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-danger btn-xs";
    deleteBtn.dataset.action = "delete";
    deleteBtn.innerHTML = '<i data-lucide="trash-2" style="width:13px;height:13px"></i>Delete';

    actionsWrap.append(viewBtn, saveScansBtn, deleteBtn);
    actionsCell.appendChild(actionsWrap);

    row.append(createdAtCell, publicIdCell, originalIdCell, scansCell, actionsCell);
    recentIdsBody.appendChild(row);
  });

  lucide.createIcons();
}

async function refreshManagedAssets(rawQuery) {
  const query = String(rawQuery || "").trim();
  const params = new URLSearchParams();
  params.set("limit", query ? "50" : "20");
  if (query) params.set("query", query);

  try {
    const res = await fetch("/api/assets?" + params.toString(), { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || "Failed to load IDs.");

    state.managedAssets = data.items || [];
    renderManagedAssets(state.managedAssets, query);
  } catch (err) {
    state.managedAssets = [];
    renderManagedAssets([], query);
    showIdManagerBanner(err.message || "Unable to load IDs.", "error");
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MASTER KEY PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════

function loadStoredKeyState() {
  const remember = localStorage.getItem(STORAGE_FLAG) === "1";
  rememberKeyToggle.checked = remember;
  if (remember) masterKeyInput.value = localStorage.getItem(STORAGE_VALUE) || "";
}

function persistKeyState() {
  if (rememberKeyToggle.checked) {
    localStorage.setItem(STORAGE_FLAG, "1");
    localStorage.setItem(STORAGE_VALUE, masterKeyInput.value);
  } else {
    localStorage.removeItem(STORAGE_VALUE);
    localStorage.setItem(STORAGE_FLAG, "0");
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SETTINGS — CHANGE CREDENTIALS
// ═══════════════════════════════════════════════════════════════════════

settingsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showSettingsBanner();

  const currentPwd = settingsCurrentPwd.value;
  const newUsername = settingsNewUsername.value.trim();
  const newPassword = settingsNewPassword.value;
  const confirmPwd = settingsConfirmPwd.value;

  if (!currentPwd) {
    showSettingsBanner("Current password is required.", "error");
    return;
  }

  if (!newUsername && !newPassword) {
    showSettingsBanner("Provide a new username or new password.", "error");
    return;
  }

  if (newPassword && newPassword.length < 6) {
    showSettingsBanner("New password must be at least 6 characters.", "error");
    return;
  }

  if (newPassword && newPassword !== confirmPwd) {
    showSettingsBanner("Passwords do not match.", "error");
    return;
  }

  const body = { current_password: currentPwd };
  if (newUsername) body.new_username = newUsername;
  if (newPassword) body.new_password = newPassword;

  const saveBtn = document.getElementById("settings-save-btn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  try {
    const res = await fetch("/api/change-credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || "Failed to update credentials.");

    // Update UI with new username
    if (data.username) {
      state.currentUser = data.username;
      userDisplayName.textContent = data.username;
      userAvatar.textContent = (data.username[0] || "A").toUpperCase();
    }

    // Clear form
    settingsCurrentPwd.value = "";
    settingsNewUsername.value = "";
    settingsNewPassword.value = "";
    settingsConfirmPwd.value = "";

    showSettingsBanner("Credentials updated successfully!", "success");

    // If username was changed, re-login is recommended
    if (newUsername) {
      showSettingsBanner("Credentials updated! You may need to sign in again with the new username.", "success");
    }
  } catch (err) {
    showSettingsBanner(err.message, "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i data-lucide="save" style="width:16px;height:16px"></i> Save Changes';
    lucide.createIcons();
  }
});

// ═══════════════════════════════════════════════════════════════════════
// EVENT WIRING
// ═══════════════════════════════════════════════════════════════════════

addRowBtn.addEventListener("click", () => addRow());

clearRowsBtn.addEventListener("click", () => {
  setRows([{}]);
  showBanner("Rows cleared.", "info");
});

manualPanel.addEventListener("paste", (e) => {
  const text = (e.clipboardData || window.clipboardData).getData("text");
  const pasted = parseClipboardRows(text);
  if (pasted.length > 1) {
    e.preventDefault();
    setRows(pasted);
    showBanner("Imported " + pasted.length + " rows from clipboard.", "success");
  }
});

selectFileBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const file = fileInput.files && fileInput.files[0];
  if (file) handleFile(file);
});

["dragenter", "dragover"].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add("drag-over");
  });
});

["dragleave", "drop"].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove("drag-over");
  });
});

dropZone.addEventListener("drop", (e) => {
  const files = e.dataTransfer && e.dataTransfer.files;
  if (files && files.length) handleFile(files[0]);
});

assetSearchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showIdManagerBanner();
  await refreshManagedAssets(assetSearchInput.value);
});

assetSearchClearBtn.addEventListener("click", async () => {
  assetSearchInput.value = "";
  showIdManagerBanner();
  await refreshManagedAssets("");
});

recentIdsBody.addEventListener("click", async (e) => {
  const button = e.target.closest("button[data-action]");
  if (!button) return;

  const row = button.closest("tr");
  if (!row) return;

  const publicId = row.dataset.publicId;
  if (!publicId) return;

  const maxScansInput = row.querySelector("input[data-role='managed-max-scans']");
  const activeQuery = assetSearchInput.value.trim();

  if (button.dataset.action === "view-qr") {
    const qrPath = row.dataset.qrPath || ("/static/qrs/" + publicId + ".png");
    const currentId = row.dataset.originalId || publicId;
    openQrModal({ original_id: currentId || publicId, qr_path: qrPath });
    return;
  }

  if (button.dataset.action === "save-scans") {
    const updatedMaxScans = Number.parseInt(maxScansInput ? maxScansInput.value : "", 10);
    if (!Number.isInteger(updatedMaxScans) || updatedMaxScans < 1) {
      showIdManagerBanner("Max scans must be a positive integer.", "error");
      return;
    }

    const rowButtons = row.querySelectorAll("button[data-action]");
    rowButtons.forEach((btn) => { btn.disabled = true; });

    try {
      const res = await fetch("/api/assets/" + encodeURIComponent(publicId), {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ max_scans: updatedMaxScans }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Failed to update max scans.");

      await refreshManagedAssets(activeQuery);
      showIdManagerBanner("Max scans updated successfully.", "success");
    } catch (err) {
      showIdManagerBanner(err.message || "Unable to update max scans.", "error");
    } finally {
      rowButtons.forEach((btn) => { btn.disabled = false; });
    }
    return;
  }

  if (button.dataset.action === "delete") {
    if (!window.confirm("Delete this ID record permanently?")) return;

    const rowButtons = row.querySelectorAll("button[data-action]");
    rowButtons.forEach((btn) => { btn.disabled = true; });

    try {
      const res = await fetch("/api/assets/" + encodeURIComponent(publicId), {
        method: "DELETE",
        headers: authHeaders(),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Failed to delete ID.");

      await refreshManagedAssets(activeQuery);
      showIdManagerBanner("ID deleted successfully.", "success");
    } catch (err) {
      showIdManagerBanner(err.message || "Unable to delete ID.", "error");
    } finally {
      rowButtons.forEach((btn) => { btn.disabled = false; });
    }
  }
});

generateBtn.addEventListener("click", submitIngestion);

downloadAllPdfBtn.addEventListener("click", async () => {
  if (!state.results.length) {
    showBanner("No generated QRs available to export yet.", "error");
    return;
  }

  const originalLabel = downloadAllPdfBtn.innerHTML;
  downloadAllPdfBtn.disabled = true;
  downloadAllPdfBtn.textContent = "Preparing PDF...";

  try {
    await downloadAllAssetTagsPdf(state.results);
    showBanner(
      "Batch PDF downloaded: " + state.results.length + " encrypted QR(s), 6 per page.",
      "success"
    );
  } catch (err) {
    showBanner(err.message || "Batch PDF generation failed.", "error");
  } finally {
    downloadAllPdfBtn.disabled = false;
    downloadAllPdfBtn.innerHTML = originalLabel;
    lucide.createIcons();
  }
});

if (downloadSourcePdfBtn) {
  downloadSourcePdfBtn.addEventListener("click", async () => {
    showBanner();

    const rawIds = collectIds();
    if (!rawIds.length) {
      showBanner("No asset id found.", "error");
      return;
    }

    const uniqueIds = uniqueValues(rawIds);
    const originalLabel = downloadSourcePdfBtn.innerHTML;
    downloadSourcePdfBtn.disabled = true;
    downloadSourcePdfBtn.textContent = "Preparing PDF...";

    try {
      const lookup = await fetchAssetsByIds(uniqueIds);
      const items = Array.isArray(lookup.items) ? lookup.items : [];
      const missing = Array.isArray(lookup.missing_ids)
        ? lookup.missing_ids
        : uniqueIds.filter((id) => !items.some((item) => item.original_id === id));

      if (missing.length) {
        const missingMessage = missing.map((id) => id + " id is not in the data base.").join(" ");
        showBanner(missingMessage, "error");
        return;
      }

      const itemMap = new Map(items.map((item) => [item.original_id, item]));
      const orderedItems = rawIds.map((id) => itemMap.get(id)).filter(Boolean);

      if (!orderedItems.length) {
        showBanner("No asset id found.", "error");
        return;
      }

      await downloadAllAssetTagsPdf(orderedItems);
      showBanner(
        "Batch PDF downloaded: " + orderedItems.length + " QR(s), 6 per page.",
        "success"
      );
    } catch (err) {
      showBanner(err.message || "Batch PDF generation failed.", "error");
    } finally {
      downloadSourcePdfBtn.disabled = false;
      downloadSourcePdfBtn.innerHTML = originalLabel;
      lucide.createIcons();
    }
  });
}

resultsBody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const item = state.results[Number(btn.dataset.index)];
  if (!item) return;

  if (btn.dataset.action === "preview") openQrModal(item);
  if (btn.dataset.action === "pdf") {
    try { await downloadAssetTag(item); }
    catch (err) { showBanner(err.message || "PDF generation failed.", "error"); }
  }
});

masterKeyInput.addEventListener("input", () => {
  persistKeyState();
  updateGenerateState();
});

rememberKeyToggle.addEventListener("change", persistKeyState);

toggleKeyVisibilityBtn.addEventListener("click", () => {
  const isPwd = masterKeyInput.type === "password";
  masterKeyInput.type = isPwd ? "text" : "password";
  toggleKeyVisibilityBtn.textContent = isPwd ? "Hide" : "Show";
});

// ═══════════════════════════════════════════════════════════════════════
// DB RESET
// ═══════════════════════════════════════════════════════════════════════

function openResetDbModal() {
  resetDbModal.classList.add("visible");
}

function closeResetDbModal() {
  resetDbModal.classList.remove("visible");
}

if (resetDbBtn) {
  resetDbBtn.addEventListener("click", openResetDbModal);
}

if (closeResetModalBtn) {
  closeResetModalBtn.addEventListener("click", closeResetDbModal);
}

if (cancelResetBtn) {
  cancelResetBtn.addEventListener("click", closeResetDbModal);
}

if (resetDbModal) {
  resetDbModal.addEventListener("click", (e) => {
    if (e.target === resetDbModal) closeResetDbModal();
  });
}

if (confirmResetBtn) {
  confirmResetBtn.addEventListener("click", async () => {
    const originalText = confirmResetBtn.innerHTML;
    confirmResetBtn.disabled = true;
    confirmResetBtn.textContent = "Resetting...";
    cancelResetBtn.disabled = true;

    try {
      const res = await fetch("/api/assets", {
        method: "DELETE",
        headers: authHeaders(),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Failed to reset database.");

      showIdManagerBanner("Database has been successfully reset.", "success");
      await refreshManagedAssets(assetSearchInput.value);
      state.results = [];
      renderResults();
      setRows([{}]);
      closeResetDbModal();
    } catch (err) {
      showIdManagerBanner(err.message || "Failed to reset database.", "error");
      closeResetDbModal();
    } finally {
      confirmResetBtn.disabled = false;
      confirmResetBtn.innerHTML = originalText;
      cancelResetBtn.disabled = false;
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════════

loadStoredKeyState();
setRows(Array.from({ length: 10 }, () => ({})));
setActiveTab("manual");
updateGenerateState();
lucide.createIcons();
checkAuth();
