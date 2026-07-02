/* Section B — KOL Plan (per-creator campaign table + budget + media).
 * Self-registers with the content-asset core via window.CA.register().
 * Everything KOL-specific lives here so it can be edited in isolation. */
(() => {
  "use strict";
  const CA = window.CA;
  if (!CA) { console.error("ca-section-b.js: CA connector missing"); return; }
  const { api, el, esc, toast, isAdmin, render, fmtNum, uploadFile, mediaSrc, modal, inpCls, lbl, money, saveAsset } = CA;

  // Roster (directory creators) loaded per section render; the "Assign KOL" button
  // in the section header reads this when clicked.
  let lastRoster = [];

  async function saveKols(a, kols) {
    a.kols = kols;
    await saveAsset(a.id, { kols }, a);
  }

  // v2 (KOLs-Confirmed Excel format) is the active table; v1 kept as a fallback.
  let USE_V2 = true;
  let kolSortDir = "desc";   // budget high→low by default
  let selectedKolRows = new Set();
  const renderKolTable = (host, a, roster) => (USE_V2 ? renderKolTableV2 : renderKolTableV1)(host, a, roster);

  const V2_PLATFORMS = [
    { k: "tiktok", icon: "fa-brands fa-tiktok", color: "#111111", label: "TikTok" },
    { k: "instagram", icon: "fa-brands fa-instagram", color: "#E4405F", label: "Instagram" },
    { k: "facebook", icon: "fa-brands fa-facebook", color: "#1877F2", label: "Facebook" },
    { k: "lemon8", icon: "fa-solid fa-lemon", color: "#00d26a", label: "Lemon8" },
    { k: "youtube", icon: "fa-brands fa-youtube", color: "#FF0000", label: "YouTube" },
  ];
  const V2_BUDGET = [
    { f: "kol_price", th: "KOL Price" },
    { f: "gencode_boosting", th: "Gencode/Boost" },
    { f: "cart_added", th: "Cart Added" },
    { f: "buy_asset", th: "Buy Asset" },
    { f: "outside_shooting", th: "Outside" },
  ];
  const V2_TIERS = ["Nano", "Micro", "Mid-Tier", "Macro", "Mega"];
  const CHANNEL_ORDER = ["instagram", "tiktok", "youtube", "facebook", "twitter", "website"];
  const primaryChannelLink = (person = {}) => {
    const links = person.social_links || {};
    const key = CHANNEL_ORDER.find((k) => (links[k] || "").trim());
    return key ? links[key].trim() : "";
  };
  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

  function renderKolTableV2(host, a, roster) {
    const admin = CA.canEdit(a);
    const ro = admin ? "" : "disabled";
    const kols = a.kols || [];
    selectedKolRows = new Set([...selectedKolRows].filter((i) => Number.isInteger(i) && i >= 0 && i < kols.length));
    const inf = (id) => roster.find((r) => r.id === id) || {};
    const nameOf = (k) => (k.influencer_id ? (inf(k.influencer_id).name || k.name) : k.name) || ("#" + (k.influencer_id || "?"));
    const channelOf = (k) => (((hasOwn(k, "profile_link") ? k.profile_link : (k.channel_link || primaryChannelLink(inf(k.influencer_id)))) || "") + "").trim();
    const tierOf = (k) => (k.influencer_id ? inf(k.influencer_id).tier : k.tier) || "";
    const follOf = (k) => (k.influencer_id ? inf(k.influencer_id).followers : k.followers) ?? "";
    const tierCls = (t) => (V2_TIERS.includes(t) ? t : "custom");

    // Customer visibility (eye) — reused from v1, now over the v2 budget fields.
    const bshow = a.budget_show || {};
    const bvis = (f) => bshow[f] !== false;
    const cellOpen = (k, f) => (k.show || {})[f] !== false;
    const colOpen = (f) => kols.some((k) => cellOpen(k, f));
    const colVis = (f) => admin || (bvis(f) && colOpen(f));
    const visB = V2_BUDGET.filter((b) => colVis(b.f));

    if (!kols.length) {
      host.innerHTML = `<div class="kol-panel"><div class="kol-empty"><span class="material-symbols-outlined">groups</span><span>ยังไม่มี KOL${admin ? ' — กด "Assign KOL" หรือ "นำเข้า Excel"' : ""}</span></div></div>`;
      return;
    }

    const money$ = (v) => "฿" + (Number(v) || 0).toLocaleString("en-US");
    const num = (f, val) => `<input class="kol-in num" inputmode="numeric" data-f="${f}" data-money value="${val === "" || val == null ? "" : Number(val).toLocaleString("en-US")}" ${ro}/>`;
    const txt = (f, val, cls = "kol-in") => `<input class="${cls}" data-f="${f}" value="${esc(val ?? "")}" ${ro}/>`;
    const eye = (k, f) => admin ? `<button class="kol-eye ${cellOpen(k, f) ? "on" : ""}" data-eye="${f}" title="โชว์/ซ่อนตอนส่งลูกค้า"><span class="material-symbols-outlined text-[16px]">${cellOpen(k, f) ? "visibility" : "visibility_off"}</span></button>` : "";
    const platCell = (k, p) => {
      const url = ((k.links || {})[p.k] || "").trim();
      const a2 = url ? `<a class="kol-plat" href="${esc(url)}" target="_blank" rel="noopener" title="${p.label} — เปิดโพสต์" style="color:${p.color}"><i class="${p.icon}"></i></a>` : `<span style="color:#d4cebe">—</span>`;
      return a2;
    };
    const nameCell = (k) => {
      const name = k.influencer_id ? `<a href="#/influencer/${k.influencer_id}">${esc(nameOf(k))}</a>` : `<span>${esc(nameOf(k))}</span>`;
      const url = channelOf(k);
      const open = url ? `<a class="kol-channel-link" href="${esc(url)}" target="_blank" rel="noopener" title="Open channel"><span class="material-symbols-outlined text-[14px]">open_in_new</span></a>` : "";
      const edit = admin ? `<button class="kol-channel-edit" data-channel-edit title="${url ? "Edit channel link" : "Add channel link"}"><span class="material-symbols-outlined text-[14px]">${url ? "edit" : "add_link"}</span></button>` : "";
      return `<div class="kol-name-wrap"><span class="kol-name-main">${name}</span><span class="kol-channel-actions">${open}${edit}</span></div>`;
    };

    const rowHtml = (k, i) => `<tr data-i="${i}">
      ${admin ? `<td class="kol-sel"><input type="checkbox" class="kol-check" data-select-row value="${i}" ${selectedKolRows.has(i) ? "checked" : ""} title="Select row"/></td>` : ""}
      <td class="kol-rownum">${i + 1}</td>
      <td>${txt("kol_type", k.kol_type, "kol-in sm")}</td>
      <td class="kol-name">${nameCell(k)}</td>
      <td class="kol-c">${follOf(k) !== "" ? esc(String(follOf(k))) : '<span style="color:#d4cebe">—</span>'}</td>
      <td>${txt("content_type", k.content_type, "kol-in sm")}</td>
      <td><button class="kol-cellbtn" data-sow-edit><span class="material-symbols-outlined text-[15px]">checklist</span>${(k.sow || []).length || "+"}</button></td>
      <td>${txt("product_focus", k.product_focus, "kol-in md")}</td>
      <td><input class="kol-in dt" type="date" data-f="post_date" value="${esc(k.post_date || "")}" ${ro}/></td>
      ${V2_PLATFORMS.map((p) => `<td class="kol-c">${platCell(k, p)}</td>`).join("")}
      ${admin ? `<td><button class="kol-cellbtn" data-links-edit title="แก้ลิงก์ทุกแพลตฟอร์ม"><span class="material-symbols-outlined text-[15px]">link</span></button></td>` : ""}
      ${visB.map(({ f }) => admin
        ? `<td><div class="kol-bcell">${num(f, k[f])}${eye(k, f)}</div></td>`
        : (cellOpen(k, f) ? `<td><div class="kol-bcell">${num(f, k[f])}</div></td>` : `<td><div class="kol-bcell" style="justify-content:center;color:#bcb5a4">—</div></td>`)).join("")}
      <td>${txt("gencode", k.gencode, "kol-in sm")}</td>
      <td><button class="kol-cellbtn" data-cond-edit title="เงื่อนไข">${(k.condition || k.conditions) ? '<span class="material-symbols-outlined text-[15px]" style="color:#e1121c">sticky_note_2</span>' : '<span class="material-symbols-outlined text-[15px]">add</span>'}</button></td>
      <td><button class="kol-cellbtn" data-media-edit>${(k.media || []).length ? `${(k.media || []).length}` : '<span class="material-symbols-outlined text-[15px]">image</span>'}</button></td>
      ${admin ? `<td><button class="kol-remove" data-remove title="ลบ"><span class="material-symbols-outlined text-[18px]">delete</span></button></td>` : ""}
    </tr>`;

    // Group by Month (top), then Tier (sub, like v1) — standalone rows fall back to KOLs Type.
    const byMonth = {};
    kols.forEach((k, i) => { const m = k.month || "—"; (byMonth[m] = byMonth[m] || []).push(i); });
    const TIER_ORDER = ["Mega", "Macro", "Mid-Tier", "Micro", "Nano"];
    const subOf = (k) => tierOf(k) || k.kol_type || "—";
    const sortIdx = (idxs) => idxs.slice().sort((x, y) => {
      const d = (Number(kols[y].kol_price) || 0) - (Number(kols[x].kol_price) || 0);
      return kolSortDir === "desc" ? d : -d;
    });
    const monthKeys = Object.keys(byMonth);
    const colspan = 11 + V2_PLATFORMS.length + visB.length + (admin ? 3 : 0);
    const body = monthKeys.map((m) => {
      const idxs = byMonth[m];
      const subs = {};
      idxs.forEach((i) => { const s = subOf(kols[i]); (subs[s] = subs[s] || []).push(i); });
      const subKeys = TIER_ORDER.filter((t) => subs[t]).concat(Object.keys(subs).filter((s) => !TIER_ORDER.includes(s)).sort());
      const monthHead = `<tr class="kol-group kol-group-month"><td colspan="${colspan}">📅 ${esc(m === "—" ? "ไม่ระบุเดือน" : m)}<span class="kol-gcount">${idxs.length} KOL</span></td></tr>`;
      const subRows = subKeys.map((s) => {
        const head = V2_TIERS.includes(s) ? `<span class="tier-chip tier-${tierCls(s)}">${esc(s)}</span>` : `<span class="kol-gname">${esc(s)}</span>`;
        return `<tr class="kol-group"><td colspan="${colspan}">${head}<span class="kol-gcount">${subs[s].length}</span></td></tr>${sortIdx(subs[s]).map((i) => rowHtml(kols[i], i)).join("")}`;
      }).join("");
      return monthHead + subRows;
    }).join("");

    const tot = (f) => kols.reduce((s, k) => s + (admin || cellOpen(k, f) ? (Number(k[f]) || 0) : 0), 0);
    const grand = V2_BUDGET.reduce((s, b) => s + (colVis(b.f) ? tot(b.f) : 0), 0);
    const bEye = (f) => admin ? `<button class="kol-eye ${bvis(f) ? "on" : ""}" data-budget-eye="${f}"><span class="material-symbols-outlined text-[16px]">${bvis(f) ? "visibility" : "visibility_off"}</span></button>` : "";
    const foot = (admin || visB.length) ? `<div class="kol-foot"><div class="kol-foot-items">
      ${V2_BUDGET.filter((b) => admin || colVis(b.f)).map((b) => `<div class="kol-tot ${admin && !bvis(b.f) ? "is-cust-hidden" : ""}"><span class="l">${b.th}</span><span class="kol-tot-vrow"><span class="v" data-tot="${b.f}">${money$(tot(b.f))}</span>${bEye(b.f)}</span></div>`).join("")}
      <div class="kol-tot kol-tot-budget"><span class="l">Total Budget</span><span class="kol-tot-vrow"><span class="v" data-tot="grand">${money$(grand)}</span></span></div>
    </div></div>` : "";

    const sortBtn = `<button class="kol-sort" data-sort title="เรียงงบ มาก↔น้อย"><span class="material-symbols-outlined text-[16px]">${kolSortDir === "desc" ? "arrow_downward" : "arrow_upward"}</span>KOL Price</button>`;
    const selectedCount = [...selectedKolRows].filter((i) => kols[i]).length;
    const bulkTools = admin ? `<div class="kol-bulk">
      <span class="kol-bulk-count"><b data-selected-count>${selectedCount}</b> selected</span>
      <button class="kol-bulk-btn" data-clear-selected ${selectedCount ? "" : "disabled"}><span class="material-symbols-outlined text-[15px]">backspace</span>Clear selection</button>
      <button class="kol-bulk-btn danger" data-delete-selected ${selectedCount ? "" : "disabled"}><span class="material-symbols-outlined text-[15px]">delete</span>Delete selected</button>
    </div>` : "";
    host.innerHTML = `<div class="kol-panel">
      <div class="kol-toolbar">${bulkTools}${sortBtn}</div>
      <div class="kol-wrap"><table class="kol-table"><thead><tr>
        ${admin ? `<th><input type="checkbox" class="kol-check" data-select-all title="Select all"/></th>` : ""}<th>#</th><th>Type</th><th>KOL Name</th><th>Follower</th><th>Content</th><th>SOW</th><th>Product Focus</th><th>Post Date</th>
        ${V2_PLATFORMS.map((p) => `<th title="${p.label}"><i class="${p.icon}"></i></th>`).join("")}${admin ? "<th>Links</th>" : ""}
        ${visB.map((b) => `<th>${b.th}</th>`).join("")}<th>Gencode</th><th>Cond.</th><th>Media</th>${admin ? "<th></th>" : ""}
      </tr></thead><tbody>${body}</tbody></table></div>${foot}</div>`;

    host.querySelector("[data-sort]")?.addEventListener("click", () => { kolSortDir = kolSortDir === "desc" ? "asc" : "desc"; renderKolTableV2(host, a, roster); });

    host.querySelectorAll("[data-budget-eye]").forEach((b) => b.addEventListener("click", () => {
      const f = b.getAttribute("data-budget-eye"); a.budget_show = a.budget_show || {};
      a.budget_show[f] = a.budget_show[f] === false; renderKolTableV2(host, a, roster);
      saveAsset(a.id, { budget_show: a.budget_show }, a).catch((e) => toast(e.message, "err"));
    }));

    if (!admin) return;
    let timer; const persist = () => { clearTimeout(timer); timer = setTimeout(() => saveKols(a, a.kols).catch((e) => toast(e.message, "err")), 600); };
    const retotal = () => { host.querySelectorAll("[data-tot]").forEach((eln) => { const f = eln.getAttribute("data-tot"); eln.textContent = money$(f === "grand" ? V2_BUDGET.reduce((s, b) => s + tot(b.f), 0) : tot(f)); }); };
    const updateBulkState = () => {
      selectedKolRows = new Set([...selectedKolRows].filter((i) => a.kols[i]));
      const n = selectedKolRows.size;
      const count = host.querySelector("[data-selected-count]");
      if (count) count.textContent = String(n);
      host.querySelectorAll("[data-clear-selected],[data-delete-selected]").forEach((b) => { b.disabled = n === 0; });
      const all = host.querySelector("[data-select-all]");
      if (all) { all.checked = n > 0 && n === a.kols.length; all.indeterminate = n > 0 && n < a.kols.length; }
    };
    host.querySelector("[data-select-all]")?.addEventListener("change", (e) => {
      selectedKolRows = e.target.checked ? new Set(a.kols.map((_, i) => i)) : new Set();
      host.querySelectorAll("[data-select-row]").forEach((inp) => { inp.checked = selectedKolRows.has(+inp.value); });
      updateBulkState();
    });
    host.querySelectorAll("[data-select-row]").forEach((inp) => inp.addEventListener("change", () => {
      const i = +inp.value;
      if (inp.checked) selectedKolRows.add(i); else selectedKolRows.delete(i);
      updateBulkState();
    }));
    host.querySelector("[data-clear-selected]")?.addEventListener("click", () => {
      selectedKolRows.clear();
      host.querySelectorAll("[data-select-row]").forEach((inp) => { inp.checked = false; });
      updateBulkState();
    });
    host.querySelector("[data-delete-selected]")?.addEventListener("click", async () => {
      const rows = [...selectedKolRows].filter((i) => a.kols[i]).sort((x, y) => y - x);
      if (!rows.length) return;
      if (!confirm(`Delete ${rows.length} selected KOL from this campaign?`)) return;
      clearTimeout(timer);
      rows.forEach((i) => a.kols.splice(i, 1));
      selectedKolRows.clear();
      await saveKols(a, a.kols);
      renderKolTableV2(host, a, roster);
    });
    updateBulkState();
    host.querySelectorAll("[data-f]").forEach((inpEl) => {
      const f = inpEl.getAttribute("data-f"); const isMoney = inpEl.hasAttribute("data-money");
      inpEl.addEventListener("input", () => {
        const i = +inpEl.closest("tr").dataset.i;
        if (isMoney) { const digits = inpEl.value.replace(/[^\d]/g, ""); a.kols[i][f] = digits === "" ? "" : Number(digits); retotal(); persist(); return; }
        a.kols[i][f] = inpEl.value; persist();
      });
      if (isMoney) {
        inpEl.addEventListener("focus", () => { const v = a.kols[+inpEl.closest("tr").dataset.i][f]; inpEl.value = (v === "" || v == null) ? "" : String(v); });
        inpEl.addEventListener("blur", () => { const v = a.kols[+inpEl.closest("tr").dataset.i][f]; inpEl.value = (v === "" || v == null) ? "" : Number(v).toLocaleString("en-US"); });
      }
    });
    host.querySelectorAll("[data-eye]").forEach((b) => b.addEventListener("click", () => {
      const i = +b.closest("tr").dataset.i, f = b.getAttribute("data-eye"), k = a.kols[i];
      k.show = k.show || {}; k.show[f] = k.show[f] === false; renderKolTableV2(host, a, roster); persist();
    }));
    host.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", async () => {
      const i = +b.closest("tr").dataset.i;
      if (!confirm(`ลบ ${nameOf(a.kols[i])} ออกจากแคมเปญ?`)) return;
      a.kols.splice(i, 1); await saveKols(a, a.kols); renderKolTableV2(host, a, roster);
    }));
    host.querySelectorAll("[data-sow-edit]").forEach((b) => b.addEventListener("click", () => openKolSowModal(a, +b.closest("tr").dataset.i, roster, host)));
    host.querySelectorAll("[data-cond-edit]").forEach((b) => b.addEventListener("click", () => openKolCondModal(a, +b.closest("tr").dataset.i, roster, host)));
    host.querySelectorAll("[data-media-edit]").forEach((b) => b.addEventListener("click", () => openKolMediaModal(a, +b.closest("tr").dataset.i, roster, host)));
    host.querySelectorAll("[data-links-edit]").forEach((b) => b.addEventListener("click", () => openKolLinksModal(a, +b.closest("tr").dataset.i, roster, host)));
    host.querySelectorAll("[data-channel-edit]").forEach((b) => b.addEventListener("click", () => openKolChannelModal(a, +b.closest("tr").dataset.i, roster, host)));
  }

  // Edit all per-platform links for one KOL (v2).
  function openKolLinksModal(a, idx, roster, host) {
    const k = a.kols[idx]; k.links = k.links || {};
    const body = V2_PLATFORMS.map((p) => `<label class="flex flex-col gap-1">${lbl(`<i class="${p.icon}" style="color:${p.color}"></i> ${p.label}`)}<input data-plat="${p.k}" class="${inpCls}" value="${esc(k.links[p.k] || "")}" placeholder="https://..."/></label>`).join("");
    const m = modal("ลิงก์โพสต์ (แยกแพลตฟอร์ม)", "link", body, `<button data-close class="ml-auto px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Cancel</button><button data-save class="px-md py-2 rounded-lg font-semibold bg-primary text-on-primary">Save</button>`);
    m.querySelector("[data-save]").addEventListener("click", async () => {
      const links = {};
      m.querySelectorAll("[data-plat]").forEach((inp) => { const v = inp.value.trim(); if (v) links[inp.getAttribute("data-plat")] = v; });
      k.links = links;
      try { await saveKols(a, a.kols); m.remove(); renderKolTableV2(host, a, roster); } catch (e) { toast(e.message, "err"); }
    });
  }

  function openKolChannelModal(a, idx, roster, host) {
    const k = a.kols[idx];
    const person = roster.find((r) => r.id === k.influencer_id) || {};
    const who = person.name || k.name || "KOL";
    const current = (((hasOwn(k, "profile_link") ? k.profile_link : (k.channel_link || primaryChannelLink(person))) || "") + "").trim();
    const body = `<label class="flex flex-col gap-1">${lbl(`Channel link ของ ${esc(who)}`)}<input id="chl" class="${inpCls}" placeholder="https://..." value="${esc(current)}"/></label>`;
    const m = modal("Channel Link", "alternate_email", body, `<button data-close class="ml-auto px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Cancel</button><button data-clear class="px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Clear</button><button data-save class="px-md py-2 rounded-lg font-semibold bg-primary text-on-primary">Save</button>`);
    const inp = m.querySelector("#chl"); inp.focus();
    m.querySelector("[data-clear]").addEventListener("click", () => { inp.value = ""; });
    m.querySelector("[data-save]").addEventListener("click", async () => {
      k.profile_link = inp.value.trim();
      delete k.channel_link;
      try { await saveKols(a, a.kols); m.remove(); renderKolTableV2(host, a, roster); } catch (e) { toast(e.message, "err"); }
    });
  }

  // Import KOLs from a "KOLs Confirmed" .xlsx → preview count → append.
  function openImportKolModal(a) {
    const m = modal("นำเข้า KOL จาก Excel", "upload_file", `
      <div class="text-[13px] text-on-surface-variant">อัปโหลดไฟล์ฟอร์แมต <b>KOLs Confirmed</b> (.xlsx) — ระบบจะดึงชื่อ · SOW · ลิงก์แต่ละแพลตฟอร์ม (แนบอัตโนมัติ) · งบ ให้เลย</div>
      <button data-pick class="px-md py-2 rounded-lg border border-outline-variant hover:bg-surface-container-low flex items-center gap-1 w-fit"><span class="material-symbols-outlined text-[18px]">upload_file</span>เลือกไฟล์ .xlsx</button>
      <div id="imp-status" class="text-[13px]"></div>`,
      `<button data-close class="ml-auto px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Cancel</button><button data-add class="px-md py-2 rounded-lg font-semibold bg-primary text-on-primary hover:bg-primary-container" disabled style="opacity:.5">เพิ่มเข้าแคมเปญ</button>`);
    const status = m.querySelector("#imp-status"); const addBtn = m.querySelector("[data-add]");
    let parsed = [];
    m.querySelector("[data-pick]").addEventListener("click", () => {
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".xlsx,.xlsm";
      inp.addEventListener("change", async () => {
        const file = inp.files && inp.files[0]; if (!file) return;
        status.innerHTML = "⏳ กำลังอ่านไฟล์...";
        try {
          const fd = new FormData(); fd.append("file", file);
          const res = await api("/assets/" + a.id + "/import-kols", { method: "POST", body: fd });
          parsed = res.kols || [];
          const withLinks = parsed.filter((k) => k.links && Object.keys(k.links).length).length;
          status.innerHTML = `✅ อ่านได้ <b>${res.count}</b> KOL · มีลิงก์ ${withLinks} คน<br><span class="text-on-surface-variant text-[12px]">กด "เพิ่มเข้าแคมเปญ" เพื่อต่อท้าย KOL เดิม</span>`;
          addBtn.disabled = false; addBtn.style.opacity = "1";
        } catch (e) { status.innerHTML = `<span class="text-error">❌ ${esc(e.message)}</span>`; }
      });
      inp.click();
    });
    addBtn.addEventListener("click", async () => {
      if (!parsed.length) return;
      const kols = (a.kols || []).slice();
      const sowOptions = new Set(a.sow_options || []);
      parsed.forEach((p) => {
        const importedSow = Array.isArray(p.sow) ? p.sow : (p.sow ? [p.sow] : []);
        importedSow.forEach((s) => { const v = String(s || "").trim(); if (v) sowOptions.add(v); });
        kols.push({
          influencer_id: null, name: p.name, kol_type: p.kol_type, followers: p.followers,
          content_type: p.content_type, sow: importedSow, product_focus: p.product_focus,
          post_date: p.post_date, month: p.month, tier: "", profile_link: p.profile_link,
          links: p.links || {}, kol_price: p.kol_price, gencode_boosting: p.gencode_boosting,
          cart_added: p.cart_added, buy_asset: p.buy_asset, outside_shooting: p.outside_shooting,
          condition: p.condition, conditions: p.condition, gencode: p.gencode, objective: "Awareness",
          show: { kol_price: true, gencode_boosting: true, cart_added: true, buy_asset: true, outside_shooting: true },
        });
      });
      a.sow_options = [...sowOptions];
      try { a.kols = kols; await saveAsset(a.id, { kols, sow_options: a.sow_options }, a); toast(`นำเข้า ${parsed.length} KOL แล้ว`); m.remove(); render(); } catch (e) { toast(e.message, "err"); }
    });
  }

  function renderKolTableV1(host, a, roster) {
    const admin = CA.canEdit(a);   // admin or a manager assigned to this campaign
    const kols = a.kols || [];
    const inf = (id) => roster.find((r) => r.id === id) || {};
    const APPROVE = ["Pending", "Posted", "Approve"];
    const OBJ = ["Awareness", "Engagement", "Conversion"];
    const ro = admin ? "" : "disabled";

    // Tier is the single source of truth in the Directory (derived from the
    // creator's follower count). Section B mirrors it read-only — it is never
    // hand-edited here, so a campaign can't drift from the Directory profile.
    const TIER_LABELS = ["Nano", "Micro", "Mid-Tier", "Macro", "Mega"];
    const tierClass = (t) => (TIER_LABELS.includes(t) ? t : "custom");
    const tierOf = (k) => inf(k.influencer_id).tier || k.tier || "";
    const tierChip = (t) => (t
      ? `<span class="tier-chip tier-${tierClass(t)}">${esc(t)}</span>`
      : `<span style="color:#bcb5a4">—</span>`);

    // Budget columns. For the customer view a column shows only if at least one
    // KOL has its eye open; if every value in it is hidden the whole column
    // collapses away. Within a shown column, hidden cells stay hidden ("—").
    // Admins/managers always see the full table + eye toggles.
    const BUDGET_FIELDS = [
      { f: "rate", th: "ค่าตัว" },
      { f: "gen_code_price", th: "Gen Code" },
      { f: "boosting_cost", th: "Boosting" },
    ];
    const bshow = a.budget_show || {};
    const bvis = (f) => bshow[f] !== false;
    const totalHidden = bshow.total === false;
    const cellOpen = (k, f) => (k.show || {})[f] !== false;
    const colOpen = (f) => kols.some((k) => cellOpen(k, f));
    const colVis = (f) => admin || (!totalHidden && bvis(f) && colOpen(f));
    const visBudget = BUDGET_FIELDS.filter((b) => colVis(b.f));

    if (!kols.length) {
      host.innerHTML = `<div class="kol-panel"><div class="kol-empty"><span class="material-symbols-outlined">groups</span><span>ยังไม่มี KOL ในแคมเปญนี้${admin ? ' — กด "Assign KOL" เพื่อเพิ่ม' : ""}</span></div></div>`;
      return;
    }

    const sel = (f, val, opts, cls = "kol-in sm") => `<select class="${cls}" data-f="${f}" ${ro}>${opts.map((o) => `<option ${String(val) === String(o) ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
    const txt = (f, val, cls = "kol-in") => `<input class="${cls}" data-f="${f}" value="${esc(val ?? "")}" ${ro}/>`;
    // Budget fields are text (not number) so they can show thousands separators
    // ("120,000"); a text input with no [type] also escapes the forms-plugin border.
    const num = (f, val) => `<input class="kol-in num" inputmode="numeric" data-f="${f}" data-money value="${val === "" || val == null ? "" : Number(val).toLocaleString("en-US")}" ${ro}/>`;
    const eye = (f, on) => `<button class="kol-eye ${on ? "on" : ""}" data-eye="${f}" title="โชว์/ซ่อนตอนส่งลูกค้า" ${ro}><span class="material-symbols-outlined text-[16px]">${on ? "visibility" : "visibility_off"}</span></button>`;

    const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthSel = (val) => `<select class="kol-in mon" data-f="month" ${ro}>${MONTHS.map((mo) => `<option value="${mo}" ${(val || "") === mo ? "selected" : ""}>${mo || "—"}</option>`).join("")}</select>`;
    // Link shown as the post's platform icon (detected from the URL), opens in a
    // new tab; edited via a small modal. Brand glyphs come from Font Awesome.
    const PLATFORMS = [
      { re: /(facebook\.com|fb\.com|fb\.watch|m\.facebook)/i, cls: "fa-brands fa-facebook", color: "#1877F2", label: "Facebook" },
      { re: /(tiktok\.com|vt\.tiktok)/i, cls: "fa-brands fa-tiktok", color: "#111111", label: "TikTok" },
      { re: /(instagram\.com|instagr\.am)/i, cls: "fa-brands fa-instagram", color: "#E4405F", label: "Instagram" },
      { re: /(youtube\.com|youtu\.be)/i, cls: "fa-brands fa-youtube", color: "#FF0000", label: "YouTube" },
      { re: /(twitter\.com|x\.com)/i, cls: "fa-brands fa-x-twitter", color: "#111111", label: "X" },
      { re: /(line\.me|lin\.ee)/i, cls: "fa-brands fa-line", color: "#06C755", label: "LINE" },
    ];
    const platformOf = (url) => PLATFORMS.find((p) => p.re.test(url)) || { cls: "fa-solid fa-link", color: "#0058be", label: "เปิดลิงค์" };
    const linkCell = (url) => {
      const u = (url || "").trim();
      const editBtn = admin ? `<button class="kol-linkedit" data-link-edit title="${u ? "แก้ไขลิงค์" : "ใส่ลิงค์"}"><span class="material-symbols-outlined text-[15px]">${u ? "edit" : "add_link"}</span></button>` : "";
      if (!u) return `<div class="kol-linkcell">${admin ? editBtn : `<span style="color:#bcb5a4">—</span>`}</div>`;
      const p = platformOf(u);
      const link = `<a class="kol-plat" href="${esc(u)}" target="_blank" rel="noopener" title="${esc(p.label)} — เปิดโพสต์" style="color:${p.color}"><i class="${p.cls}"></i></a>`;
      return `<div class="kol-linkcell">${link}${editBtn}</div>`;
    };
    // Period shown compactly (e.g. "1 Jun – 30 Jun"); edited via a start–end date modal.
    const fmtD = (s) => { if (!s) return ""; const p = String(s).split("-"); return p.length < 3 ? esc(s) : `${+p[2]} ${MONTHS[+p[1]] || ""}`; };
    const periodCell = (k) => {
      const f = k.period_from, t = k.period_to, has = f || t;
      const label = has ? `${fmtD(f) || "…"} – ${fmtD(t) || "…"}` : "";
      if (!admin) return has ? `<span style="white-space:nowrap">${label}</span>` : `<span style="color:#bcb5a4">—</span>`;
      return `<button class="kol-cellbtn" data-period-edit><span class="material-symbols-outlined text-[14px]">date_range</span>${has ? label : "ช่วงวันที่"}</button>`;
    };

    const rowHtml = (k, i) => {
      const person = inf(k.influencer_id);
      const name = person.name || k.name || ("#" + k.influencer_id);
      const show = k.show || {};
      const media = k.media || [];
      const thumb = media.find((m) => m.url && m.type !== "video")?.url || media[0]?.url || (media[0]?.urls || [])[0] || "";
      const dt = (f, val) => `<input class="kol-in dt" type="date" data-f="${f}" value="${esc(val ?? "")}" ${ro}/>`;
      return `<tr data-i="${i}">
        <td class="kol-rownum">${i + 1}</td>
        <td>${monthSel(k.month)}</td>
        <td>${tierChip(tierOf(k))}</td>
        <td>${txt("kol_type", k.kol_type ?? person.niche ?? "", "kol-in sm")}</td>
        <td class="kol-name"><a href="#/influencer/${k.influencer_id}">${esc(name)}</a></td>
        <td><button class="kol-cellbtn" data-sow-edit><span class="material-symbols-outlined text-[15px]">checklist</span>${(k.sow || []).length || "+"}</button></td>
        <td>${txt("product_focus", k.product_focus, "kol-in md")}</td>
        <td>${sel("client_approved", k.client_approved || "Pending", APPROVE)}</td>
        <td>${dt("post_date", k.post_date)}</td>
        <td>${linkCell(k.link)}</td>
        ${visBudget.map(({ f }) => {
          if (admin) return `<td><div class="kol-bcell">${num(f, k[f])}${eye(f, cellOpen(k, f))}</div></td>`;
          return cellOpen(k, f)
            ? `<td><div class="kol-bcell">${num(f, k[f])}</div></td>`
            : `<td><div class="kol-bcell" style="justify-content:center;color:#bcb5a4">—</div></td>`;
        }).join("")}
        <td>${sel("objective", k.objective || "Awareness", OBJ, "kol-in obj")}</td>
        <td>${periodCell(k)}</td>
        <td><button class="kol-cellbtn" data-cond-edit title="เงื่อนไข">${k.conditions ? '<span class="material-symbols-outlined text-[15px]" style="color:#e1121c">sticky_note_2</span>' : '<span class="material-symbols-outlined text-[15px]">add</span>'}</button></td>
        <td><button class="kol-cellbtn" data-media-edit>${thumb ? `<img class="kol-thumb" src="${esc(mediaSrc(thumb))}"/>` : '<span class="material-symbols-outlined text-[15px]">image</span>'}${media.length ? ` ${media.length}` : ""}</button></td>
        ${admin ? `<td><button class="kol-remove" data-remove title="ลบ"><span class="material-symbols-outlined text-[18px]">delete</span></button></td>` : ""}
      </tr>`;
    };

    // Group rows by tier (from the Directory) so the table is easy to scan
    // (Mega → Macro → Mid-Tier → Micro → Nano → unspecified).
    const TIER_ORDER = ["Mega", "Macro", "Mid-Tier", "Micro", "Nano"];
    const effTier = (k) => tierOf(k);
    const groups = {};
    kols.forEach((k, i) => { const t = effTier(k) || "—"; (groups[t] = groups[t] || []).push(i); });
    const tierKeys = TIER_ORDER.filter((t) => groups[t])
      .concat(Object.keys(groups).filter((t) => !TIER_ORDER.includes(t)).sort());
    const colspan = admin ? 18 : (14 + visBudget.length);
    const rows = tierKeys.map((t) => {
      const head = t === "—" ? `<span class="kol-gname">ไม่ระบุ Tier</span>` : `<span class="tier-chip tier-${tierClass(t)}">${esc(t)}</span>`;
      const body = groups[t].map((i) => rowHtml(kols[i], i)).join("");
      return `<tr class="kol-group"><td colspan="${colspan}">${head}<span class="kol-gcount">${groups[t].length} KOL</span></td></tr>${body}`;
    }).join("");

    const tot = (f) => kols.reduce((s, k) => s + (Number(k[f]) || 0), 0);
    // Viewer totals reflect only the values the customer can actually see (open cells).
    const totOpen = (f) => kols.reduce((s, k) => s + (cellOpen(k, f) ? (Number(k[f]) || 0) : 0), 0);
    const viewerTotal = BUDGET_FIELDS.reduce((s, b) => s + (colVis(b.f) ? totOpen(b.f) : 0), 0);
    // Budget total visibility — admins/managers can also hide the grand total.
    const bEye = (f) => admin
      ? `<button class="kol-eye ${bvis(f) ? "on" : ""}" data-budget-eye="${f}" title="โชว์/ซ่อนยอดนี้ตอนส่งลูกค้า"><span class="material-symbols-outlined text-[16px]">${bvis(f) ? "visibility" : "visibility_off"}</span></button>`
      : "";
    const footVisible = (f) => admin || (f === "total" ? (!totalHidden && bvis("total") && visBudget.length > 0) : colVis(f));
    const footItem = (f, label, value, extraCls = "") => {
      if (!footVisible(f)) return "";   // viewers never see a hidden / collapsed figure
      return `<div class="kol-tot ${extraCls} ${admin && !bvis(f) ? "is-cust-hidden" : ""}"><span class="l">${label}</span><span class="kol-tot-vrow"><span class="v">${value}</span>${bEye(f)}</span></div>`;
    };
    const fval = (f) => admin ? tot(f) : totOpen(f);
    const anyBudgetVisible = admin || visBudget.length > 0;
    host.innerHTML = `<div class="kol-panel">
      <div class="kol-wrap"><table class="kol-table">
      <thead><tr>
        <th>#</th><th>Month</th><th>Tier</th><th>Type</th><th>KOL Name</th><th>SOW</th>
        <th>Product Focus</th><th>Approved</th><th>Post Date</th><th>Link</th>
        ${visBudget.map((b) => `<th>${b.th}</th>`).join("")}<th>Obj.</th><th>Period</th>
        <th>Cond.</th><th>Media</th>${admin ? "<th></th>" : ""}
      </tr></thead>
      <tbody>${rows}</tbody></table></div>
      ${anyBudgetVisible ? `<div class="kol-foot"><div class="kol-foot-items">
        ${footItem("rate", "ค่าตัว", money(fval("rate")))}
        ${footItem("gen_code_price", "Gen Code", money(fval("gen_code_price")))}
        ${footItem("boosting_cost", "Boosting", money(fval("boosting_cost")))}
        ${footItem("total", "Total Budget", money(admin ? (tot("rate") + tot("gen_code_price") + tot("boosting_cost")) : viewerTotal), "kol-tot-budget")}
      </div></div>` : ""}</div>`;

    // Budget visibility — admin/manager toggles which figures the customer sees.
    host.querySelectorAll("[data-budget-eye]").forEach((b) => b.addEventListener("click", () => {
      const f = b.getAttribute("data-budget-eye");
      a.budget_show = a.budget_show || {};
      const newVis = a.budget_show[f] === false;   // hidden → show · shown → hide
      a.budget_show[f] = newVis;
      b.classList.toggle("on", newVis);
      b.querySelector(".material-symbols-outlined").textContent = newVis ? "visibility" : "visibility_off";
      b.closest(".kol-tot").classList.toggle("is-cust-hidden", !newVis);
      saveAsset(a.id, { budget_show: a.budget_show }, a).catch((e) => toast(e.message, "err"));
    }));

    if (!admin) return;
    let timer;
    const sum = (f) => a.kols.reduce((s, k) => s + (Number(k[f]) || 0), 0);
    const updateTotals = () => {
      const vs = host.querySelectorAll(".kol-foot .v");
      if (vs[0]) vs[0].textContent = money(sum("rate"));
      if (vs[1]) vs[1].textContent = money(sum("gen_code_price"));
      if (vs[2]) vs[2].textContent = money(sum("boosting_cost"));
      if (vs[3]) vs[3].textContent = money(sum("rate") + sum("gen_code_price") + sum("boosting_cost"));
    };
    const persist = () => { clearTimeout(timer); timer = setTimeout(() => saveKols(a, a.kols).catch((e) => toast(e.message, "err")), 600); };
    host.querySelectorAll("[data-f]").forEach((inpEl) => {
      const f = inpEl.getAttribute("data-f");
      const money$ = inpEl.hasAttribute("data-money");
      inpEl.addEventListener("input", () => {
        const i = +inpEl.closest("tr").dataset.i;
        if (money$) { // keep only digits; store the number, leave the field's display alone while typing
          const digits = inpEl.value.replace(/[^\d]/g, "");
          a.kols[i][f] = digits === "" ? "" : Number(digits);
          updateTotals();
          persist();
          return;
        }
        a.kols[i][f] = inpEl.type === "number" ? (inpEl.value === "" ? "" : Number(inpEl.value)) : inpEl.value;
        persist();
      });
      if (money$) { // edit on raw digits, settle back to comma-grouped on blur
        inpEl.addEventListener("focus", () => { const v = a.kols[+inpEl.closest("tr").dataset.i][f]; inpEl.value = (v === "" || v == null) ? "" : String(v); });
        inpEl.addEventListener("blur", () => { const v = a.kols[+inpEl.closest("tr").dataset.i][f]; inpEl.value = (v === "" || v == null) ? "" : Number(v).toLocaleString("en-US"); });
      }
    });
    host.querySelectorAll("[data-eye]").forEach((b) => b.addEventListener("click", () => {
      const i = +b.closest("tr").dataset.i, f = b.getAttribute("data-eye"), k = a.kols[i];
      k.show = k.show || {}; k.show[f] = k.show[f] === false;
      b.classList.toggle("on", k.show[f] !== false);
      b.querySelector(".material-symbols-outlined").textContent = k.show[f] !== false ? "visibility" : "visibility_off";
      persist();
    }));
    host.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", async () => {
      const i = +b.closest("tr").dataset.i;
      if (!confirm(`ลบ ${inf(a.kols[i].influencer_id).name || "KOL"} ออกจากแคมเปญ?`)) return;
      a.kols.splice(i, 1); await saveKols(a, a.kols); renderKolTable(host, a, roster);
    }));
    host.querySelectorAll("[data-link-edit]").forEach((b) => b.addEventListener("click", () => openKolLinkModal(a, +b.closest("tr").dataset.i, roster, host)));
    host.querySelectorAll("[data-period-edit]").forEach((b) => b.addEventListener("click", () => openKolPeriodModal(a, +b.closest("tr").dataset.i, roster, host)));
    host.querySelectorAll("[data-sow-edit]").forEach((b) => b.addEventListener("click", () => openKolSowModal(a, +b.closest("tr").dataset.i, roster, host)));
    host.querySelectorAll("[data-cond-edit]").forEach((b) => b.addEventListener("click", () => openKolCondModal(a, +b.closest("tr").dataset.i, roster, host)));
    host.querySelectorAll("[data-media-edit]").forEach((b) => b.addEventListener("click", () => openKolMediaModal(a, +b.closest("tr").dataset.i, roster, host)));
  }

  function openAssignKolModal(a, roster) {
    const have = new Set((a.kols || []).map((k) => k.influencer_id));
    const avail = roster.filter((r) => !have.has(r.id));
    const body = `<div class="text-[12px] text-on-surface-variant">เลือกครีเอเตอร์จาก Directory (ดึงค่าตัวมา prefill งบให้)</div>
      <input id="kpq" class="${inpCls}" placeholder="ค้นหา..."/>
      <div class="max-h-80 overflow-y-auto border border-outline-variant rounded-lg p-sm flex flex-col gap-1">
      ${avail.map((r) => `<label data-n="${esc((r.name || "").toLowerCase())}" class="flex items-center gap-sm px-sm py-1 rounded hover:bg-surface-container-low cursor-pointer text-[14px]"><input type="checkbox" class="kp" value="${r.id}"/><span class="truncate flex-1">${esc(r.name)} <span class="text-on-surface-variant">· ${fmtNum(r.followers)} · ${esc(r.tier || "")}</span></span></label>`).join("") || `<div class="text-[13px] text-on-surface-variant">เพิ่มครบทุกคนแล้ว</div>`}
      </div>`;
    const m = modal("Assign KOL", "person_add", body, `
      <button data-close class="ml-auto px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Cancel</button>
      <button data-save class="px-md py-2 rounded-lg font-semibold bg-primary text-on-primary hover:bg-primary-container">Add</button>`);
    m.querySelector("#kpq").addEventListener("input", (e) => { const q = e.target.value.toLowerCase(); m.querySelectorAll("[data-n]").forEach((l) => { l.style.display = l.dataset.n.includes(q) ? "" : "none"; }); });
    m.querySelector("[data-save]").addEventListener("click", async () => {
      const ids = [...m.querySelectorAll(".kp:checked")].map((c) => +c.value);
      if (!ids.length) { m.remove(); return; }
      const kols = (a.kols || []).slice();
      ids.forEach((id) => { const r = roster.find((x) => x.id === id) || {};
        // v2 row shape (KOLs-Confirmed format). Budget starts blank — it is entered
        // per campaign in the table, not prefilled from the Directory fee estimate.
        kols.push({ influencer_id: id, month: "", tier: r.tier || "", kol_type: r.niche || "", followers: r.followers ?? "", content_type: "Video", sow: [], product_focus: "", post_date: "", profile_link: primaryChannelLink(r), links: {}, kol_price: 0, gencode_boosting: 0, cart_added: 0, buy_asset: 0, outside_shooting: 0, gencode: "", condition: "", conditions: "", objective: "Awareness", media: [], show: { kol_price: true, gencode_boosting: true, cart_added: true, buy_asset: true, outside_shooting: true } });
      });
      try { await saveKols(a, kols); toast(`เพิ่ม ${ids.length} KOL`); m.remove(); render(); } catch (e) { toast(e.message, "err"); }
    });
  }

  function openKolSowModal(a, idx, roster, host) {
    const k = a.kols[idx]; const sel = new Set(k.sow || []);
    const opts = () => a.sow_options || [];
    const body = `<div class="text-[12px] text-on-surface-variant">Scope of Work สำหรับ ${esc((roster.find((r) => r.id === k.influencer_id) || {}).name || "KOL")}</div>
      <div id="sl" class="flex flex-col gap-1">${opts().map((o) => `<label class="flex items-center gap-sm text-[14px]"><input type="checkbox" class="sw" value="${esc(o)}" ${sel.has(o) ? "checked" : ""}/>${esc(o)}</label>`).join("") || `<div class="text-[13px] text-on-surface-variant">ยังไม่มีรายการ — เพิ่มด้านล่าง</div>`}</div>
      <div class="flex gap-sm"><input id="sn" class="${inpCls}" placeholder="เพิ่มรายการใหม่"/><button data-add class="px-md py-2 rounded-lg bg-primary text-on-primary shrink-0">+</button></div>`;
    const m = modal("Scope of Work", "checklist", body, `<button data-close class="ml-auto px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Cancel</button><button data-save class="px-md py-2 rounded-lg font-semibold bg-primary text-on-primary">Save</button>`);
    m.querySelector("[data-add]").addEventListener("click", async () => {
      const v = m.querySelector("#sn").value.trim(); if (!v) return;
      a.sow_options = [...opts(), v];
      try { await saveAsset(a.id, { sow_options: a.sow_options }, a); } catch (e) { return toast(e.message, "err"); }
      m.querySelector("#sl").appendChild(el(`<label class="flex items-center gap-sm text-[14px]"><input type="checkbox" class="sw" value="${esc(v)}" checked/>${esc(v)}</label>`));
      m.querySelector("#sn").value = "";
    });
    m.querySelector("[data-save]").addEventListener("click", async () => {
      k.sow = [...m.querySelectorAll(".sw:checked")].map((c) => c.value);
      try { await saveKols(a, a.kols); m.remove(); renderKolTable(host, a, roster); } catch (e) { toast(e.message, "err"); }
    });
  }

  function openKolPeriodModal(a, idx, roster, host) {
    const k = a.kols[idx];
    const who = (roster.find((r) => r.id === k.influencer_id) || {}).name || "KOL";
    const body = `<div class="text-[12px] text-on-surface-variant">เลือกช่วงวันที่ของ ${esc(who)} (เริ่ม – จบ)</div>
      <div class="flex items-end gap-sm">
        <label class="flex flex-col gap-1 flex-1">${lbl("เริ่ม")}<input id="pf" type="date" class="${inpCls}" value="${esc(k.period_from || "")}"/></label>
        <span class="pb-2 text-on-surface-variant material-symbols-outlined">arrow_forward</span>
        <label class="flex flex-col gap-1 flex-1">${lbl("จบ")}<input id="pt" type="date" class="${inpCls}" value="${esc(k.period_to || "")}"/></label>
      </div>`;
    const m = modal("ช่วงวันที่ (Period)", "date_range", body, `<button data-close class="ml-auto px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Cancel</button><button data-clear class="px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">ล้าง</button><button data-save class="px-md py-2 rounded-lg font-semibold bg-primary text-on-primary">Save</button>`);
    m.querySelector("[data-clear]").addEventListener("click", () => { m.querySelector("#pf").value = ""; m.querySelector("#pt").value = ""; });
    m.querySelector("[data-save]").addEventListener("click", async () => { k.period_from = m.querySelector("#pf").value; k.period_to = m.querySelector("#pt").value; try { await saveKols(a, a.kols); m.remove(); renderKolTable(host, a, roster); } catch (e) { toast(e.message, "err"); } });
  }

  function openKolLinkModal(a, idx, roster, host) {
    const k = a.kols[idx];
    const who = (roster.find((r) => r.id === k.influencer_id) || {}).name || "KOL";
    const m = modal("Link Post", "link", `<label class="flex flex-col gap-1">${lbl(`ลิงค์โพสต์ของ ${esc(who)}`)}<input id="lk" class="${inpCls}" placeholder="https://..." value="${esc(k.link || "")}"/></label>`, `<button data-close class="ml-auto px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Cancel</button><button data-save class="px-md py-2 rounded-lg font-semibold bg-primary text-on-primary">Save</button>`);
    const inp = m.querySelector("#lk"); inp.focus();
    m.querySelector("[data-save]").addEventListener("click", async () => { k.link = inp.value.trim(); try { await saveKols(a, a.kols); m.remove(); renderKolTable(host, a, roster); } catch (e) { toast(e.message, "err"); } });
  }

  function openKolCondModal(a, idx, roster, host) {
    const k = a.kols[idx];
    const current = k.condition ?? k.conditions ?? "";
    const m = modal("KOL Conditions", "sticky_note_2", `<label class="flex flex-col gap-1">${lbl("เงื่อนไขเฉพาะ KOL คนนี้ (ถ้ามี)")}<textarea id="cd" rows="4" class="${inpCls}">${esc(current)}</textarea></label>`, `<button data-close class="ml-auto px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Cancel</button><button data-save class="px-md py-2 rounded-lg font-semibold bg-primary text-on-primary">Save</button>`);
    m.querySelector("[data-save]").addEventListener("click", async () => { const v = m.querySelector("#cd").value; k.condition = v; k.conditions = v; try { await saveKols(a, a.kols); m.remove(); renderKolTable(host, a, roster); } catch (e) { toast(e.message, "err"); } });
  }

  function openKolMediaModal(a, idx, roster, host) {
    const k = a.kols[idx]; k.media = k.media || [];
    const item = (md, j) => `<div class="flex items-center gap-sm border border-outline-variant rounded-lg p-sm">
      ${md.type === "video" ? `<span class="material-symbols-outlined text-primary">movie</span>` : md.type === "album" ? `<span class="material-symbols-outlined text-primary">photo_library</span>` : `<img src="${esc(mediaSrc(md.url || ""))}" class="kol-thumb"/>`}
      <span class="flex-1 text-[13px] truncate">${(md.type || "image").toUpperCase()}${md.type === "album" ? ` (${(md.urls || []).length} รูป)` : ""}</span>
      <button data-mdel="${j}" class="text-on-surface-variant hover:text-error"><span class="material-symbols-outlined text-[18px]">delete</span></button></div>`;
    const listHTML = () => k.media.length ? k.media.map(item).join("") : `<div class="text-[13px] text-on-surface-variant">ยังไม่มีสื่อ</div>`;
    const m = modal("KOL Media", "perm_media", `
      <label class="flex flex-col gap-1">${lbl("Caption / ข้อมูลโพสต์")}<textarea id="kcap" rows="3" class="${inpCls}" placeholder="ใส่แคปชั่น หรือ รายละเอียดเกี่ยวกับโพสต์...">${esc(k.caption || "")}</textarea></label>
      <div class="text-[12px] text-on-surface-variant">สื่อของ KOL — ภาพนิ่ง / อัลบัม / วิดีโอ</div>
      <div class="flex gap-sm flex-wrap">
        <button data-img class="px-md py-2 rounded-lg border border-outline-variant text-[13px] hover:bg-surface-container-low flex items-center gap-1"><span class="material-symbols-outlined text-[18px]">image</span>ภาพนิ่ง</button>
        <button data-album class="px-md py-2 rounded-lg border border-outline-variant text-[13px] hover:bg-surface-container-low flex items-center gap-1"><span class="material-symbols-outlined text-[18px]">photo_library</span>อัลบัม</button>
        <button data-video class="px-md py-2 rounded-lg border border-outline-variant text-[13px] hover:bg-surface-container-low flex items-center gap-1"><span class="material-symbols-outlined text-[18px]">movie</span>วิดีโอ</button>
      </div>
      <div id="ml" class="flex flex-col gap-sm">${listHTML()}</div>`, `<button data-close class="ml-auto px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Close</button>`);
    const refresh = () => { m.querySelector("#ml").innerHTML = listHTML(); wire(); };
    const wire = () => m.querySelectorAll("[data-mdel]").forEach((b) => b.addEventListener("click", async () => { k.media.splice(+b.getAttribute("data-mdel"), 1); await saveKols(a, a.kols); refresh(); renderKolTable(host, a, roster); }));
    const pick = (accept, multiple) => new Promise((res) => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = accept; if (multiple) inp.multiple = true; inp.onchange = async () => { const urls = []; for (const f of [...(inp.files || [])]) { try { const { url } = await uploadFile("/uploads/campaign-media", f); urls.push(url); } catch (e) { toast(e.message, "err"); } } res(urls); }; inp.click(); });
    m.querySelector("[data-img]").addEventListener("click", async () => { const u = await pick("image/png,image/jpeg,image/webp,image/gif", false); if (u[0]) { k.media.push({ type: "image", url: u[0] }); await saveKols(a, a.kols); refresh(); renderKolTable(host, a, roster); } });
    m.querySelector("[data-album]").addEventListener("click", async () => { const u = await pick("image/png,image/jpeg,image/webp,image/gif", true); if (u.length) { k.media.push({ type: "album", urls: u }); await saveKols(a, a.kols); refresh(); renderKolTable(host, a, roster); } });
    m.querySelector("[data-video]").addEventListener("click", async () => { const u = await pick("video/mp4,video/webm,video/quicktime", false); if (u[0]) { k.media.push({ type: "video", url: u[0] }); await saveKols(a, a.kols); refresh(); renderKolTable(host, a, roster); } });
    // Caption / post info — auto-saved (debounced) as the user types.
    let capTimer; m.querySelector("#kcap").addEventListener("input", (e) => { k.caption = e.target.value; clearTimeout(capTimer); capTimer = setTimeout(() => saveKols(a, a.kols).catch((err) => toast(err.message, "err")), 600); });
    wire();
  }

  function openSowModal(a) {
    const m = modal("Manage Scope of Work", "checklist", `
      <div class="flex gap-sm"><input id="son" class="${inpCls}" placeholder="เพิ่ม SOW เช่น VDO Review"/><button data-add class="px-md py-2 rounded-lg bg-primary text-on-primary shrink-0">เพิ่ม</button></div>
      <div id="sol" class="flex flex-col gap-1 mt-sm"></div>`, `<button data-close class="ml-auto px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Close</button>`);
    const listEl = m.querySelector("#sol");
    const save = (opts) => saveAsset(a.id, { sow_options: opts }, a);
    const refresh = () => {
      listEl.innerHTML = (a.sow_options || []).length ? (a.sow_options || []).map((o, i) => `<div class="flex items-center gap-sm py-1 border-b border-outline-variant/50"><span class="flex-1 text-[14px]">${esc(o)}</span><button data-del="${i}" class="text-on-surface-variant hover:text-error"><span class="material-symbols-outlined text-[18px]">delete</span></button></div>`).join("") : `<div class="text-[13px] text-on-surface-variant">ยังไม่มีรายการ</div>`;
      listEl.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => { a.sow_options.splice(+b.getAttribute("data-del"), 1); try { await save(a.sow_options); refresh(); } catch (e) { toast(e.message, "err"); } }));
    };
    m.querySelector("[data-add]").addEventListener("click", async () => { const v = m.querySelector("#son").value.trim(); if (!v) return; a.sow_options = [...(a.sow_options || []), v]; try { await save(a.sow_options); m.querySelector("#son").value = ""; refresh(); } catch (e) { toast(e.message, "err"); } });
    m.querySelector("[data-close]").addEventListener("click", () => render());
    refresh();
  }

  // ---- HTML report fragment (consumed by the core handoff report) ----
  async function reportHtml(a) {
    const roster = await CA.roster();
    const MON = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const d1 = (s) => { if (!s) return ""; const p = String(s).split("-"); return p.length < 3 ? esc(s) : `${+p[2]} ${MON[+p[1]] || ""}`; };
    const range = (k) => { const f = d1(k.period_from), t = d1(k.period_to); return f || t ? `${f || "…"} – ${t || "…"}` : "—"; };
    const nameOf = (k) => (roster.find((r) => r.id === k.influencer_id) || {}).name || k.name || ("#" + k.influencer_id);
    const tierR = (k) => (roster.find((r) => r.id === k.influencer_id) || {}).tier || k.tier || "";   // Directory tier
    const linkTxt = (u) => { u = (u || "").trim(); if (!u) return "—"; return `<a href="${esc(u)}" target="_blank" rel="noopener">เปิดโพสต์ ↗</a>`; };
    const kols = a.kols || [];
    const tot = (f) => kols.reduce((s, k) => s + (Number(k[f]) || 0), 0);
    const grand = tot("rate") + tot("gen_code_price") + tot("boosting_cost");
    const bshow = a.budget_show || {};
    const bvis = (f) => bshow[f] !== false;   // hidden figures don't go to the customer
    const TIER_ORDER = ["Mega", "Macro", "Mid-Tier", "Micro", "Nano"];
    const ordered = kols.map((k, i) => ({ k, i })).sort((x, y) => {
      const rank = (t) => { const ix = TIER_ORDER.indexOf(t || ""); return ix < 0 ? 99 : ix; };
      return rank(tierR(x.k)) - rank(tierR(y.k));
    });
    const rows = ordered.map(({ k }, n) => `<tr>
      <td class="c">${n + 1}</td><td class="c">${esc(k.month) || "—"}</td>
      <td class="c">${tierR(k) ? `<span class="tier t-${esc(tierR(k))}">${esc(tierR(k))}</span>` : "—"}</td>
      <td>${esc(k.kol_type) || "—"}</td><td class="b">${esc(nameOf(k))}</td>
      <td>${(k.sow || []).length ? (k.sow || []).map(esc).join(", ") : "—"}</td>
      <td>${esc(k.product_focus) || "—"}</td><td class="c">${esc(k.client_approved || "Pending")}</td>
      <td class="c">${esc(k.post_date) || "—"}</td><td>${linkTxt(k.link)}</td>
      <td class="n">${money(k.rate)}</td><td class="n">${money(k.gen_code_price)}</td><td class="n">${money(k.boosting_cost)}</td>
      <td class="c">${esc(k.objective) || "—"}</td><td class="c">${range(k)}</td>
      <td>${esc(k.conditions) || "—"}</td><td>${esc(k.caption) || "—"}</td></tr>`).join("");
    return `<h2><span class="em">B.</span>KOL Plan <span style="color:#8a8a8f;font-weight:600;font-size:13px">· ${kols.length} KOL</span></h2>
<div class="panel"><table><thead><tr>
<th>#</th><th>Month</th><th>Tier</th><th>Type</th><th>KOL</th><th>SOW</th><th>Product Focus</th><th>Approved</th><th>Post Date</th><th>Link</th><th class="n">ค่าตัว</th><th class="n">Gen Code</th><th class="n">Boosting</th><th>Obj.</th><th>Period</th><th>Conditions</th><th>Caption</th>
</tr></thead><tbody>${rows || `<tr><td colspan="17" class="c">ยังไม่มี KOL</td></tr>`}</tbody></table>
<div class="tot">
${bvis("rate") ? `<div class="item"><span class="l">ค่าตัว</span><span class="v">${money(tot("rate"))}</span></div>` : ""}
${bvis("gen_code_price") ? `<div class="item"><span class="l">Gen Code</span><span class="v">${money(tot("gen_code_price"))}</span></div>` : ""}
${bvis("boosting_cost") ? `<div class="item"><span class="l">Boosting</span><span class="v">${money(tot("boosting_cost"))}</span></div>` : ""}
${bvis("total") ? `<div class="item grand"><span class="l">Total Budget</span><span class="v">${money(grand)}</span></div>` : ""}
</div></div>`;
  }

  CA.register({
    id: "section-b",
    order: 2,
    letter: "B.",
    title: "KOL Plan",
    count: (a) => `${(a.kols || []).length} KOLS`,
    actions: (a) => [
      { icon: "checklist", label: "Manage SOW", onClick: () => openSowModal(a) },
      { icon: "upload_file", label: "นำเข้า Excel", onClick: () => openImportKolModal(a) },
      { icon: "person_add", label: "Assign KOL", gold: true, onClick: () => openAssignKolModal(a, lastRoster) },
    ],
    render: async (host, a) => { lastRoster = await CA.roster(); renderKolTable(host, a, lastRoster); },
    reportHtml,
  });
})();
