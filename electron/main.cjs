const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

function isAuthenticationUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return (url.protocol === "https:" || url.protocol === "http:") && url.pathname === "/auth";
  } catch {
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    backgroundColor: "#0b0f14",
    title: "MicroFluor",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "..", "dist-desktop", "index.html"));

  win.webContents.setWindowOpenHandler(({ url }) => {
    // Desktop account authentication is always rendered in-app. Never hand an
    // auth route to the operating system browser, even if stale renderer code
    // or cached markup attempts to open one.
    if (isAuthenticationUrl(url)) return { action: "deny" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (isAuthenticationUrl(url)) event.preventDefault();
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
