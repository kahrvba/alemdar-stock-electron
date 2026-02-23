const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const { startUniversalSearchServer, stopUniversalSearchServer } = require("./server/universal-search");

const loadLocalEnv = () => {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const contents = fs.readFileSync(envPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex < 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
};

loadLocalEnv();

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 760,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadFile("index.html");
};

app.whenReady().then(() => {
  const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
  if (!databaseUrl) {
    console.error("Missing DATABASE_URL or DATABASE_URL_UNPOOLED in environment.");
  }

  startUniversalSearchServer(databaseUrl)
    .then(() => {
      createWindow();
    })
    .catch((error) => {
      console.error("Failed to start universal search server:", error);
      app.quit();
    });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  await stopUniversalSearchServer();
});
