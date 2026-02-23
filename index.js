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

  win.loadFile("index.html");
};

const sanitizeQrPayload = (value) =>
  String(value ?? "")
    .replace(/[\r\n"]/g, " ")
    .trim();

const normalizePrintPayload = (value) => {
  const payload = value && typeof value === "object" ? value : {};
  const productId = sanitizeQrPayload(payload.productId ?? payload.id);
  const qrNumber = sanitizeQrPayload(payload.qrNumber ?? productId);
  const rawPrice = sanitizeQrPayload(payload.price ?? "");
  const normalizedPrice = rawPrice ? rawPrice.replace(/[^\d.,-]/g, "") : "";

  if (!productId) {
    throw new Error("Product ID is required.");
  }

  return {
    productId,
    qrNumber,
    price: normalizedPrice || "0",
    qrData: `ID:${productId}|PRICE:${normalizedPrice || "0"}|QR:${qrNumber}`,
  };
};

const sanitizeLabelText = (value) => sanitizeQrPayload(value).replace(/[,^~]/g, " ");

const buildPplbEplQrCommand = (value) => {
  const data = normalizePrintPayload(value);

  if (!data.qrData) {
    throw new Error("QR payload is empty.");
  }

  // PPLB(EPL2) style raw label format.
  return [
    "N",
    "q832",
    "Q240,24",
    "S2",
    "D8",
    "ZT",
    "R0,0",
    "f100",
    `A30,20,0,4,1,1,N,"ID: ${sanitizeLabelText(data.productId)}"`,
    `A30,55,0,4,1,1,N,"PRICE: ${sanitizeLabelText(data.price)}"`,
    `A30,90,0,4,1,1,N,"QR: ${sanitizeLabelText(data.qrNumber)}"`,
    `b300,20,Q,m2,s6,eM,"${sanitizeLabelText(data.qrData)}"`,
    "P1",
    "",
  ].join("\r\n");
};

const buildPplzZplQrCommand = (value) => {
  const data = normalizePrintPayload(value);
  if (!data.qrData) {
    throw new Error("QR payload is empty.");
  }

  // PPLZ(ZPL) style QR format.
  return [
    "^XA",
    "^PW832",
    "^LL320",
    "^LH0,0",
    `^FO30,20^A0N,32,28^FDID: ${sanitizeLabelText(data.productId)}^FS`,
    `^FO30,60^A0N,32,28^FDPRICE: ${sanitizeLabelText(data.price)}^FS`,
    `^FO30,100^A0N,32,28^FDQR: ${sanitizeLabelText(data.qrNumber)}^FS`,
    "^FO420,20",
    "^BQN,2,6",
    `^FDLA,${sanitizeLabelText(data.qrData)}^FS`,
    "^XZ",
    "",
  ].join("\r\n");
};

const sendRawToWindowsPrinter = async (printerName, rawCommand, dataType = "RAW") => {
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

  return { stdout, stderr };
};

ipcMain.handle("print-qr", async (_event, payload) => {
  if (process.platform !== "win32") {
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
      const command = lang === "pplz" ? buildPplzZplQrCommand(payload) : buildPplbEplQrCommand(payload);
      for (const dataType of dataTypeAttempts) {
        try {
          await sendRawToWindowsPrinter(TARGET_QR_PRINTER, command, dataType);
          return { ok: true, language: lang, dataType };
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        }
      }
    }

    return { ok: false, error: lastError };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Print failed",
    };
  }
});

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
