const queryInput = document.getElementById("universal-inventory-search");
const panel = document.getElementById("results-panel");
const stateText = document.getElementById("results-state");
const grid = document.getElementById("results-grid");

let currentAbortController = null;
let searchTimeout = null;

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

    card.append(imageWrap, body, meta);
    grid.appendChild(card);
  }
};

const executeSearch = async () => {
  const query = queryInput.value;
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    panel.classList.add("hidden");
    grid.innerHTML = "";
    stateText.textContent = "";
    return;
  }

  panel.classList.remove("hidden");
  renderState("Searching all sections...");

  if (currentAbortController) {
    currentAbortController.abort();
  }
  currentAbortController = new AbortController();

  try {
    const response = await fetch(
      `http://127.0.0.1:3791/api/universal-search?query=${encodeURIComponent(trimmedQuery)}&limit=30`,
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
