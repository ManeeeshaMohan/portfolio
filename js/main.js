/* ------------------------------------------------------------------
   Shared behaviour: nav active state, projects carousel, detail view.
------------------------------------------------------------------ */

const ARROW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>`;
const CHEV_L = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
const CHEV_R = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

/* highlight the current page in the nav */
function setActiveNav() {
  const here = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  document.querySelectorAll(".pill__link").forEach((a) => {
    const target = a.getAttribute("href").toLowerCase();
    if (target === here || (here === "" && target === "index.html")) a.classList.add("is-active");
  });
}

/* -------------------- Projects carousel -------------------- */
function initCarousel() {
  const stage = document.getElementById("proj-stage");
  const track = document.getElementById("thumb-track");
  if (!stage || !track) return;

  let index = 0;

  const thumbs = PROJECTS.map((p, i) => {
    const el = document.createElement("div");
    el.className = "thumb" + (i === 0 ? " is-active" : "");
    el.innerHTML = `<span class="t-no">${p.no}</span><img src="${p.cover}" alt="${p.heading}" loading="lazy">`;
    el.addEventListener("click", () => go(i));
    track.appendChild(el);
    return el;
  });

  function render() {
    const p = PROJECTS[index];
    stage.innerHTML = `
      <div class="proj__meta">
        <span class="p-no">${p.no} / 08</span>
        <h1>${p.title}</h1>
        <p class="p-kicker">${p.kicker}</p>
      </div>
      <div class="proj__visual">
        <a href="project.html?id=${p.id}" aria-label="Open ${p.heading}">
          <span class="arrow-badge">${ARROW}</span>
          <img src="${p.hero}" alt="${p.heading}">
        </a>
      </div>`;
    thumbs.forEach((t, i) => t.classList.toggle("is-active", i === index));
  }

  function go(i) { index = (i + PROJECTS.length) % PROJECTS.length; render(); }
  window.__projGo = go;

  document.querySelectorAll("[data-carousel-prev]").forEach((b) => b.addEventListener("click", () => go(index - 1)));
  document.querySelectorAll("[data-carousel-next]").forEach((b) => b.addEventListener("click", () => go(index + 1)));
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") go(index - 1);
    if (e.key === "ArrowRight") go(index + 1);
  });

  render();
}

/* -------------------- Project detail -------------------- */
function initDetail() {
  const root = document.getElementById("detail-root");
  if (!root) return;

  const id = new URLSearchParams(location.search).get("id");
  const idx = Math.max(0, PROJECTS.findIndex((p) => p.id === id));
  const p = PROJECTS[idx];
  document.title = `${p.heading} — Maneesha Mohan`;

  const prev = PROJECTS[(idx - 1 + PROJECTS.length) % PROJECTS.length];
  const next = PROJECTS[(idx + 1) % PROJECTS.length];

  const soft = p.softwares.map((s) => `<span>${s}</span>`).join("");
  const report = p.report
    ? `<a class="detail__report" href="${p.report}" target="_blank" rel="noopener">${p.report.replace(/^https?:\/\//, "")} <span class="arrow-badge" style="width:30px;height:30px">${ARROW}</span></a>`
    : `<span style="color:var(--muted)">Branding project — no public report</span>`;
  const gallery = p.gallery.map((src) => `<img src="${src}" alt="${p.heading}" loading="lazy">`).join("");

  root.innerHTML = `
    <section class="detail__hero">
      <img src="${p.hero}" alt="${p.heading}">
      <span class="arrow-badge">${ARROW}</span>
    </section>
    <div class="detail__band">
      <div class="wrap">
        <div class="detail__no">${p.no}</div>
        <h1 class="detail__title">${p.heading}</h1>
        <div class="detail__cols">
          <p class="detail__desc">${p.desc}</p>
          <div class="detail__side">
            <div class="soft"><h4>Softwares</h4>${soft}</div>
            <div><h4>Full Report</h4>${report}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="wrap">
      <div class="gallery">${gallery}</div>
      <div class="thumbs" style="margin-bottom:10px">
        <a class="thumbs__arrow" href="project.html?id=${prev.id}" aria-label="Previous project">${CHEV_L}</a>
        <div class="thumbs__track" id="detail-track"></div>
        <a class="thumbs__arrow" href="project.html?id=${next.id}" aria-label="Next project">${CHEV_R}</a>
      </div>
    </div>`;

  const dt = document.getElementById("detail-track");
  PROJECTS.forEach((q, i) => {
    const a = document.createElement("a");
    a.className = "thumb" + (i === idx ? " is-active" : "");
    a.href = `project.html?id=${q.id}`;
    a.innerHTML = `<span class="t-no">${q.no}</span><img src="${q.cover}" alt="${q.heading}" loading="lazy">`;
    dt.appendChild(a);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setActiveNav();
  initCarousel();
  initDetail();
});
