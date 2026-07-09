/**
 * Electron main process. Thin wrapper around the React PWA (apps/web) that adds
 * OS-level global hotkeys via `globalShortcut` (ADR-0005).
 *
 * Responsibilities:
 *  - Create the BrowserWindow and load the PWA (dev: Vite URL; prod: built files).
 *  - Persist + register the per-device hotkey map (delegated to hotkeys.ts).
 *  - Forward hotkey presses to the renderer via IPC (`bts:hotkey-pressed`); the
 *    renderer (PWA) owns the WS connection and emits C->S `play` — this process
 *    does NOT open a WebSocket and does NOT play audio.
 *  - Expose the `window.btsDesktop` bridge (preload.ts) for the settings UI.
 *
 * Lifecycle: single-instance lock; `globalShortcut.unregisterAll()` on quit.
 */
import { app, BrowserWindow } from "electron";
import * as path from "node:path";
import { registerIpcHandlers, sendHotkeyPressed } from "./ipc.js";
import {
  loadMap,
  registerAll,
  setHotkeyPressHandler,
  unregisterAll,
} from "./hotkeys.js";

const isDev = process.env.NODE_ENV === "development" || process.env.BTS_DEV === "1";

let mainWindow: BrowserWindow | null = null;

function resolvePwaIndex(): string {
  // Packaged: the built PWA is shipped as an extraResource at <resourcesPath>/pwa/
  // (see electron-builder.yml). Dev/source: relative to this compiled file.
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "pwa", "index.html");
  }
  return path.join(__dirname, "..", "..", "web", "dist", "index.html");
}

function resolveDevUrl(): string {
  const port = process.env.BTS_WEB_PORT ?? "5173";
  return `http://localhost:${port}`;
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1024,
    height: 720,
    title: "BTS Soundboard",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    void win.loadURL(resolveDevUrl());
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    void win.loadFile(resolvePwaIndex());
  }
  return win;
}

function bootstrap(): void {
  // Hotkey presses forward to the (single) renderer window.
  setHotkeyPressHandler((soundId) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      sendHotkeyPressed(mainWindow, soundId);
    }
  });

  registerIpcHandlers(() => mainWindow);

  // Persisted map must be loaded after app is ready (uses app.getPath("userData")).
  loadMap();
  registerAll();

  mainWindow = createWindow();

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    bootstrap();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      mainWindow.on("closed", () => {
        mainWindow = null;
      });
    }
  });

  // v1: quit when all windows are closed (Windows/Linux convention). Hotkeys are
  // cleared here and again on before-quit as a safety net.
  app.on("window-all-closed", () => {
    unregisterAll();
    app.quit();
  });

  app.on("before-quit", () => {
    unregisterAll();
  });
}
