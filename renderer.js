const queryInput = document.getElementById("universal-inventory-search");
const idOnlyFilter = document.getElementById("filter-id-only");
const panel = document.getElementById("results-panel");
const stateText = document.getElementById("results-state");
const grid = document.getElementById("results-grid");

let currentAbortController = null;
let searchTimeout = null;
let searchSeq = 0;

const logUi = (message, meta) => {
  if (meta) console.log(`[renderer] ${message}`, meta);
  else console.log(`[renderer] ${message}`);
};

window.addEventListener("error", (event) => {
  console.error("[renderer] window error", event.message, event.filename, event.lineno, event.colno);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[renderer] unhandled rejection", event.reason);
});

const openPrintPreview = (item) => {
  const previewPayload = {
    name: item.title,
    barcode: String(item.id),
    number: String(item.id),
  };
  const encoded = encodeURIComponent(JSON.stringify(previewPayload));

  const preview = window.open(`print-preview.html#${encoded}`, "_blank", "width=700,height=820");
  logUi("openPrintPreview called", { itemId: item.id, title: item.title });
  if (!preview) {
    logUi("openPrintPreview failed: popup blocked");
    alert("Could not open print preview window.");
    return;
  }
  logUi("openPrintPreview success");
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
  const seq = ++searchSeq;
  const query = queryInput.value;
  const trimmedQuery = query.trim();
  const idOnly = Boolean(idOnlyFilter?.checked);
  logUi("executeSearch start", { seq, query, trimmedQuery, idOnly });

  if (!trimmedQuery) {
    panel.classList.add("hidden");
    grid.innerHTML = "";
    stateText.textContent = "";
    return;
  }

  panel.classList.remove("hidden");

  if (idOnly && !/^\d+$/.test(trimmedQuery)) {
    logUi("executeSearch blocked: idOnly requires numeric query", { seq, trimmedQuery });
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
    logUi("search response received", { seq, ok: response.ok, status: response.status });

    if (!response.ok) {
      throw new Error("Failed to search inventory");
    }

    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];
    logUi("search parsed", { seq, count: items.length });

    if (items.length > 0) {
      renderResults(items);
      return;
    }

    renderState(`No results for "${trimmedQuery}".`);
  } catch (error) {
    if (currentAbortController.signal.aborted) return;
    logUi("search failed", { seq, error: error instanceof Error ? error.message : String(error) });
    renderState(error instanceof Error ? error.message : "Search failed", true);
  }
};

queryInput.addEventListener("input", () => {
  logUi("query input changed", { value: queryInput.value });
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  searchTimeout = setTimeout(() => {
    executeSearch();
  }, 250);
});

if (idOnlyFilter) {
  idOnlyFilter.addEventListener("change", () => {
    logUi("idOnly filter changed", { checked: idOnlyFilter.checked });
    executeSearch();
  });
}
