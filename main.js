// ========== ELECTRON & NODE IMPORTS ==========
const { app, BrowserWindow, ipcMain, session, Menu, dialog } = require("electron");
const path = require("path");

// ========== AUTO UPDATER ==========
const { autoUpdater } = require("electron-updater");

// ========== HTTP FETCH HELPERS ==========
// Note: uses global fetch (Electron ships with it).
async function fetchJson(url, cookieHeader) {
  const headers = {};
  if (cookieHeader) headers.Cookie = cookieHeader;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchText(url, cookieHeader) {
  const headers = {};
  if (cookieHeader) headers.Cookie = cookieHeader;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// ========== AUTHENTICATION HELPERS ==========
// IMPORTANT: electron-updater also uses network; this cookie approach is separate.
async function getMoonAuthCookieHeader() {
  const cookies = await session.defaultSession.cookies.get({
    url: "https://transcripts.moonlighthub.co.uk",
    name: "moon_auth"
  });

  if (!cookies || cookies.length === 0) return null;
  return `moon_auth=${cookies[0].value}`;
}

async function clearAuthCookies() {
  await session.defaultSession.clearStorageData({
    origin: "https://transcripts.moonlighthub.co.uk"
  });
}

// ========== SECURITY CONFIGURATION ==========
// Disable developer tools via command-line switches (before app.whenReady)
app.commandLine.appendSwitch("disable-dev-tools");
app.commandLine.appendSwitch("disable-features", "EnableDeveloperTools");
app.commandLine.appendSwitch("remote-debugging-port", "0");

/**
 * Block keyboard shortcuts that could open developer tools
 * Prevents F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
 * @param {BrowserWindow} win - Window to protect
 */
function blockDevtoolsShortcuts(win) {
  win.webContents.on("before-input-event", (event, input) => {
    const key = (input.key || "").toLowerCase();
    const ctrlOrCmd = input.control || input.meta;
    const shift = input.shift;

    if (key === "f12") {
      event.preventDefault();
      return;
    }
    if (ctrlOrCmd && key === "i") {
      event.preventDefault();
      return;
    }
    if (ctrlOrCmd && shift && key === "j") {
      event.preventDefault();
      return;
    }
    if (ctrlOrCmd && shift && key === "c") {
      event.preventDefault();
      return;
    }
  });
}

// ========== WINDOW CREATION ==========

function createWindow() {
  const iconPath = path.join(__dirname, "assets", "logo.ico");

  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: iconPath,
    autoHideMenuBar: true,

    // ---- Custom title bar settings ----
    frame: false,
    transparent: true,

    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
      devTools: false,
      sandbox: true
    }
  });

  blockDevtoolsShortcuts(win);
  win.loadFile("index.html");
  return win;
}

// ========== AUTO UPDATES SETUP (prompt + restart) ==========
function setupAutoUpdates() {
  // Helps debug locally
  autoUpdater.logger = console;

  autoUpdater.on("checking-for-update", () => {
    console.log("Checking for updates...");
  });

  autoUpdater.on("update-available", (info) => {
    console.log("Update available:", info && info.version);
  });

  autoUpdater.on("update-not-available", () => {
    console.log("No update available.");
  });

  autoUpdater.on("error", (err) => {
    console.error("AutoUpdater error:", err);
  });

  autoUpdater.on("download-progress", (progress) => {
    // Optional logging
    const percent = progress && typeof progress.percent === "number"
      ? progress.percent.toFixed(1)
      : "?";
    console.log(`Download progress: ${percent}%`);
  });

  autoUpdater.on("update-downloaded", async () => {
    const result = await dialog.showMessageBox({
      type: "info",
      buttons: ["Restart", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update ready",
      message:
        "A new version has been downloaded.\n\nRestart the application to apply the update?"
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });
}

// Kick off update checks
function startUpdateChecks() {
  // You can change this to a schedule if you want (e.g., every day).
  // For now: check once on app ready.
  setupAutoUpdates();
  autoUpdater
    .checkForUpdates()
    .catch((e) => console.error("checkForUpdates failed:", e));
}

// ========== IPC HANDLERS (MAIN <-> RENDERER COMMUNICATION) ==========

// ===== Window controls (custom titlebar) =====
ipcMain.handle("win:minimize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
  return true;
});

ipcMain.handle("win:maximizeToggle", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;

  if (win.isMaximized()) win.unmaximize();
  else win.maximize();

  return true;
});

ipcMain.handle("win:close", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
  return true;
});

// ===== Transcripts =====
ipcMain.handle("transcripts:getList", async () => {
  const cookieHeader = await getMoonAuthCookieHeader();
  return fetchJson(
    "https://transcripts.moonlighthub.co.uk/transcripts",
    cookieHeader
  );
});

ipcMain.handle("transcripts:getHtml", async (_event, ticketId) => {
  const cookieHeader = await getMoonAuthCookieHeader();
  return fetchText(
    `https://transcripts.moonlighthub.co.uk/transcripts/html/${encodeURIComponent(
      ticketId
    )}`,
    cookieHeader
  );
});

// ===== Auth =====
ipcMain.handle("auth:me", async () => {
  const cookieHeader = await getMoonAuthCookieHeader();
  if (!cookieHeader) return { ok: false, status: 401 };

  const res = await fetch("https://transcripts.moonlighthub.co.uk/auth/me", {
    headers: { Cookie: cookieHeader }
  });

  if (res.ok) return await res.json();
  if (res.status === 403) return { ok: false, status: 403 };
  return { ok: false, status: res.status };
});

ipcMain.handle("auth:logout", async () => {
  await clearAuthCookies();
  return { ok: true };
});

ipcMain.handle("auth:openDiscordLogin", async () => {
  const parent = BrowserWindow.getFocusedWindow();

  const loginWin = new BrowserWindow({
    width: 900,
    height: 700,
    parent,
    modal: true,
    autoHideMenuBar: true,
    icon: path.join(__dirname, "assets", "logo.ico"),
    frame: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false,
      sandbox: true
    }
  });

  blockDevtoolsShortcuts(loginWin);

  await loginWin.loadURL(
    "https://transcripts.moonlighthub.co.uk/auth/discord/start"
  );

  return new Promise((resolve) => {
    loginWin.webContents.on("did-navigate", () => {
      const current = loginWin.webContents.getURL();
      if (current.includes("/auth/success")) {
        loginWin.close();
        resolve(true);
      }
    });

    loginWin.on("closed", () => resolve(true));
  });
});

// ========== APP LIFECYCLE ==========
app.whenReady().then(() => {
  createWindow();
  startUpdateChecks();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});