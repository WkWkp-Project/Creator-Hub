/* Content Asset Suite — CORE / connector.
 *
 * Owns the shared infrastructure and campaign-level concerns ONLY:
 *   - shared helpers (modal, escapers, directory caches, money, saveAsset, roster)
 *   - the campaign LIST route and the campaign DETAIL route
 *   - campaign-level modals: Add / Edit / Handoff (report) / Brands
 *
 * Each SECTION of the detail view (A = Approved Input Files, B = KOL Plan,
 * future C = ...) lives in its OWN file and self-registers through
 * `window.CA.register({...})`. The detail route renders the header + summary,
 * then loops the registered sections in order — so adding Section C is just a
 * new file + one register() call, with no edits here.
 */
(() => {
  "use strict";
  const CH = window.CH;
  if (!CH) { console.error("contentasset.js: CH bridge missing"); return; }
  const { route, api, el, esc, toast, isAdmin, render, fmtNum, uploadFile, mediaSrc } = CH;

  const STATUS_LABEL = { draft: "Draft", active: "Active", paused: "Paused", completed: "Completed", done: "Done", success: "Success" };
  const CLOSED_STATUS = new Set(["completed", "complete", "done", "success", "succeeded", "cancelled"]);
  const isClosedStatus = (s) => CLOSED_STATUS.has(String(s || "").trim().toLowerCase());

  // Section A is a fixed 3-slot template; stored input_files fill each slot in order.
  // Kept in core because the campaign LIST cards summarise the linked-file count.
  // Each Section-A slot carries its display title AND the SYNCED tag, kept in
  // sync so the tag always matches the heading (not the legacy template value).
  const SECTION_A_SLOTS = [
    { title: "Product Information", synced: "Product_Info" },
    { title: "KOLs Communication Plan", synced: "KOLs_Comm_Plan" },
    { title: "KOLs Brief", synced: "KOLs_Brief" },
  ];
  const sectionAFiles = (a) => SECTION_A_SLOTS.map((slot, i) => ({
    ...((a.input_files || [])[i] || {}), title: slot.title, synced: slot.synced, n: String(i + 1).padStart(2, "0"),
  }));

  const inpCls = "w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-sm py-2 text-[14px] focus:border-primary focus:ring-1 focus:ring-primary";
  const lbl = (t) => `<span class="text-[12px] font-semibold text-on-surface-variant">${t}</span>`;

  // Shared modal shell (reuses the app's modal style for consistency).
  function modal(title, icon, bodyHTML, footHTML, maxw = "max-w-2xl") {
    const m = el(`
      <div class="fixed inset-0 z-50 bg-on-surface/50 backdrop-blur-sm flex items-center justify-center p-md">
        <div class="bg-surface-container-lowest rounded-2xl shadow-2xl w-full ${maxw} flex flex-col overflow-hidden max-h-[92vh]">
          <div class="px-lg py-md border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
            <h2 class="text-[20px] font-bold flex items-center gap-sm"><span class="material-symbols-outlined text-primary">${icon}</span>${esc(title)}</h2>
            <button data-close class="text-on-surface-variant hover:text-on-surface"><span class="material-symbols-outlined">close</span></button>
          </div>
          <div class="p-lg overflow-y-auto flex flex-col gap-md">${bodyHTML}</div>
          <div class="px-lg py-md border-t border-outline-variant flex items-center gap-sm bg-surface-container-lowest">${footHTML}</div>
        </div>
      </div>`);
    document.querySelector("#modal-root").appendChild(m);
    m.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => m.remove()));
    m.addEventListener("click", (e) => { if (e.target === m) m.remove(); });
    return m;
  }

  // Directory caches (brands + members) for grouping/labels.
  let brands = [], members = [];
  const loadDirectory = async () => {
    try { brands = await api("/brands"); } catch (_) { brands = []; }
    try { members = await api("/members"); } catch (_) { members = []; }
  };
  const brandName = (id) => brands.find((b) => b.id === id)?.name || "";
  const brandLogo = (id) => brands.find((b) => b.id === id)?.logo_url || "";
  const memberName = (id) => { const m = members.find((x) => x.id === id); return m ? m.name : ""; };
  // Members who can be a campaign Lead — internal staff (admins + managers).
  const adminMembers = () => members.filter((m) => m.role === "admin" || m.role === "manager");
  // A campaign can have several responsible leads. Prefer the multi list; fall
  // back to the legacy single field so older campaigns still show their lead.
  const leadIdsOf = (a) => (a.responsible_member_ids && a.responsible_member_ids.length)
    ? a.responsible_member_ids
    : (a.responsible_member_id ? [a.responsible_member_id] : []);
  const leadLabel = (a) => leadIdsOf(a).map(memberName).filter(Boolean).join(", ");
  // Multi-select checklist of team members (admins) — used for picking the lead(s).
  function respChecklistHtml(cls, selectedIds) {
    const team = adminMembers();
    if (!team.length) return `<div class="border border-outline-variant rounded-lg p-sm text-[12px] text-on-surface-variant">ยังไม่มีทีมงาน (admin/manager) — เพิ่มที่หน้าจัดการผู้ใช้</div>`;
    return `<div class="max-h-40 overflow-y-auto border border-outline-variant rounded-lg p-sm flex flex-col gap-1">
      ${team.map((x) => `<label class="flex items-center gap-sm text-[13px] cursor-pointer px-1 py-0.5 rounded hover:bg-surface-container-low"><input type="checkbox" class="${cls} accent-primary" value="${x.id}" ${selectedIds.includes(x.id) ? "checked" : ""}/><span class="truncate">${esc(x.name)}</span></label>`).join("")}
    </div>`;
  }

  // Editorial title treatment: highlight [bracketed] text + italicise the last word.
  function fancyTitle(name, emClass = "ca-em", itClass = "ca-it") {
    let html = esc(name).replace(/\[([^\]]+)\]/g, `<span class="${emClass}">[$1]</span>`);
    const parts = html.split(" ");
    if (parts.length > 1) parts[parts.length - 1] = `<span class="${itClass}">${parts[parts.length - 1]}</span>`;
    return parts.join(" ");
  }

  // ============================================================ CONNECTOR ===
  // ---- Version log: keep up to 10 snapshots per campaign (admin can restore) ----
  // Stored client-side (localStorage). Snapshots are captured on open + after each
  // save, with bursts coalesced so rapid auto-saves don't flood the history.
  const VERSION_CAP = 10;
  let activeAssetRef = null;
  const verKey = (id) => "ch_ver_" + id;
  const loadVersions = (id) => { try { return JSON.parse(localStorage.getItem(verKey(id)) || "[]"); } catch (_) { return []; } };
  const verFields = (a) => ({
    campaign_name: a.campaign_name, client_name: a.client_name, brand_id: a.brand_id,
    responsible_member_id: a.responsible_member_id, responsible_member_ids: a.responsible_member_ids,
    period_start: a.period_start, period_end: a.period_end,
    status: a.status, description: a.description, stakeholders: a.stakeholders, drive_folder_url: a.drive_folder_url,
    input_files: a.input_files, kols: a.kols, sow_options: a.sow_options, influencer_ids: a.influencer_ids,
  });
  function recordVersion(a) {
    if (!a || !a.id) return;
    try {
      const arr = loadVersions(a.id);
      const data = JSON.parse(JSON.stringify(verFields(a)));
      const now = Date.now();
      const last = arr[arr.length - 1];
      if (last && JSON.stringify(last.data) === JSON.stringify(data)) return;     // unchanged → skip
      if (last && now - last.ts < 4000) arr[arr.length - 1] = { ts: now, data };   // coalesce a save burst
      else arr.push({ ts: now, data });
      while (arr.length > VERSION_CAP) arr.shift();
      localStorage.setItem(verKey(a.id), JSON.stringify(arr));
    } catch (_) {}
  }

  // Shared bridge for the section modules (ca-section-*.js). They register their
  // section here and reuse these helpers instead of importing the core directly.
  const CA = (window.CA = {
    sections: [],
    register(def) { this.sections.push(def); this.sections.sort((x, y) => (x.order || 99) - (y.order || 99)); },
    // shared helpers
    api, el, esc, toast, isAdmin, render, fmtNum, uploadFile, mediaSrc,
    modal, inpCls, lbl, sectionAFiles,
    money: (n) => "฿" + (Number(n) || 0).toLocaleString("en-US"),
    // Optimistic-concurrency aware: pass the asset object `a` so the loaded
    // row_version rides along (and the fresh version is tracked back onto it).
    // A 409 means someone else saved first → reload the latest state.
    saveAsset: async (id, patch, a) => {
      if (a && a.row_version != null) patch = { ...patch, row_version: a.row_version };
      try {
        const res = await api("/assets/" + id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
        if (a && res && res.row_version != null) a.row_version = res.row_version;
        try { if (activeAssetRef && activeAssetRef.id === id) recordVersion(activeAssetRef); } catch (_) {}
        return res;
      } catch (e) {
        if (e.status === 409) { toast("มีคนอื่นแก้แคมเปญนี้ไปแล้ว — กำลังโหลดเวอร์ชันล่าสุด", "err"); render(); }
        throw e;
      }
    },
    // directory creators (fresh each call so newly-added creators show up)
    roster: async () => { try { return (await api("/influencers?limit=200")).items; } catch (_) { return []; } },
    // Per-campaign edit permission: admin (all) or a manager assigned to it.
    canEdit: (a) => {
      const u = CH.user || {};
      if (u.role === "admin") return true;
      return u.role === "manager" && Array.isArray(a && a.assigned_user_ids) && a.assigned_user_ids.includes(u.id);
    },
  });

  // ============================================================ LIST ROUTE ===
  route("assets", async (view) => {
    await loadDirectory();
    const wrap = el(`<div class="ca-root">
      <div class="ca-headrow">
        <h1 class="ca-title">Campaigns</h1>
        ${isAdmin() ? `<div class="ca-actions">
          <button class="ca-btn" data-brands><span class="material-symbols-outlined text-[18px]">sell</span>Manage Brands</button>
          <button class="ca-btn ca-btn-gold" data-new><span class="material-symbols-outlined text-[18px]">add</span>New Campaign</button>
        </div>` : ""}
      </div>
      <hr class="ca-list-rule" />
      <div class="ca-tabs" id="ca-tabs"></div>
      <div id="ca-groups"></div>
      <div id="ca-pager" style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;flex-wrap:wrap;gap:12px"></div>
    </div>`);
    view.appendChild(wrap);

    const kolProgress = (a) => {
      const k = a.kols || [];
      if (!k.length) return "";
      const ap = k.filter((x) => x.client_approved === "Approve").length;
      const po = k.filter((x) => x.client_approved === "Posted").length;
      const pct = (n) => Math.round((n / k.length) * 100);
      return `<div style="margin-top:10px">
        <div style="display:flex;height:6px;border-radius:9999px;overflow:hidden;background:#ececf0">
          <span style="width:${pct(ap)}%;background:#16a34a"></span><span style="width:${pct(po)}%;background:#f59e0b"></span>
        </div>
        <div style="font-size:11px;color:#8a8a8f;margin-top:5px">📋 ${ap} อนุมัติ · ${po} โพสต์ · ${k.length} KOL</div>
      </div>`;
    };
    const deadlineBadge = (a) => {
      if (isClosedStatus(a.status)) return "";
      const kols = a.kols || [];
      if (!kols.length) return "";
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const parse = (s) => { if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null; const d = new Date(s); return isNaN(d) ? null : d; };
      let overdue = 0, soon = 0;
      kols.forEach((k) => {
        if (k.client_approved === "Approve") return;   // already done
        const d = parse(k.post_date) || parse(k.period_to);
        if (!d) return;
        const days = Math.round((d - today) / 86400000);
        if (days < 0) overdue++; else if (days <= 7) soon++;
      });
      if (overdue) return `<div style="margin-top:6px;font-size:11px;font-weight:700;color:#b80f18">⚠ ${overdue} งานเลยกำหนด</div>`;
      if (soon) return `<div style="margin-top:6px;font-size:11px;font-weight:700;color:#9a6700">🕒 ${soon} งานใกล้ถึงกำหนด (7 วัน)</div>`;
      return "";
    };
    const card = (a) => {
      const slots = sectionAFiles(a);
      const linked = slots.filter((f) => f.linked).length;
      const lead = leadLabel(a);
      const c = el(`<div class="ca-card" style="cursor:pointer">
        <div class="ca-card-head">
          <div class="ca-label">${esc(a.client_name || "—")}</div>
          <div class="ca-card-title" style="font-family:'Poppins','Prompt',sans-serif;font-size:19px;margin-top:6px">${fancyTitle(a.campaign_name)}</div>
          <div class="ca-synced" style="color:#8a8a8f;margin-top:8px">${esc(a.period_start)} → ${esc(a.period_end)}${lead ? " · 👤 " + esc(lead) : ""}</div>
          ${kolProgress(a)}${deadlineBadge(a)}
        </div>
        <div class="ca-card-foot">
          <span class="ca-unlinked" style="font-family:'Poppins','Prompt',sans-serif;font-size:11px">${STATUS_LABEL[a.status] || a.status}</span>
          <span class="ca-linked">${linked} of ${slots.length} linked</span>
        </div>
      </div>`);
      c.addEventListener("click", () => (location.hash = `#/asset/${a.id}`));
      return c;
    };

    const groupsHost = wrap.querySelector("#ca-groups");
    const tabsHost = wrap.querySelector("#ca-tabs");
    const pagerHost = wrap.querySelector("#ca-pager");
    const PAGE = 24;
    let skip = 0, activeBrand = "all", brandSearch = "";
    const sortedBrands = [...brands].sort((x, y) => x.name.localeCompare(y.name));

    // group the CURRENT PAGE's items by brand (server already paginated/filtered)
    const renderGroupsFor = (items) => {
      groupsHost.innerHTML = "";
      if (!items.length) { groupsHost.innerHTML = `<div style="color:#8a8a8f;padding:8px 0">ไม่มีแคมเปญ</div>`; return; }
      const byBrand = new Map();
      items.forEach((a) => { const k = a.brand_id || 0; if (!byBrand.has(k)) byBrand.set(k, []); byBrand.get(k).push(a); });
      const ids = sortedBrands.map((b) => b.id).filter((id) => byBrand.has(id));
      [...byBrand.keys()].forEach((k) => { if (!ids.includes(k)) ids.push(k); });
      ids.forEach((bid) => {
        const heading = (bid && brandName(bid)) ? esc(brandName(bid)) : "No brand";
        const logo = bid && brandLogo(bid);
        const isBrand = !!(bid && brandName(bid));
        const grp = el(`<div style="margin-bottom:28px">
          <div class="ca-sechead" style="margin:0 0 14px">${logo ? `<img class="ca-brand-logo" src="${esc(mediaSrc(logo))}" alt=""/>` : ""}<span class="ca-sectitle" style="font-size:20px">${heading}</span><span class="ca-linkcount">${byBrand.get(bid).length}</span>${isBrand ? `<a data-brand style="margin-left:14px;font-size:12px;color:#e1121c;font-weight:600;cursor:pointer">ดูแบรนด์ →</a>` : ""}</div>
          <div class="ca-cards"></div></div>`);
        grp.querySelector("[data-brand]")?.addEventListener("click", () => (location.hash = "#/brand/" + bid));
        const cards = grp.querySelector(".ca-cards");
        byBrand.get(bid).forEach((a) => cards.appendChild(card(a)));
        groupsHost.appendChild(grp);
      });
    };

    const renderPage = async () => {
      groupsHost.innerHTML = `<div style="color:#8a8a8f;padding:8px 0">กำลังโหลด…</div>`;
      const q = `/assets?skip=${skip}&limit=${PAGE}`
        + (activeBrand !== "all" ? `&brand_id=${activeBrand}` : "")
        + (brandSearch ? `&search=${encodeURIComponent(brandSearch)}` : "");
      let data;
      try { data = await api(q); } catch (e) { groupsHost.innerHTML = `<div class="text-error p-md">${esc(e.message)}</div>`; return; }
      const items = data.items || [], total = data.total || 0;
      renderGroupsFor(items);
      const from = total ? skip + 1 : 0, to = skip + items.length;
      pagerHost.innerHTML = `<span style="color:#8a8a8f;font-size:13px">แสดง ${from}–${to} จาก ${total} แคมเปญ</span>
        <div style="display:flex;gap:8px">
          <button class="ca-btn" data-prev ${skip <= 0 ? "disabled" : ""}>← ก่อนหน้า</button>
          <button class="ca-btn" data-next ${to >= total ? "disabled" : ""}>ถัดไป →</button>
        </div>`;
      pagerHost.querySelector("[data-prev]")?.addEventListener("click", () => { skip = Math.max(0, skip - PAGE); renderPage(); window.scrollTo(0, 0); });
      pagerHost.querySelector("[data-next]")?.addEventListener("click", () => { skip += PAGE; renderPage(); window.scrollTo(0, 0); });
    };

    const filterBar = el(`<div class="ca-filter">
      <label class="ca-brand-search">
        <span class="material-symbols-outlined">search</span>
        <input type="search" placeholder="Search brands..." aria-label="Search brands" />
      </label>
      <span class="ca-filter-label"><span class="material-symbols-outlined text-[18px]">sell</span>แบรนด์</span>
      <select class="ca-brand-select"><option value="all">ทั้งหมด</option>${sortedBrands.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("")}</select>
    </div>`);
    let brandSearchTimer;
    filterBar.querySelector("input").addEventListener("input", (e) => {
      clearTimeout(brandSearchTimer);
      brandSearchTimer = setTimeout(() => { brandSearch = e.target.value.trim(); skip = 0; renderPage(); }, 250);
    });
    filterBar.querySelector("select").addEventListener("change", (e) => { activeBrand = e.target.value; skip = 0; renderPage(); });
    tabsHost.appendChild(filterBar);
    await renderPage();
    wrap.querySelector("[data-new]")?.addEventListener("click", () => openAddModal());
    wrap.querySelector("[data-brands]")?.addEventListener("click", () => openBrandsModal());
  });

  // ========================================================== BRAND ROUTE ===
  route("brand", async (view, id) => {
    await loadDirectory();
    const bid = Number(id);
    const b = brands.find((x) => x.id === bid);
    const data = await api("/assets?brand_id=" + bid + "&limit=500");
    const camps = data.items;
    const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };
    const budget = (a) => (a.kols || []).reduce((s, k) => s + num(k.rate) + num(k.gen_code_price) + num(k.boosting_cost), 0);
    const money = (n) => "฿" + Math.round(n).toLocaleString("en-US");
    const total = camps.reduce((s, a) => s + budget(a), 0);
    const logo = b && brandLogo(b.id);
    const rows = camps.length ? camps.map((a) => `<div class="brand-camp-row" data-go="#/asset/${a.id}" style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #ececf0;cursor:pointer">
        <div style="min-width:0"><div style="font-weight:700" class="truncate">${esc(a.campaign_name)}</div>
          <div style="font-size:12px;color:#8a8a8f">${esc(STATUS_LABEL[a.status] || a.status)} · ${(a.kols || []).length} KOL · ${esc(a.period_start || "—")} → ${esc(a.period_end || "—")}</div></div>
        <div style="font-weight:800;white-space:nowrap;font-family:'Poppins'">${money(budget(a))}</div>
      </div>`).join("") : `<div style="color:#8a8a8f;padding:14px 0">ยังไม่มีแคมเปญใต้แบรนด์นี้</div>`;
    const wrap = el(`<div class="ca-root">
      <div class="ca-hero">
        <button class="ca-back" data-back><span class="material-symbols-outlined text-[18px]">arrow_back</span>ย้อนกลับ</button>
        <div class="ca-hero-row"><div class="ca-hero-main">
          <div class="ca-hero-brandline">${logo ? `<img class="ca-brand-logo" src="${esc(mediaSrc(logo))}" alt=""/>` : ""}<span class="ca-hero-client">${esc(b ? b.name : "No brand")}</span>${b && b.company ? `<span class="ca-dot"></span><span class="ca-hero-brand">${esc(b.company)}</span>` : ""}</div>
          <h1 class="ca-title ca-hero-title">${camps.length} campaign${camps.length === 1 ? "" : "s"}</h1>
          <div class="ca-hero-meta"><span class="mi"><span class="material-symbols-outlined">payments</span>งบรวม ${money(total)}</span></div>
        </div></div>
      </div>
      <div style="background:#fff;border:1px solid #ececec;border-radius:14px;padding:8px 20px;margin-top:18px">${rows}</div>
    </div>`);
    view.appendChild(wrap);
    wrap.querySelector("[data-back]")?.addEventListener("click", () => CH.goBack("#/assets"));
    wrap.querySelectorAll("[data-go]").forEach((r) => r.addEventListener("click", () => (location.hash = r.dataset.go)));
  });

  // ========================================================== DETAIL ROUTE ===
  // Header + summary, then each registered section (A, B, C, ...) in order.
  route("asset", async (view, id) => {
    const a = await api("/assets/" + id);
    activeAssetRef = a; recordVersion(a);   // snapshot the opened state for the version log
    await loadDirectory();
    const brand = brandName(a.brand_id), lead = leadLabel(a);
    const lastSaved = (() => { try { return new Date(a.updated_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }); } catch { return "—"; } })();
    const summaryItem = (label, value) => `<div class="ca-summary-item"><div class="ca-label">${label}</div><div class="ca-summary-v">${value}</div></div>`;
    const admin = isAdmin();
    const canEdit = CA.canEdit(a);   // admin, or a manager assigned to this campaign

    const wrap = el(`<div class="ca-root">
      <div class="ca-hero">
        <button class="ca-back" data-back><span class="material-symbols-outlined text-[18px]">arrow_back</span>ย้อนกลับ</button>
        <div class="ca-hero-row">
          <div class="ca-hero-main">
            <div class="ca-hero-brandline">
              <span class="ca-hero-client">${esc(a.client_name || "—")}</span>
              ${brand ? `<span class="ca-dot"></span><span class="ca-hero-brand">${esc(brand)}</span>` : ""}
              <span class="ca-chip">${(STATUS_LABEL[a.status] || a.status).toUpperCase()}</span>
            </div>
            <h1 class="ca-title ca-hero-title">${fancyTitle(a.campaign_name)}</h1>
            <div class="ca-hero-meta">
              ${lead ? `<span class="mi"><span class="material-symbols-outlined">person</span>${esc(lead)}</span>` : ""}
              <span class="mi"><span class="material-symbols-outlined">calendar_month</span>${esc(a.period_start || "—")} → ${esc(a.period_end || "—")}</span>
              <span class="mi"><span class="material-symbols-outlined">schedule</span>บันทึกล่าสุด ${lastSaved}</span>
            </div>
          </div>
          ${canEdit ? `<div class="ca-hero-actions">
            <button class="ca-btn" data-edit><span class="material-symbols-outlined text-[18px]">edit</span>Edit Info</button>
            <button class="ca-btn ca-btn-gold" data-handoff><span class="material-symbols-outlined text-[18px]">hexagon</span>Prepare Handoff</button>
          </div>` : ""}
        </div>
      </div>
      <div id="ca-sections"></div>
    </div>`);
    view.appendChild(wrap);

    wrap.querySelector("[data-back]")?.addEventListener("click", () => CH.goBack("#/assets"));
    wrap.querySelector("[data-edit]")?.addEventListener("click", () => openEditModal(a));
    wrap.querySelector("[data-handoff]")?.addEventListener("click", () => openHandoffModal(a));

    // Render each registered section: a consistent header (letter + title + count
    // + declared action buttons) followed by the section's own body.
    const host = wrap.querySelector("#ca-sections");
    const ctx = { brand, lead, canEdit };
    for (const sec of CA.sections) {
      const head = el(`<div class="ca-sechead">
        <span class="ca-secletter">${sec.letter}</span>
        <span class="ca-sectitle">${esc(sec.title)}</span>
        <span class="ca-linkcount">${sec.count ? sec.count(a, ctx) : ""}</span>
      </div>`);
      // A header item is either a button (default) or a {select} dropdown.
      const headerItem = (it) => {
        if (it.select) {
          const s = el(`<select class="ca-hdr-select">${it.options.map((o) => `<option value="${esc(o.value)}" ${o.value === it.value ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`);
          s.addEventListener("change", () => it.onChange(s.value));
          return s;
        }
        const b = el(`<button class="ca-btn${it.gold ? " ca-btn-gold" : ""}"><span class="material-symbols-outlined text-[18px]">${it.icon}</span>${esc(it.label)}</button>`);
        b.addEventListener("click", it.onClick);
        return b;
      };
      // View controls (everyone) then admin-only actions.
      if (sec.controls) sec.controls(a, ctx).forEach((it) => head.appendChild(headerItem(it)));
      if (canEdit && sec.actions) sec.actions(a, ctx).forEach((it) => head.appendChild(headerItem(it)));
      const body = el(`<div></div>`);
      host.append(head, body);
      try { await sec.render(body, a, ctx); }
      catch (e) { body.appendChild(el(`<div class="text-error p-md">Section ${esc(sec.title)} error: ${esc(e.message)}</div>`)); }
    }
  });

  // ============================================================== MODALS ===
  // Company → Brand → Campaign consistency: when a campaign is put under a brand
  // that has a Company, the Company field is auto-filled from that brand and
  // locked (read-only). Picking "none" or a brand without a company frees it.
  function wireBrandCompany(brandSel, clientInp) {
    if (!brandSel || !clientInp) return;
    const apply = () => {
      const b = brands.find((x) => String(x.id) === brandSel.value);
      if (b && b.company) {
        clientInp.value = b.company;
        clientInp.readOnly = true;
        clientInp.classList.add("opacity-70", "cursor-not-allowed");
        clientInp.title = "บริษัทดึงจากแบรนด์ \"" + b.name + "\" อัตโนมัติ — แก้ที่หน้า Manage Brands";
      } else {
        clientInp.readOnly = false;
        clientInp.classList.remove("opacity-70", "cursor-not-allowed");
        clientInp.title = "";
      }
    };
    brandSel.addEventListener("change", apply);
    apply();
  }

  async function openAddModal() {
    await loadDirectory();
    const u = CH.user || {};
    const m = modal("Add New Campaign", "note_add", `
      <div class="flex flex-col gap-1">${lbl("MEMBER · แคมเปญนี้จะอยู่ภายใต้ member คนนี้")}
        <div class="px-sm py-2 bg-surface-container rounded-lg text-[13px]" style="font-family:'Poppins','Prompt',sans-serif">${esc(u.full_name || u.username || "—")} · ${esc(u.username || "")}</div></div>
      <div class="grid grid-cols-2 gap-sm">
        <label class="flex flex-col gap-1">${lbl("Company Name (ชื่อบริษัทลูกค้า)")}<input id="ad-client" class="${inpCls}" placeholder="e.g. Ocean Bites Co., Ltd."/></label>
        <label class="flex flex-col gap-1">${lbl("Brand")}<select id="ad-brand" class="${inpCls}"><option value="">— none —</option>${brands.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("")}</select></label>
      </div>
      <label class="flex flex-col gap-1">${lbl("Campaign Name *")}<input id="ad-camp" class="${inpCls}" placeholder="e.g. Songkran 2026"/></label>
      <label class="flex flex-col gap-1">${lbl("ผู้รับผิดชอบ (Lead) — เลือกได้หลายคน")}${respChecklistHtml("ad-resp", [])}</label>
      <label class="flex flex-col gap-1">${lbl("Client Drive Folder URL *")}<input id="ad-drive" class="${inpCls}" placeholder="https://drive.google.com/drive/folders/..."/>
        <small class="text-[11px] text-on-surface-variant">โฟลเดอร์ Drive ที่เก็บ JSON + media ของแคมเปญนี้ · กันข้อมูลข้ามกัน</small></label>
      <div class="grid grid-cols-2 gap-sm">
        <label class="flex flex-col gap-1">${lbl("Start Period")}<input id="ad-start" class="${inpCls}" placeholder="e.g. May 2026"/></label>
        <label class="flex flex-col gap-1">${lbl("End Period")}<input id="ad-end" class="${inpCls}" placeholder="e.g. Aug 2026"/></label>
      </div>`, `
      <button data-close class="ml-auto px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Cancel</button>
      <button data-save class="px-md py-2 rounded-lg font-semibold bg-primary text-on-primary hover:bg-primary-container">Create Campaign</button>`);
    wireBrandCompany(m.querySelector("#ad-brand"), m.querySelector("#ad-client"));
    m.querySelector("[data-save]").addEventListener("click", async () => {
      const campaign_name = m.querySelector("#ad-camp").value.trim();
      const drive = m.querySelector("#ad-drive").value.trim();
      if (!campaign_name) return toast("กรุณาใส่ Campaign Name", "err");
      if (!drive) return toast("Client Drive Folder URL จำเป็น", "err");
      try {
        const brandVal = m.querySelector("#ad-brand").value;
        const respIds = [...m.querySelectorAll(".ad-resp:checked")].map((c) => +c.value);
        const created = await api("/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          owner_name: u.full_name || u.username || "", owner_email: u.email || u.username || "",
          client_name: m.querySelector("#ad-client").value.trim(), campaign_name, drive_folder_url: drive,
          period_start: m.querySelector("#ad-start").value.trim(), period_end: m.querySelector("#ad-end").value.trim(),
          brand_id: brandVal ? Number(brandVal) : null,
          responsible_member_ids: respIds, responsible_member_id: respIds[0] || null,
        }) });
        toast("สร้างแคมเปญแล้ว"); m.remove(); location.hash = "#/asset/" + created.id;
      } catch (e) { toast(e.message, "err"); }
    });
  }

  async function openEditModal(a) {
    await loadDirectory();
    const admin = isAdmin();
    let assignUsers = [];
    if (admin) { try { assignUsers = await api("/auth/users"); } catch (_) {} }   // ทุกคนในระบบ (จากจัดการผู้ใช้)
    const accessHtml = admin ? `
      <div class="flex flex-col gap-1">${lbl("🔐 สิทธิ์เข้าถึงแคมเปญ — Manager แก้ไขได้ · Viewer ดูได้")}
        ${assignUsers.length ? `<div class="relative"><span class="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span><input id="ed-acc-q" class="pl-9 ${inpCls}" placeholder="ค้นหาชื่อ / อีเมล / role..."/></div>` : ""}
        <div id="ed-acc-box" class="max-h-56 overflow-y-auto border border-outline-variant rounded-lg p-sm flex flex-col gap-1">
          ${assignUsers.length ? assignUsers.map((u) => `<label data-acc-s="${esc(`${u.full_name || u.username} ${u.email || ""} ${u.role}`.toLowerCase())}" class="flex items-center gap-sm text-[13px] cursor-pointer px-1 py-0.5 rounded hover:bg-surface-container-low"><input type="checkbox" class="ed-acc accent-primary" value="${u.id}" ${(a.assigned_user_ids || []).includes(u.id) ? "checked" : ""}/><span class="truncate flex-1">${esc(u.full_name || u.username)} <span class="text-on-surface-variant">· ${esc(u.role)}${u.role === "admin" ? " · เห็นทุกแคมเปญอยู่แล้ว" : ""}${u.email ? " · " + esc(u.email) : ""}</span></span></label>`).join("") : `<div class="text-[12px] text-on-surface-variant">ยังไม่มีผู้ใช้ในระบบ — เพิ่มที่หน้าจัดการผู้ใช้ก่อน</div>`}
        </div>
        <small class="text-[11px] text-on-surface-variant"><b id="ed-acc-count"></b> · เฉพาะแอดมินมอบสิทธิ์ได้ · คนที่ติ๊กจะเห็น/จัดการเฉพาะแคมเปญนี้ ไม่เห็นแคมเปญอื่น</small></div>` : "";
    const ownerMember = members.find((x) => (x.email || "").toLowerCase() === (a.owner_email || "").toLowerCase());
    const ownerRole = ownerMember?.role || "customer";
    const ownerRoleBadge = ownerRole === "admin"
      ? `<span class="bg-primary-fixed text-primary text-[11px] font-bold px-sm py-1 rounded-full inline-flex items-center gap-1 shrink-0"><span class="material-symbols-outlined text-[13px]">shield_person</span>Admin</span>`
      : `<span class="bg-surface-container-high text-on-surface-variant text-[11px] font-bold px-sm py-1 rounded-full inline-flex items-center gap-1 shrink-0"><span class="material-symbols-outlined text-[13px]">person</span>Customer</span>`;
    const m = modal("Edit Campaign Info", "edit", `
      <div class="grid grid-cols-2 gap-sm">
        <label class="flex flex-col gap-1">${lbl("Company Name *")}<input id="ed-client" class="${inpCls}" value="${esc(a.client_name || "")}"/></label>
        <label class="flex flex-col gap-1">${lbl("Brand")}<select id="ed-brand" class="${inpCls}"><option value="">— none —</option>${brands.map((b) => `<option value="${b.id}" ${a.brand_id === b.id ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select></label>
      </div>
      <label class="flex flex-col gap-1">${lbl("Campaign Name *")}<input id="ed-camp" class="${inpCls}" value="${esc(a.campaign_name || "")}"/></label>
      <label class="flex flex-col gap-1">${lbl("ผู้รับผิดชอบ (Lead) — เลือกได้หลายคน")}${respChecklistHtml("ed-resp", leadIdsOf(a))}</label>
      <div class="grid grid-cols-2 gap-sm">
        <label class="flex flex-col gap-1">${lbl("📅 Period Start")}<input id="ed-start" class="${inpCls}" value="${esc(a.period_start || "")}" placeholder="e.g. May 2026"/></label>
        <label class="flex flex-col gap-1">${lbl("Period End")}<input id="ed-end" class="${inpCls}" value="${esc(a.period_end || "")}" placeholder="e.g. Aug 2026"/></label>
      </div>
      <label class="flex flex-col gap-1">${lbl("Status")}<select id="ed-status" class="${inpCls}">${Object.keys(STATUS_LABEL).map((s) => `<option value="${s}" ${a.status === s ? "selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}</select></label>
      <label class="flex flex-col gap-1">${lbl("📝 Description / Brief")}<textarea id="ed-desc" rows="5" class="${inpCls}" placeholder="วัตถุประสงค์, target audience, key messages, deliverables...">${esc(a.description || "")}</textarea><small id="ed-count" class="text-[11px] text-on-surface-variant"></small></label>
      <label class="flex flex-col gap-1">${lbl("👥 Stakeholders / Contacts (optional)")}<textarea id="ed-stake" rows="2" class="${inpCls}" placeholder="Account Director: ...&#10;Creative Lead: ...&#10;Client contact: ...">${esc(a.stakeholders || "")}</textarea></label>
      <div class="flex flex-col gap-1">${lbl("👤 Client (Member)")}<div class="px-sm py-2 bg-surface-container rounded-lg text-[12px] flex items-center justify-between gap-sm"><span class="truncate" style="font-family:'Poppins','Prompt',sans-serif">${esc(a.owner_name || "—")} · ${esc(a.owner_email || "")}</span>${ownerRoleBadge}</div>
        <small class="text-[11px] text-on-surface-variant">เปลี่ยน member ไม่ได้ — ให้ลบแล้วสร้างใหม่ใต้ member อื่น (กัน leak ข้ามลูกค้า)</small></div>
      <label class="flex flex-col gap-1">${lbl("📁 Client Drive Folder URL")}
        <div class="grid gap-sm" style="grid-template-columns:1fr auto"><input id="ed-drive" class="${inpCls}" value="${esc(a.drive_folder_url || "")}" placeholder="https://drive.google.com/drive/folders/..."/>
        <button type="button" data-open class="px-md py-2 rounded-lg border border-outline-variant text-[13px] hover:bg-surface-container-low">Open ↗</button></div>
        <small class="text-[11px] text-on-surface-variant">ระบบจะสร้าง subfolder <code>wakuwaku-media-${a.id}/</code> ในนั้นให้อัตโนมัติเมื่ออัปไฟล์ (เฟส Drive)</small></label>
      ${accessHtml}
    `, `
      ${admin ? `<button data-reset class="px-md py-2 rounded-lg font-semibold border border-amber-500 text-amber-600 hover:bg-amber-50">🔄 Reset</button>
      <button data-del class="px-md py-2 rounded-lg font-semibold border border-error text-error hover:bg-error-container/40">🗑 Delete</button>` : ""}
      <button data-close class="ml-auto px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Cancel</button>
      <button data-save class="px-md py-2 rounded-lg font-semibold bg-primary text-on-primary hover:bg-primary-container">💾 Save Changes</button>
    `);
    const desc = m.querySelector("#ed-desc"), count = m.querySelector("#ed-count");
    const upd = () => { count.textContent = `${desc.value.length} ตัวอักษร`; };
    desc.addEventListener("input", upd); upd();
    m.querySelector("[data-open]").addEventListener("click", () => { const u = m.querySelector("#ed-drive").value.trim(); if (u) window.open(u, "_blank", "noopener"); });
    wireBrandCompany(m.querySelector("#ed-brand"), m.querySelector("#ed-client"));
    if (admin) {   // searchable access picker + live selected-count (scales to many users)
      const accQ = m.querySelector("#ed-acc-q"), accBox = m.querySelector("#ed-acc-box"), accCount = m.querySelector("#ed-acc-count");
      const updAccCount = () => { if (accCount) accCount.textContent = "เลือก " + m.querySelectorAll(".ed-acc:checked").length + " คน"; };
      accQ?.addEventListener("input", () => { const q = accQ.value.trim().toLowerCase(); accBox.querySelectorAll("[data-acc-s]").forEach((l) => { l.style.display = l.dataset.accS.includes(q) ? "" : "none"; }); });
      accBox?.addEventListener("change", updAccCount);
      updAccCount();
    }
    m.querySelector("[data-save]").addEventListener("click", async () => {
      const campaign_name = m.querySelector("#ed-camp").value.trim();
      if (!campaign_name) return toast("Campaign Name จำเป็น", "err");
      try {
        const brandVal = m.querySelector("#ed-brand").value;
        const respIds = [...m.querySelectorAll(".ed-resp:checked")].map((c) => +c.value);
        const body = {
          client_name: m.querySelector("#ed-client").value.trim(), campaign_name,
          period_start: m.querySelector("#ed-start").value.trim(), period_end: m.querySelector("#ed-end").value.trim(),
          status: m.querySelector("#ed-status").value,
          description: desc.value, stakeholders: m.querySelector("#ed-stake").value,
          drive_folder_url: m.querySelector("#ed-drive").value.trim(),
          brand_id: brandVal ? Number(brandVal) : null,
          responsible_member_ids: respIds, responsible_member_id: respIds[0] || null,
        };
        if (admin) body.assigned_user_ids = [...m.querySelectorAll(".ed-acc:checked")].map((c) => +c.value);
        body.row_version = a.row_version;   // optimistic lock
        await api("/assets/" + a.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        toast("บันทึกแล้ว"); m.remove(); render();
      } catch (e) {
        if (e.status === 409) { toast("มีคนอื่นแก้แคมเปญนี้ไปแล้ว — กำลังโหลดเวอร์ชันล่าสุด", "err"); m.remove(); render(); }
        else toast(e.message, "err");
      }
    });
    m.querySelector("[data-reset]")?.addEventListener("click", async () => {
      if (!confirm("Reset แคมเปญ? (ล้าง brief/tags/stakeholders, สถานะ→draft, ยกเลิกลิงก์ไฟล์ทั้งหมด — ชื่อยังอยู่)")) return;
      const files = (a.input_files || []).map((f) => ({ ...f, drive_url: "", linked: false }));
      try {
        await api("/assets/" + a.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          status: "draft", tags: "", description: "", stakeholders: "", input_files: files }) });
        toast("รีเซ็ตแล้ว"); m.remove(); render();
      } catch (e) { toast(e.message, "err"); }
    });
    m.querySelector("[data-del]")?.addEventListener("click", async () => {
      if (!confirm(`ลบแคมเปญ "${a.campaign_name}"? (ลบถาวร)`)) return;
      try { await api("/assets/" + a.id, { method: "DELETE" }); toast("ลบแล้ว"); m.remove(); location.hash = "#/assets"; }
      catch (e) { toast(e.message, "err"); }
    });
  }

  function openHandoffModal(a) {
    const company = a.client_name || "Campaign";
    const campaign = a.campaign_name || "—";
    const brand = brandName(a.brand_id);
    const files = sectionAFiles(a);
    const total = files.length;
    const linked = files.filter((f) => f.linked).length;
    const creators = (a.influencer_ids || []).length;
    const folder = (company.replace(/[^\p{L}\p{N}]+/gu, "") || "Campaign") + "_Handoff";

    const checks = [
      { ok: !!(a.client_name && campaign !== "—"), title: "Campaign info complete", detail: `${esc(company)}${brand ? " · " + esc(brand) : ""}` },
      { ok: total > 0 && linked === total, title: "All input files linked", detail: `${linked} of ${total} connected` },
      { ok: total >= 3, title: `${total} assets ready`, detail: "Sufficient content" },
      { ok: creators > 0, title: "Creators assigned", detail: `${creators} on roster` },
      { warn: true, title: "Cloud backup outdated", detail: 'Click "Backup to Cloud"' },
    ];
    const score = Math.min(100, checks.reduce((s, c) => s + (c.ok ? 20 : c.warn ? 10 : 0), 0));
    const statusLabel = score >= 90 ? "Excellent" : score >= 70 ? "Good" : score >= 50 ? "Fair" : "Needs work";
    const statusColor = score >= 90 ? "#5fd08a" : score >= 70 ? "#cdb36a" : "#e0a050";

    const checkRow = (c) => `<div class="ho-check ${c.ok ? "ho-ok" : c.warn ? "ho-warn" : "ho-bad"}">
        <span class="ho-ico material-symbols-outlined">${c.ok ? "check" : c.warn ? "priority_high" : "close"}</span>
        <div><div class="ho-check-t">${c.title}</div><div class="ho-check-d">${c.detail}</div></div>
      </div>`;

    const body = `
      <div class="ho-banner">
        <div><div class="ho-banner-label">HANDOFF READINESS</div>
          <div class="ho-score"><span class="ho-score-n">${score}</span><span class="ho-score-d">/ 100</span></div></div>
        <div class="ho-banner-status"><div class="ho-banner-label">STATUS</div>
          <div class="ho-status" style="color:${statusColor}">${statusLabel}</div></div>
      </div>
      <div class="ho-checks">${checks.map(checkRow).join("")}</div>
      <div class="ho-label">Bundle Contents Preview</div>
      <div class="ho-bundle"><div class="ho-tree">
        <div class="ho-dir">📁 ${esc(folder)}/</div>
        <div class="ho-file">📄 campaign-report.html <span class="ho-muted">(รายงานพร้อมส่งลูกค้า)</span></div>
        <div class="ho-file">📄 campaign-data.json</div>
        <div class="ho-file">📄 activity-log.json</div>
        <div class="ho-dir">📁 attachments/ <span class="ho-muted">(${linked} files)</span></div>
      </div></div>`;

    const foot = `
      <button data-close class="px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Cancel</button>
      <button data-html class="ml-auto px-md py-2 rounded-lg font-semibold border border-outline-variant hover:bg-surface-container-low">💾 Save as HTML</button>
      <button data-zip class="px-md py-2 rounded-lg font-semibold border border-outline-variant hover:bg-surface-container-low">📥 Download JSON</button>
      <button data-finalize class="px-md py-2 rounded-lg font-semibold text-white" style="background:#e1121c">📦 Finalize &amp; Hand Off</button>`;

    const m = modal("Pre-Handoff Readiness Check", "inventory_2", body, foot, "max-w-2xl");
    const download = (content, type, name) => {
      const url = URL.createObjectURL(new Blob([content], { type }));
      const link = document.createElement("a");
      link.href = url; link.download = name; link.click();
      URL.revokeObjectURL(url);
    };
    m.querySelector("[data-html]").addEventListener("click", async () => {
      const btn = m.querySelector("[data-html]"); const old = btn.innerHTML;
      btn.disabled = true; btn.innerHTML = "⏳ กำลังสร้าง...";
      try {
        download(await buildReportHtml(a, brand), "text/html;charset=utf-8", folder + "-report.html");
        toast("บันทึกรายงาน HTML แล้ว ✓");
      } catch (e) { toast(e.message, "err"); }
      finally { btn.disabled = false; btn.innerHTML = old; }
    });
    m.querySelector("[data-zip]").addEventListener("click", () => {
      const bundle = {
        campaign: a.campaign_name, company: a.client_name, brand,
        period: { start: a.period_start, end: a.period_end }, status: a.status,
        input_files: files, kols: a.kols || [], sow_options: a.sow_options || [],
        creators: a.influencer_ids || [], generated_at: new Date().toISOString(),
      };
      download(JSON.stringify(bundle, null, 2), "application/json", folder + "-campaign-data.json");
      toast("ดาวน์โหลด campaign-data.json แล้ว", "info");
    });
    m.querySelector("[data-finalize]").addEventListener("click", () => {
      toast(`Finalized & handed off: ${a.campaign_name} ✓`); m.remove();
    });
  }

  // Self-contained, client-shareable HTML report. The document shell + meta live
  // here; each registered section contributes its own fragment via reportHtml(),
  // so Section C's report appears automatically once it registers one.
  async function buildReportHtml(a, brand) {
    const e = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const meta = [["Client", a.client_name], ["Brand", brand || "—"], ["Period", `${a.period_start || "—"} → ${a.period_end || "—"}`], ["Status", (a.status || "draft").toUpperCase()]];
    let sectionsHtml = "";
    for (const sec of CA.sections) if (sec.reportHtml) sectionsHtml += await sec.reportHtml(a, { brand });
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${e(a.campaign_name)} — Campaign Report</title>
<link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600;700;800&family=Poppins:wght@600;700;800&display=swap" rel="stylesheet"/>
<style>
:root{--ink:#1a1a1a;--mut:#52525b;--line:#e8e8ea;--gold:#e1121c;--bg:#fafafa;}
*{box-sizing:border-box;}
body{margin:0;background:var(--bg);color:var(--ink);font-family:'Poppins','Prompt',system-ui,sans-serif;padding:40px;}
.wrap{max-width:1200px;margin:0 auto;}
h1{font-family:'Poppins','Prompt',sans-serif;font-size:30px;font-weight:800;margin:0 0 4px;}
.sub{color:var(--mut);font-size:14px;margin-bottom:24px;}
.meta{display:flex;flex-wrap:wrap;gap:14px 40px;padding:18px 22px;background:#fff;border:1px solid var(--line);border-radius:14px;margin-bottom:30px;}
.meta div{display:flex;flex-direction:column;gap:3px;}
.meta .l{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#8a8a8f;font-weight:600;}
.meta .v{font-size:15px;font-weight:600;}
h2{font-family:'Poppins','Prompt',sans-serif;font-size:18px;font-weight:700;margin:28px 0 12px;}
h2 .em{color:var(--gold);font-style:italic;margin-right:6px;}
.panel{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;}
table{border-collapse:collapse;width:100%;font-size:12.5px;}
th{background:#fafafa;text-align:left;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#8a8a8f;font-weight:700;padding:11px 10px;border-bottom:1px solid var(--line);white-space:nowrap;}
td{padding:9px 10px;border-bottom:1px solid #f0f0f1;vertical-align:top;}
tr:last-child td{border-bottom:0;}
.c{text-align:center;white-space:nowrap;}.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;}.b{font-weight:700;}
a{color:#0058be;text-decoration:none;}a:hover{text-decoration:underline;}
.tier{display:inline-block;font-weight:700;font-size:11px;padding:3px 8px;border-radius:999px;}
.t-Nano{background:#e7eefe;color:#0058be;}.t-Micro{background:#fff0d6;color:#9a6700;}.t-Mega{background:#ffd9e2;color:#b90538;}
.tot{display:flex;flex-wrap:wrap;gap:28px;justify-content:flex-end;align-items:center;padding:16px 22px;border-top:1px solid #f0f0f1;background:#fcfcfd;}
.tot .item{display:flex;flex-direction:column;gap:2px;text-align:right;}
.tot .l{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#8a8a8f;font-weight:600;}
.tot .v{font-size:16px;font-weight:700;font-family:'Poppins','Prompt',sans-serif;}
.tot .grand{padding-left:28px;border-left:1px solid var(--line);}
.tot .grand .l{color:#e1121c;}.tot .grand .v{font-size:22px;font-weight:800;color:var(--gold);}
.foot{margin-top:26px;color:#8a8a8f;font-size:11px;text-align:center;}
@media print{body{padding:0;background:#fff;}.panel,.meta{box-shadow:none;}}
</style></head><body><div class="wrap">
<h1>${e(a.campaign_name)}</h1>
<div class="sub">Campaign Report${a.client_name ? " · " + e(a.client_name) : ""}</div>
<div class="meta">${meta.map(([l, v]) => `<div><span class="l">${e(l)}</span><span class="v">${e(v || "—")}</span></div>`).join("")}</div>
${sectionsHtml}
<div class="foot">Generated by Creator Hub · ${e(a.campaign_name)}</div>
</div></body></html>`;
  }

  function openBrandsModal() {
    const m = modal("Manage Brands", "sell", `
      <div class="flex gap-sm"><input id="br-new" class="${inpCls}" placeholder="ชื่อแบรนด์ใหม่"/><button data-add class="px-md py-2 rounded-lg font-semibold bg-primary text-on-primary hover:bg-primary-container shrink-0">เพิ่ม</button></div>
      <div id="br-list" class="flex flex-col gap-1 mt-sm"></div>`, `
      <button data-close class="ml-auto px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Close</button>`);
    const listEl = m.querySelector("#br-list");
    const setBrandLogo = async (id, logo_url) => {
      await api("/brands/" + id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logo_url }) });
    };
    const pickBrandLogo = (id) => {
      const inp = document.createElement("input");
      inp.type = "file"; inp.accept = "image/png,image/jpeg,image/webp,image/gif";
      inp.addEventListener("change", async () => {
        const file = inp.files && inp.files[0];
        if (!file) return;
        try { const { url } = await uploadFile("/uploads/campaign-media", file); await setBrandLogo(id, url); toast("อัปโหลดโลโก้แล้ว"); refresh(); }
        catch (e) { toast(e.message, "err"); }
      });
      inp.click();
    };
    const refresh = async () => {
      brands = await api("/brands");
      listEl.innerHTML = brands.length
        ? brands.map((b) => `<div class="flex items-center gap-sm py-2 border-b border-outline-variant/50" data-id="${b.id}">
            <div class="br-logo">${b.logo_url ? `<img src="${esc(mediaSrc(b.logo_url))}" alt=""/>` : `<span class="material-symbols-outlined text-[18px] text-on-surface-variant">storefront</span>`}</div>
            <span class="w-36 shrink-0 font-semibold truncate" title="${esc(b.name)}">${esc(b.name)}</span>
            <input data-company class="flex-1 min-w-0 bg-surface-container-lowest border border-outline-variant rounded-lg px-sm py-1 text-[13px]" value="${esc(b.company || "")}" placeholder="บริษัทเจ้าของแบรนด์ (Company)" title="บริษัทเจ้าของแบรนด์ — แคมเปญใต้แบรนด์นี้จะใช้ชื่อบริษัทนี้อัตโนมัติ"/>
            <button data-logo class="text-on-surface-variant hover:text-primary" title="${b.logo_url ? "เปลี่ยนโลโก้" : "เพิ่มโลโก้"}"><span class="material-symbols-outlined text-[18px]">${b.logo_url ? "photo_camera" : "add_photo_alternate"}</span></button>
            ${b.logo_url ? `<button data-logo-del class="text-on-surface-variant hover:text-error" title="ลบโลโก้"><span class="material-symbols-outlined text-[18px]">hide_image</span></button>` : ""}
            <button data-del class="text-on-surface-variant hover:text-error" title="ลบแบรนด์"><span class="material-symbols-outlined text-[18px]">delete</span></button>
          </div>`).join("")
        : `<div class="text-[13px] text-on-surface-variant">ยังไม่มีแบรนด์</div>`;
      listEl.querySelectorAll("[data-company]").forEach((inp) => inp.addEventListener("change", async () => {
        const id = inp.closest("[data-id]").dataset.id;
        const company = inp.value.trim();
        try { await api("/brands/" + id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company }) }); toast(company ? "บันทึกบริษัท — แคมเปญใต้แบรนด์นี้อัปเดตตามแล้ว" : "ล้างบริษัทแล้ว"); }
        catch (e) { toast(e.message, "err"); }
      }));
      listEl.querySelectorAll("[data-logo]").forEach((b) => b.addEventListener("click", () => pickBrandLogo(b.closest("[data-id]").dataset.id)));
      listEl.querySelectorAll("[data-logo-del]").forEach((b) => b.addEventListener("click", async () => {
        try { await setBrandLogo(b.closest("[data-id]").dataset.id, ""); toast("ลบโลโก้แล้ว"); refresh(); } catch (e) { toast(e.message, "err"); }
      }));
      listEl.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
        const id = b.closest("[data-id]").dataset.id;
        if (!confirm("ลบแบรนด์นี้? (แคมเปญใต้แบรนด์จะกลายเป็น No brand)")) return;
        try { await api("/brands/" + id, { method: "DELETE" }); refresh(); } catch (e) { toast(e.message, "err"); }
      }));
    };
    m.querySelector("[data-add]").addEventListener("click", async () => {
      const name = m.querySelector("#br-new").value.trim();
      if (!name) return;
      try { await api("/brands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }); m.querySelector("#br-new").value = ""; refresh(); }
      catch (e) { toast(e.message, "err"); }
    });
    m.querySelector("[data-close]").addEventListener("click", () => render());
    refresh();
  }

  // ---- Activity log modal (header button) — server-side audit trail ----
  async function openVersionModal() {
    const a = activeAssetRef;
    if (!a || !a.id) { toast("เปิดแคมเปญก่อน แล้วจึงดูประวัติการแก้ไข", "info"); return; }
    let list = [];
    try { list = await api("/assets/" + a.id + "/history"); } catch (e) { toast(e.message, "err"); return; }
    const fmtTs = (ts) => { try { return new Date(ts).toLocaleString("th-TH", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch (_) { return String(ts); } };
    const ico = (act) => act === "created" ? "add_circle" : act === "deleted" ? "delete" : "edit";
    const rowHtml = (v) => `<div class="ver-row">
        <div class="ver-info"><div class="ver-when"><span class="material-symbols-outlined text-[15px]" style="vertical-align:-3px">${ico(v.action)}</span> ${esc(v.actor || "—")} · ${fmtTs(v.at)}</div>
          <div class="ver-meta">${esc(v.summary || v.action)}</div></div>
      </div>`;
    const body = list.length
      ? `<div class="text-[12px] text-on-surface-variant">บันทึกการแก้ไขแคมเปญนี้ (ใครแก้อะไรเมื่อไหร่) — เก็บฝั่งเซิร์ฟเวอร์ ล่าสุด 50 รายการ</div><div class="ver-list">${list.map(rowHtml).join("")}</div>`
      : `<div class="text-[13px] text-on-surface-variant">ยังไม่มีประวัติการแก้ไข</div>`;
    modal("ประวัติการแก้ไข (Activity Log)", "history", body, `<button data-close class="ml-auto px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Close</button>`, "max-w-xl");
  }
  document.getElementById("ver-history")?.addEventListener("click", openVersionModal);
})();
