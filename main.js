// ========== ELECTRON & NODE IMPORTS ==========
const {
  app,
  BrowserWindow,
  ipcMain,
  session,
  Menu,
  dialog
} = require("electron");
const path = require("path");
const fs = require("fs");

// ========== AUTO UPDATER ==========
const { autoUpdater } = require("electron-updater");

// ========== HTTP FETCH HELPERS ==========
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

// ========== LOGGING ==========
function createUpdaterLogger() {
  const appDir = path.join(app.getPath("appData"), "Moonlight Transcripts");
  const logPath = path.join(appDir, "updater.log");

  function ensureDir() {
    try {
      fs.mkdirSync(appDir, { recursive: true });
    } catch {
      // ignore
    }
  }

  function write(line) {
    ensureDir();
    const stamp = new Date().toISOString();
    const msg = `[${stamp}] ${line}\n`;
    try {
      fs.appendFileSync(logPath, msg, { encoding: "utf8" });
    } catch {
      // ignore
    }
  }

  write("=== app start ===");
  write(`app.getVersion=${app.getVersion()}`);
  write(`process.platform=${process.platform}`);
  write(`NODE_ENV=${process.env.NODE_ENV || ""}`);
  write(`env.GH_TOKEN present=${Boolean(process.env.GH_TOKEN)}`);

  return { write, logPath };
}

// ========== AUTH HELPERS ==========
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
app.commandLine.appendSwitch("disable-dev-tools");
app.commandLine.appendSwitch("disable-features", "EnableDeveloperTools");
app.commandLine.appendSwitch("remote-debugging-port", "0");

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

// ========== AUTO UPDATES (no feed override) ==========
function setupAutoUpdates(logger) {
  logger.write("autoUpdater: setupAutoUpdates entered");

  autoUpdater.logger = console;

  autoUpdater.on("checking-for-update", () => {
    logger.write("autoUpdater: checking-for-update event");
  });

  autoUpdater.on("update-available", (info) => {
    logger.write(
      `autoUpdater: update-available version=${info?.version || "?"}`
    );
  });

  autoUpdater.on("update-not-available", () => {
    logger.write("autoUpdater: update-not-available event");
  });

  autoUpdater.on("error", (err) => {
    const msg = err && err.stack ? err.stack : String(err);
    logger.write(`autoUpdater: error event: ${msg}`);
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent =
      progress && typeof progress.percent === "number"
        ? progress.percent.toFixed(1)
        : "?";
    logger.write(`autoUpdater: download-progress percent=${percent}`);
  });

  autoUpdater.on("update-downloaded", async (info) => {
    logger.write(
      `autoUpdater: update-downloaded version=${info?.version || "?"}`
    );

    const result = await dialog.showMessageBox({
      type: "info",
      buttons: ["Restart", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update ready",
      message:
        "A new version has been downloaded.\n\nRestart the application to apply the update?"
    });

    logger.write(
      `autoUpdater: update-downloaded userResponse=${result.response}`
    );

    if (result.response === 0) {
      logger.write("autoUpdater: calling quitAndInstall");
      autoUpdater.quitAndInstall(false, true);
    } else {
      logger.write("autoUpdater: user chose Later");
    }
  });

  logger.write("autoUpdater: setupAutoUpdates finished");
}

function startUpdateChecks(logger) {
  logger.write("autoUpdater: startUpdateChecks entered");

  try {
    logger.write("autoUpdater: calling setupAutoUpdates");
    setupAutoUpdates(logger);

    logger.write("autoUpdater: calling checkForUpdates()");
    autoUpdater
      .checkForUpdates()
      .then((res) => {
        try {
          logger.write(
            `autoUpdater: checkForUpdates resolved ${JSON.stringify(res)}`
          );
        } catch {
          logger.write("autoUpdater: checkForUpdates resolved (unstringifiable)");
        }
      })
      .catch((e) => {
        const msg = e && e.stack ? e.stack : String(e);
        logger.write(`autoUpdater: checkForUpdates failed: ${msg}`);
      });
  } catch (e) {
    const msg = e && e.stack ? e.stack : String(e);
    logger.write(`autoUpdater: startUpdateChecks exception: ${msg}`);
  }

  logger.write("autoUpdater: startUpdateChecks exiting");
}

// ========== IPC HANDLERS ==========
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
  const logger = createUpdaterLogger();
  createWindow();
  startUpdateChecks(logger);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});