/* ------------------------------------------------------------------
   Admin panel — soft login gate + GitHub-backed project/photo editor.

   How it works:
   - The email/password check is a convenience gate only (its code is
     public). Real protection comes from the GitHub token, which must
     have write (Contents) access to the repo to publish anything.
   - Edits are made to an in-memory copy of PROJECTS (from js/data.js).
   - On "Publish", any newly-added images are committed to assets/img/
     and js/data.js is regenerated and committed. GitHub Pages then
     rebuilds the live site automatically.
------------------------------------------------------------------ */

const OWNER = "ManeeeshaMohan";
const REPO = "portfolio";
const BRANCH = "main";
const ADMIN_EMAIL = "maneeshamohan321@gmail.com";
// SHA-256 of the admin password (plaintext is never stored here).
const ADMIN_PASS_HASH = "f98efb8b91850fa302401ae241c435efeccd445cd38392cc6f004be47882c9c8";

let TOKEN = null;
let WHO = null;
let profile = null;         // working copy
let projects = null;        // working copy
let selected = -1;          // selected project index
const pending = {};         // path -> { base64, dataUrl }  (images not yet uploaded)

/* ------------------------- helpers ------------------------- */
const $ = (id) => document.getElementById(id);
const views = ["login-view", "token-view", "editor-view"];
function showView(id) {
  views.forEach((v) => $(v).classList.toggle("hide", v !== id));
}
function msg(el, text, kind) {
  el.className = "msg " + (kind || "info");
  el.textContent = text;
  if (!text) el.style.display = "none";
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function slugify(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "project";
}
function escapeHtml(s) {
  return (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
// resolve preview src for a path (staged image -> dataUrl, else the file path)
function srcFor(path) {
  if (!path) return "";
  return pending[path] ? pending[path].dataUrl : path;
}

/* ------------------------- GitHub API ------------------------- */
async function gh(path, method = "GET", body) {
  const res = await fetch("https://api.github.com" + path, {
    method,
    headers: {
      Authorization: "token " + TOKEN,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).message; } catch (e) { detail = res.statusText; }
    throw new Error(res.status + " " + detail);
  }
  return res.status === 204 ? null : res.json();
}

async function getFileSha(path) {
  try {
    const j = await gh(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${BRANCH}`);
    return j.sha;
  } catch (e) {
    return null; // file doesn't exist yet
  }
}

async function putFile(path, base64, message, sha) {
  const body = { message, content: base64, branch: BRANCH };
  if (sha) body.sha = sha;
  return gh(`/repos/${OWNER}/${REPO}/contents/${path}`, "PUT", body);
}

/* ------------------------- auth flow ------------------------- */
$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("li-email").value.trim().toLowerCase();
  const pass = $("li-pass").value;
  const hash = await sha256Hex(pass);
  if (email === ADMIN_EMAIL && hash === ADMIN_PASS_HASH) {
    msg($("login-msg"), "");
    const remembered = localStorage.getItem("mm_token") || sessionStorage.getItem("mm_token");
    if (remembered) {
      TOKEN = remembered;
      showView("token-view");
      tryConnect();
    } else {
      showView("token-view");
    }
  } else {
    msg($("login-msg"), "Incorrect email or password.", "err");
  }
});

async function tryConnect() {
  msg($("token-msg"), "Connecting to GitHub…", "info");
  $("tk-connect").disabled = true;
  try {
    const user = await gh("/user");
    WHO = user.login;
    const repo = await gh(`/repos/${OWNER}/${REPO}`);
    if (!repo.permissions || !repo.permissions.push) {
      throw new Error("This token can't write to " + OWNER + "/" + REPO + " (needs Contents: read & write).");
    }
    await loadData();
    $("who").textContent = `Signed in as ${WHO} · ${OWNER}/${REPO}`;
    showView("editor-view");
    renderList();
  } catch (err) {
    msg($("token-msg"), String(err.message || err), "err");
    TOKEN = null;
    localStorage.removeItem("mm_token");
    sessionStorage.removeItem("mm_token");
    showView("token-view");
  } finally {
    $("tk-connect").disabled = false;
  }
}

$("token-form").addEventListener("submit", (e) => {
  e.preventDefault();
  TOKEN = $("tk-input").value.trim();
  if (!TOKEN) { msg($("token-msg"), "Please paste a token.", "err"); return; }
  (localStorage.setItem, sessionStorage.setItem); // noop for clarity
  if ($("tk-remember").checked) localStorage.setItem("mm_token", TOKEN);
  else sessionStorage.setItem("mm_token", TOKEN);
  tryConnect();
});

function logout() {
  TOKEN = null; WHO = null;
  localStorage.removeItem("mm_token");
  sessionStorage.removeItem("mm_token");
  $("tk-input").value = "";
  $("li-pass").value = "";
  showView("login-view");
}
$("tk-logout").addEventListener("click", logout);
$("editor-logout").addEventListener("click", logout);

/* ------------------------- data ------------------------- */
async function loadData() {
  // Use the globals from js/data.js as the working copy (deep clone).
  profile = JSON.parse(JSON.stringify(typeof PROFILE !== "undefined" ? PROFILE : {}));
  projects = JSON.parse(JSON.stringify(typeof PROJECTS !== "undefined" ? PROJECTS : []));
  for (const k in pending) delete pending[k];
  selected = projects.length ? 0 : -1;
}

/* ------------------------- list rendering ------------------------- */
function renderList() {
  const list = $("plist");
  list.innerHTML = "";
  projects.forEach((p, i) => {
    const el = document.createElement("div");
    el.className = "pitem" + (i === selected ? " active" : "");
    el.innerHTML = `
      <img src="${srcFor(p.cover)}" alt="" onerror="this.style.visibility='hidden'">
      <div>
        <div class="pi-no">${String(i + 1).padStart(2, "0")}</div>
        <div class="pi-title">${escapeHtml(p.heading || "(untitled)")}</div>
      </div>
      <div class="pi-move">
        <button data-up="${i}" title="Move up">▲</button>
        <button data-down="${i}" title="Move down">▼</button>
      </div>`;
    el.addEventListener("click", (ev) => {
      if (ev.target.closest(".pi-move")) return;
      selected = i; renderList(); renderEditor();
    });
    list.appendChild(el);
  });
  list.querySelectorAll("[data-up]").forEach((b) => b.addEventListener("click", () => move(+b.dataset.up, -1)));
  list.querySelectorAll("[data-down]").forEach((b) => b.addEventListener("click", () => move(+b.dataset.down, 1)));
  renderEditor();
}

function move(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= projects.length) return;
  [projects[i], projects[j]] = [projects[j], projects[i]];
  if (selected === i) selected = j;
  else if (selected === j) selected = i;
  renderList();
}

/* ------------------------- editor rendering ------------------------- */
function renderEditor() {
  const panel = $("editor-panel");
  if (selected < 0 || !projects[selected]) {
    panel.innerHTML = `<p class="note">No project selected. Use “+ Add project”.</p>`;
    return;
  }
  const p = projects[selected];
  const soft = (p.softwares || []).join(", ");
  const singleImg = (label, key) => `
    <div class="imgbox">
      <h4>${label}</h4>
      <div class="single-img">
        <img src="${srcFor(p[key])}" alt="" onerror="this.style.visibility='hidden'">
        <div>
          <input type="file" accept="image/*" data-single="${key}">
          <div class="note" style="margin-top:6px;word-break:break-all">${escapeHtml(p[key] || "— none —")}</div>
        </div>
      </div>
    </div>`;

  panel.innerHTML = `
    <h2>Edit project</h2>
    <p class="note" style="margin-bottom:18px">Changes are staged here and go live when you press <b>Publish changes</b>.</p>
    <div class="field-grid">
      <div class="full">
        <label>Heading (shown on detail page)</label>
        <input type="text" data-f="heading" value="${escapeHtml(p.heading)}">
      </div>
      <div class="full">
        <label>Carousel title (two lines — press Enter for line break)</label>
        <textarea data-f="title" style="min-height:64px">${escapeHtml(p.title)}</textarea>
      </div>
      <div>
        <label>Kicker / category</label>
        <input type="text" data-f="kicker" value="${escapeHtml(p.kicker)}">
      </div>
      <div>
        <label>Softwares (comma separated)</label>
        <input type="text" data-f="softwares" value="${escapeHtml(soft)}">
      </div>
      <div class="full">
        <label>Full report URL (leave blank if none)</label>
        <input type="text" data-f="report" value="${escapeHtml(p.report || "")}">
      </div>
      <div class="full">
        <label>Description</label>
        <textarea data-f="desc">${escapeHtml(p.desc)}</textarea>
      </div>
      <div class="full">
        <label>ID (used in the page URL)</label>
        <input type="text" data-f="id" value="${escapeHtml(p.id)}">
      </div>
    </div>

    <div style="display:grid;gap:12px;margin-top:16px">
      ${singleImg("Thumbnail / cover", "cover")}
      ${singleImg("Carousel image (slide)", "slide")}
      ${singleImg("Detail hero image", "hero")}
      <div class="imgbox">
        <h4>Gallery photos</h4>
        <div class="thumb-grid" id="gallery-grid"></div>
        <div style="margin-top:12px">
          <label style="margin-top:0">Add a photo</label>
          <input type="file" accept="image/*" id="gallery-add" multiple>
        </div>
      </div>
    </div>

    <div class="row-actions">
      <button class="btn btn-danger btn-sm" id="delete-project">Delete this project</button>
    </div>`;

  // gallery cells
  const grid = $("gallery-grid");
  (p.gallery || []).forEach((src, gi) => {
    const cell = document.createElement("div");
    cell.className = "thumb-cell";
    cell.innerHTML = `<img src="${srcFor(src)}" alt="" onerror="this.style.visibility='hidden'"><button class="x" data-gremove="${gi}" title="Remove">×</button>`;
    grid.appendChild(cell);
  });

  // field bindings
  panel.querySelectorAll("[data-f]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const key = inp.dataset.f;
      let val = inp.value;
      if (key === "softwares") p.softwares = val.split(",").map((s) => s.trim()).filter(Boolean);
      else if (key === "report") p.report = val.trim() ? val.trim() : null;
      else p[key] = val;
      if (key === "heading") { const item = $("plist").children[selected]; if (item) item.querySelector(".pi-title").textContent = val || "(untitled)"; }
    });
  });

  // single image replace
  panel.querySelectorAll("[data-single]").forEach((inp) => {
    inp.addEventListener("change", () => stageFiles(inp.files, (path) => { p[inp.dataset.single] = path; renderEditor(); }));
  });
  // gallery add
  $("gallery-add").addEventListener("change", (e) => {
    stageFiles(e.target.files, (path) => { p.gallery = p.gallery || []; p.gallery.push(path); }, () => renderEditor());
  });
  // gallery remove
  grid.querySelectorAll("[data-gremove]").forEach((b) => b.addEventListener("click", () => {
    p.gallery.splice(+b.dataset.gremove, 1); renderEditor();
  }));
  // delete project
  $("delete-project").addEventListener("click", () => {
    if (!confirm(`Delete “${p.heading}”? This will be removed when you publish.`)) return;
    projects.splice(selected, 1);
    selected = projects.length ? Math.min(selected, projects.length - 1) : -1;
    renderList();
  });
}

/* stage one or more image files (read to base64, assign a repo path) */
function stageFiles(fileList, perFile, done) {
  const files = [...(fileList || [])];
  if (!files.length) return;
  const p = projects[selected];
  let remaining = files.length;
  files.forEach((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = String(dataUrl).split(",")[1];
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `assets/img/${slugify(p.id)}-${Date.now()}-${Math.floor(performance.now() % 100000)}.${ext}`;
      pending[path] = { base64, dataUrl };
      perFile(path);
      if (--remaining === 0 && done) done();
    };
    reader.readAsDataURL(file);
  });
}

/* ------------------------- add project ------------------------- */
$("add-project").addEventListener("click", () => {
  const n = projects.length + 1;
  const base = "new-project";
  let id = base, k = 1;
  while (projects.some((p) => p.id === id)) id = base + "-" + (++k);
  projects.push({
    id,
    no: String(n).padStart(2, "0"),
    title: "NEW PROJECT\nSUBTITLE",
    heading: "NEW PROJECT",
    kicker: "Category",
    cover: "", slide: "", hero: "",
    softwares: [], report: null,
    desc: "",
    gallery: [],
  });
  selected = projects.length - 1;
  renderList();
});

/* ------------------------- publish ------------------------- */
$("save-all").addEventListener("click", async () => {
  const btn = $("save-all");
  const box = $("editor-msg");
  // validation
  const problems = [];
  projects.forEach((p, i) => {
    const n = String(i + 1).padStart(2, "0");
    if (!p.id) problems.push(`#${n}: missing ID`);
    if (!p.heading) problems.push(`#${n}: missing heading`);
    ["cover", "slide", "hero"].forEach((k) => { if (!p[k]) problems.push(`#${n} (${escapeHtml(p.heading)}): missing ${k} image`); });
  });
  const ids = projects.map((p) => p.id);
  if (new Set(ids).size !== ids.length) problems.push("Duplicate project IDs — each must be unique.");
  if (problems.length) { msg(box, "Can't publish yet:\n• " + problems.join("\n• "), "err"); window.scrollTo(0, 0); return; }

  btn.disabled = true;
  const orig = btn.innerHTML;
  btn.innerHTML = `<span class="spinner"></span> Publishing…`;
  try {
    // renumber sequentially
    projects.forEach((p, i) => { p.no = String(i + 1).padStart(2, "0"); });

    // 1) upload pending images
    const paths = Object.keys(pending);
    for (let i = 0; i < paths.length; i++) {
      msg(box, `Uploading image ${i + 1} of ${paths.length}…`, "info");
      const sha = await getFileSha(paths[i]); // usually null (new file)
      await putFile(paths[i], pending[paths[i]].base64, `admin: add image ${paths[i]}`, sha);
    }

    // 2) regenerate + commit js/data.js
    msg(box, "Saving project data…", "info");
    const content = generateDataJs(profile, projects);
    const dataSha = await getFileSha("js/data.js");
    await putFile("js/data.js", b64utf8(content), "admin: update projects", dataSha);

    // clear staged images (now committed)
    for (const k in pending) delete pending[k];

    msg(box, "✓ Published! The live site will update in about a minute. Reloading the editor…", "ok");
    window.scrollTo(0, 0);
    setTimeout(() => location.reload(), 2500);
  } catch (err) {
    msg(box, "Publish failed: " + String(err.message || err), "err");
    window.scrollTo(0, 0);
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
});

function generateDataJs(profile, projects) {
  return (
    "/* ------------------------------------------------------------------\n" +
    "   Portfolio content — generated by the admin panel (admin.html).\n" +
    "   Single source of truth for projects + profile.\n" +
    "------------------------------------------------------------------ */\n\n" +
    "const PROFILE = " + JSON.stringify(profile, null, 2) + ";\n\n" +
    "const PROJECTS = " + JSON.stringify(projects, null, 2) + ";\n"
  );
}

// start
showView("login-view");
