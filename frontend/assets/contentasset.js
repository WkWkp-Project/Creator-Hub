/* Content Asset Suite — campaign overview (editorial theme). Separate module,
 * registers routes via window.CH. Phase 1: overview (image A) + campaign list.
 * Add/Edit/Drive-link modals + member directory arrive in later phases. */
(() => {
  "use strict";
  const CH = window.CH;
  if (!CH) { console.error("contentasset.js: CH bridge missing"); return; }
  const { route, api, el, esc, toast, isAdmin, render, fmtNum } = CH;

  const NUM_COLORS = ["#2f5fd0", "#3a7d44", "#1a1a1a", "#c0552f"];
  const SRC_LABEL = { google_drive: "GOOGLE DRIVE", uploaded: "UPLOADED", notion: "NOTION", none: "—" };
  const STATUS_LABEL = { draft: "Draft", active: "Active", paused: "Paused", completed: "Completed" };
  const soon = (what) => toast(`${what} — มาในเฟสถัดไป`, "info");

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
  const memberName = (id) => { const m = members.find((x) => x.id === id); return m ? m.name : ""; };
  const adminMembers = () => members.filter((m) => m.role === "admin");

  // Editorial title treatment: highlight [bracketed] text + italicise the last word.
  function fancyTitle(name, emClass = "ca-em", itClass = "ca-it") {
    let html = esc(name).replace(/\[([^\]]+)\]/g, `<span class="${emClass}">[$1]</span>`);
    const parts = html.split(" ");
    if (parts.length > 1) parts[parts.length - 1] = `<span class="${itClass}">${parts[parts.length - 1]}</span>`;
    return parts.join(" ");
  }

  // ============================================================ LIST ROUTE ===
  route("assets", async (view) => {
    await loadDirectory();
    const data = await api("/assets");
    const wrap = el(`<div class="ca-root">
      <div class="ca-eyebrow">Content Creation Suite · Campaigns</div>
      <div class="ca-headrow">
        <h1 class="ca-title">Campaigns</h1>
        ${isAdmin() ? `<div class="ca-actions">
          <button class="ca-btn" data-brands><span class="material-symbols-outlined text-[18px]">sell</span>Manage Brands</button>
          <button class="ca-btn ca-btn-gold" data-new><span class="material-symbols-outlined text-[18px]">add</span>New Campaign</button>
        </div>` : ""}
      </div>
      <p class="ca-sub">จัดกลุ่มตามแบรนด์ · เลือกแคมเปญเพื่อดูโครงสร้างภายใน</p>
      <hr class="ca-rule"/>
      <div id="ca-groups"></div>
    </div>`);
    view.appendChild(wrap);

    const card = (a) => {
      const linked = (a.input_files || []).filter((f) => f.linked).length;
      const lead = memberName(a.responsible_member_id);
      const c = el(`<div class="ca-card" style="cursor:pointer">
        <div class="ca-card-head">
          <div class="ca-label">${esc(a.client_name || "—")}</div>
          <div class="ca-card-title" style="font-family:'Playfair Display',serif;font-size:19px;margin-top:6px">${fancyTitle(a.campaign_name)}</div>
          <div class="ca-synced" style="color:#9a9488;margin-top:8px">${esc(a.period_start)} → ${esc(a.period_end)}${lead ? " · 👤 " + esc(lead) : ""}</div>
        </div>
        <div class="ca-card-foot">
          <span class="ca-unlinked" style="font-family:'Space Mono',monospace;font-size:11px">${STATUS_LABEL[a.status] || a.status}</span>
          <span class="ca-linked">${linked} of ${(a.input_files || []).length} linked</span>
        </div>
      </div>`);
      c.addEventListener("click", () => (location.hash = `#/asset/${a.id}`));
      return c;
    };

    const groupsHost = wrap.querySelector("#ca-groups");
    if (!data.items.length) {
      groupsHost.innerHTML = `<div style="color:#9a9488">ยังไม่มีแคมเปญ</div>`;
    } else {
      // group by brand (brands in name order, then "No brand")
      const byBrand = new Map();
      data.items.forEach((a) => {
        const key = a.brand_id || 0;
        if (!byBrand.has(key)) byBrand.set(key, []);
        byBrand.get(key).push(a);
      });
      const orderedBrandIds = [...brands].sort((x, y) => x.name.localeCompare(y.name)).map((b) => b.id).filter((id) => byBrand.has(id));
      // append any remaining groups (no-brand + ids whose brand was deleted) so nothing is dropped
      [...byBrand.keys()].forEach((k) => { if (!orderedBrandIds.includes(k)) orderedBrandIds.push(k); });
      orderedBrandIds.forEach((bid) => {
        const heading = (bid && brandName(bid)) ? esc(brandName(bid)) : "No brand";
        const grp = el(`<div style="margin-bottom:28px">
          <div class="ca-sechead" style="margin:0 0 14px"><span class="ca-sectitle" style="font-size:20px">${heading}</span><span class="ca-linkcount">${byBrand.get(bid).length} CAMPAIGN${byBrand.get(bid).length > 1 ? "S" : ""}</span></div>
          <div class="ca-cards"></div></div>`);
        const cards = grp.querySelector(".ca-cards");
        byBrand.get(bid).forEach((a) => cards.appendChild(card(a)));
        groupsHost.appendChild(grp);
      });
    }
    wrap.querySelector("[data-new]")?.addEventListener("click", () => openAddModal());
    wrap.querySelector("[data-brands]")?.addEventListener("click", () => openBrandsModal());
  });

  // ======================================================== OVERVIEW ROUTE ===
  route("asset", async (view, id) => {
    const a = await api("/assets/" + id);
    await loadDirectory();
    const files = a.input_files || [];
    const brand = brandName(a.brand_id), lead = memberName(a.responsible_member_id);
    const linked = files.filter((f) => f.linked).length;
    const lastSaved = (() => { try { return new Date(a.updated_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }); } catch { return "—"; } })();

    const metaCell = (label, value) => `<div><div class="ca-label">${label}</div><div class="ca-meta-v">${value}</div></div>`;
    const cards = files.map((f, i) => {
      const color = NUM_COLORS[i % NUM_COLORS.length];
      const footRight = f.linked
        ? `<span class="ca-linked"><span class="material-symbols-outlined" style="font-size:16px">check</span>Linked</span>`
        : `<span class="ca-unlinked">Not linked</span>`;
      return `<div class="ca-card">
        <div class="ca-card-head">
          <span class="ca-num" style="background:${color}">${esc(f.n || String(i + 1).padStart(2, "0"))}</span>
          <div class="ca-card-title">${esc(f.title)}</div>
          <div class="ca-synced">SYNCED: ${esc(f.synced || "—")}</div>
          <span class="ca-src ca-src-${f.source || "none"}">${SRC_LABEL[f.source] || "—"}</span>
        </div>
        <div class="ca-thumb">
          <div class="ca-thumb-t">${fancyTitle(a.campaign_name)}</div>
          <div class="ca-thumb-cap">${esc(f.title)}</div>
        </div>
        <div class="ca-card-foot">
          <button class="ca-view" data-view="${esc(f.drive_url || "")}">View File</button>
          ${footRight}
        </div>
      </div>`;
    }).join("");

    const wrap = el(`<div class="ca-root">
      <div class="ca-eyebrow">Content Creation Suite · Campaign Overview</div>
      <div class="ca-headrow">
        <h1 class="ca-title">${fancyTitle(a.campaign_name)}</h1>
        ${isAdmin() ? `<div class="ca-actions">
          <button class="ca-btn" data-edit><span class="material-symbols-outlined text-[18px]">edit</span>Edit Info</button>
          <button class="ca-btn ca-btn-gold" data-handoff><span class="material-symbols-outlined text-[18px]">hexagon</span>Prepare Handoff</button>
        </div>` : ""}
      </div>
      <p class="ca-sub">รวบรวม assets, schedule, links — ทั้งหมดเชื่อมโยงกันในที่เดียว</p>
      ${(brand || lead) ? `<div class="ca-sub" style="margin-top:6px">${brand ? `🏷 <strong>${esc(brand)}</strong>` : ""}${brand && lead ? " · " : ""}${lead ? `👤 ผู้รับผิดชอบ: <strong>${esc(lead)}</strong>` : ""}</div>` : ""}
      <hr class="ca-rule"/>
      <div class="ca-meta">
        ${metaCell("Campaign", `<span style="font-family:'Playfair Display',serif">${fancyTitle(a.campaign_name)}</span>`)}
        ${metaCell("Client", esc(a.client_name || "—"))}
        ${metaCell("Period", `${esc(a.period_start || "—")} → ${esc(a.period_end || "—")}`)}
        ${metaCell("Status", `<span class="ca-chip">${(STATUS_LABEL[a.status] || a.status).toUpperCase()}</span>`)}
        ${metaCell("Last saved", lastSaved)}
      </div>
      <div class="ca-sechead">
        <span class="ca-secletter">A.</span>
        <span class="ca-sectitle">Approved Input Files</span>
        <span class="ca-linkcount">${linked} OF ${files.length} LINKED</span>
        ${isAdmin() ? `<button class="ca-btn" data-drive><span class="material-symbols-outlined text-[18px]">link</span>Connect Drive</button>` : ""}
      </div>
      <div class="ca-cards">${cards}</div>
      <div class="ca-sechead">
        <span class="ca-secletter">B.</span>
        <span class="ca-sectitle">Assigned Creators</span>
        <span class="ca-linkcount">${(a.influencer_ids || []).length} CREATORS</span>
        ${isAdmin() ? `<button class="ca-btn" data-creators><span class="material-symbols-outlined text-[18px]">group_add</span>Edit Creators</button>` : ""}
      </div>
      <div class="ca-cards" id="ca-creators"></div>
    </div>`);
    view.appendChild(wrap);

    // Assigned creators (merged from legacy Campaign) — resolve names from the roster.
    const creatorHost = wrap.querySelector("#ca-creators");
    let roster = [];
    try { roster = (await api("/influencers?limit=500")).items; } catch (_) {}
    const assigned = (a.influencer_ids || []).map((id) => roster.find((r) => r.id === id)).filter(Boolean);
    if (!assigned.length) {
      creatorHost.innerHTML = `<div style="color:#9a9488;grid-column:1/-1">ยังไม่ได้มอบหมายครีเอเตอร์</div>`;
    } else {
      assigned.forEach((inf) => creatorHost.appendChild(el(`
        <div class="ca-card"><div class="ca-card-head">
          <div class="ca-card-title">${esc(inf.name)}</div>
          <div class="ca-synced" style="color:#9a9488">${fmtNum(inf.followers)} followers · ${esc(inf.tier || "")}</div>
        </div></div>`)));
    }

    wrap.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
      const url = b.getAttribute("data-view");
      if (url) window.open(url, "_blank", "noopener");
      else toast("ยังไม่ได้ลิงก์ไฟล์นี้", "info");
    }));
    wrap.querySelector("[data-edit]")?.addEventListener("click", () => openEditModal(a));
    wrap.querySelector("[data-handoff]")?.addEventListener("click", () => soon("Prepare Handoff"));
    wrap.querySelector("[data-drive]")?.addEventListener("click", () => openDriveModal(a));
    wrap.querySelector("[data-creators]")?.addEventListener("click", () => openCreatorsModal(a, roster));
  });

  // ============================================================== MODALS ===
  async function openAddModal() {
    await loadDirectory();
    const u = CH.user || {};
    const m = modal("Add New Campaign", "note_add", `
      <div class="flex flex-col gap-1">${lbl("MEMBER · แคมเปญนี้จะอยู่ภายใต้ member คนนี้")}
        <div class="px-sm py-2 bg-surface-container rounded-lg text-[13px]" style="font-family:'Space Mono',monospace">${esc(u.full_name || u.username || "—")} · ${esc(u.username || "")}</div></div>
      <label class="flex flex-col gap-1">${lbl("Client Name (ชื่อบริษัทลูกค้า)")}<input id="ad-client" class="${inpCls}" placeholder="e.g. Ocean Bites Co., Ltd."/></label>
      <label class="flex flex-col gap-1">${lbl("Campaign Name *")}<input id="ad-camp" class="${inpCls}" placeholder="e.g. Songkran 2026"/></label>
      <div class="grid grid-cols-2 gap-sm">
        <label class="flex flex-col gap-1">${lbl("Brand")}<select id="ad-brand" class="${inpCls}"><option value="">— none —</option>${brands.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("")}</select></label>
        <label class="flex flex-col gap-1">${lbl("ผู้รับผิดชอบ (Lead)")}<select id="ad-resp" class="${inpCls}"><option value="">— none —</option>${adminMembers().map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select></label>
      </div>
      <label class="flex flex-col gap-1">${lbl("Client Drive Folder URL *")}<input id="ad-drive" class="${inpCls}" placeholder="https://drive.google.com/drive/folders/..."/>
        <small class="text-[11px] text-on-surface-variant">โฟลเดอร์ Drive ที่เก็บ JSON + media ของแคมเปญนี้ · กันข้อมูลข้ามกัน</small></label>
      <div class="grid grid-cols-2 gap-sm">
        <label class="flex flex-col gap-1">${lbl("Start Period")}<input id="ad-start" class="${inpCls}" placeholder="e.g. May 2026"/></label>
        <label class="flex flex-col gap-1">${lbl("End Period")}<input id="ad-end" class="${inpCls}" placeholder="e.g. Aug 2026"/></label>
      </div>`, `
      <button data-close class="ml-auto px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Cancel</button>
      <button data-save class="px-md py-2 rounded-lg font-semibold bg-primary text-on-primary hover:bg-primary-container">Create Campaign</button>`);
    m.querySelector("[data-save]").addEventListener("click", async () => {
      const campaign_name = m.querySelector("#ad-camp").value.trim();
      const drive = m.querySelector("#ad-drive").value.trim();
      if (!campaign_name) return toast("กรุณาใส่ Campaign Name", "err");
      if (!drive) return toast("Client Drive Folder URL จำเป็น", "err");
      try {
        const brandVal = m.querySelector("#ad-brand").value;
        const respVal = m.querySelector("#ad-resp").value;
        const created = await api("/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          owner_name: u.full_name || u.username || "", owner_email: u.username || "",
          client_name: m.querySelector("#ad-client").value.trim(), campaign_name, drive_folder_url: drive,
          period_start: m.querySelector("#ad-start").value.trim(), period_end: m.querySelector("#ad-end").value.trim(),
          brand_id: brandVal ? Number(brandVal) : null, responsible_member_id: respVal ? Number(respVal) : null,
        }) });
        toast("สร้างแคมเปญแล้ว"); m.remove(); location.hash = "#/asset/" + created.id;
      } catch (e) { toast(e.message, "err"); }
    });
  }

  async function openEditModal(a) {
    await loadDirectory();
    const m = modal("Edit Campaign Info", "edit", `
      <div class="grid grid-cols-2 gap-sm">
        <label class="flex flex-col gap-1">${lbl("Client Name *")}<input id="ed-client" class="${inpCls}" value="${esc(a.client_name || "")}"/></label>
        <label class="flex flex-col gap-1">${lbl("Campaign Name *")}<input id="ed-camp" class="${inpCls}" value="${esc(a.campaign_name || "")}"/></label>
      </div>
      <div class="grid grid-cols-2 gap-sm">
        <label class="flex flex-col gap-1">${lbl("Brand")}<select id="ed-brand" class="${inpCls}"><option value="">— none —</option>${brands.map((b) => `<option value="${b.id}" ${a.brand_id === b.id ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select></label>
        <label class="flex flex-col gap-1">${lbl("ผู้รับผิดชอบ (Lead)")}<select id="ed-resp" class="${inpCls}"><option value="">— none —</option>${adminMembers().map((x) => `<option value="${x.id}" ${a.responsible_member_id === x.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>
      </div>
      <div class="grid grid-cols-2 gap-sm">
        <label class="flex flex-col gap-1">${lbl("📅 Period Start")}<input id="ed-start" class="${inpCls}" value="${esc(a.period_start || "")}" placeholder="e.g. May 2026"/></label>
        <label class="flex flex-col gap-1">${lbl("Period End")}<input id="ed-end" class="${inpCls}" value="${esc(a.period_end || "")}" placeholder="e.g. Aug 2026"/></label>
      </div>
      <div class="grid grid-cols-2 gap-sm">
        <label class="flex flex-col gap-1">${lbl("Status")}<select id="ed-status" class="${inpCls}">${Object.keys(STATUS_LABEL).map((s) => `<option value="${s}" ${a.status === s ? "selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}</select></label>
        <label class="flex flex-col gap-1">${lbl("Tags / Keywords (comma-separated)")}<input id="ed-tags" class="${inpCls}" value="${esc(a.tags || "")}" placeholder="e.g. food, launch, q2"/></label>
      </div>
      <label class="flex flex-col gap-1">${lbl("📝 Description / Brief")}<textarea id="ed-desc" rows="5" class="${inpCls}" placeholder="วัตถุประสงค์, target audience, key messages, deliverables...">${esc(a.description || "")}</textarea><small id="ed-count" class="text-[11px] text-on-surface-variant"></small></label>
      <label class="flex flex-col gap-1">${lbl("👥 Stakeholders / Contacts (optional)")}<textarea id="ed-stake" rows="2" class="${inpCls}" placeholder="Account Director: ...&#10;Creative Lead: ...&#10;Client contact: ...">${esc(a.stakeholders || "")}</textarea></label>
      <div class="flex flex-col gap-1">${lbl("👤 Client (Member)")}<div class="px-sm py-2 bg-surface-container rounded-lg text-[12px]" style="font-family:'Space Mono',monospace">${esc(a.owner_name || "—")} · ${esc(a.owner_email || "")}</div>
        <small class="text-[11px] text-on-surface-variant">เปลี่ยน member ไม่ได้ — ให้ลบแล้วสร้างใหม่ใต้ member อื่น (กัน leak ข้ามลูกค้า)</small></div>
      <label class="flex flex-col gap-1">${lbl("📁 Client Drive Folder URL")}
        <div class="grid gap-sm" style="grid-template-columns:1fr auto"><input id="ed-drive" class="${inpCls}" value="${esc(a.drive_folder_url || "")}" placeholder="https://drive.google.com/drive/folders/..."/>
        <button type="button" data-open class="px-md py-2 rounded-lg border border-outline-variant text-[13px] hover:bg-surface-container-low">Open ↗</button></div>
        <small class="text-[11px] text-on-surface-variant">ระบบจะสร้าง subfolder <code>wakuwaku-media-${a.id}/</code> ในนั้นให้อัตโนมัติเมื่ออัปไฟล์ (เฟส Drive)</small></label>
    `, `
      <button data-reset class="px-md py-2 rounded-lg font-semibold border border-amber-500 text-amber-600 hover:bg-amber-50">🔄 Reset</button>
      <button data-del class="px-md py-2 rounded-lg font-semibold border border-error text-error hover:bg-error-container/40">🗑 Delete</button>
      <button data-close class="ml-auto px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Cancel</button>
      <button data-save class="px-md py-2 rounded-lg font-semibold bg-primary text-on-primary hover:bg-primary-container">💾 Save Changes</button>
    `);
    const desc = m.querySelector("#ed-desc"), count = m.querySelector("#ed-count");
    const upd = () => { count.textContent = `${desc.value.length} ตัวอักษร`; };
    desc.addEventListener("input", upd); upd();
    m.querySelector("[data-open]").addEventListener("click", () => { const u = m.querySelector("#ed-drive").value.trim(); if (u) window.open(u, "_blank", "noopener"); });
    m.querySelector("[data-save]").addEventListener("click", async () => {
      const campaign_name = m.querySelector("#ed-camp").value.trim();
      if (!campaign_name) return toast("Campaign Name จำเป็น", "err");
      try {
        const brandVal = m.querySelector("#ed-brand").value;
        const respVal = m.querySelector("#ed-resp").value;
        await api("/assets/" + a.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          client_name: m.querySelector("#ed-client").value.trim(), campaign_name,
          period_start: m.querySelector("#ed-start").value.trim(), period_end: m.querySelector("#ed-end").value.trim(),
          status: m.querySelector("#ed-status").value, tags: m.querySelector("#ed-tags").value.trim(),
          description: desc.value, stakeholders: m.querySelector("#ed-stake").value,
          drive_folder_url: m.querySelector("#ed-drive").value.trim(),
          brand_id: brandVal ? Number(brandVal) : null, responsible_member_id: respVal ? Number(respVal) : null,
        }) });
        toast("บันทึกแล้ว"); m.remove(); render();
      } catch (e) { toast(e.message, "err"); }
    });
    m.querySelector("[data-reset]").addEventListener("click", async () => {
      if (!confirm("Reset แคมเปญ? (ล้าง brief/tags/stakeholders, สถานะ→draft, ยกเลิกลิงก์ไฟล์ทั้งหมด — ชื่อยังอยู่)")) return;
      const files = (a.input_files || []).map((f) => ({ ...f, drive_url: "", linked: false }));
      try {
        await api("/assets/" + a.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          status: "draft", tags: "", description: "", stakeholders: "", input_files: files }) });
        toast("รีเซ็ตแล้ว"); m.remove(); render();
      } catch (e) { toast(e.message, "err"); }
    });
    m.querySelector("[data-del]").addEventListener("click", async () => {
      if (!confirm(`ลบแคมเปญ "${a.campaign_name}"? (ลบถาวร)`)) return;
      try { await api("/assets/" + a.id, { method: "DELETE" }); toast("ลบแล้ว"); m.remove(); location.hash = "#/assets"; }
      catch (e) { toast(e.message, "err"); }
    });
  }

  function openDriveModal(a) {
    const files = a.input_files || [];
    const body = files.map((f, i) => `<label class="flex flex-col gap-1">${lbl(`${f.n || String(i + 1).padStart(2, "0")} - ${esc(f.title)}`)}<input data-link="${esc(f.key)}" class="${inpCls}" value="${esc(f.drive_url || "")}" placeholder="https://drive.google.com/drive/folders/..."/></label>`).join("");
    const m = modal("Update Drive Links", "link", body, `
      <button data-close class="ml-auto px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Cancel</button>
      <button data-save class="px-md py-2 rounded-lg font-semibold bg-primary text-on-primary hover:bg-primary-container">Save Links</button>`);
    m.querySelector("[data-save]").addEventListener("click", async () => {
      const links = {};
      m.querySelectorAll("[data-link]").forEach((inp) => { links[inp.getAttribute("data-link")] = inp.value.trim(); });
      try { await api("/assets/" + a.id + "/drive-links", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(links) }); toast("บันทึกลิงก์แล้ว"); m.remove(); render(); }
      catch (e) { toast(e.message, "err"); }
    });
  }

  function openCreatorsModal(a, roster) {
    const assigned = new Set(a.influencer_ids || []);
    const body = `<div class="text-[12px] text-on-surface-variant">เลือกครีเอเตอร์ที่มอบหมายให้แคมเปญนี้ (จาก Directory)</div>
      <div class="max-h-72 overflow-y-auto border border-outline-variant rounded-lg p-sm grid grid-cols-1 sm:grid-cols-2 gap-1">
      ${(roster || []).map((i) => `<label class="flex items-center gap-sm px-sm py-1 rounded hover:bg-surface-container-low cursor-pointer text-[14px]"><input type="checkbox" class="cr rounded text-primary focus:ring-primary" value="${i.id}" ${assigned.has(i.id) ? "checked" : ""}/><span class="truncate">${esc(i.name)} <span class="text-on-surface-variant">· ${fmtNum(i.followers)}</span></span></label>`).join("")}</div>`;
    const m = modal("Assign Creators", "group_add", body, `
      <button data-close class="ml-auto px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Cancel</button>
      <button data-save class="px-md py-2 rounded-lg font-semibold bg-primary text-on-primary hover:bg-primary-container">Save</button>`);
    m.querySelector("[data-save]").addEventListener("click", async () => {
      const ids = [...m.querySelectorAll(".cr:checked")].map((c) => parseInt(c.value));
      try { await api("/assets/" + a.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ influencer_ids: ids }) }); toast("บันทึกครีเอเตอร์แล้ว"); m.remove(); render(); }
      catch (e) { toast(e.message, "err"); }
    });
  }

  function openBrandsModal() {
    const m = modal("Manage Brands", "sell", `
      <div class="flex gap-sm"><input id="br-new" class="${inpCls}" placeholder="ชื่อแบรนด์ใหม่"/><button data-add class="px-md py-2 rounded-lg font-semibold bg-primary text-on-primary hover:bg-primary-container shrink-0">เพิ่ม</button></div>
      <div id="br-list" class="flex flex-col gap-1 mt-sm"></div>`, `
      <button data-close class="ml-auto px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Close</button>`);
    const listEl = m.querySelector("#br-list");
    const refresh = async () => {
      brands = await api("/brands");
      listEl.innerHTML = brands.length
        ? brands.map((b) => `<div class="flex items-center gap-sm py-1 border-b border-outline-variant/50" data-id="${b.id}"><span class="flex-1">${esc(b.name)}</span><button data-del class="text-on-surface-variant hover:text-error" title="ลบ"><span class="material-symbols-outlined text-[18px]">delete</span></button></div>`).join("")
        : `<div class="text-[13px] text-on-surface-variant">ยังไม่มีแบรนด์</div>`;
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
})();
