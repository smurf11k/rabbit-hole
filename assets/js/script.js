const DATA_URL = "assets/json/links.json";

// Pagination + safety limits
const MAX_RENDER = 100; // hard cap to avoid overload
const PAGE_SIZE = 24; // cards per page

const pageTitleEl = document.getElementById("pageTitle");
const categoryBarEl = document.getElementById("categoryBar");
const linkGridEl = document.getElementById("linkGrid");
const tpl = document.getElementById("linkCardTemplate");
const resultsMetaEl = document.getElementById("resultsMeta");
const searchInputEl = document.getElementById("searchInput");

// Top pager
const firstBtn = document.getElementById("firstBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const lastBtn = document.getElementById("lastBtn");
const pageInfo = document.getElementById("pageInfo");

// Bottom pager
const firstBtnBottom = document.getElementById("firstBtnBottom");
const prevBtnBottom = document.getElementById("prevBtnBottom");
const nextBtnBottom = document.getElementById("nextBtnBottom");
const lastBtnBottom = document.getElementById("lastBtnBottom");
const pageListEl = document.getElementById("pageList");

/** @type {{ meta?: any, categories?: {id:string,label:string}[], links?: any[] }} */
let db;
let activeCategory = "all";
let currentPage = 1;

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalize(s) {
  return String(s ?? "")
    .toLowerCase()
    .trim();
}

function buildCategoryBar(categories) {
  categoryBarEl.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.className = "chip active";
  allBtn.type = "button";
  allBtn.dataset.cat = "all";
  allBtn.textContent = "All";
  categoryBarEl.appendChild(allBtn);

  for (const c of categories) {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.type = "button";
    btn.dataset.cat = c.id;
    btn.textContent = c.label;
    categoryBarEl.appendChild(btn);
  }

  categoryBarEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-cat]");
    if (!btn) return;

    activeCategory = btn.dataset.cat;
    currentPage = 1;

    for (const b of categoryBarEl.querySelectorAll("button[data-cat]")) {
      b.classList.toggle("active", b.dataset.cat === activeCategory);
    }

    render();
  });
}

function linkMatchesCategory(link) {
  if (activeCategory === "all") return true;
  const cats = Array.isArray(link.categories) ? link.categories : [];
  return cats.includes(activeCategory);
}

function linkMatchesSearch(link, q) {
  if (!q) return true;
  const hay = normalize(`${link.title} ${link.description ?? ""}`);
  return hay.includes(q);
}

function sortLinksAZ(links) {
  return links.slice().sort((a, b) =>
    String(a.title ?? "").localeCompare(String(b.title ?? ""), undefined, {
      sensitivity: "base",
      numeric: true,
    }),
  );
}

function getFilteredLinks() {
  const q = normalize(searchInputEl.value);
  const links = Array.isArray(db.links) ? db.links : [];

  const filtered = links
    .filter(linkMatchesCategory)
    .filter((l) => linkMatchesSearch(l, q));

  return sortLinksAZ(filtered);
}

function setPagerState({ totalPages, totalFiltered, totalAll, shownOnPage }) {
  const pages = Math.max(1, totalPages);
  currentPage = Math.min(Math.max(1, currentPage), pages);

  const atFirst = currentPage <= 1;
  const atLast = currentPage >= pages;

  for (const btn of [firstBtn, prevBtn, firstBtnBottom, prevBtnBottom]) {
    btn.disabled = atFirst;
  }
  for (const btn of [nextBtn, lastBtn, nextBtnBottom, lastBtnBottom]) {
    btn.disabled = atLast;
  }

  pageInfo.textContent = `Page ${currentPage} / ${pages}`;

  if (totalFiltered > MAX_RENDER) {
    // (capped at ${MAX_RENDER})
    resultsMetaEl.textContent = `${shownOnPage} shown • ${totalFiltered} matched • ${totalAll} total`;
  } else {
    resultsMetaEl.textContent = `${shownOnPage} shown • ${totalFiltered} matched • ${totalAll} total`;
  }
}

function makePageButton(n) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "page-btn";
  btn.textContent = String(n);
  btn.disabled = n === currentPage;
  btn.classList.toggle("active", n === currentPage);
  btn.addEventListener("click", () => goToPage(n));
  return btn;
}

function makeEllipsis() {
  const span = document.createElement("span");
  span.className = "page-ellipsis";
  span.textContent = "…";
  return span;
}

function renderBottomPageList(totalPages) {
  if (!pageListEl) return;

  pageListEl.innerHTML = "";

  const maxVisible = 9; // number buttons (not counting ellipses)
  if (totalPages <= maxVisible) {
    for (let i = 1; i <= totalPages; i++)
      pageListEl.appendChild(makePageButton(i));
    return;
  }

  // Windows:
  // - near start: 1..9 … last
  // - near end: 1 … last-8..last
  // - middle: 1 … (cur-3..cur+3) … last
  const nearStart = currentPage <= 5;
  const nearEnd = currentPage >= totalPages - 4;

  if (nearStart) {
    for (let i = 1; i <= maxVisible; i++)
      pageListEl.appendChild(makePageButton(i));
    pageListEl.appendChild(makeEllipsis());
    pageListEl.appendChild(makePageButton(totalPages));
    return;
  }

  if (nearEnd) {
    pageListEl.appendChild(makePageButton(1));
    pageListEl.appendChild(makeEllipsis());
    for (let i = totalPages - (maxVisible - 1); i <= totalPages; i++) {
      pageListEl.appendChild(makePageButton(i));
    }
    return;
  }

  // middle
  pageListEl.appendChild(makePageButton(1));
  pageListEl.appendChild(makeEllipsis());

  const start = currentPage - 3;
  const end = currentPage + 3;
  for (let i = start; i <= end; i++) pageListEl.appendChild(makePageButton(i));

  pageListEl.appendChild(makeEllipsis());
  pageListEl.appendChild(makePageButton(totalPages));
}

function goToPage(n) {
  currentPage = n;
  render();
}

function render() {
  const filtered = getFilteredLinks();
  const totalAll = (db.links ?? []).length;

  const capped = filtered.slice(0, MAX_RENDER);

  const totalPages = Math.ceil(capped.length / PAGE_SIZE) || 1;
  currentPage = Math.min(Math.max(1, currentPage), totalPages);

  renderBottomPageList(totalPages);

  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageItems = capped.slice(start, end);

  linkGridEl.innerHTML = "";

  for (const link of pageItems) {
    const node = tpl.content.cloneNode(true);

    const a = node.querySelector(".card-title");
    const desc = node.querySelector(".card-desc");
    const pillRow = node.querySelector(".pill-row");

    a.href = link.url;
    a.textContent = link.title;

    desc.textContent = link.description ?? "";

    // Pills: categories only (no tags)
    for (const catId of link.categories ?? []) {
      const span = document.createElement("span");
      span.className = "pill cat";
      span.textContent = catId;
      pillRow.appendChild(span);
    }

    linkGridEl.appendChild(node);
  }

  setPagerState({
    totalPages,
    totalFiltered: filtered.length,
    totalAll,
    shownOnPage: pageItems.length,
  });
}

function wirePagerButtons() {
  // Top
  firstBtn.addEventListener("click", () => goToPage(1));
  prevBtn.addEventListener("click", () =>
    goToPage(Math.max(1, currentPage - 1)),
  );
  nextBtn.addEventListener("click", () => goToPage(currentPage + 1));
  lastBtn.addEventListener("click", () => {
    const filtered = getFilteredLinks().slice(0, MAX_RENDER);
    const pages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
    goToPage(pages);
  });

  // Bottom
  firstBtnBottom.addEventListener("click", () => goToPage(1));
  prevBtnBottom.addEventListener("click", () =>
    goToPage(Math.max(1, currentPage - 1)),
  );
  nextBtnBottom.addEventListener("click", () => goToPage(currentPage + 1));
  lastBtnBottom.addEventListener("click", () => {
    const filtered = getFilteredLinks().slice(0, MAX_RENDER);
    const pages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
    goToPage(pages);
  });
}

async function init() {
  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${DATA_URL}: ${res.status}`);

  db = await res.json();
  db.categories ??= [];
  db.links ??= [];

  document.title = "Rabbit Hole";
  pageTitleEl.textContent = "Rabbit Hole";

  buildCategoryBar(db.categories);
  wirePagerButtons();

  searchInputEl.addEventListener("input", () => {
    currentPage = 1;
    render();
  });

  render();
}

init().catch((err) => {
  resultsMetaEl.textContent = "Could not load links.json.";
  linkGridEl.innerHTML = `<pre class="error">${escapeHtml(err.message)}</pre>`;
  console.error(err);
});
