import { app, BrowserWindow, dialog, shell, utilityProcess } from "electron";
import net from "node:net";
import path from "node:path";
import packageJson from "./package.json" with { type: "json" };

// Fixed per app on purpose: browser storage belongs to the origin, so a different port would hide every saved project.
const PORT = packageJson.studioPort;
const APP_NAME = packageJson.productName;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SERVER_START_TIMEOUT_MS = 30_000;

let server;
let mainWindow;

function getServerScript() {
  const appDir = app.isPackaged ? path.join(process.resourcesPath, "server") : path.join(import.meta.dirname, "server");
  return path.join(appDir, "server.js");
}

function isPortOpen() {
  return new Promise((resolve) => {
    const socket = net.connect(PORT, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function waitForServer() {
  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isPortOpen()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`The studio server did not start within ${SERVER_START_TIMEOUT_MS / 1000} seconds.`);
}

function startServer() {
  const script = getServerScript();
  server = utilityProcess.fork(script, [], {
    cwd: path.dirname(script),
    env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), HOSTNAME: "127.0.0.1" },
    serviceName: `${APP_NAME} server`,
  });
  server.once("exit", (code) => {
    server = undefined;
    if (!app.isQuitting) {
      dialog.showErrorBox(`${APP_NAME} stopped`, `The studio server exited (code ${code}). Please restart the app.`);
      app.quit();
    }
  });
}

function openExternally(url) {
  if (url.startsWith("http:") || url.startsWith("https:") || url.startsWith("mailto:")) shell.openExternal(url);
}

function keepExternalLinksInBrowser(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(ORIGIN)) return { action: "allow" };
    openExternally(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    if (url.startsWith(ORIGIN)) return;
    event.preventDefault();
    openExternally(url);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#0a0a0f",
    autoHideMenuBar: true,
    title: APP_NAME,
  });
  mainWindow.loadURL(`${ORIGIN}/projects`);
  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });
}

async function launch() {
  if (await isPortOpen()) {
    dialog.showErrorBox(
      `${APP_NAME} can't start`,
      `Another program is using port ${PORT}, which ${APP_NAME} needs. Close it and open ${APP_NAME} again.`,
    );
    app.quit();
    return;
  }
  startServer();
  try {
    await waitForServer();
  } catch (error) {
    dialog.showErrorBox(`${APP_NAME} can't start`, error.message);
    app.quit();
    return;
  }
  createWindow();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.on("web-contents-created", (_event, contents) => keepExternalLinksInBrowser(contents));
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("activate", () => {
    if (!mainWindow && server) createWindow();
  });
  app.on("before-quit", () => {
    app.isQuitting = true;
    server?.kill();
  });
  app.whenReady().then(launch);
}
