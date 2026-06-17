/* Creator Hub — frontend SPA logic (vanilla JS, no build step) */
(() => {
  "use strict";

  // API base: same-origin "/api" when served together, override via window.API_BASE.
  const API = (window.API_BASE || "") + "/api";

  // ---------- auth state ----------
  let auth = null;
  try { auth = JSON.parse(localStorage.getItem("ch_auth") || "null"); } catch (_) { auth = null; }
  const isAdmin = () => auth?.user?.role === "admin";
  const authHeaders = () => (auth?.token ? { Authorization: "Bearer " + auth.token } : {});
  function setAuth(data) {
    auth = data;
    if (data) localStorage.setItem("ch_auth", JSON.stringify(data));
    else localStorage.removeItem("ch_auth");
    document.body.classList.toggle("is-viewer", !!data && data.user.role !== "admin");
  }

  // ---------- tiny helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const fmtNum = (n) => {
    n = Number(n) || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
    return String(n);
  };
  const fmtMoney = (n, ccy = "THB") => {
    const sym = ccy === "THB" ? "฿" : ccy === "USD" ? "$" : (ccy ? ccy + " " : "");
    return sym + Math.round(Number(n) || 0).toLocaleString("en-US");
  };

  // Social platform link icons (Font Awesome brands) — used in cards + profile.
  const SOCIAL_META = {
    instagram: { icon: "fa-brands fa-instagram", label: "Instagram", color: "#E1306C" },
    tiktok:    { icon: "fa-brands fa-tiktok",    label: "TikTok",    color: "#010101" },
    youtube:   { icon: "fa-brands fa-youtube",   label: "YouTube",   color: "#FF0000" },
    facebook:  { icon: "fa-brands fa-facebook",  label: "Facebook",  color: "#1877F2" },
    twitter:   { icon: "fa-brands fa-x-twitter", label: "X",         color: "#000000" },
    line:      { icon: "fa-brands fa-line",      label: "LINE",      color: "#06C755" },
    website:   { icon: "fa-solid fa-globe",      label: "Website",   color: "#0058be" },
  };
  function socialIcons(links, size = 34) {
    const entries = Object.entries(links || {}).filter(([, url]) => url);
    if (!entries.length) return "";
    return `<div class="flex flex-wrap gap-sm items-center">${entries.map(([k, url]) => {
      const m = SOCIAL_META[k] || { icon: "fa-solid fa-link", label: k, color: "#424754" };
      return `<a href="${esc(url)}" target="_blank" rel="noopener" title="${esc(m.label)}"
        onclick="event.stopPropagation()"
        class="rounded-full flex items-center justify-center border border-outline-variant hover:scale-110 transition-transform"
        style="width:${size}px;height:${size}px;color:${m.color};background:#fff" aria-label="${esc(m.label)}">
        <i class="${m.icon}" style="font-size:${Math.round(size*0.5)}px"></i></a>`;
    }).join("")}</div>`;
  }

  async function api(path, opts = {}) {
    opts.headers = { ...(opts.headers || {}), ...authHeaders() };
    const res = await fetch(API + path, opts);
    if (res.status === 401) { handleUnauthorized(); throw new Error("Session expired — please log in again."); }
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).detail || msg; } catch (_) {}
      throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
  }

  // Upload a file to an /api/uploads/* endpoint, returning the JSON response
  // ({url, [media_type]}). Throws with the server message on failure.
  async function uploadFile(path, file) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(API + path, { method: "POST", body: fd, headers: authHeaders() });
    if (res.status === 401) { handleUnauthorized(); throw new Error("Session expired — please log in again."); }
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).detail || msg; } catch (_) {}
      throw new Error(msg);
    }
    return res.json();
  }

  function handleUnauthorized() {
    setAuth(null);
    showLogin("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
  }

  // Password input with a show/hide eye toggle. `cls` lets callers add classes.
  function pwInput(id, placeholder, cls = "") {
    return `<div class="relative">
      <input id="${id}" type="password" placeholder="${esc(placeholder)}" autocomplete="new-password"
        class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-sm py-2 pr-10 text-[15px] focus:border-primary focus:ring-1 focus:ring-primary ${cls}"/>
      <button type="button" data-eye="${id}" tabindex="-1" aria-label="แสดง/ซ่อนรหัสผ่าน"
        class="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface">
        <span class="material-symbols-outlined text-[20px]">visibility</span></button>
    </div>`;
  }

  // ---------- influencer tiers (mirror backend services/tiers.py) ----------
  const TIERS = ["Nano", "Micro", "Mega"];
  function tierForFollowers(n) {
    n = Number(n) || 0;
    if (n >= 1_000_000) return "Mega";
    if (n >= 10_000) return "Micro";
    return "Nano";
  }
  const TIER_ICON = { Nano: "eco", Micro: "trending_up", Mega: "stars" };
  function tierChip(tier) {
    if (!tier || !TIERS.includes(tier)) return "";
    return `<span class="tier-chip tier-${tier}"><span class="material-symbols-outlined text-[13px]">${TIER_ICON[tier]}</span>${tier}</span>`;
  }
  // Resolve an upload path / URL to something the browser can load.
  const mediaSrc = (url) => (url && url.startsWith("/uploads/") ? (window.API_BASE || "") + url : url);

  // Past-campaign media (image/video) thumbnail + work link.
  function campaignMediaThumb(c) {
    const url = c.media_url;
    if (!url) return "";
    const src = mediaSrc(url);
    const type = c.media_type || (/\.(mp4|webm|mov)$/i.test(url) ? "video" : "image");
    if (type === "video")
      return `<video src="${esc(src)}" controls preload="metadata" class="w-full h-40 object-cover bg-black"></video>`;
    return `<a href="${esc(src)}" target="_blank" rel="noopener" class="block"><img src="${esc(src)}" alt="${esc(c.campaign||c.brand||"work")}" class="w-full h-40 object-cover hover:opacity-90 transition-opacity" onerror="this.closest('a').style.display='none'"/></a>`;
  }
  function campaignWorkLink(c) {
    const url = c.work_url || (c.media_url ? mediaSrc(c.media_url) : "");
    if (!url) return "";
    return `<a href="${esc(url)}" target="_blank" rel="noopener" class="ml-auto self-center text-primary text-[13px] font-semibold flex items-center gap-1 hover:underline">
      <span class="material-symbols-outlined text-[16px]">open_in_new</span>ดูผลงาน</a>`;
  }

  function toast(msg, kind = "ok") {
    let root = $("#toast");
    if (!root) { root = el(`<div id="toast"></div>`); document.body.appendChild(root); }
    const palette = { ok: "bg-secondary-container text-on-secondary-container",
      err: "bg-error-container text-on-error-container",
      info: "bg-surface-container-high text-on-surface" };
    const icon = { ok: "check_circle", err: "error", info: "info" }[kind];
    const item = el(`<div class="toast-item ${palette[kind]}"><span class="material-symbols-outlined text-[18px]">${icon}</span>${esc(msg)}</div>`);
    root.appendChild(item);
    setTimeout(() => item.remove(), 3600);
  }

  // ---------- router ----------
  const routes = {};
  const route = (path, handler) => (routes[path] = handler);

  async function render() {
    const hash = location.hash || "#/directory";
    const [path, param] = hash.replace(/^#/, "").split("/").filter(Boolean).length
      ? parseHash(hash) : ["directory", null];
    // sidebar active state
    document.querySelectorAll(".nav-link").forEach((a) => {
      a.classList.toggle("active", a.dataset.route && hash.startsWith(a.dataset.route));
    });
    const view = $("#view");
    view.innerHTML = "";
    const handler = routes[path] || routes["directory"];
    try { await handler(view, param); }
    catch (e) { view.appendChild(el(`<div class="text-error p-lg">Error: ${esc(e.message)}</div>`)); }
  }

  function parseHash(hash) {
    const parts = hash.replace(/^#\//, "").split("/").filter(Boolean);
    // Any registered route works (incl. ones added by separate modules like content.js),
    // with an optional id/param as the second segment.
    if (parts.length && routes[parts[0]]) return [parts[0], parts[1] || null];
    return ["directory", null];
  }

  // ============================================================
  //  DIRECTORY
  // ============================================================
  let filterState = { search: "", platform: "", niche: "", price: "", tier: "" };

  route("directory", async (view) => {
    view.appendChild(el(`
      <section class="grid grid-cols-1 md:grid-cols-12 gap-md items-end">
        <div class="md:col-span-5">
          <h1 class="text-[32px] leading-10 font-semibold tracking-tight">Discover Creators</h1>
          <p class="text-on-surface-variant mt-xs">Browse your verified network of top-performing influencers.</p>
        </div>
        <div class="md:col-span-7 flex flex-wrap gap-sm justify-end items-end">
          ${filterSelect("tier","Tier",["All Tiers","Nano","Micro","Mega"])}
          ${filterSelect("platform","Platform",["All Platforms","Instagram","TikTok","YouTube"])}
          ${filterSelect("niche","Niche",["Any Niche","Beauty","Tech","Lifestyle","Fitness","Food","Travel","Art"])}
          ${filterSelect("price","Price Range (฿)",["Any Price","< ฿50k","฿50k - ฿150k","฿150k - ฿300k","> ฿300k"])}
        </div>
      </section>`));

    const grid = el(`<section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-gutter"></section>`);
    view.appendChild(grid);

    // skeletons
    for (let i = 0; i < 8; i++) grid.appendChild(el(`
      <div class="rounded-xl border border-outline-variant overflow-hidden">
        <div class="h-48 skeleton"></div>
        <div class="p-md space-y-2"><div class="h-5 w-32 skeleton rounded"></div><div class="h-4 w-20 skeleton rounded"></div></div>
      </div>`));

    // wire filters
    view.querySelectorAll("[data-filter]").forEach((sel) => {
      sel.value = filterState[sel.dataset.filter] || sel.options[0].value;
      sel.addEventListener("change", () => { filterState[sel.dataset.filter] = sel.value; loadGrid(grid); });
    });

    await loadGrid(grid);
  });

  function filterSelect(key, label, options) {
    return `<div class="flex flex-col">
      <label class="text-[12px] tracking-wider font-semibold text-on-surface-variant mb-1">${label}</label>
      <select data-filter="${key}" class="bg-surface-container-lowest border border-outline-variant rounded-lg px-sm py-2 text-[15px] focus:border-primary focus:ring-1 focus:ring-primary shadow-sm min-w-[150px]">
        ${options.map((o) => `<option>${o}</option>`).join("")}
      </select></div>`;
  }

  function priceBounds(label) {
    if (label === "< ฿50k") return { max_price: 50000 };
    if (label === "฿50k - ฿150k") return { min_price: 50000, max_price: 150000 };
    if (label === "฿150k - ฿300k") return { min_price: 150000, max_price: 300000 };
    if (label === "> ฿300k") return { min_price: 300000 };
    return {};
  }

  async function loadGrid(grid) {
    const p = new URLSearchParams();
    if (filterState.search) p.set("search", filterState.search);
    if (filterState.platform && !filterState.platform.startsWith("All")) p.set("platform", filterState.platform);
    if (filterState.niche && !filterState.niche.startsWith("Any")) p.set("niche", filterState.niche);
    if (filterState.tier && !filterState.tier.startsWith("All")) p.set("tier", filterState.tier);
    Object.entries(priceBounds(filterState.price)).forEach(([k, v]) => p.set(k, v));
    p.set("limit", "60");

    const data = await api("/influencers?" + p.toString());
    grid.innerHTML = "";
    if (!data.items.length) {
      grid.appendChild(el(`<div class="col-span-full text-center py-3xl text-on-surface-variant">
        <span class="material-symbols-outlined text-[48px] opacity-40">search_off</span>
        <p class="mt-sm">No influencers match these filters.</p></div>`));
      return;
    }
    data.items.forEach((inf) => grid.appendChild(card(inf)));
  }

  function card(inf) {
    const avatar = inf.avatar_url
      ? `<img src="${esc(inf.avatar_url)}" alt="${esc(inf.name)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onerror="this.style.display='none';this.parentElement.classList.add('flex','items-center','justify-center')"/>`
      : `<span class="material-symbols-outlined text-[48px] text-on-surface-variant">person</span>`;
    const badge = inf.verified ? `
      <div class="absolute top-sm right-sm bg-surface-container-lowest/90 backdrop-blur px-2 py-1 rounded-full border border-outline-variant/50 flex items-center gap-1">
        <span class="material-symbols-outlined text-[14px] text-secondary fill">verified</span>
        <span class="text-[11px] font-semibold">Verified</span></div>` : "";
    const c = el(`
      <article class="bg-surface-container-lowest rounded-xl border border-outline-variant elevation-1 lift overflow-hidden flex flex-col group cursor-pointer">
        <div class="relative h-48 w-full overflow-hidden bg-surface-container-high flex items-center justify-center">${avatar}${badge}</div>
        <div class="p-md flex flex-col flex-1">
          <div class="flex justify-between items-start mb-sm gap-2">
            <div class="min-w-0">
              <h3 class="text-[20px] font-semibold leading-tight truncate">${esc(inf.name)}</h3>
              <p class="text-[14px] text-on-surface-variant truncate">${esc(inf.handle || "")}</p>
            </div>
            <div class="flex flex-col items-end gap-1 shrink-0">
              ${tierChip(inf.tier)}
              ${inf.niche ? `<span class="bg-surface-container text-primary text-[11px] font-semibold px-sm py-1 rounded-full">${esc(inf.niche.split(",")[0])}</span>` : ""}
            </div>
          </div>
          ${Object.keys(inf.social_links || {}).length ? `<div class="mb-sm">${socialIcons(inf.social_links, 26)}</div>` : ""}
          <div class="mt-auto pt-md border-t border-outline-variant flex justify-between items-center">
            <div class="flex flex-col">
              <span class="text-[11px] tracking-wider font-semibold text-on-surface-variant uppercase">Followers</span>
              <span class="text-[22px] font-bold font-poppins">${fmtNum(inf.followers)}</span>
            </div>
            <div class="flex flex-col items-end">
              <span class="text-[11px] tracking-wider font-semibold text-on-surface-variant uppercase">ER</span>
              <span class="text-[20px] font-bold text-primary">${(inf.engagement_rate || 0).toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </article>`);
    c.addEventListener("click", () => (location.hash = `#/influencer/${inf.id}`));
    return c;
  }

  // ============================================================
  //  PROFILE DETAIL  (mirrors the two detail mockups)
  // ============================================================
  route("influencer", async (view, id) => {
    const inf = await api("/influencer".replace("influencer", "influencers") + "/" + id);
    const ccy = inf.currency || "THB";

    // back + header
    view.appendChild(el(`
      <button data-action="back" class="self-start flex items-center gap-1 text-on-surface-variant hover:text-on-surface text-[14px] font-semibold">
        <span class="material-symbols-outlined text-[18px]">arrow_back</span> Back to Directory</button>`));

    const niches = (inf.niche || "").split(",").map((n) => n.trim()).filter(Boolean);
    view.appendChild(el(`
      <article class="bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-1 p-lg flex flex-col md:flex-row gap-lg">
        <div class="w-28 h-28 rounded-full overflow-hidden bg-surface-container-high shrink-0 flex items-center justify-center border border-outline-variant">
          ${inf.avatar_url ? `<img src="${esc(inf.avatar_url)}" class="w-full h-full object-cover" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'material-symbols-outlined text-[40px] text-on-surface-variant',textContent:'person'}))"/>` : `<span class="material-symbols-outlined text-[40px] text-on-surface-variant">person</span>`}
        </div>
        <div class="flex-1">
          <div class="flex flex-wrap items-center gap-sm">
            <h1 class="text-[32px] font-semibold tracking-tight">${esc(inf.name)}</h1>
            ${inf.age ? `<span class="text-[18px] text-on-surface-variant">Age ${inf.age}</span>` : ""}
            <div class="flex flex-wrap gap-1 ml-auto items-center">
              ${tierChip(inf.tier)}
              ${inf.verified ? `<span class="bg-primary-fixed text-primary text-[12px] font-semibold px-sm py-1 rounded-full flex items-center gap-1"><span class="material-symbols-outlined text-[14px] fill">verified</span>Verified</span>` : ""}
              ${niches.map((n) => `<span class="bg-surface-container text-primary text-[12px] font-semibold px-sm py-1 rounded-full">${esc(n)}</span>`).join("")}
            </div>
          </div>
          ${inf.location || inf.handle ? `<p class="text-[14px] text-on-surface-variant mt-1">${esc(inf.handle || "")}${inf.location ? " · " + esc(inf.location) : ""}${inf.active_since ? " · active since " + esc(inf.active_since) : ""}</p>` : ""}
          ${Object.keys(inf.social_links || {}).length ? `<div class="mt-sm">${socialIcons(inf.social_links, 36)}</div>` : ""}
          <p class="text-on-surface-variant mt-sm leading-relaxed">${esc(inf.bio || "No bio provided.")}</p>
          <div class="flex gap-sm mt-md" data-admin-only>
            <button data-action="edit" class="bg-primary text-on-primary text-[14px] font-semibold rounded-lg py-2 px-md hover:bg-primary-container transition-colors shadow-sm flex items-center gap-1"><span class="material-symbols-outlined text-[18px]">edit</span>Edit Profile</button>
            <button data-action="delete" class="bg-surface border border-error text-error text-[14px] font-semibold rounded-lg py-2 px-md hover:bg-error-container transition-colors flex items-center gap-1"><span class="material-symbols-outlined text-[18px]">delete</span>Remove</button>
          </div>
        </div>
      </article>`));

    // Reach + platforms
    const reachRow = el(`<section class="grid grid-cols-1 lg:grid-cols-3 gap-gutter"></section>`);
    reachRow.appendChild(el(`
      <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-1 p-lg flex flex-col">
        <h3 class="text-[20px] font-semibold mb-sm">Total Reach</h3>
        <span class="text-[48px] leading-none font-extrabold text-primary tracking-tight font-poppins">${fmtNum(inf.followers)}</span>
        <span class="text-on-surface-variant mt-1">Combined Followers</span>
        <div class="mt-auto pt-md border-t border-outline-variant grid grid-cols-2 gap-sm">
          <div><div class="text-[12px] tracking-wide font-semibold text-on-surface-variant">Avg. Engagement</div><div class="text-secondary font-bold text-[20px]">${(inf.engagement_rate||0).toFixed(1)}%</div></div>
          <div><div class="text-[12px] tracking-wide font-semibold text-on-surface-variant">Growth (30d)</div><div class="text-secondary font-bold text-[20px]">${inf.growth_30d>=0?"+":""}${(inf.growth_30d||0).toFixed(1)}%</div></div>
        </div>
      </div>`));
    const platCard = el(`
      <div class="lg:col-span-2 bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-1 p-lg">
        <h3 class="text-[20px] font-semibold mb-md">Top Platforms</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-md" id="plat-grid"></div>
      </div>`);
    const pg = $("#plat-grid", platCard) || platCard.querySelector("#plat-grid");
    const platIcon = (p) => ({ youtube: "smart_display", instagram: "photo_camera", tiktok: "music_note" }[p.toLowerCase().split(",")[0].trim()] || "public");
    (inf.platforms && inf.platforms.length ? inf.platforms : [{ platform: inf.platform || "—", metric: "Followers", value: fmtNum(inf.followers) }])
      .forEach((p) => pg.appendChild(el(`
        <div class="border border-outline-variant rounded-xl p-md flex items-center gap-md">
          <div class="w-11 h-11 rounded-full bg-tertiary/10 flex items-center justify-center"><span class="material-symbols-outlined text-tertiary">${platIcon(p.platform)}</span></div>
          <div><div class="font-semibold text-[16px]">${esc(p.platform)}</div><div class="text-[14px] text-on-surface-variant">${esc(p.value)} ${esc(p.metric || "")}</div></div>
        </div>`)));
    reachRow.appendChild(platCard);
    view.appendChild(reachRow);

    // Scope of work + Financial breakdown
    const midRow = el(`<section class="grid grid-cols-1 lg:grid-cols-2 gap-gutter"></section>`);
    const scope = (inf.scope_of_work || []);
    midRow.appendChild(el(`
      <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-1 overflow-hidden">
        <div class="px-lg py-md border-b border-outline-variant flex justify-between items-center">
          <h3 class="text-[20px] font-semibold flex items-center gap-sm"><span class="material-symbols-outlined text-primary">assignment</span>Typical Scope of Work</h3>
          ${scope.length ? `<span class="bg-primary-fixed text-primary text-[12px] font-bold px-sm py-1 rounded-full">${scope.length} deliverable${scope.length>1?"s":""}</span>` : ""}
        </div>
        <div class="p-lg">
          ${scope.length ? `<ol class="flex flex-col gap-3 relative">${scope.map((s, i) => `
            <li class="scope-item relative flex gap-md items-start rounded-xl border border-outline-variant/70 p-md hover:border-primary/40 hover:bg-surface-container-low/50 transition-colors">
              <span class="shrink-0 w-8 h-8 rounded-full bg-primary text-on-primary text-[14px] font-bold flex items-center justify-center">${i + 1}</span>
              <div class="min-w-0 flex-1">
                <div class="font-semibold text-[15px] flex items-center gap-1"><span class="material-symbols-outlined text-secondary fill text-[18px]">check_circle</span>${esc(s.title || "")}</div>
                ${s.detail ? `<div class="text-[14px] text-on-surface-variant mt-1 leading-relaxed">${esc(s.detail)}</div>` : ""}
              </div>
            </li>`).join("")}</ol>` : `
            <div class="flex flex-col items-center justify-center text-center py-lg text-on-surface-variant gap-2">
              <span class="material-symbols-outlined text-[40px] opacity-40">assignment_add</span>
              <p class="text-[14px]">No scope defined yet.</p>
              <button data-action="edit" class="text-primary text-[13px] font-semibold hover:underline">+ Add deliverables</button>
            </div>`}
        </div>
      </div>`));

    const feeRow = (label, val) => `
      <div class="flex justify-between items-center py-3 border-b border-outline-variant">
        <span class="text-on-surface">${label}</span><span class="font-semibold text-[18px]">${fmtMoney(val, ccy)}</span></div>`;
    midRow.appendChild(el(`
      <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-1 overflow-hidden">
        <div class="px-lg py-md border-b border-outline-variant flex justify-between items-center">
          <h3 class="text-[20px] font-semibold">Financial Breakdown</h3>
          <span class="bg-secondary-container text-on-secondary-container text-[12px] font-semibold px-sm py-1 rounded-full">Est. Rate</span>
        </div>
        <div class="p-lg pt-0">
          ${feeRow("Base Rate <span class='text-on-surface-variant'>(ค่าตัว)</span>", inf.base_rate)}
          ${feeRow("Code Generation Fee <span class='text-on-surface-variant'>(ค่าเจนโค้ด)</span>", inf.code_gen_fee)}
          ${feeRow("Management Fee <span class='text-on-surface-variant'>(ค่าเมเนจฟี)</span>", inf.management_fee)}
          <div class="flex justify-between items-center py-3 border-b border-outline-variant bg-surface-container-low/40">
            <span class="text-on-surface-variant">Subtotal <span class="text-[12px]">(ก่อนเอเจนฟี)</span></span>
            <span class="font-semibold text-[16px] text-on-surface-variant">${fmtMoney(inf.subtotal_fee, ccy)}</span>
          </div>
          <div class="flex justify-between items-center py-3 border-b border-outline-variant">
            <span class="text-on-surface">Agency Fee <span class="text-on-surface-variant">(ค่าเอเจนฟี)</span>
              <span class="ml-1 bg-primary-fixed text-primary text-[12px] font-bold px-2 py-[2px] rounded-full">${(inf.agency_fee_pct || 0).toFixed(inf.agency_fee_pct % 1 ? 1 : 0)}%</span>
            </span>
            <span class="font-semibold text-[18px]">${fmtMoney(inf.agency_amount, ccy)}</span>
          </div>
          <div class="mt-md bg-surface-container-low rounded-xl px-md py-3 flex justify-between items-center">
            <span class="text-[18px] font-bold">Total Fee <span class="text-[13px] font-medium text-on-surface-variant">(รวมทั้งหมด)</span></span>
            <span class="text-[24px] font-extrabold text-primary">${fmtMoney(inf.total_fee, ccy)}</span>
          </div>
        </div>
      </div>`));
    view.appendChild(midRow);

    // Campaign fit + past campaigns
    const fitItems = [
      ["Brand Safety", inf.brand_safety], ["Audience Alignment", inf.audience_alignment],
      ["Content Quality", inf.content_quality], ["Reliability", inf.reliability],
    ];
    const bottomRow = el(`<section class="grid grid-cols-1 lg:grid-cols-3 gap-gutter"></section>`);
    bottomRow.appendChild(el(`
      <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-1 overflow-hidden">
        <div class="px-lg py-md border-b border-outline-variant flex justify-between items-center">
          <h3 class="text-[20px] font-semibold">Campaign Fit</h3>
          <span class="text-primary text-[12px] font-semibold flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">auto_awesome</span>AI Score</span>
        </div>
        <div class="p-lg flex flex-col gap-md">
          ${fitItems.map(([label, v]) => `
            <div><div class="flex justify-between text-[14px] mb-1"><span class="font-medium">${label}</span><span class="font-bold">${Math.round(v||0)}%</span></div>
            <div class="score-track"><div class="score-fill" style="width:${Math.min(100, v||0)}%"></div></div></div>`).join("")}
          ${inf.fit_note ? `<p class="text-[14px] italic text-on-surface-variant mt-sm">${esc(inf.fit_note)}</p>` : ""}
        </div>
      </div>`));

    const camps = inf.past_campaigns || [];
    bottomRow.appendChild(el(`
      <div class="lg:col-span-2 bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-1 overflow-hidden">
        <div class="px-lg py-md border-b border-outline-variant"><h3 class="text-[20px] font-semibold">Past Campaigns</h3></div>
        <div class="p-lg grid grid-cols-1 sm:grid-cols-2 gap-md">
          ${camps.length ? camps.map((c) => `
            <div class="border border-outline-variant rounded-xl overflow-hidden lift hover:border-primary/40 transition-colors flex flex-col">
              ${campaignMediaThumb(c)}
              <div class="p-md flex flex-col flex-1">
                <div class="flex items-center gap-sm mb-sm">
                  <div class="w-9 h-9 rounded-lg bg-primary-fixed text-primary font-bold flex items-center justify-center shrink-0">${esc((c.brand||"?")[0])}</div>
                  <div class="min-w-0">
                    <div class="font-semibold truncate">${esc(c.brand||"")}</div>
                    <div class="text-[13px] text-on-surface-variant truncate">${esc(c.campaign||"")}</div>
                  </div>
                </div>
                <div class="flex gap-lg pt-sm border-t border-outline-variant mt-auto items-end">
                  <div><div class="text-secondary font-bold font-poppins">${esc(c.views||"-")}</div><div class="text-[11px] tracking-wide text-on-surface-variant uppercase">Views</div></div>
                  <div><div class="text-secondary font-bold font-poppins">${esc(c.ctr||"-")}</div><div class="text-[11px] tracking-wide text-on-surface-variant uppercase">CTR</div></div>
                  ${campaignWorkLink(c)}
                </div>
              </div>
            </div>`).join("") : `
            <div class="col-span-full flex flex-col items-center justify-center text-center py-lg text-on-surface-variant gap-2">
              <span class="material-symbols-outlined text-[40px] opacity-40">history</span>
              <p class="text-[14px]">No past campaigns recorded yet.</p>
              <button data-action="edit" class="text-primary text-[13px] font-semibold hover:underline">+ Add a campaign</button>
            </div>`}
        </div>
      </div>`));
    view.appendChild(bottomRow);

    // wire actions
    view.querySelector("[data-action=back]").addEventListener("click", () => (location.hash = "#/directory"));
    view.querySelectorAll("[data-action=edit]").forEach((b) => b.addEventListener("click", () => openInfluencerForm(inf)));
    view.querySelector("[data-action=delete]").addEventListener("click", async () => {
      if (!confirm(`Remove ${inf.name}? This cannot be undone.`)) return;
      await api("/influencers/" + inf.id, { method: "DELETE" });
      toast("Influencer removed");
      location.hash = "#/directory";
    });
  });

  // ============================================================
  //  ANALYTICS (simple stats overview)
  // ============================================================
  route("analytics", async (view) => {
    const s = await api("/stats");
    view.appendChild(el(`<h1 class="text-[32px] font-semibold tracking-tight">Analytics Overview</h1>`));
    const stat = (label, val, icon) => `
      <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-1 p-lg flex items-center gap-md">
        <div class="w-12 h-12 rounded-xl bg-primary-fixed flex items-center justify-center"><span class="material-symbols-outlined text-primary">${icon}</span></div>
        <div><div class="text-[28px] font-extrabold leading-none font-poppins">${val}</div><div class="text-[13px] tracking-wide text-on-surface-variant font-semibold mt-1">${label}</div></div>
      </div>`;
    view.appendChild(el(`<section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
      ${stat("Total Influencers", s.total_influencers, "groups")}
      ${stat("Verified", s.verified, "verified")}
      ${stat("Avg Engagement", s.avg_engagement_rate + "%", "favorite")}
      ${stat("Total Reach", fmtNum(s.total_reach), "public")}
    </section>`));
    const breakdown = (title, rows) => `
      <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-1 p-lg">
        <h3 class="text-[20px] font-semibold mb-md">${title}</h3>
        <div class="flex flex-col gap-sm">${rows.map((r) => `
          <div class="flex justify-between items-center"><span>${esc(r.name)}</span>
          <span class="bg-surface-container text-primary text-[12px] font-semibold px-sm py-1 rounded-full">${r.count}</span></div>`).join("")}</div>
      </div>`;
    view.appendChild(el(`<section class="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
      ${breakdown("By Tier", s.tiers || [])}${breakdown("By Niche", s.niches)}${breakdown("By Platform", s.platforms)}</section>`));

    // ----- Niche performance comparison (multi-dimensional) -----
    const np = await api("/stats/niche-performance");
    const rows = np.niches || [];
    if (rows.length) {
      // best-in-class per dimension (for highlighting)
      const best = {};
      const dims = ["avg_engagement_rate", "avg_growth_30d", "total_reach", "avg_fit_score", "reach_per_1k_thb"];
      dims.forEach((d) => { best[d] = Math.max(...rows.map((r) => r[d] || 0)); });
      const maxReach = best.total_reach || 1;
      const hi = (r, d) => (r[d] === best[d] && r[d] > 0) ? "text-secondary font-bold" : "";
      const cell = (v, cls = "") => `<td class="py-2 px-sm text-right ${cls}">${v}</td>`;
      view.appendChild(el(`
        <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-1 overflow-hidden">
          <div class="px-lg py-md border-b border-outline-variant flex items-center justify-between flex-wrap gap-sm">
            <h3 class="text-[20px] font-semibold flex items-center gap-sm"><span class="material-symbols-outlined text-primary">leaderboard</span>Niche Performance Comparison</h3>
            <span class="text-[12px] text-on-surface-variant">เปรียบเทียบหลายมิติ · <span class="text-secondary font-semibold">เขียว = ดีที่สุดในมิตินั้น</span></span>
          </div>
          <div class="p-lg overflow-x-auto">
            <table class="w-full text-[14px] min-w-[760px]">
              <thead><tr class="text-on-surface-variant text-[12px] uppercase tracking-wide border-b border-outline-variant">
                <th class="py-2 px-sm text-left">Niche</th>
                <th class="py-2 px-sm text-right">Creators</th>
                <th class="py-2 px-sm text-left w-[180px]">Total Reach</th>
                <th class="py-2 px-sm text-right">Avg ER</th>
                <th class="py-2 px-sm text-right">Avg Growth</th>
                <th class="py-2 px-sm text-right">Avg Fit</th>
                <th class="py-2 px-sm text-right">Avg Fee</th>
                <th class="py-2 px-sm text-right" title="Reach delivered per ฿1,000 of fee">Reach / ฿1k</th>
              </tr></thead>
              <tbody>
                ${rows.map((r) => `
                  <tr class="border-b border-outline-variant/60 hover:bg-surface-container-low/40">
                    <td class="py-2 px-sm font-semibold">${esc(r.niche)}</td>
                    ${cell(r.count)}
                    <td class="py-2 px-sm">
                      <div class="flex items-center gap-sm">
                        <div class="score-track flex-1"><div class="score-fill" style="width:${Math.round((r.total_reach/maxReach)*100)}%"></div></div>
                        <span class="font-poppins ${hi(r,'total_reach')}">${fmtNum(r.total_reach)}</span>
                      </div>
                    </td>
                    ${cell((r.avg_engagement_rate).toFixed(1)+"%", hi(r,'avg_engagement_rate'))}
                    ${cell((r.avg_growth_30d>=0?"+":"")+r.avg_growth_30d.toFixed(1)+"%", hi(r,'avg_growth_30d'))}
                    ${cell(Math.round(r.avg_fit_score)+"%", hi(r,'avg_fit_score'))}
                    ${cell(fmtMoney(r.avg_total_fee), "")}
                    ${cell(fmtNum(r.reach_per_1k_thb), hi(r,'reach_per_1k_thb'))}
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>`));
    }
  });

  // ============================================================
  //  CAMPAIGNS
  // ============================================================
  const CAMP_STATUSES = ["planning", "active", "completed", "cancelled"];
  const STATUS_LABEL = { planning: "Planning", active: "Active", completed: "Completed", cancelled: "Cancelled" };
  const statusChip = (s) => `<span class="status-chip status-${s}">${STATUS_LABEL[s] || s}</span>`;
  let campFilter = { status: "", search: "" };

  route("campaigns", async (view) => {
    view.appendChild(el(`
      <section class="flex flex-wrap gap-md items-end justify-between">
        <div>
          <h1 class="text-[32px] leading-10 font-semibold tracking-tight">Campaigns</h1>
          <p class="text-on-surface-variant mt-xs">จัดการแคมเปญ มอบหมายอินฟลูเอนเซอร์ และติดตามงบประมาณ</p>
        </div>
        <div class="flex gap-sm items-end">
          <div class="flex flex-col"><label class="text-[12px] tracking-wider font-semibold text-on-surface-variant mb-1">Status</label>
            <select id="camp-status" class="bg-surface-container-lowest border border-outline-variant rounded-lg px-sm py-2 text-[15px] focus:border-primary focus:ring-1 focus:ring-primary min-w-[150px]">
              ${["All Statuses", ...CAMP_STATUSES.map((s) => STATUS_LABEL[s])].map((o) => `<option>${o}</option>`).join("")}
            </select></div>
          <button data-admin-only data-new-campaign class="bg-primary text-on-primary font-semibold rounded-lg py-2 px-md hover:bg-primary-container shadow-sm flex items-center gap-1 h-[42px]"><span class="material-symbols-outlined text-[20px]">add</span>New Campaign</button>
        </div>
      </section>`));
    const grid = el(`<section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter"></section>`);
    view.appendChild(grid);
    const statusSel = view.querySelector("#camp-status");
    statusSel.value = campFilter.status || "All Statuses";
    statusSel.addEventListener("change", () => { campFilter.status = statusSel.value; loadCampaigns(grid); });
    view.querySelector("[data-new-campaign]")?.addEventListener("click", () => openCampaignForm());
    await loadCampaigns(grid);
  });

  async function loadCampaigns(grid) {
    const p = new URLSearchParams();
    if (campFilter.status && !campFilter.status.startsWith("All")) p.set("status", campFilter.status.toLowerCase());
    const data = await api("/campaigns?" + p.toString());
    grid.innerHTML = "";
    if (!data.items.length) {
      grid.appendChild(el(`<div class="col-span-full text-center py-3xl text-on-surface-variant">
        <span class="material-symbols-outlined text-[48px] opacity-40">rocket_launch</span>
        <p class="mt-sm">ยังไม่มีแคมเปญ${isAdmin() ? " — กด New Campaign เพื่อเริ่ม" : ""}</p></div>`));
      return;
    }
    data.items.forEach((c) => grid.appendChild(campaignCard(c)));
  }

  function campaignCard(c) {
    const card = el(`
      <article class="bg-surface-container-lowest rounded-xl border border-outline-variant elevation-1 lift overflow-hidden flex flex-col cursor-pointer">
        <div class="p-md flex flex-col flex-1 gap-sm">
          <div class="flex justify-between items-start gap-2">
            <div class="min-w-0">
              <h3 class="text-[18px] font-semibold leading-tight truncate">${esc(c.name)}</h3>
              <p class="text-[13px] text-on-surface-variant truncate">${esc(c.brand || "—")}</p>
            </div>
            ${statusChip(c.status)}
          </div>
          ${c.objective ? `<p class="text-[13px] text-on-surface-variant line-clamp-2">${esc(c.objective)}</p>` : ""}
          <div class="mt-auto pt-md border-t border-outline-variant grid grid-cols-2 gap-sm">
            <div><div class="text-[11px] tracking-wide font-semibold text-on-surface-variant uppercase">Budget</div><div class="text-[18px] font-bold font-poppins">${fmtMoney(c.budget, c.currency)}</div></div>
            <div class="text-right"><div class="text-[11px] tracking-wide font-semibold text-on-surface-variant uppercase">Creators</div><div class="text-[18px] font-bold font-poppins">${(c.influencer_ids || []).length}</div></div>
          </div>
          ${(c.start_date || c.end_date) ? `<div class="text-[12px] text-on-surface-variant flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">calendar_month</span>${esc(c.start_date || "?")} → ${esc(c.end_date || "?")}</div>` : ""}
        </div>
      </article>`);
    card.addEventListener("click", () => (location.hash = `#/campaign/${c.id}`));
    return card;
  }

  route("campaign", async (view, id) => {
    const c = await api("/campaigns/" + id);
    const all = await api("/influencers?limit=200");
    const assigned = (c.influencer_ids || []).map((iid) => all.items.find((x) => x.id === iid)).filter(Boolean);
    view.appendChild(el(`<button data-action="back-camp" class="self-start flex items-center gap-1 text-on-surface-variant hover:text-on-surface text-[14px] font-semibold"><span class="material-symbols-outlined text-[18px]">arrow_back</span> Back to Campaigns</button>`));
    view.appendChild(el(`
      <article class="bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-1 p-lg">
        <div class="flex flex-wrap items-start gap-md">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-sm flex-wrap">
              <h1 class="text-[30px] font-semibold tracking-tight">${esc(c.name)}</h1>${statusChip(c.status)}
            </div>
            <p class="text-on-surface-variant mt-1">${esc(c.brand || "")}${(c.start_date||c.end_date)?` · ${esc(c.start_date||"?")} → ${esc(c.end_date||"?")}`:""}</p>
            ${c.objective ? `<p class="mt-sm leading-relaxed">${esc(c.objective)}</p>` : ""}
            ${c.notes ? `<p class="mt-sm text-[14px] text-on-surface-variant italic">${esc(c.notes)}</p>` : ""}
          </div>
          <div class="flex flex-col items-end gap-sm">
            <div class="text-right"><div class="text-[12px] tracking-wide font-semibold text-on-surface-variant uppercase">Budget</div><div class="text-[28px] font-extrabold text-primary font-poppins">${fmtMoney(c.budget, c.currency)}</div></div>
            <div class="flex gap-sm" data-admin-only>
              <button data-action="edit-camp" class="bg-primary text-on-primary text-[14px] font-semibold rounded-lg py-2 px-md hover:bg-primary-container flex items-center gap-1"><span class="material-symbols-outlined text-[18px]">edit</span>Edit</button>
              <button data-action="del-camp" class="bg-surface border border-error text-error text-[14px] font-semibold rounded-lg py-2 px-md hover:bg-error-container flex items-center gap-1"><span class="material-symbols-outlined text-[18px]">delete</span>Delete</button>
            </div>
          </div>
        </div>
      </article>`));
    const roster = el(`<div class="bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-1 overflow-hidden">
      <div class="px-lg py-md border-b border-outline-variant flex justify-between items-center"><h3 class="text-[20px] font-semibold">Assigned Creators</h3><span class="bg-primary-fixed text-primary text-[12px] font-bold px-sm py-1 rounded-full">${assigned.length}</span></div>
      <div class="p-lg grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md" id="camp-roster"></div></div>`);
    const rg = roster.querySelector("#camp-roster");
    if (!assigned.length) rg.appendChild(el(`<p class="col-span-full text-on-surface-variant text-[14px]">ยังไม่ได้มอบหมายอินฟลูเอนเซอร์</p>`));
    assigned.forEach((inf) => {
      const r = el(`<div class="border border-outline-variant rounded-xl p-md flex items-center gap-sm lift cursor-pointer">
        <div class="w-10 h-10 rounded-full overflow-hidden bg-surface-container-high flex items-center justify-center shrink-0">${inf.avatar_url ? `<img src="${esc(mediaSrc(inf.avatar_url))}" class="w-full h-full object-cover"/>` : `<span class="material-symbols-outlined text-on-surface-variant text-[20px]">person</span>`}</div>
        <div class="min-w-0 flex-1"><div class="font-semibold truncate">${esc(inf.name)}</div><div class="text-[12px] text-on-surface-variant truncate">${fmtNum(inf.followers)} · ${esc(inf.tier||"")}</div></div>
        ${tierChip(inf.tier)}</div>`);
      r.addEventListener("click", () => (location.hash = `#/influencer/${inf.id}`));
      rg.appendChild(r);
    });
    view.appendChild(roster);

    view.querySelector("[data-action=back-camp]").addEventListener("click", () => (location.hash = "#/campaigns"));
    view.querySelector("[data-action=edit-camp]")?.addEventListener("click", () => openCampaignForm(c));
    view.querySelector("[data-action=del-camp]")?.addEventListener("click", async () => {
      if (!confirm(`ลบแคมเปญ "${c.name}"?`)) return;
      await api("/campaigns/" + c.id, { method: "DELETE" });
      toast("ลบแคมเปญแล้ว"); location.hash = "#/campaigns";
    });
  });

  async function openCampaignForm(existing = null) {
    const c = existing || {};
    const all = await api("/influencers?limit=200");
    const assigned = new Set(c.influencer_ids || []);
    const f = (name, label, val = "", type = "text") => `
      <label class="flex flex-col gap-1"><span class="text-[12px] tracking-wide font-semibold text-on-surface-variant">${label}</span>
      <input name="${name}" type="${type}" value="${esc(val)}" class="bg-surface-container-lowest border border-outline-variant rounded-lg px-sm py-2 text-[15px] focus:border-primary focus:ring-1 focus:ring-primary"/></label>`;
    const modal = el(`
      <div class="fixed inset-0 z-50 bg-on-surface/50 backdrop-blur-sm flex items-center justify-center p-md">
        <div class="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[92vh]">
          <div class="px-lg py-md border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
            <h2 class="text-[22px] font-bold flex items-center gap-sm"><span class="material-symbols-outlined text-primary">rocket_launch</span>${existing ? "Edit" : "New"} Campaign</h2>
            <button data-close class="text-on-surface-variant hover:text-on-surface"><span class="material-symbols-outlined">close</span></button>
          </div>
          <form id="camp-form" class="p-lg overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-md">
            ${f("name", "Campaign Name *", c.name)}
            ${f("brand", "Brand", c.brand)}
            <label class="flex flex-col gap-1"><span class="text-[12px] tracking-wide font-semibold text-on-surface-variant">Status</span>
              <select name="status" class="bg-surface-container-lowest border border-outline-variant rounded-lg px-sm py-2 text-[15px] focus:border-primary focus:ring-1 focus:ring-primary">
                ${CAMP_STATUSES.map((s) => `<option value="${s}" ${(c.status||"planning")===s?"selected":""}>${STATUS_LABEL[s]}</option>`).join("")}
              </select></label>
            <div class="grid grid-cols-2 gap-sm">
              ${f("budget", "Budget (฿)", c.budget ?? 0, "number")}
              <label class="flex flex-col gap-1"><span class="text-[12px] tracking-wide font-semibold text-on-surface-variant">Currency</span>
                <select name="currency" class="bg-surface-container-lowest border border-outline-variant rounded-lg px-sm py-2 text-[15px] focus:border-primary focus:ring-1 focus:ring-primary">
                  ${["THB","USD","EUR","GBP","SGD","JPY"].map((x) => `<option ${(c.currency||"THB")===x?"selected":""}>${x}</option>`).join("")}
                </select></label>
            </div>
            ${f("start_date", "Start Date", c.start_date, "date")}
            ${f("end_date", "End Date", c.end_date, "date")}
            <label class="flex flex-col gap-1 sm:col-span-2"><span class="text-[12px] tracking-wide font-semibold text-on-surface-variant">Objective</span>
              <textarea name="objective" rows="2" class="bg-surface-container-lowest border border-outline-variant rounded-lg px-sm py-2 text-[15px] focus:border-primary focus:ring-1 focus:ring-primary">${esc(c.objective || "")}</textarea></label>
            <label class="flex flex-col gap-1 sm:col-span-2"><span class="text-[12px] tracking-wide font-semibold text-on-surface-variant">Notes</span>
              <textarea name="notes" rows="2" class="bg-surface-container-lowest border border-outline-variant rounded-lg px-sm py-2 text-[15px] focus:border-primary focus:ring-1 focus:ring-primary">${esc(c.notes || "")}</textarea></label>
            <div class="sm:col-span-2">
              <div class="text-[12px] tracking-wide font-semibold text-on-surface-variant mb-sm flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">group</span>มอบหมายอินฟลูเอนเซอร์ (${all.items.length})</div>
              <div class="max-h-48 overflow-y-auto border border-outline-variant rounded-lg p-sm grid grid-cols-1 sm:grid-cols-2 gap-1">
                ${all.items.map((i) => `<label class="flex items-center gap-sm px-sm py-1 rounded hover:bg-surface-container-low cursor-pointer text-[14px]">
                  <input type="checkbox" class="camp-inf rounded text-primary focus:ring-primary" value="${i.id}" ${assigned.has(i.id)?"checked":""}/>
                  <span class="truncate">${esc(i.name)} <span class="text-on-surface-variant">· ${fmtNum(i.followers)}</span></span></label>`).join("")}
              </div>
            </div>
          </form>
          <div class="px-lg py-md border-t border-outline-variant flex justify-end gap-md bg-surface-container-lowest">
            <button data-close class="px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Cancel</button>
            <button data-save class="px-md py-2 rounded-lg font-semibold bg-primary text-on-primary hover:bg-primary-container shadow-sm flex items-center gap-1"><span class="material-symbols-outlined text-[20px]">save</span>Save</button>
          </div>
        </div>
      </div>`);
    $("#modal-root").appendChild(modal);
    const close = () => modal.remove();
    modal.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    modal.querySelector("[data-save]").addEventListener("click", async () => {
      const form = modal.querySelector("#camp-form");
      const fd = new FormData(form);
      const payload = Object.fromEntries(fd.entries());
      payload.budget = parseFloat(payload.budget) || 0;
      payload.influencer_ids = [...modal.querySelectorAll(".camp-inf:checked")].map((c) => parseInt(c.value));
      if (!payload.name?.trim()) return toast("Campaign name is required", "err");
      try {
        if (existing) await api("/campaigns/" + existing.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        else await api("/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        toast(existing ? "อัปเดตแคมเปญแล้ว" : "สร้างแคมเปญแล้ว");
        close(); render();
      } catch (e) { toast(e.message, "err"); }
    });
  }

  // ============================================================
  //  FINANCIALS
  // ============================================================
  route("financials", async (view) => {
    const f = await api("/stats/financials");
    view.appendChild(el(`<h1 class="text-[32px] font-semibold tracking-tight">Financials</h1>`));
    const stat = (label, val, icon, sub = "") => `
      <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-1 p-lg flex items-center gap-md">
        <div class="w-12 h-12 rounded-xl bg-primary-fixed flex items-center justify-center"><span class="material-symbols-outlined text-primary">${icon}</span></div>
        <div><div class="text-[26px] font-extrabold leading-none font-poppins">${val}</div><div class="text-[13px] tracking-wide text-on-surface-variant font-semibold mt-1">${label}</div>${sub?`<div class="text-[12px] text-on-surface-variant">${sub}</div>`:""}</div>
      </div>`;
    view.appendChild(el(`<section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
      ${stat("มูลค่ารวมโรสเตอร์", fmtMoney(f.roster_value), "account_balance_wallet")}
      ${stat("ค่าเฉลี่ยต่อคน", fmtMoney(f.avg_fee), "payments")}
      ${stat("งบแคมเปญทั้งหมด", fmtMoney(f.campaign_budget_total), "rocket_launch", `${f.campaign_count} campaigns`)}
      ${stat("งบที่กำลังใช้ (active/plan)", fmtMoney(f.campaign_budget_active), "trending_up")}
    </section>`));

    const comp = f.fee_composition;
    const compRows = [
      ["Base Rate (ค่าตัว)", comp.base_rate],
      ["Code Gen (ค่าเจนโค้ด)", comp.code_gen_fee],
      ["Management (ค่าเมเนจฟี)", comp.management_fee],
      ["Agency (ค่าเอเจนฟี)", comp.agency_amount],
    ];
    const compTotal = compRows.reduce((a, [, v]) => a + v, 0) || 1;
    const left = el(`
      <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-1 p-lg">
        <h3 class="text-[20px] font-semibold mb-md">โครงสร้างค่าใช้จ่าย (Fee Composition)</h3>
        <div class="flex flex-col gap-md">
          ${compRows.map(([label, v]) => `
            <div><div class="flex justify-between text-[14px] mb-1"><span class="font-medium">${label}</span><span class="font-bold font-poppins">${fmtMoney(v)} <span class="text-on-surface-variant font-normal">(${Math.round(v/compTotal*100)}%)</span></span></div>
            <div class="score-track"><div class="score-fill" style="width:${Math.round(v/compTotal*100)}%"></div></div></div>`).join("")}
        </div>
      </div>`);
    const tierTable = el(`
      <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-1 p-lg">
        <h3 class="text-[20px] font-semibold mb-md">มูลค่าตาม Tier</h3>
        <div class="flex flex-col gap-sm">
          ${(f.by_tier||[]).map((t) => `<div class="flex items-center justify-between border-b border-outline-variant/60 pb-2">
            <span class="flex items-center gap-sm">${tierChip(t.tier) || esc(t.tier)}<span class="text-on-surface-variant text-[13px]">${t.count} คน</span></span>
            <span class="font-bold font-poppins">${fmtMoney(t.total_fee)}</span></div>`).join("")}
        </div>
      </div>`);
    view.appendChild(el(`<section class="grid grid-cols-1 lg:grid-cols-2 gap-gutter"></section>`)).append(left, tierTable);

    const top = el(`
      <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-1 overflow-hidden">
        <div class="px-lg py-md border-b border-outline-variant"><h3 class="text-[20px] font-semibold">Top Earners</h3></div>
        <div class="p-lg flex flex-col gap-sm" id="top-earners"></div></div>`);
    const te = top.querySelector("#top-earners");
    (f.top_earners||[]).forEach((e, i) => {
      const r = el(`<div class="flex items-center gap-md py-2 border-b border-outline-variant/60 cursor-pointer hover:bg-surface-container-low/40 rounded-lg px-sm">
        <span class="w-7 h-7 rounded-full bg-primary-fixed text-primary font-bold flex items-center justify-center text-[13px] font-poppins">${i+1}</span>
        <span class="flex-1 font-semibold truncate">${esc(e.name)}</span>${tierChip(e.tier)}
        <span class="font-bold font-poppins text-primary">${fmtMoney(e.total_fee)}</span></div>`);
      r.addEventListener("click", () => (location.hash = `#/influencer/${e.id}`));
      te.appendChild(r);
    });
    view.appendChild(top);
  });

  // ============================================================
  //  SETTINGS
  // ============================================================
  route("settings", async (view) => {
    view.appendChild(el(`<h1 class="text-[32px] font-semibold tracking-tight">Settings</h1>`));

    // Account — change own password
    const acct = el(`
      <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-1 p-lg max-w-xl">
        <h3 class="text-[20px] font-semibold mb-sm flex items-center gap-sm"><span class="material-symbols-outlined text-primary">manage_accounts</span>บัญชีของฉัน</h3>
        <p class="text-[14px] text-on-surface-variant mb-md">${esc(auth.user.full_name || auth.user.username)} · @${esc(auth.user.username)} · ${auth.user.role === "admin" ? "ผู้ดูแล (Admin)" : "ผู้ชม (Viewer)"}</p>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-sm">
          ${pwInput("pw-cur", "รหัสผ่านปัจจุบัน")}
          ${pwInput("pw-new", "รหัสผ่านใหม่ (≥ 4 ตัว)")}
          ${pwInput("pw-confirm", "ยืนยันรหัสผ่านใหม่")}
        </div>
        <button id="pw-save" class="mt-md bg-primary text-on-primary font-semibold rounded-lg py-2 px-md hover:bg-primary-container shadow-sm flex items-center gap-1"><span class="material-symbols-outlined text-[18px]">key</span>เปลี่ยนรหัสผ่าน</button>
      </div>`);
    view.appendChild(acct);
    acct.querySelector("#pw-save").addEventListener("click", async () => {
      const current_password = acct.querySelector("#pw-cur").value;
      const new_password = acct.querySelector("#pw-new").value;
      const confirm = acct.querySelector("#pw-confirm").value;
      if (new_password.length < 4) return toast("รหัสผ่านใหม่สั้นเกินไป (อย่างน้อย 4 ตัว)", "err");
      if (new_password !== confirm) return toast("ยืนยันรหัสผ่านไม่ตรงกัน", "err");
      try {
        await api("/auth/password", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current_password, new_password }) });
        toast("เปลี่ยนรหัสผ่านแล้ว");
        acct.querySelector("#pw-cur").value = ""; acct.querySelector("#pw-new").value = ""; acct.querySelector("#pw-confirm").value = "";
      } catch (e) { toast(e.message, "err"); }
    });

    // User management (admin only)
    if (isAdmin()) {
      const card = el(`
        <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-1 overflow-hidden">
          <div class="px-lg py-md border-b border-outline-variant flex justify-between items-center"><h3 class="text-[20px] font-semibold flex items-center gap-sm"><span class="material-symbols-outlined text-primary">group</span>จัดการผู้ใช้</h3>
            <button id="add-user" class="bg-primary text-on-primary text-[14px] font-semibold rounded-lg py-2 px-md hover:bg-primary-container flex items-center gap-1"><span class="material-symbols-outlined text-[18px]">person_add</span>เพิ่มผู้ใช้</button></div>
          <div class="p-lg" id="user-list"></div></div>`);
      view.appendChild(card);
      const listEl = card.querySelector("#user-list");
      const loadUsers = async () => {
        const users = await api("/auth/users");
        const byId = Object.fromEntries(users.map((u) => [u.id, u]));
        listEl.innerHTML = `<div class="flex flex-col gap-sm">${users.map((u) => `
          <div class="flex items-center gap-md py-2 border-b border-outline-variant/60" data-uid="${u.id}">
            <span class="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold font-poppins">${esc((u.full_name||u.username)[0].toUpperCase())}</span>
            <div class="flex-1 min-w-0"><div class="font-semibold truncate">${esc(u.full_name||u.username)}</div><div class="text-[12px] text-on-surface-variant">@${esc(u.username)}${u.id===auth.user.id?" · (คุณ)":""}</div></div>
            <span class="${u.role==="admin"?"bg-primary-fixed text-primary":"bg-surface-container text-on-surface-variant"} text-[12px] font-semibold px-sm py-1 rounded-full">${u.role}</span>
            <button data-edit class="text-on-surface-variant hover:text-primary" title="ดู/แก้ไขผู้ใช้"><span class="material-symbols-outlined text-[20px]">edit</span></button>
            <button data-del class="text-on-surface-variant hover:text-error" title="ลบผู้ใช้"><span class="material-symbols-outlined text-[20px]">delete</span></button>
          </div>`).join("")}</div>`;
        listEl.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
          const uid = +b.closest("[data-uid]").dataset.uid;
          openUserForm(loadUsers, byId[uid]);
        }));
        listEl.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
          const uid = b.closest("[data-uid]").dataset.uid;
          if (!confirm("ลบผู้ใช้นี้?")) return;
          try { await api("/auth/users/" + uid, { method: "DELETE" }); toast("ลบผู้ใช้แล้ว"); loadUsers(); }
          catch (e) { toast(e.message, "err"); }
        }));
      };
      card.querySelector("#add-user").addEventListener("click", () => openUserForm(loadUsers));
      await loadUsers();

      // --- Local Backup (safety net) ---
      const bk = el(`
        <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-1 overflow-hidden">
          <div class="px-lg py-md border-b border-outline-variant flex justify-between items-center flex-wrap gap-sm">
            <h3 class="text-[20px] font-semibold flex items-center gap-sm"><span class="material-symbols-outlined text-primary">backup</span>สำรองข้อมูล (Local Backup)</h3>
            <div class="flex gap-sm">
              <button id="bk-restore-latest" class="bg-surface border border-primary text-primary text-[14px] font-semibold rounded-lg py-2 px-md hover:bg-surface-container-low flex items-center gap-1"><span class="material-symbols-outlined text-[18px]">history</span>กู้คืนล่าสุด</button>
              <button id="bk-create" class="bg-primary text-on-primary text-[14px] font-semibold rounded-lg py-2 px-md hover:bg-primary-container flex items-center gap-1"><span class="material-symbols-outlined text-[18px]">save</span>สร้าง backup</button>
            </div>
          </div>
          <div class="p-lg">
            <p class="text-[13px] text-on-surface-variant mb-md">บันทึก snapshot ของ influencers + campaigns ไว้บนเครื่อง (localhost) ใช้กู้คืนกันพลาดได้ — ก่อนกู้คืนระบบจะ snapshot สถานะปัจจุบันให้อัตโนมัติ</p>
            <div id="bk-list" class="flex flex-col gap-sm"></div>
          </div>
        </div>`);
      view.appendChild(bk);
      const bkList = bk.querySelector("#bk-list");
      const fmtDT = (iso) => { try { return new Date(iso).toLocaleString("th-TH"); } catch { return iso || "-"; } };
      const fmtKB = (b) => (b >= 1024 ? (b / 1024).toFixed(1) + " KB" : b + " B");
      const loadBackups = async () => {
        const data = await api("/backup");
        bk.querySelector("#bk-restore-latest").disabled = !data.latest;
        bk.querySelector("#bk-restore-latest").classList.toggle("opacity-40", !data.latest);
        bkList.innerHTML = data.backups.length ? data.backups.map((b, i) => `
          <div class="flex items-center gap-md py-2 border-b border-outline-variant/60" data-fn="${esc(b.filename)}">
            <span class="material-symbols-outlined text-on-surface-variant">${i === 0 ? "bookmark" : "description"}</span>
            <div class="flex-1 min-w-0">
              <div class="font-semibold text-[14px] truncate">${fmtDT(b.created_at)}${i === 0 ? ` <span class="text-[11px] text-primary font-bold">· ล่าสุด</span>` : ""}</div>
              <div class="text-[12px] text-on-surface-variant">influencers ${b.counts.influencers ?? 0} · campaigns ${b.counts.campaigns ?? 0} · ${fmtKB(b.size_bytes)}</div>
            </div>
            <button data-bk-dl class="text-on-surface-variant hover:text-primary" title="ดาวน์โหลด"><span class="material-symbols-outlined text-[20px]">download</span></button>
            <button data-bk-restore class="text-on-surface-variant hover:text-primary" title="กู้คืนเวอร์ชันนี้"><span class="material-symbols-outlined text-[20px]">restore</span></button>
          </div>`).join("") : `<p class="text-[13px] text-on-surface-variant">ยังไม่มี backup — กด "สร้าง backup" เพื่อเริ่ม</p>`;
        bkList.querySelectorAll("[data-bk-dl]").forEach((b) => b.addEventListener("click", () => {
          const fn = b.closest("[data-fn]").dataset.fn;
          const t = auth?.token ? "?token=" + encodeURIComponent(auth.token) : "";
          window.open(API + "/backup/" + encodeURIComponent(fn) + "/download" + t, "_blank");
        }));
        bkList.querySelectorAll("[data-bk-restore]").forEach((b) => b.addEventListener("click", async () => {
          const fn = b.closest("[data-fn]").dataset.fn;
          if (!confirm(`กู้คืนข้อมูลจาก backup นี้?\nข้อมูล influencers/campaigns ปัจจุบันจะถูกแทนที่ (ระบบ snapshot ปัจจุบันให้ก่อนแล้ว)`)) return;
          try { const r = await api("/backup/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: fn }) });
            toast(`กู้คืนแล้ว: influencers ${r.counts.influencers}, campaigns ${r.counts.campaigns}`); loadBackups(); }
          catch (e) { toast(e.message, "err"); }
        }));
      };
      bk.querySelector("#bk-create").addEventListener("click", async () => {
        try { const r = await api("/backup", { method: "POST" }); toast(`สร้าง backup แล้ว (inf ${r.counts.influencers}, camp ${r.counts.campaigns})`); loadBackups(); }
        catch (e) { toast(e.message, "err"); }
      });
      bk.querySelector("#bk-restore-latest").addEventListener("click", async () => {
        if (!confirm("กู้คืนจาก backup ล่าสุด?\nข้อมูลปัจจุบันจะถูกแทนที่ (ระบบ snapshot ปัจจุบันให้ก่อนแล้ว)")) return;
        try { const r = await api("/backup/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
          toast(`กู้คืนล่าสุดแล้ว: influencers ${r.counts.influencers}, campaigns ${r.counts.campaigns}`); loadBackups(); }
        catch (e) { toast(e.message, "err"); }
      });
      await loadBackups();
    }

    // Reference info
    view.appendChild(el(`
      <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-1 p-lg max-w-xl">
        <h3 class="text-[20px] font-semibold mb-sm flex items-center gap-sm"><span class="material-symbols-outlined text-primary">info</span>ข้อมูลระบบ</h3>
        <div class="text-[14px] text-on-surface-variant flex flex-col gap-1">
          <div>เกณฑ์ Tier: <b>Nano</b> &lt; 10K · <b>Micro</b> 10K–1M · <b>Mega</b> ≥ 1M</div>
          <div>สกุลเงินหลัก: <b>฿ THB</b></div>
          <div>ชนิดไฟล์อัปโหลด: รูป (JPG/PNG/WebP/GIF) · วิดีโอ (MP4/WebM/MOV)</div>
        </div>
      </div>`));
  });

  function openUserForm(onDone, existing = null) {
    const u = existing || {};
    const inpCls = "bg-surface-container-lowest border border-outline-variant rounded-lg px-sm py-2 focus:border-primary focus:ring-1 focus:ring-primary";
    const lbl = (t) => `<span class="text-[12px] font-semibold text-on-surface-variant">${t}</span>`;
    const modal = el(`
      <div class="fixed inset-0 z-50 bg-on-surface/50 backdrop-blur-sm flex items-center justify-center p-md">
        <div class="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
          <div class="px-lg py-md border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
            <h2 class="text-[20px] font-bold flex items-center gap-sm"><span class="material-symbols-outlined text-primary">${existing ? "manage_accounts" : "person_add"}</span>${existing ? "แก้ไขผู้ใช้" : "เพิ่มผู้ใช้"}</h2>
            <button data-close class="text-on-surface-variant hover:text-on-surface"><span class="material-symbols-outlined">close</span></button></div>
          <div class="p-lg flex flex-col gap-sm">
            <label class="flex flex-col gap-1">${lbl("ชื่อ-สกุล")}<input id="u-name" value="${esc(u.full_name || "")}" placeholder="ชื่อ-สกุล" class="${inpCls}"/></label>
            <label class="flex flex-col gap-1">${lbl("Username")}<input id="u-user" value="${esc(u.username || "")}" placeholder="Username (อย่างน้อย 3 ตัว)" class="${inpCls} ${existing ? "opacity-60" : ""}" ${existing ? "disabled" : ""}/></label>
            <label class="flex flex-col gap-1">${lbl("สิทธิ์การใช้งาน")}<select id="u-role" class="${inpCls}">
              <option value="viewer" ${u.role === "viewer" ? "selected" : ""}>Viewer (ลูกค้า — ดูอย่างเดียว)</option>
              <option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin (ผู้ดูแล — จัดการได้เต็ม)</option></select></label>
            <label class="flex flex-col gap-1">${lbl(existing ? "รหัสผ่านใหม่ (เว้นว่างไว้ถ้าไม่เปลี่ยน)" : "Password (อย่างน้อย 4 ตัว)")}${pwInput("u-pass", existing ? "รหัสผ่านใหม่" : "Password")}</label>
            <label class="flex flex-col gap-1">${lbl("ยืนยันรหัสผ่าน")}${pwInput("u-pass2", "พิมพ์รหัสผ่านอีกครั้ง")}</label>
          </div>
          <div class="px-lg py-md border-t border-outline-variant flex justify-end gap-md">
            <button data-close class="px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Cancel</button>
            <button data-save class="px-md py-2 rounded-lg font-semibold bg-primary text-on-primary hover:bg-primary-container shadow-sm">Save</button></div>
        </div></div>`);
    $("#modal-root").appendChild(modal);
    const close = () => modal.remove();
    modal.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    modal.querySelector("[data-save]").addEventListener("click", async () => {
      const full_name = modal.querySelector("#u-name").value.trim();
      const role = modal.querySelector("#u-role").value;
      const pass = modal.querySelector("#u-pass").value;
      const pass2 = modal.querySelector("#u-pass2").value;
      if (pass || pass2) {
        if (pass.length < 4) return toast("รหัสผ่านสั้นเกินไป (อย่างน้อย 4 ตัว)", "err");
        if (pass !== pass2) return toast("ยืนยันรหัสผ่านไม่ตรงกัน", "err");
      }
      try {
        if (existing) {
          await api("/auth/users/" + existing.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ full_name, role }) });
          if (pass) await api("/auth/users/" + existing.id + "/password", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ new_password: pass }) });
          toast("อัปเดตผู้ใช้แล้ว");
        } else {
          const username = modal.querySelector("#u-user").value.trim();
          if (!pass) return toast("กรุณาตั้งรหัสผ่าน", "err");
          await api("/auth/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ full_name, username, password: pass, role }) });
          toast("เพิ่มผู้ใช้แล้ว");
        }
        close(); onDone && onDone();
      } catch (e) { toast(e.message, "err"); }
    });
  }

  // ============================================================
  //  SUPPORT
  // ============================================================
  route("support", async (view) => {
    view.appendChild(el(`<h1 class="text-[32px] font-semibold tracking-tight">Support</h1>`));
    const cardBox = (icon, title, body) => `
      <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-1 p-lg">
        <h3 class="text-[18px] font-semibold mb-sm flex items-center gap-sm"><span class="material-symbols-outlined text-primary">${icon}</span>${title}</h3>
        <div class="text-[14px] text-on-surface-variant leading-relaxed flex flex-col gap-2">${body}</div></div>`;
    view.appendChild(el(`<section class="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
      ${cardBox("rocket_launch", "เริ่มต้นใช้งาน", `
        <div>1. <b>Directory</b> — ดู/ค้นหา/กรองอินฟลูเอนเซอร์ (ตาม Tier, แพลตฟอร์ม, หมวด, ราคา)</div>
        <div>2. <b>Add / Import</b> — เพิ่มทีละคน หรืออัปโหลด Excel/CSV (เฉพาะ Admin)</div>
        <div>3. <b>Campaigns</b> — สร้างแคมเปญ มอบหมายอินฟลู และตั้งงบ</div>
        <div>4. <b>Financials</b> — ดูมูลค่ารวม โครงสร้างค่าใช้จ่าย และ Top earners</div>
        <div>5. <b>Analytics</b> — เปรียบเทียบ performance ระหว่างหมวด</div>`)}
      ${cardBox("help", "คำถามที่พบบ่อย", `
        <div><b>Tier คำนวณยังไง?</b> อัตโนมัติจากจำนวนผู้ติดตาม (แก้เองได้ในฟอร์ม)</div>
        <div><b>viewer ทำอะไรได้?</b> ดูข้อมูลทุกหน้า แต่แก้ไข/เพิ่ม/ลบไม่ได้</div>
        <div><b>แนบสื่อผลงานยังไง?</b> ในฟอร์มแก้ไข → Past Campaigns → ปุ่ม "แนบสื่อ" หรือวางลิงก์</div>`)}
      ${cardBox("vpn_key", "บัญชี & สิทธิ์", `
        <div><b>Admin</b> — จัดการข้อมูล/ผู้ใช้ได้ทั้งหมด</div>
        <div><b>Viewer</b> — สำหรับลูกค้า ดูอย่างเดียว</div>
        <div>เปลี่ยนรหัสผ่าน/จัดการผู้ใช้ได้ที่หน้า <b>Settings</b></div>`)}
      ${cardBox("mail", "ติดต่อทีมงาน", `
        <div>อีเมล: <a href="mailto:support@creatorhub.local" class="text-primary hover:underline">support@creatorhub.local</a></div>
        <div>เอกสาร API: <a href="${(window.API_BASE||"")}/docs" target="_blank" class="text-primary hover:underline">/docs (Swagger)</a></div>
        <div class="text-[12px] mt-sm">Creator Hub · เวอร์ชัน 1.1.0</div>`)}
    </section>`));
  });

  // ============================================================
  //  IMPORT WIZARD MODAL
  // ============================================================
  let importPreview = null;

  function openImportModal() {
    importPreview = null;
    const modal = el(`
    <div class="fixed inset-0 z-50 bg-on-surface/50 backdrop-blur-sm flex items-center justify-center p-md">
      <div class="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden max-h-[92vh]">
        <div class="px-lg py-md border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
          <h2 class="text-[24px] font-bold flex items-center gap-sm"><span class="material-symbols-outlined text-primary">upload_file</span>Import Data Wizard</h2>
          <button data-close class="text-on-surface-variant hover:text-on-surface"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="p-lg flex-1 overflow-y-auto flex flex-col gap-lg" id="import-body">
          <div class="dropzone border-2 border-dashed border-outline-variant rounded-xl p-xl flex flex-col items-center justify-center text-center bg-surface-container-low/50 hover:bg-surface-container-low transition-colors cursor-pointer group">
            <div class="w-16 h-16 bg-primary-fixed rounded-full flex items-center justify-center mb-md group-hover:scale-105 transition-transform"><span class="material-symbols-outlined text-[32px] text-primary">cloud_upload</span></div>
            <h3 class="text-[20px] font-semibold mb-1">Drag &amp; Drop your file here</h3>
            <p class="text-[14px] text-on-surface-variant mb-md">Supports .csv, .xlsx, .xls up to 10MB</p>
            <button data-browse class="bg-surface border border-outline-variant text-primary font-semibold rounded-lg py-2 px-md hover:bg-surface-container-lowest transition-colors shadow-sm">Browse Files</button>
            <input type="file" accept=".csv,.xlsx,.xls" class="hidden" data-fileinput />
          </div>
          <div id="mapping-zone"></div>
        </div>
        <div class="px-lg py-md border-t border-outline-variant flex justify-between items-center bg-surface-container-lowest">
          <span class="text-[14px] text-on-surface-variant" id="map-status">Awaiting file…</span>
          <div class="flex gap-md">
            <button data-close class="px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors">Cancel</button>
            <button data-process disabled class="px-md py-2 rounded-lg font-semibold bg-primary text-on-primary hover:bg-primary-container transition-colors shadow-sm flex items-center gap-sm disabled:opacity-40 disabled:cursor-not-allowed"><span class="material-symbols-outlined text-[20px]">sync</span>Process Import</button>
          </div>
        </div>
      </div>
    </div>`);
    $("#modal-root").appendChild(modal);

    const close = () => modal.remove();
    modal.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

    const fileInput = modal.querySelector("[data-fileinput]");
    const dz = modal.querySelector(".dropzone");
    modal.querySelector("[data-browse]").addEventListener("click", () => fileInput.click());
    dz.addEventListener("click", (e) => { if (e.target.closest("[data-browse]")) return; fileInput.click(); });
    fileInput.addEventListener("change", () => fileInput.files[0] && handleFile(fileInput.files[0], modal));
    ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("dragover"); }));
    ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("dragover"); }));
    dz.addEventListener("drop", (e) => e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0], modal));

    modal.querySelector("[data-process]").addEventListener("click", () => processImport(modal, close));
  }

  async function handleFile(file, modal) {
    const zone = modal.querySelector("#mapping-zone");
    const status = modal.querySelector("#map-status");
    zone.innerHTML = `<div class="flex items-center gap-sm text-on-surface-variant"><span class="material-symbols-outlined animate-spin">progress_activity</span>Analysing “${esc(file.name)}”…</div>`;
    try {
      const fd = new FormData();
      fd.append("file", file);
      importPreview = await api("/imports/preview", { method: "POST", body: fd });
      renderMapping(modal);
      status.textContent = `${importPreview.mapped_count}/${importPreview.suggestions.length} columns mapped · ${importPreview.row_count} rows`;
      modal.querySelector("[data-process]").disabled = importPreview.mapped_count === 0;
    } catch (e) {
      zone.innerHTML = `<div class="text-error flex items-center gap-sm"><span class="material-symbols-outlined">error</span>${esc(e.message)}</div>`;
    }
  }

  function renderMapping(modal) {
    const zone = modal.querySelector("#mapping-zone");
    const fields = importPreview.system_fields;
    const opt = (sel) => `<option value="">— Skip —</option>` +
      fields.map((f) => `<option value="${f}" ${f === sel ? "selected" : ""}>${f}</option>`).join("");
    const statusPill = (s) => {
      if (s === "matched") return `<div class="inline-flex items-center gap-1 text-secondary bg-secondary-container/30 px-sm py-1 rounded-full"><span class="material-symbols-outlined text-[16px]">check_circle</span><span class="text-[12px] font-semibold">Matched</span></div>`;
      if (s === "review") return `<div class="inline-flex items-center gap-1 text-primary bg-primary-fixed/50 px-sm py-1 rounded-full"><span class="material-symbols-outlined text-[16px]">help</span><span class="text-[12px] font-semibold">Review</span></div>`;
      return `<div class="inline-flex items-center gap-1 text-error bg-error-container/40 px-sm py-1 rounded-full"><span class="material-symbols-outlined text-[16px]">warning</span><span class="text-[12px] font-semibold">Unmapped</span></div>`;
    };
    zone.innerHTML = `
      <h3 class="text-[20px] font-semibold mb-1">Column Mapping Preview</h3>
      <p class="text-[14px] text-on-surface-variant mb-sm">Auto-matched columns from “${esc(importPreview.filename)}”. Adjust any before importing.</p>
      <div class="overflow-x-auto border border-outline-variant rounded-xl">
        <table class="w-full text-left border-collapse">
          <thead><tr class="bg-surface-container-low border-b border-outline-variant">
            <th class="p-md text-[12px] tracking-wider font-semibold text-on-surface-variant uppercase">File Column</th>
            <th class="p-md text-[12px] tracking-wider font-semibold text-on-surface-variant uppercase">System Field</th>
            <th class="p-md text-[12px] tracking-wider font-semibold text-on-surface-variant uppercase text-center">Status</th>
          </tr></thead>
          <tbody class="divide-y divide-outline-variant">
            ${importPreview.suggestions.map((s, i) => `
              <tr class="hover:bg-surface-container-lowest/50">
                <td class="p-md align-top"><div class="font-medium">${esc(s.file_column)}</div>${s.sample.length ? `<div class="text-[12px] text-on-surface-variant truncate max-w-[160px]">e.g. ${esc(s.sample[0])}</div>` : ""}</td>
                <td class="p-md"><select data-map="${i}" class="w-full bg-surface-container-lowest border ${s.system_field ? "border-outline-variant" : "border-error"} rounded-md px-sm py-2 text-[14px] focus:border-primary focus:ring-1 focus:ring-primary">${opt(s.system_field)}</select></td>
                <td class="p-md text-center" data-status="${i}">${statusPill(s.status)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
    zone.querySelectorAll("[data-map]").forEach((sel) => {
      sel.addEventListener("change", () => {
        const i = +sel.dataset.map;
        importPreview.suggestions[i].system_field = sel.value || null;
        importPreview.suggestions[i].status = sel.value ? "matched" : "unmapped";
        zone.querySelector(`[data-status="${i}"]`).innerHTML = statusPill(importPreview.suggestions[i].status);
        sel.classList.toggle("border-error", !sel.value);
        sel.classList.toggle("border-outline-variant", !!sel.value);
        const mapped = importPreview.suggestions.filter((x) => x.system_field).length;
        modal.querySelector("#map-status").textContent = `${mapped}/${importPreview.suggestions.length} columns mapped · ${importPreview.row_count} rows`;
        modal.querySelector("[data-process]").disabled = mapped === 0;
      });
    });
  }

  async function processImport(modal, close) {
    const btn = modal.querySelector("[data-process]");
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>Importing…`;
    try {
      const mappings = importPreview.suggestions.map((s) => ({ file_column: s.file_column, system_field: s.system_field }));
      const res = await api("/imports/commit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upload_id: importPreview.upload_id, mappings, update_existing: true }),
      });
      toast(`Imported: ${res.created} new, ${res.updated} updated${res.skipped ? `, ${res.skipped} skipped` : ""}`);
      if (res.errors.length) toast(`${res.errors.length} row error(s) — check console`, "info"), console.warn(res.errors);
      close();
      if ((location.hash || "#/directory").startsWith("#/directory")) render();
    } catch (e) {
      toast(e.message, "err");
      btn.disabled = false;
      btn.innerHTML = `<span class="material-symbols-outlined text-[20px]">sync</span>Process Import`;
    }
  }

  // ============================================================
  //  ADD / EDIT INFLUENCER FORM MODAL
  // ============================================================
  function openInfluencerForm(existing = null) {
    const d = existing || {};
    const field = (name, label, val = "", type = "text") => `
      <label class="flex flex-col gap-1"><span class="text-[12px] tracking-wide font-semibold text-on-surface-variant">${label}</span>
      <input name="${name}" type="${type}" value="${esc(val)}" class="bg-surface-container-lowest border border-outline-variant rounded-lg px-sm py-2 text-[15px] focus:border-primary focus:ring-1 focus:ring-primary"/></label>`;
    const linkField = (key, label, icon, links = {}) => `
      <label class="flex items-center gap-sm border border-outline-variant rounded-lg px-sm bg-surface-container-lowest focus-within:border-primary">
        <i class="${icon} text-on-surface-variant" style="width:18px;text-align:center"></i>
        <input name="link_${key}" type="url" placeholder="${label} URL" value="${esc((links || {})[key] || "")}" class="flex-1 bg-transparent py-2 text-[14px] focus:outline-none"/></label>`;
    const sectionHead = (icon, text) => `
      <div class="sm:col-span-2 flex items-center gap-sm mt-md pt-md border-t border-outline-variant [&:first-child]:border-0 [&:first-child]:pt-0 [&:first-child]:mt-0">
        <span class="material-symbols-outlined text-primary text-[18px]">${icon}</span>
        <span class="text-[13px] font-bold tracking-wide">${text}</span></div>`;
    const modal = el(`
    <div class="fixed inset-0 z-50 bg-on-surface/50 backdrop-blur-sm flex items-center justify-center p-md">
      <div class="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[92vh]">
        <div class="px-lg py-md border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
          <h2 class="text-[22px] font-bold flex items-center gap-sm"><span class="material-symbols-outlined text-primary">${existing ? "edit" : "person_add"}</span>${existing ? "Edit" : "Add"} Influencer</h2>
          <button data-close class="text-on-surface-variant hover:text-on-surface"><span class="material-symbols-outlined">close</span></button>
        </div>
        <form id="inf-form" class="p-lg overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-md">
          ${sectionHead("badge", "ข้อมูลส่วนตัว · Personal details")}
          ${field("name", "Name *", d.name)}
          ${field("handle", "Handle", d.handle)}
          ${field("niche", "Niche (comma sep)", d.niche)}
          ${field("platform", "Platform", d.platform)}
          ${field("age", "Age", d.age ?? "", "number")}
          ${field("location", "Location", d.location)}
          ${field("active_since", "Active Since", d.active_since)}
          <div class="sm:col-span-2 flex items-center gap-md">
            <div id="avatar-preview" class="w-16 h-16 rounded-full overflow-hidden bg-surface-container-high border border-outline-variant flex items-center justify-center shrink-0">
              ${d.avatar_url ? `<img src="${esc(mediaSrc(d.avatar_url))}" class="w-full h-full object-cover"/>` : `<span class="material-symbols-outlined text-on-surface-variant">person</span>`}
            </div>
            <div class="flex-1 flex flex-col gap-1">
              <span class="text-[12px] tracking-wide font-semibold text-on-surface-variant">Profile Picture (รูปโปรไฟล์)</span>
              <div class="flex gap-sm items-center">
                <button type="button" data-avatar-browse class="shrink-0 bg-surface border border-primary text-primary text-[13px] font-semibold rounded-lg px-md py-2 hover:bg-surface-container-low flex items-center gap-1"><span class="material-symbols-outlined text-[18px]">upload</span>อัปโหลด</button>
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" data-avatar-file />
                <input name="avatar_url" type="text" placeholder="หรือวางลิงก์รูป (URL)" value="${esc(d.avatar_url || "")}" class="flex-1 bg-surface-container-lowest border border-outline-variant rounded-lg px-sm py-2 text-[14px] focus:border-primary focus:ring-1 focus:ring-primary"/>
              </div>
              <span data-avatar-status class="text-[11px] text-on-surface-variant"></span>
            </div>
          </div>
          ${sectionHead("groups", "ตัวชี้วัด · Audience metrics")}
          ${field("followers", "Followers", d.followers ?? 0, "number")}
          ${field("engagement_rate", "Engagement %", d.engagement_rate ?? 0, "number")}
          ${field("growth_30d", "Growth 30d %", d.growth_30d ?? 0, "number")}
          <label class="flex flex-col gap-1"><span class="text-[12px] tracking-wide font-semibold text-on-surface-variant">Tier (ระดับอินฟลู)</span>
            <select name="tier" data-tier class="bg-surface-container-lowest border border-outline-variant rounded-lg px-sm py-2 text-[15px] focus:border-primary focus:ring-1 focus:ring-primary">
              <option value="">Auto — จาก Followers</option>
              ${TIERS.map((t) => `<option value="${t}" ${d.tier === t ? "selected" : ""}>${t}</option>`).join("")}
            </select>
            <span data-tier-hint class="text-[11px] text-on-surface-variant"></span></label>
          ${sectionHead("payments", "ค่าใช้จ่าย · Pricing")}
          ${field("base_rate", "Base Rate ค่าตัว (฿)", d.base_rate ?? 0, "number")}
          ${field("code_gen_fee", "Code Gen ค่าเจนโค้ด (฿)", d.code_gen_fee ?? 0, "number")}
          ${field("management_fee", "Management ค่าเมเนจฟี (฿)", d.management_fee ?? 0, "number")}
          ${field("agency_fee_pct", "Agency ค่าเอเจนฟี (%)", d.agency_fee_pct ?? 0, "number")}
          <label class="flex flex-col gap-1"><span class="text-[12px] tracking-wide font-semibold text-on-surface-variant">Currency</span>
            <select name="currency" class="bg-surface-container-lowest border border-outline-variant rounded-lg px-sm py-2 text-[15px] focus:border-primary focus:ring-1 focus:ring-primary">
              ${["THB","USD","EUR","GBP","SGD","JPY"].map((c) => `<option ${(d.currency || "THB") === c ? "selected" : ""}>${c}</option>`).join("")}
            </select></label>
          ${sectionHead("hub", "ช่องทางติดต่อ · Social links")}
          <div class="sm:col-span-2 mt-sm">
            <div class="text-[12px] text-on-surface-variant mb-sm">กรอกลิงก์แต่ละแพลตฟอร์ม จะแสดงเป็นไอคอนคลิกได้บนโปรไฟล์</div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-md">
              ${linkField("instagram", "Instagram", "fa-brands fa-instagram", d.social_links)}
              ${linkField("tiktok", "TikTok", "fa-brands fa-tiktok", d.social_links)}
              ${linkField("youtube", "YouTube", "fa-brands fa-youtube", d.social_links)}
              ${linkField("facebook", "Facebook", "fa-brands fa-facebook", d.social_links)}
              ${linkField("twitter", "X / Twitter", "fa-brands fa-x-twitter", d.social_links)}
              ${linkField("website", "Website", "fa-solid fa-globe", d.social_links)}
            </div>
          </div>
          ${sectionHead("description", "เนื้อหา · Content")}
          <label class="flex flex-col gap-1 sm:col-span-2"><span class="text-[12px] tracking-wide font-semibold text-on-surface-variant">Bio</span>
            <textarea name="bio" rows="3" class="bg-surface-container-lowest border border-outline-variant rounded-lg px-sm py-2 text-[15px] focus:border-primary focus:ring-1 focus:ring-primary">${esc(d.bio || "")}</textarea></label>
          <div class="sm:col-span-2">
            <div class="flex items-center justify-between mb-sm">
              <span class="text-[12px] tracking-wide font-semibold text-on-surface-variant flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">hub</span>Top Platforms (เมตริกแยกแพลตฟอร์ม)</span>
              <button type="button" data-add="plat" class="text-primary text-[13px] font-semibold flex items-center gap-1 hover:underline"><span class="material-symbols-outlined text-[16px]">add</span>Add platform</button>
            </div>
            <div id="plat-rows" class="flex flex-col gap-sm"></div>
          </div>
          <div class="sm:col-span-2 border-t border-outline-variant pt-md">
            <div class="flex items-center justify-between mb-sm">
              <span class="text-[12px] tracking-wide font-semibold text-on-surface-variant flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">assignment</span>Scope of Work (ขอบเขตงาน)</span>
              <button type="button" data-add="scope" class="text-primary text-[13px] font-semibold flex items-center gap-1 hover:underline"><span class="material-symbols-outlined text-[16px]">add</span>Add item</button>
            </div>
            <div id="scope-rows" class="flex flex-col gap-sm"></div>
          </div>
          <div class="sm:col-span-2 border-t border-outline-variant pt-md">
            <div class="flex items-center justify-between mb-sm">
              <span class="text-[12px] tracking-wide font-semibold text-on-surface-variant flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">history</span>Past Campaigns (แคมเปญที่ผ่านมา)</span>
              <button type="button" data-add="camp" class="text-primary text-[13px] font-semibold flex items-center gap-1 hover:underline"><span class="material-symbols-outlined text-[16px]">add</span>Add campaign</button>
            </div>
            <div id="camp-rows" class="flex flex-col gap-sm"></div>
          </div>
          ${sectionHead("auto_awesome", "คะแนนความเหมาะสม · Campaign Fit (0–100)")}
          ${field("brand_safety", "Brand Safety", d.brand_safety ?? 0, "number")}
          ${field("audience_alignment", "Audience Alignment", d.audience_alignment ?? 0, "number")}
          ${field("content_quality", "Content Quality", d.content_quality ?? 0, "number")}
          ${field("reliability", "Reliability", d.reliability ?? 0, "number")}
          <label class="flex flex-col gap-1 sm:col-span-2"><span class="text-[12px] tracking-wide font-semibold text-on-surface-variant">Fit Note (สรุปความเหมาะสม)</span>
            <input name="fit_note" type="text" value="${esc(d.fit_note || "")}" class="bg-surface-container-lowest border border-outline-variant rounded-lg px-sm py-2 text-[15px] focus:border-primary focus:ring-1 focus:ring-primary"/></label>
          <label class="flex items-center gap-sm sm:col-span-2 mt-sm"><input type="checkbox" name="verified" ${d.verified ? "checked" : ""} class="rounded text-primary focus:ring-primary"/><span class="font-medium">Verified</span></label>
        </form>
        <div class="px-lg py-md border-t border-outline-variant flex justify-end gap-md bg-surface-container-lowest">
          <button data-close class="px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Cancel</button>
          <button data-save class="px-md py-2 rounded-lg font-semibold bg-primary text-on-primary hover:bg-primary-container shadow-sm flex items-center gap-1"><span class="material-symbols-outlined text-[20px]">save</span>Save</button>
        </div>
      </div>
    </div>`);
    $("#modal-root").appendChild(modal);
    const close = () => modal.remove();
    modal.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

    const inpCls = "border border-outline-variant rounded-lg px-sm py-2 text-[14px] bg-surface-container-lowest focus:border-primary focus:ring-1 focus:ring-primary";
    const scopeRows = modal.querySelector("#scope-rows");
    const campRows = modal.querySelector("#camp-rows");
    const platRows = modal.querySelector("#plat-rows");
    const delBtn = () => {
      const b = el(`<button type="button" class="shrink-0 self-center text-on-surface-variant hover:text-error" aria-label="Remove"><span class="material-symbols-outlined text-[20px]">delete</span></button>`);
      return b;
    };
    function addScopeRow(s = {}) {
      const row = el(`<div class="scope-row flex gap-sm items-start">
        <div class="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-sm">
          <input class="sc-title ${inpCls}" placeholder="Title เช่น 1x YouTube Video" value="${esc(s.title || "")}"/>
          <input class="sc-detail ${inpCls}" placeholder="Detail (รายละเอียด)" value="${esc(s.detail || "")}"/>
        </div></div>`);
      const b = delBtn(); b.addEventListener("click", () => row.remove()); row.appendChild(b);
      scopeRows.appendChild(row);
    }
    function addCampRow(c = {}) {
      const row = el(`<div class="camp-row border border-outline-variant rounded-xl p-sm flex flex-col gap-sm">
        <div class="cp-head flex gap-sm items-start">
          <div class="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-sm">
            <input class="cp-brand ${inpCls}" placeholder="Brand" value="${esc(c.brand || "")}"/>
            <input class="cp-campaign ${inpCls}" placeholder="Campaign" value="${esc(c.campaign || "")}"/>
            <input class="cp-views ${inpCls}" placeholder="Views เช่น 200k" value="${esc(c.views || "")}"/>
            <input class="cp-ctr ${inpCls}" placeholder="CTR เช่น 15%" value="${esc(c.ctr || "")}"/>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-sm">
          <div class="flex gap-sm items-center">
            <button type="button" class="cp-media-browse shrink-0 bg-surface border border-outline-variant text-primary text-[13px] font-semibold rounded-lg px-sm py-2 hover:bg-surface-container-low flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">attach_file</span>แนบสื่อ</button>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime" class="hidden cp-media-file"/>
            <input class="cp-media-url ${inpCls} flex-1" placeholder="ลิงก์รูป/วิดีโอ หรือ อัปโหลด" value="${esc(c.media_url || "")}"/>
          </div>
          <input class="cp-work-url ${inpCls}" placeholder="ลิงก์ผลงาน (โพสต์/คลิป)" value="${esc(c.work_url || "")}"/>
        </div>
        <input type="hidden" class="cp-media-type" value="${esc(c.media_type || "")}"/>
        <div class="cp-media-status text-[11px] text-on-surface-variant"></div>
      </div>`);
      const head = row.querySelector(".cp-head");
      const b = delBtn(); b.addEventListener("click", () => row.remove()); head.appendChild(b);

      const fileInput = row.querySelector(".cp-media-file");
      const urlInput = row.querySelector(".cp-media-url");
      const typeInput = row.querySelector(".cp-media-type");
      const status = row.querySelector(".cp-media-status");
      const inferType = (v) =>
        /\.(mp4|webm|mov)$/i.test(v) ? "video" : /\.(jpe?g|png|webp|gif)$/i.test(v) ? "image" : "";
      if (c.media_url) status.textContent = `สื่อแนบ: ${c.media_type || inferType(c.media_url) || "link"}`;
      row.querySelector(".cp-media-browse").addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", async () => {
        const f = fileInput.files[0];
        if (!f) return;
        status.textContent = "กำลังอัปโหลด…";
        try {
          const res = await uploadFile("/uploads/campaign-media", f);
          urlInput.value = res.url;
          typeInput.value = res.media_type || inferType(res.url);
          status.textContent = `แนบแล้ว: ${f.name} (${typeInput.value || "media"})`;
        } catch (e) { status.textContent = "อัปโหลดไม่สำเร็จ: " + e.message; }
      });
      urlInput.addEventListener("input", () => { typeInput.value = inferType(urlInput.value.trim()); });
      campRows.appendChild(row);
    }
    function addPlatRow(p = {}) {
      const row = el(`<div class="plat-row flex gap-sm items-start">
        <div class="flex-1 grid grid-cols-3 gap-sm">
          <input class="pl-platform ${inpCls}" placeholder="Platform เช่น YouTube" value="${esc(p.platform || "")}"/>
          <input class="pl-metric ${inpCls}" placeholder="Metric เช่น Subscribers" value="${esc(p.metric || "")}"/>
          <input class="pl-value ${inpCls}" placeholder="Value เช่น 850K" value="${esc(p.value || "")}"/>
        </div></div>`);
      const b = delBtn(); b.addEventListener("click", () => row.remove()); row.appendChild(b);
      platRows.appendChild(row);
    }
    (d.scope_of_work || []).forEach(addScopeRow);
    (d.past_campaigns || []).forEach(addCampRow);
    (d.platforms || []).forEach(addPlatRow);
    modal.querySelector('[data-add="scope"]').addEventListener("click", () => addScopeRow());
    modal.querySelector('[data-add="camp"]').addEventListener("click", () => addCampRow());
    modal.querySelector('[data-add="plat"]').addEventListener("click", () => addPlatRow());

    // --- Avatar upload wiring ---
    const avatarFile = modal.querySelector("[data-avatar-file]");
    const avatarUrl = modal.querySelector('input[name="avatar_url"]');
    const avatarPreview = modal.querySelector("#avatar-preview");
    const avatarStatus = modal.querySelector("[data-avatar-status]");
    const setAvatarPreview = (src) => {
      avatarPreview.innerHTML = src
        ? `<img src="${esc(mediaSrc(src))}" class="w-full h-full object-cover"/>`
        : `<span class="material-symbols-outlined text-on-surface-variant">person</span>`;
    };
    modal.querySelector("[data-avatar-browse]").addEventListener("click", () => avatarFile.click());
    avatarFile.addEventListener("change", async () => {
      const f = avatarFile.files[0];
      if (!f) return;
      avatarStatus.textContent = "กำลังอัปโหลด…";
      try {
        const res = await uploadFile("/uploads/avatar", f);
        avatarUrl.value = res.url;
        setAvatarPreview(res.url);
        avatarStatus.textContent = `อัปโหลดแล้ว: ${f.name}`;
      } catch (e) { avatarStatus.textContent = "อัปโหลดไม่สำเร็จ: " + e.message; }
    });
    avatarUrl.addEventListener("input", () => setAvatarPreview(avatarUrl.value.trim()));

    // --- Tier auto-hint (mirrors backend auto-derivation) ---
    const tierSelect = modal.querySelector("[data-tier]");
    const tierHint = modal.querySelector("[data-tier-hint]");
    const followersInput = modal.querySelector('input[name="followers"]');
    const updateTierHint = () => {
      const auto = tierForFollowers(followersInput.value);
      tierHint.textContent = tierSelect.value
        ? `กำหนดเอง · auto = ${auto}`
        : `จะเป็น ${auto} อัตโนมัติจาก ${fmtNum(followersInput.value)} followers`;
    };
    tierSelect.addEventListener("change", updateTierHint);
    followersInput.addEventListener("input", updateTierHint);
    updateTierHint();

    modal.querySelector("[data-save]").addEventListener("click", async () => {
      const form = modal.querySelector("#inf-form");
      const fd = new FormData(form);
      const numFields = ["age", "followers", "engagement_rate", "growth_30d", "base_rate", "code_gen_fee", "management_fee", "agency_fee_pct", "brand_safety", "audience_alignment", "content_quality", "reliability"];
      const payload = {};
      const social = {};
      for (const [k, v] of fd.entries()) {
        if (k.startsWith("link_")) { if (v.trim()) social[k.slice(5)] = v.trim(); continue; }
        payload[k] = numFields.includes(k) ? (parseFloat(v) || 0) : v;
      }
      payload.social_links = social;
      payload.verified = form.verified.checked;
      payload.scope_of_work = [...scopeRows.querySelectorAll(".scope-row")].map((r) => ({
        title: r.querySelector(".sc-title").value.trim(),
        detail: r.querySelector(".sc-detail").value.trim(),
      })).filter((s) => s.title);
      payload.past_campaigns = [...campRows.querySelectorAll(".camp-row")].map((r) => {
        const camp = {
          brand: r.querySelector(".cp-brand").value.trim(),
          campaign: r.querySelector(".cp-campaign").value.trim(),
          views: r.querySelector(".cp-views").value.trim(),
          ctr: r.querySelector(".cp-ctr").value.trim(),
        };
        const mediaUrl = r.querySelector(".cp-media-url").value.trim();
        const workUrl = r.querySelector(".cp-work-url").value.trim();
        const mediaType = r.querySelector(".cp-media-type").value.trim();
        if (mediaUrl) { camp.media_url = mediaUrl; if (mediaType) camp.media_type = mediaType; }
        if (workUrl) camp.work_url = workUrl;
        return camp;
      }).filter((c) => c.brand || c.campaign || c.media_url || c.work_url);
      payload.platforms = [...platRows.querySelectorAll(".plat-row")].map((r) => ({
        platform: r.querySelector(".pl-platform").value.trim(),
        metric: r.querySelector(".pl-metric").value.trim(),
        value: r.querySelector(".pl-value").value.trim(),
      })).filter((p) => p.platform);
      if (!payload.name?.trim()) return toast("Name is required", "err");
      try {
        if (existing) await api("/influencers/" + existing.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        else await api("/influencers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        toast(existing ? "Profile updated" : "Influencer added");
        close();
        render();
      } catch (e) { toast(e.message, "err"); }
    });
  }

  // ---------- global wiring ----------
  document.addEventListener("click", (e) => {
    // password show/hide toggle
    const eye = e.target.closest("[data-eye]");
    if (eye) {
      e.preventDefault();
      const inp = document.getElementById(eye.dataset.eye);
      if (inp) {
        const show = inp.type === "password";
        inp.type = show ? "text" : "password";
        eye.querySelector(".material-symbols-outlined").textContent = show ? "visibility_off" : "visibility";
      }
      return;
    }

    // sidebar SPA navigation (links use data-route, not href)
    const navLink = e.target.closest("[data-route]");
    if (navLink) { e.preventDefault(); location.hash = navLink.dataset.route; return; }

    const a = e.target.closest("[data-action]");
    if (!a) return;
    if (a.dataset.action === "import") openImportModal();
    if (a.dataset.action === "add-influencer") openInfluencerForm();
    if (a.dataset.action === "export") {
      const tokenQ = auth?.token ? "&token=" + encodeURIComponent(auth.token) : "";
      window.open(API + "/influencers/export?format=xlsx" + tokenQ, "_blank");
      toast("Exporting roster to Excel…");
    }
  });

  let searchTimer;
  $("#global-search").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      filterState.search = e.target.value.trim();
      if (!location.hash.startsWith("#/directory")) location.hash = "#/directory";
      else render();
    }, 300);
  });

  // ---------- login + session boot ----------
  function showLogin(message = "") {
    document.querySelector("#login-overlay")?.remove();
    const overlay = el(`
      <div id="login-overlay" class="fixed inset-0 z-[100] bg-surface flex items-center justify-center p-md">
        <div class="w-full max-w-sm bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-2 p-xl flex flex-col gap-md">
          <div class="flex items-center gap-sm">
            <div class="w-10 h-10 rounded-full bg-primary flex items-center justify-center"><span class="material-symbols-outlined text-on-primary">hub</span></div>
            <div><div class="text-[22px] font-black text-primary font-poppins leading-none">Creator Hub</div>
            <div class="text-[12px] text-on-surface-variant font-semibold tracking-wide">Enterprise Management</div></div>
          </div>
          <h1 class="text-[20px] font-semibold mt-sm">เข้าสู่ระบบ</h1>
          ${message ? `<div class="text-[13px] text-error bg-error-container/40 rounded-lg px-sm py-2">${esc(message)}</div>` : ""}
          <label class="flex flex-col gap-1"><span class="text-[12px] font-semibold text-on-surface-variant">Username</span>
            <input id="lg-user" class="bg-surface-container-lowest border border-outline-variant rounded-lg px-sm py-2 focus:border-primary focus:ring-1 focus:ring-primary" autocomplete="username"/></label>
          <label class="flex flex-col gap-1"><span class="text-[12px] font-semibold text-on-surface-variant">Password</span>
            ${pwInput("lg-pass", "")}</label>
          <div id="lg-err" class="text-[13px] text-error min-h-[18px]"></div>
          <button id="lg-btn" class="bg-primary text-on-primary font-semibold rounded-lg py-2 hover:bg-primary-container shadow-sm flex items-center justify-center gap-1"><span class="material-symbols-outlined text-[20px]">login</span>เข้าสู่ระบบ</button>
          <div class="text-[12px] text-on-surface-variant bg-surface-container-low rounded-lg px-sm py-2 leading-relaxed">
            <b>ทดลองใช้:</b><br/>admin / admin123 (ผู้ดูแล)<br/>viewer / viewer123 (ลูกค้า — ดูอย่างเดียว)
          </div>
        </div>
      </div>`);
    document.body.appendChild(overlay);
    const userI = overlay.querySelector("#lg-user");
    const passI = overlay.querySelector("#lg-pass");
    const err = overlay.querySelector("#lg-err");
    const btn = overlay.querySelector("#lg-btn");
    userI.focus();
    const submit = async () => {
      err.textContent = "";
      btn.disabled = true;
      try {
        const res = await fetch(API + "/auth/login", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: userI.value.trim(), password: passI.value }),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.detail || "เข้าสู่ระบบไม่สำเร็จ"); }
        setAuth(await res.json());
        overlay.remove();
        startApp();
      } catch (e) { err.textContent = e.message; btn.disabled = false; }
    };
    btn.addEventListener("click", submit);
    [userI, passI].forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); }));
  }

  function logout() {
    setAuth(null);
    document.querySelector("#profile-menu")?.remove();
    showLogin();
  }

  function renderProfileChip() {
    const host = $("#profile-host");
    if (!host) return;
    const u = auth.user;
    host.innerHTML = `
      <button id="profile-btn" class="flex items-center gap-sm rounded-full pl-1 pr-sm py-1 hover:bg-surface-container-low transition-colors">
        <span class="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-[14px] font-poppins">${esc((u.full_name||u.username||"?")[0].toUpperCase())}</span>
        <span class="hidden sm:flex flex-col items-start leading-tight">
          <span class="text-[13px] font-semibold">${esc(u.full_name || u.username)}</span>
          <span class="text-[11px] text-on-surface-variant">${u.role === "admin" ? "ผู้ดูแล · Admin" : "ผู้ชม · Viewer"}</span>
        </span>
        <span class="material-symbols-outlined text-on-surface-variant text-[20px]">expand_more</span>
      </button>`;
    host.querySelector("#profile-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      if (document.querySelector("#profile-menu")) { document.querySelector("#profile-menu").remove(); return; }
      const menu = el(`
        <div id="profile-menu" class="absolute right-0 top-12 w-56 bg-surface-container-lowest border border-outline-variant rounded-xl elevation-2 py-1 z-50">
          <div class="px-md py-2 border-b border-outline-variant">
            <div class="font-semibold text-[14px]">${esc(u.full_name || u.username)}</div>
            <div class="text-[12px] text-on-surface-variant">@${esc(u.username)} · ${u.role === "admin" ? "Admin" : "Viewer"}</div>
          </div>
          <button data-route="#/settings" class="w-full text-left px-md py-2 text-[14px] hover:bg-surface-container-low flex items-center gap-sm"><span class="material-symbols-outlined text-[18px]">settings</span>Settings</button>
          <button data-route="#/support" class="w-full text-left px-md py-2 text-[14px] hover:bg-surface-container-low flex items-center gap-sm"><span class="material-symbols-outlined text-[18px]">help</span>Support</button>
          <button id="logout-btn" class="w-full text-left px-md py-2 text-[14px] text-error hover:bg-error-container/40 flex items-center gap-sm"><span class="material-symbols-outlined text-[18px]">logout</span>ออกจากระบบ</button>
        </div>`);
      host.appendChild(menu);
      menu.querySelector("#logout-btn").addEventListener("click", logout);
      setTimeout(() => document.addEventListener("click", function close() {
        menu.remove(); document.removeEventListener("click", close);
      }, { once: true }), 0);
    });
  }

  async function startApp() {
    setAuth(auth);                          // refresh body.is-viewer class
    renderProfileChip();
    if (!location.hash) location.hash = "#/directory";
    render();
  }

  async function boot() {
    if (!auth?.token) { showLogin(); return; }
    // validate the stored token
    try {
      const me = await fetch(API + "/auth/me", { headers: authHeaders() });
      if (!me.ok) throw new Error("expired");
      setAuth({ ...auth, user: await me.json() });
      startApp();
    } catch (_) { setAuth(null); showLogin(); }
  }

  // Bridge for separate feature modules (e.g. content.js) — lets them register
  // routes and reuse helpers without modifying this file's logic.
  window.CH = {
    route, render, api, uploadFile, el, esc, toast,
    fmtNum, fmtMoney, mediaSrc, isAdmin,
    qs: (sel, root) => (root || document).querySelector(sel),
    get token() { return auth?.token || null; },
    get user() { return auth?.user || null; },
  };

  window.addEventListener("hashchange", () => { if (auth?.token) render(); });
  // Boot exactly once: feature modules (loaded after this script) finish first,
  // then DOMContentLoaded fires. Calling boot() directly too would double-render.
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
