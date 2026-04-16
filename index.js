const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { startUniversalSearchServer, stopUniversalSearchServer } = require("./server/universal-search");

const HARDCODED_CONFIG = {
  DATABASE_URL:
    "postgresql://neondb_owner:npg_VGH4OnxCFv2P@ep-rapid-hall-a5gnlurt-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require",
  DATABASE_URL_UNPOOLED:
    "postgresql://neondb_owner:npg_VGH4OnxCFv2P@ep-tight-unit-a5w93vxh.us-east-2.aws.neon.tech/neondb?sslmode=require",
  ARGOX_LANGUAGE: "pplb",
};

const TARGET_QR_PRINTER = "Argox OS-214 plus series PPLB";
const execFileAsync = promisify(execFile);
const RUNTIME_LOG_PATH = path.join(__dirname, "runtime-debug.log");

const logMain = (level, message, meta) => {
  const line = `[${new Date().toISOString()}] [${level}] ${message}${
    meta ? ` ${JSON.stringify(meta)}` : ""
  }`;
  if (level === "error") console.error(line);
  else console.log(line);
  try {
    fs.appendFileSync(RUNTIME_LOG_PATH, `${line}\n`);
  } catch {
    // Keep app running even if log file write fails.
  }
};

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
logMain("info", "Environment loaded", {
  hasDatabaseUrl: Boolean(process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED),
  printer: TARGET_QR_PRINTER,
});

process.env.DATABASE_URL = process.env.DATABASE_URL || HARDCODED_CONFIG.DATABASE_URL;
process.env.DATABASE_URL_UNPOOLED =
  process.env.DATABASE_URL_UNPOOLED || HARDCODED_CONFIG.DATABASE_URL_UNPOOLED;
process.env.ARGOX_LANGUAGE = process.env.ARGOX_LANGUAGE || HARDCODED_CONFIG.ARGOX_LANGUAGE;
const PREFERRED_PRINTER_LANGUAGE = (process.env.ARGOX_LANGUAGE || "pplb").toLowerCase();

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1680,
    height: 980,
    minWidth: 1400,
    minHeight: 860,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  logMain("info", "Creating main window");
  win.loadFile("index.html");
  win.webContents.on("did-finish-load", () => {
    logMain("info", "Main window loaded");
  });
  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    logMain("error", "Main window failed to load", { errorCode, errorDescription });
  });
};

const sanitizePrintText = (value) =>
  String(value ?? "")
    .replace(/[\r\n"]/g, " ")
    .trim();

const normalizePrintPayload = (value) => {
  const payload = value && typeof value === "object" ? value : {};
  const name = sanitizePrintText(payload.name ?? "");
  const barcode = sanitizePrintText(payload.barcode ?? payload.id ?? "");
  const rawPrice = sanitizePrintText(payload.price ?? "");
  const number = sanitizePrintText(payload.number ?? payload.id ?? "");
  const normalizedPrice = rawPrice ? rawPrice.replace(/[^\d.,-]/g, "") : "";
  const numericPrice = Number(normalizedPrice.replace(",", "."));
  const formattedPrice = Number.isFinite(numericPrice) ? numericPrice.toFixed(2) : "0.00";

  if (!barcode) {
    throw new Error("Barcode is required.");
  }

  return {
    name,
    barcode,
    number,
    price: formattedPrice,
    priceText: `$${formattedPrice}`,
  };
};

const sanitizeLabelText = (value) => sanitizePrintText(value).replace(/[,^~]/g, " ");

const buildPplbEplBarcodeCommand = (value) => {
  const data = normalizePrintPayload(value);

  // PPLB(EPL2) style raw 60x30mm label (203dpi).
  // q480 ~= 60mm width, Q240 ~= 30mm height.
  const name = sanitizeLabelText(data.name || "Item");
  const barcode = sanitizeLabelText(data.barcode);
  const price = sanitizeLabelText(data.priceText);
  const numberText = sanitizeLabelText(`No ${data.number || ""}`.trim());
  return [
    "N",
    "q480",
    "Q240,24",
    "S2",
    "D8",
    "ZT",
    "R0,0",
    "f100",
    `A20,12,0,4,1,1,N,"${name}"`,
    // EPL2 barcode command: Bx,y,rotation,type,narrow,wide,height,hr,text
    // Using type "3" (Code128 on many EPL2-compatible firmwares).
    `B20,84,0,3,2,4,54,B,"${barcode}"`,
    `A20,146,0,2,1,1,N,"${barcode}"`,
    `A290,92,0,4,1,1,N,"${price}"`,
    `A290,132,0,3,1,1,N,"${numberText}"`,
    "P1",
    "",
  ].join("\r\n");
};

const buildPplzZplBarcodeCommand = (value) => {
  const data = normalizePrintPayload(value);

  const name = sanitizeLabelText(data.name || "Item");
  const barcode = sanitizeLabelText(data.barcode);
  const price = sanitizeLabelText(data.priceText);
  const numberText = sanitizeLabelText(`No ${data.number || ""}`.trim());

  // PPLZ(ZPL) style raw 60x30mm label (203dpi).
  return [
    "^XA",
    "^PW480",
    "^LL240",
    "^LH0,0",
    `^FO20,12^A0N,30,26^FD${name}^FS`,
    `^FO20,84^BY2,3,54^BCN,54,N,N,N^FD${barcode}^FS`,
    `^FO20,146^A0N,24,20^FD${barcode}^FS`,
    `^FO290,92^A0N,36,30^FD${price}^FS`,
    `^FO290,132^A0N,24,20^FD${numberText}^FS`,
    "^XZ",
    "",
  ].join("\r\n");
};

const sendRawToWindowsPrinter = async (printerName, rawCommand, dataType = "RAW") => {
  logMain("info", "Sending raw print job", { printerName, dataType, bytes: rawCommand.length });
  const printerNameBase64 = Buffer.from(printerName, "utf8").toString("base64");
  const rawBase64 = Buffer.from(rawCommand, "utf8").toString("base64");
  const dataTypeBase64 = Buffer.from(dataType, "utf8").toString("base64");

  const script = `
$printerName = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("${printerNameBase64}"))
$rawText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("${rawBase64}"))
$rawBytes = [Text.Encoding]::ASCII.GetBytes($rawText)
$dataType = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("${dataTypeBase64}"))

$printer = Get-Printer -Name $printerName -ErrorAction SilentlyContinue
if ($null -eq $printer) {
  throw "Printer queue not found: $printerName"
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }

  [DllImport("winspool.drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.drv", SetLastError=true, ExactSpelling=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOA di);
  [DllImport("winspool.drv", SetLastError=true, ExactSpelling=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true, ExactSpelling=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true, ExactSpelling=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true, ExactSpelling=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

  public static bool SendBytesToPrinter(string printerName, byte[] bytes) {
    IntPtr pHandle;
    DOCINFOA di = new DOCINFOA();
    di.pDocName = "QR Label";
    di.pDataType = "${dataType}";
    int dwWritten = 0;

    if (!OpenPrinter(printerName, out pHandle, IntPtr.Zero)) return false;
    try {
      if (!StartDocPrinter(pHandle, 1, di)) return false;
      try {
        if (!StartPagePrinter(pHandle)) return false;
        try {
          return WritePrinter(pHandle, bytes, bytes.Length, out dwWritten);
        } finally {
          EndPagePrinter(pHandle);
        }
      } finally {
        EndDocPrinter(pHandle);
      }
    } finally {
      ClosePrinter(pHandle);
    }
  }
}
"@

if (-not [RawPrinterHelper]::SendBytesToPrinter($printerName, $rawBytes)) {
  $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  throw "RAW print failed. Win32Error=$err"
}

Write-Output "OK"
`;

  const encodedScript = Buffer.from(script, "utf16le").toString("base64");
  const { stdout, stderr } = await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    encodedScript,
  ]);

  logMain("info", "Raw print command completed", { stdout: String(stdout || "").trim(), stderr: String(stderr || "").trim() });
  return { stdout, stderr };
};

ipcMain.handle("print-qr", async (_event, payload) => {
  logMain("info", "print-qr request received", { payload });
  if (process.platform !== "win32") {
    logMain("error", "print-qr rejected: non-windows platform", { platform: process.platform });
    return {
      ok: false,
      error: "RAW printer mode is supported on Windows only.",
    };
  }

  try {
    const langAttempts =
      PREFERRED_PRINTER_LANGUAGE === "pplb"
        ? ["pplb"]
        : PREFERRED_PRINTER_LANGUAGE === "pplz"
        ? ["pplz"]
        : ["pplb", "pplz"];

    const dataTypeAttempts = ["RAW", "XPS_PASS"];

    let lastError = "Unknown print failure.";
    for (const lang of langAttempts) {
      const command = lang === "pplz" ? buildPplzZplBarcodeCommand(payload) : buildPplbEplBarcodeCommand(payload);
      for (const dataType of dataTypeAttempts) {
        try {
          logMain("info", "Trying print variant", { lang, dataType });
          await sendRawToWindowsPrinter(TARGET_QR_PRINTER, command, dataType);
          logMain("info", "Print variant succeeded", { lang, dataType });
          return { ok: true, language: lang, dataType };
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          logMain("error", "Print variant failed", { lang, dataType, lastError });
        }
      }
    }

    logMain("error", "All print variants failed", { lastError });
    return { ok: false, error: lastError };
  } catch (error) {
    logMain("error", "print-qr crashed", { error: error instanceof Error ? error.message : String(error) });
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Print failed",
    };
  }
});

ipcMain.handle("list-printers", async (event) => {
  try {
    const printers = await event.sender.getPrintersAsync();
    logMain("info", "list-printers", {
      count: printers.length,
      names: printers.map((p) => p.name),
    });
    return { ok: true, printers };
  } catch (error) {
    logMain("error", "list-printers failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("print-preview-dialog", async (event) => {
  logMain("info", "print-preview-dialog requested");
  try {
    const printers = await event.sender.getPrintersAsync();
    logMain("info", "print-preview available printers", {
      count: printers.length,
      names: printers.map((p) => p.name),
      targetFound: printers.some((p) => p.name === TARGET_QR_PRINTER),
    });
  } catch (error) {
    logMain("error", "print-preview getPrinters failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return await new Promise((resolve) => {
    event.sender.print(
      {
        silent: false,
        printBackground: true,
      },
      (success, failureReason) => {
        if (success) {
          logMain("info", "print-preview completed and accepted by OS print pipeline");
          resolve({ ok: true });
          return;
        }
        const reason = failureReason || "Unknown print failure or canceled by user";
        logMain("error", "print-preview failed or canceled", { reason });
        resolve({ ok: false, error: reason });
      }
    );
  });
});

app.whenReady().then(() => {
  logMain("info", "Electron app ready");
  const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
  if (!databaseUrl) {
    logMain("error", "Missing DATABASE_URL or DATABASE_URL_UNPOOLED in environment");
  }

  startUniversalSearchServer(databaseUrl)
    .then(() => {
      logMain("info", "Universal search server started");
      createWindow();
    })
    .catch((error) => {
      logMain("error", "Failed to start universal search server", {
        error: error instanceof Error ? error.message : String(error),
      });
      app.quit();
    });
});

app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (_evt, level, message, line, sourceId) => {
    logMain("info", "renderer-console", { level, message, line, sourceId });
  });
  contents.on("render-process-gone", (_evt, details) => {
    logMain("error", "Renderer process gone", details);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  logMain("info", "App before-quit");
  await stopUniversalSearchServer();
  logMain("info", "Universal search server stopped");
});

process.on("uncaughtException", (error) => {
  logMain("error", "uncaughtException", { error: error.message, stack: error.stack });
});

process.on("unhandledRejection", (reason) => {
  logMain("error", "unhandledRejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});
