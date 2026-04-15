const queryInput = document.getElementById("universal-inventory-search");
const idOnlyFilter = document.getElementById("filter-id-only");
const panel = document.getElementById("results-panel");
const stateText = document.getElementById("results-state");
const grid = document.getElementById("results-grid");

let currentAbortController = null;
let searchTimeout = null;

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const openPrintPreview = (item) => {
  const qrPayload = `ID:${item.id}|PRICE:${item.price ? String(item.price) : "0"}|QR:${item.id}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(qrPayload)}`;

  const preview = window.open("", "_blank", "width=640,height=760");
  if (!preview) {
    alert("Could not open print preview window.");
    return;
  }

  const priceText = item.price ? formatPrice(String(item.price)) : "0";
  preview.document.open();
  preview.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Print Preview</title>
        <style>
          body {
            margin: 0;
            font-family: Arial, sans-serif;
            background: #f1f5f9;
            color: #111;
          }
          .toolbar {
            position: sticky;
            top: 0;
            padding: 10px 14px;
            background: #111827;
            color: #fff;
            display: flex;
            gap: 8px;
            align-items: center;
          }
          button {
            border: 1px solid #cbd5e1;
            background: #fff;
            color: #111;
            padding: 8px 12px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
          }
          .sheet-wrap {
            display: flex;
            justify-content: center;
            padding: 18px;
          }
          .sheet {
            width: 360px;
            background: #fff;
            border: 1px solid #111;
            border-radius: 10px;
            padding: 12px;
          }
          .line {
            margin: 0 0 6px 0;
            font-size: 14px;
            word-break: break-word;
          }
          .line b {
            display: inline-block;
            min-width: 62px;
          }
          .qr {
            margin-top: 8px;
            width: 280px;
            height: 280px;
            border: 1px solid #111;
            display: block;
          }
          @media print {
            .toolbar { display: none; }
            body { background: #fff; }
            .sheet-wrap { padding: 0; }
            .sheet { border: 1px solid #000; border-radius: 0; }
          }
        </style>
      </head>
      <body>
        <div class="toolbar">
          <span>Print Preview</span>
          <button id="btnPrint">Print</button>
          <button id="btnClose">Close</button>
        </div>
        <main class="sheet-wrap">
          <section class="sheet">
            <p class="line"><b>ID:</b> ${escapeHtml(item.id)}</p>
            <p class="line"><b>Name:</b> ${escapeHtml(item.title)}</p>
            <p class="line"><b>Price:</b> ${escapeHtml(priceText)}</p>
            <p class="line"><b>Barcode:</b> ${escapeHtml(String(item.id))}</p>
            <img class="qr" src="${qrSrc}" alt="QR Code" />
          </section>
        </main>
        <script>
          document.getElementById("btnPrint").addEventListener("click", () => window.print());
          document.getElementById("btnClose").addEventListener("click", () => window.close());
        </script>
      </body>
    </html>
  `);
  preview.document.close();
};

const formatPrice = (value) => {
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(numeric);
};

const renderState = (message, isError = false) => {
  stateText.className = isError ? "state-text error" : "state-text";
  stateText.textContent = message;
  stateText.style.display = "block";
  grid.innerHTML = "";
};

const renderResults = (items) => {
  stateText.style.display = "none";
  grid.innerHTML = "";

  for (const item of items) {
    const card = document.createElement("a");
    card.className = "result-card";
    card.href = item.href;
    card.target = "_blank";
    card.rel = "noreferrer";

    const imageWrap = document.createElement("div");
    imageWrap.className = "image-wrap";
    if (item.image) {
      const image = document.createElement("img");
      image.src = item.image;
      image.alt = item.title;
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      imageWrap.appendChild(image);
    } else {
      const noImage = document.createElement("div");
      noImage.className = "no-image";
      noImage.textContent = "No image";
      imageWrap.appendChild(noImage);
    }

    const body = document.createElement("div");
    body.className = "card-body";

    const section = document.createElement("p");
    section.className = "section";
    section.textContent = item.section;

    const title = document.createElement("p");
    title.className = "title";
    title.textContent = item.title;

    const subtitle = document.createElement("p");
    subtitle.className = "subtitle";
    subtitle.textContent = item.subtitle || `ID ${item.id}`;

    body.append(section, title, subtitle);

    const meta = document.createElement("div");
    meta.className = "meta";

    const qty = document.createElement("p");
    qty.className = "qty";
    qty.textContent = `Qty: ${Math.max(0, item.quantity ?? 0)}`;
    meta.appendChild(qty);

    if (item.price) {
      const price = document.createElement("p");
      price.className = "price";
      price.textContent = formatPrice(item.price);
      meta.appendChild(price);
    }

    const printButton = document.createElement("button");
    printButton.type = "button";
    printButton.className = "print-btn";
    printButton.textContent = "Print";
    printButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPrintPreview(item);
    });
    meta.appendChild(printButton);

    card.append(imageWrap, body, meta);
    grid.appendChild(card);
  }
};

const executeSearch = async () => {
  const query = queryInput.value;
  const trimmedQuery = query.trim();
  const idOnly = Boolean(idOnlyFilter?.checked);

  if (!trimmedQuery) {
    panel.classList.add("hidden");
    grid.innerHTML = "";
    stateText.textContent = "";
    return;
  }

  panel.classList.remove("hidden");

  if (idOnly && !/^\d+$/.test(trimmedQuery)) {
    renderState("Enter a numeric ID to search by ID.");
    return;
  }

  renderState("Searching all sections...");

  if (currentAbortController) {
    currentAbortController.abort();
  }
  currentAbortController = new AbortController();

  try {
    const response = await fetch(
      `http://127.0.0.1:3791/api/universal-search?query=${encodeURIComponent(trimmedQuery)}&limit=30&idOnly=${
        idOnly ? "1" : "0"
      }`,
      { signal: currentAbortController.signal }
    );

    if (!response.ok) {
      throw new Error("Failed to search inventory");
    }

    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];

    if (items.length > 0) {
      renderResults(items);
      return;
    }

    renderState(`No results for "${trimmedQuery}".`);
  } catch (error) {
    if (currentAbortController.signal.aborted) return;
    renderState(error instanceof Error ? error.message : "Search failed", true);
  }
};

queryInput.addEventListener("input", () => {
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  searchTimeout = setTimeout(() => {
    executeSearch();
  }, 250);
});

if (idOnlyFilter) {
  idOnlyFilter.addEventListener("change", () => {
    executeSearch();
  });
}
