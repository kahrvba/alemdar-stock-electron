const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const parsePayload = () => {
  const raw = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : "";
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
};

const payload = parsePayload() || {};
const name = payload.name ? String(payload.name) : "Unknown Item";
const barcode = payload.barcode ? String(payload.barcode) : "";
const rawPrice = payload.price != null ? String(payload.price) : "0";
const parsedPrice = Number(rawPrice);
const priceText = Number.isFinite(parsedPrice)
  ? `$${parsedPrice.toFixed(2)}`
  : `$${rawPrice}`;

console.log("[print-preview] loaded", { name, barcode, priceText });
window.addEventListener("error", (event) => {
  console.error("[print-preview] window error", event.message, event.filename, event.lineno, event.colno);
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("[print-preview] unhandled rejection", event.reason);
});

const nameEl = document.getElementById("labelName");
const barcodeEl = document.getElementById("labelBarcode");
const barcodeValueEl = document.getElementById("labelBarcodeValue");
const priceEl = document.getElementById("labelPrice");
const printBtn = document.getElementById("btnPrint");
const closeBtn = document.getElementById("btnClose");

nameEl.innerHTML = escapeHtml(name);
barcodeValueEl.innerHTML = escapeHtml(barcode);
priceEl.innerHTML = escapeHtml(priceText);

if (barcode) {
  barcodeEl.src = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(
    barcode
  )}&scale=2&height=8&includetext=false`;
  barcodeEl.addEventListener("load", () => {
    console.log("[print-preview] barcode image loaded");
  });
  barcodeEl.addEventListener("error", () => {
    console.error("[print-preview] barcode image failed to load");
  });
} else {
  barcodeEl.removeAttribute("src");
  console.warn("[print-preview] empty barcode value");
}

printBtn.addEventListener("click", () => {
  console.log("[print-preview] Print button clicked");
  if (!window.printerAPI?.printPreviewDialog) {
    console.warn("[print-preview] printerAPI missing, fallback to window.print()");
    window.print();
    return;
  }

  window.printerAPI
    .printPreviewDialog()
    .then((result) => {
      if (!result?.ok) {
        console.error("[print-preview] printPreviewDialog failed", result);
        alert(`Print failed: ${result?.error || "Unknown error"}`);
      } else {
        console.log("[print-preview] printPreviewDialog success");
      }
    })
    .catch((error) => {
      console.error("[print-preview] printPreviewDialog exception", error);
      alert(`Print exception: ${error instanceof Error ? error.message : String(error)}`);
    });
});

closeBtn.addEventListener("click", () => {
  console.log("[print-preview] Close button clicked");
  window.close();
});

if (window.printerAPI?.listPrinters) {
  window.printerAPI
    .listPrinters()
    .then((result) => {
      if (!result?.ok) {
        console.error("[print-preview] listPrinters failed", result);
        return;
      }
      const names = (result.printers || []).map((p) => p.name);
      console.log("[print-preview] printers detected", names);
    })
    .catch((error) => {
      console.error("[print-preview] listPrinters exception", error);
    });
} else {
  console.warn("[print-preview] listPrinters unavailable");
}
