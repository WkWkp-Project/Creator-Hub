/* Content Asset Suite — campaign overview (editorial theme). Separate module,
 * registers routes via window.CH. Phase 1: overview (image A) + campaign list.
 * Add/Edit/Drive-link modals + member directory arrive in later phases. */
(() => {
  "use strict";
  const CH = window.CH;
  if (!CH) { console.error("contentasset.js: CH bridge missing"); return; }
  const { route, api, el, esc, toast, isAdmin, render, fmtNum, uploadFile, mediaSrc } = CH;

  const NUM_COLORS = ["#2f5fd0", "#3a7d44", "#1a1a1a", "#c0552f"];
  const SRC_LABEL = { google_drive: "GOOGLE DRIVE", uploaded: "UPLOADED", notion: "NOTION", none: "—" };
  const STATUS_LABEL = { draft: "Draft", active: "Active", paused: "Paused", completed: "Completed" };
  const soon = (what) => toast(`${what} — มาในเฟสถัดไป`, "info");

  // Section A is a fixed 3-slot template; stored input_files fill each slot in order.
  const SECTION_A_TITLES = ["Product Information", "KOL Plan", "KOL Brief"];
  const sectionAFiles = (a) => SECTION_A_TITLES.map((title, i) => ({
    ...((a.input_files || [])[i] || {}), title, n: String(i + 1).padStart(2, "0"),
  }));

  // Persist a cover thumbnail onto one input-file slot (sends the full array).
  async function saveSlotThumb(a, slotIndex, thumbUrl) {
    const inputFiles = (a.input_files || []).map((f) => ({ ...f }));
    while (inputFiles.length <= slotIndex) inputFiles.push({ key: "slot_" + inputFiles.length, linked: false });
    inputFiles[slotIndex].thumb = thumbUrl;
    await api("/assets/" + a.id, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input_files: inputFiles }),
    });
  }

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
      <div class="ca-headrow">
        <h1 class="ca-title">Campaigns</h1>
        ${isAdmin() ? `<div class="ca-actions">
          <button class="ca-btn" data-brands><span class="material-symbols-outlined text-[18px]">sell</span>Manage Brands</button>
          <button class="ca-btn ca-btn-gold" data-new><span class="material-symbols-outlined text-[18px]">add</span>New Campaign</button>
        </div>` : ""}
      </div>
      <div class="ca-tabs" id="ca-tabs"></div>
      <div id="ca-groups"></div>
    </div>`);
    view.appendChild(wrap);

    const card = (a) => {
      const slots = sectionAFiles(a);
      const linked = slots.filter((f) => f.linked).length;
      const lead = memberName(a.responsible_member_id);
      const c = el(`<div class="ca-card" style="cursor:pointer">
        <div class="ca-card-head">
          <div class="ca-label">${esc(a.client_name || "—")}</div>
          <div class="ca-card-title" style="font-family:'Poppins','Prompt',sans-serif;font-size:19px;margin-top:6px">${fancyTitle(a.campaign_name)}</div>
          <div class="ca-synced" style="color:#9a9488;margin-top:8px">${esc(a.period_start)} → ${esc(a.period_end)}${lead ? " · 👤 " + esc(lead) : ""}</div>
        </div>
        <div class="ca-card-foot">
          <span class="ca-unlinked" style="font-family:'Prompt','Poppins',sans-serif;font-size:11px">${STATUS_LABEL[a.status] || a.status}</span>
          <span class="ca-linked">${linked} of ${slots.length} linked</span>
        </div>
      </div>`);
      c.addEventListener("click", () => (location.hash = `#/asset/${a.id}`));
      return c;
    };

    const groupsHost = wrap.querySelector("#ca-groups");
    const tabsHost = wrap.querySelector("#ca-tabs");

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

    const renderGroups = (filterId) => {
      groupsHost.innerHTML = "";
      if (!data.items.length) { groupsHost.innerHTML = `<div style="color:#9a9488">ยังไม่มีแคมเปญ</div>`; return; }
      const ids = filterId === "all" ? orderedBrandIds : orderedBrandIds.filter((id) => String(id) === String(filterId));
      ids.forEach((bid) => {
        const heading = (bid && brandName(bid)) ? esc(brandName(bid)) : "No brand";
        const logo = bid && brandLogo(bid);
        const grp = el(`<div style="margin-bottom:28px">
          <div class="ca-sechead" style="margin:0 0 14px">${logo ? `<img class="ca-brand-logo" src="${esc(mediaSrc(logo))}" alt=""/>` : ""}<span class="ca-sectitle" style="font-size:20px">${heading}</span><span class="ca-linkcount">${byBrand.get(bid).length} CAMPAIGN${byBrand.get(bid).length > 1 ? "S" : ""}</span></div>
          <div class="ca-cards"></div></div>`);
        const cards = grp.querySelector(".ca-cards");
        byBrand.get(bid).forEach((a) => cards.appendChild(card(a)));
        groupsHost.appendChild(grp);
      });
    };

    // brand tabs ("ทั้งหมด" + one per brand)
    const tabDefs = [{ id: "all", name: "ทั้งหมด", logo: "", count: data.items.length }].concat(
      orderedBrandIds.map((bid) => ({ id: String(bid), name: (bid && brandName(bid)) || "No brand", logo: bid && brandLogo(bid), count: byBrand.get(bid).length }))
    );
    let activeTab = "all";
    const filterBar = el(`<div class="ca-filter">
      <span class="ca-filter-label"><span class="material-symbols-outlined text-[18px]">sell</span>แบรนด์</span>
      <select class="ca-brand-select">${tabDefs.map((t) => `<option value="${t.id}">${esc(t.name)} (${t.count})</option>`).join("")}</select>
    </div>`);
    const sel = filterBar.querySelector("select");
    sel.value = activeTab;
    sel.addEventListener("change", () => { activeTab = sel.value; renderGroups(activeTab); });
    tabsHost.appendChild(filterBar);
    renderGroups(activeTab);
    wrap.querySelector("[data-new]")?.addEventListener("click", () => openAddModal());
    wrap.querySelector("[data-brands]")?.addEventListener("click", () => openBrandsModal());
  });

  // ======================================================== OVERVIEW ROUTE ===
  route("asset", async (view, id) => {
    const a = await api("/assets/" + id);
    await loadDirectory();
    const files = sectionAFiles(a);
    const brand = brandName(a.brand_id), lead = memberName(a.responsible_member_id);
    const linked = files.filter((f) => f.linked).length;
    const lastSaved = (() => { try { return new Date(a.updated_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }); } catch { return "—"; } })();

    const summaryItem = (label, value) => `<div class="ca-summary-item"><div class="ca-label">${label}</div><div class="ca-summary-v">${value}</div></div>`;
    const cards = files.map((f, i) => {
      const color = NUM_COLORS[i % NUM_COLORS.length];
      const thumbSrc = f.thumb ? mediaSrc(f.thumb) : "";
      const thumbInner = thumbSrc
        ? `<img class="ca-thumb-img" src="${esc(thumbSrc)}" alt="${esc(f.title)}"/>
           ${isAdmin() ? `<div class="ca-thumb-actions">
             <button class="ca-thumb-btn" data-change="${i}" title="เปลี่ยนรูป"><span class="material-symbols-outlined" style="font-size:16px">photo_camera</span></button>
             <button class="ca-thumb-btn" data-remove="${i}" title="ลบรูป"><span class="material-symbols-outlined" style="font-size:16px">delete</span></button>
           </div>` : ""}`
        : `<div class="ca-thumb-empty">
             <span class="material-symbols-outlined" style="font-size:30px">add_photo_alternate</span>
             <div class="ca-thumb-hint">${isAdmin() ? "อัปโหลดรูปหน้าปก" : "ยังไม่มีรูปหน้าปก"}</div>
             <div class="ca-thumb-dim">อัตราส่วน 16:9 · แนะนำ 1280×720px · JPG/PNG/WebP</div>
             ${isAdmin() ? `<button class="ca-thumb-up" data-up="${i}"><span class="material-symbols-outlined" style="font-size:16px">upload</span>เลือกรูป</button>` : ""}
           </div>`;
      return `<div class="ca-card">
        <div class="ca-card-head">
          <span class="ca-num" style="background:${color}">${esc(f.n || String(i + 1).padStart(2, "0"))}</span>
          <div class="ca-card-title">${esc(f.title)}</div>
          <div class="ca-synced">SYNCED: ${esc(f.synced || "—")}</div>
          <span class="ca-src ca-src-${f.source || "none"}">${SRC_LABEL[f.source] || "—"}</span>
        </div>
        <div class="ca-thumb${thumbSrc ? " has-img" : ""}" data-slot="${i}">${thumbInner}</div>
        <div class="ca-foot-2">
          <span class="ca-status ${f.linked ? "is-linked" : "is-unlinked"}"><span class="material-symbols-outlined" style="font-size:15px">${f.linked ? "check_circle" : "radio_button_unchecked"}</span>${f.linked ? "Linked" : "Not linked"}</span>
          <button class="ca-viewbtn" data-view="${esc(f.drive_url || "")}"><span class="material-symbols-outlined" style="font-size:16px">open_in_new</span>View File</button>
        </div>
      </div>`;
    }).join("");

    const wrap = el(`<div class="ca-root">
      <button class="ca-back" data-back><span class="material-symbols-outlined text-[18px]">arrow_back</span>กลับไปหน้า Campaigns</button>
      <div class="ca-overhead">
        <h1 class="ca-title">${fancyTitle(a.campaign_name)}</h1>
        ${isAdmin() ? `<div class="ca-actions">
          <button class="ca-btn" data-edit><span class="material-symbols-outlined text-[18px]">edit</span>Edit Info</button>
          <button class="ca-btn ca-btn-gold" data-handoff><span class="material-symbols-outlined text-[18px]">hexagon</span>Prepare Handoff</button>
        </div>` : ""}
      </div>
      <div class="ca-summary">
        ${summaryItem("Company", esc(a.client_name || "—"))}
        ${summaryItem("Brand", brand ? esc(brand) : "—")}
        ${summaryItem("Lead", lead ? esc(lead) : "—")}
        ${summaryItem("Period", `${esc(a.period_start || "—")} → ${esc(a.period_end || "—")}`)}
        ${summaryItem("Status", `<span class="ca-chip">${(STATUS_LABEL[a.status] || a.status).toUpperCase()}</span>`)}
        ${summaryItem("Last saved", lastSaved)}
      </div>
      <div class="ca-sechead">
        <span class="ca-secletter">A.</span>
        <span class="ca-sectitle">Approved Input Files</span>
        <span class="ca-linkcount">${linked} OF ${files.length} LINKED</span>
        ${isAdmin() ? `<button class="ca-btn" data-drive><span class="material-symbols-outlined text-[18px]">link</span>Connect Drive</button>` : ""}
      </div>
      <div class="ca-cards ca-cards-3">${cards}</div>
      <div class="ca-sechead">
        <span class="ca-secletter">B.</span>
        <span class="ca-sectitle">KOL Plan</span>
        <span class="ca-linkcount">${(a.kols || []).length} KOLS</span>
        ${isAdmin() ? `<button class="ca-btn" data-sow><span class="material-symbols-outlined text-[18px]">checklist</span>Manage SOW</button>
        <button class="ca-btn ca-btn-gold" data-assign><span class="material-symbols-outlined text-[18px]">person_add</span>Assign KOL</button>` : ""}
      </div>
      <div id="ca-kol"></div>
    </div>`);
    view.appendChild(wrap);

    // KOL plan table (creators pulled from the directory).
    let roster = [];
    try { roster = (await api("/influencers?limit=200")).items; } catch (_) {}
    renderKolTable(wrap.querySelector("#ca-kol"), a, roster);

    wrap.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
      const url = b.getAttribute("data-view");
      if (url) window.open(url, "_blank", "noopener");
      else toast("ยังไม่ได้ลิงก์ไฟล์นี้", "info");
    }));

    // Thumbnail upload / change / delete (admin only).
    const pickThumb = (slotIndex) => {
      const inp = document.createElement("input");
      inp.type = "file"; inp.accept = "image/png,image/jpeg,image/webp,image/gif";
      inp.addEventListener("change", async () => {
        const file = inp.files && inp.files[0];
        if (!file) return;
        try {
          const { url } = await uploadFile("/uploads/campaign-media", file);
          await saveSlotThumb(a, slotIndex, url);
          toast("อัปโหลดรูปหน้าปกแล้ว"); render();
        } catch (e) { toast(e.message, "err"); }
      });
      inp.click();
    };
    wrap.querySelectorAll("[data-up]").forEach((b) => b.addEventListener("click", () => pickThumb(+b.getAttribute("data-up"))));
    wrap.querySelectorAll("[data-change]").forEach((b) => b.addEventListener("click", () => pickThumb(+b.getAttribute("data-change"))));
    wrap.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("ลบรูปหน้าปกนี้?")) return;
      try { await saveSlotThumb(a, +b.getAttribute("data-remove"), ""); toast("ลบรูปแล้ว"); render(); }
      catch (e) { toast(e.message, "err"); }
    }));

    wrap.querySelector("[data-back]")?.addEventListener("click", () => (location.hash = "#/assets"));
    wrap.querySelector("[data-edit]")?.addEventListener("click", () => openEditModal(a));
    wrap.querySelector("[data-handoff]")?.addEventListener("click", () => openHandoffModal(a));
    wrap.querySelector("[data-drive]")?.addEventListener("click", () => openDriveModal(a));
    wrap.querySelector("[data-assign]")?.addEventListener("click", () => openAssignKolModal(a, roster));
    wrap.querySelector("[data-sow]")?.addEventListener("click", () => openSowModal(a));
  });

  // ============================================================== MODALS ===
  async function openAddModal() {
    await loadDirectory();
    const u = CH.user || {};
    const m = modal("Add New Campaign", "note_add", `
      <div class="flex flex-col gap-1">${lbl("MEMBER · แคมเปญนี้จะอยู่ภายใต้ member คนนี้")}
        <div class="px-sm py-2 bg-surface-container rounded-lg text-[13px]" style="font-family:'Prompt','Poppins',sans-serif">${esc(u.full_name || u.username || "—")} · ${esc(u.username || "")}</div></div>
      <div class="grid grid-cols-2 gap-sm">
        <label class="flex flex-col gap-1">${lbl("Company Name (ชื่อบริษัทลูกค้า)")}<input id="ad-client" class="${inpCls}" placeholder="e.g. Ocean Bites Co., Ltd."/></label>
        <label class="flex flex-col gap-1">${lbl("Brand")}<select id="ad-brand" class="${inpCls}"><option value="">— none —</option>${brands.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("")}</select></label>
      </div>
      <div class="grid grid-cols-2 gap-sm">
        <label class="flex flex-col gap-1">${lbl("Campaign Name *")}<input id="ad-camp" class="${inpCls}" placeholder="e.g. Songkran 2026"/></label>
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
      <div class="grid grid-cols-2 gap-sm">
        <label class="flex flex-col gap-1">${lbl("Campaign Name *")}<input id="ed-camp" class="${inpCls}" value="${esc(a.campaign_name || "")}"/></label>
        <label class="flex flex-col gap-1">${lbl("ผู้รับผิดชอบ (Lead)")}<select id="ed-resp" class="${inpCls}"><option value="">— none —</option>${adminMembers().map((x) => `<option value="${x.id}" ${a.responsible_member_id === x.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>
      </div>
      <div class="grid grid-cols-2 gap-sm">
        <label class="flex flex-col gap-1">${lbl("📅 Period Start")}<input id="ed-start" class="${inpCls}" value="${esc(a.period_start || "")}" placeholder="e.g. May 2026"/></label>
        <label class="flex flex-col gap-1">${lbl("Period End")}<input id="ed-end" class="${inpCls}" value="${esc(a.period_end || "")}" placeholder="e.g. Aug 2026"/></label>
      </div>
      <label class="flex flex-col gap-1">${lbl("Status")}<select id="ed-status" class="${inpCls}">${Object.keys(STATUS_LABEL).map((s) => `<option value="${s}" ${a.status === s ? "selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}</select></label>
      <label class="flex flex-col gap-1">${lbl("📝 Description / Brief")}<textarea id="ed-desc" rows="5" class="${inpCls}" placeholder="วัตถุประสงค์, target audience, key messages, deliverables...">${esc(a.description || "")}</textarea><small id="ed-count" class="text-[11px] text-on-surface-variant"></small></label>
      <label class="flex flex-col gap-1">${lbl("👥 Stakeholders / Contacts (optional)")}<textarea id="ed-stake" rows="2" class="${inpCls}" placeholder="Account Director: ...&#10;Creative Lead: ...&#10;Client contact: ...">${esc(a.stakeholders || "")}</textarea></label>
      <div class="flex flex-col gap-1">${lbl("👤 Client (Member)")}<div class="px-sm py-2 bg-surface-container rounded-lg text-[12px] flex items-center justify-between gap-sm"><span class="truncate" style="font-family:'Prompt','Poppins',sans-serif">${esc(a.owner_name || "—")} · ${esc(a.owner_email || "")}</span>${ownerRoleBadge}</div>
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
          status: m.querySelector("#ed-status").value,
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
      <button data-finalize class="px-md py-2 rounded-lg font-semibold text-white" style="background:#b8924f">📦 Finalize &amp; Hand Off</button>`;

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
        let roster = [];
        try { roster = (await api("/influencers?limit=200")).items; } catch (_) {}
        download(buildReportHtml(a, files, brand, roster), "text/html;charset=utf-8", folder + "-report.html");
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

  // Self-contained, client-shareable HTML report of the campaign + KOL plan.
  function buildReportHtml(a, files, brand, roster) {
    const e = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const baht = (n) => "฿" + (Number(n) || 0).toLocaleString("en-US");
    const MON = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const d1 = (s) => { if (!s) return ""; const p = String(s).split("-"); return p.length < 3 ? e(s) : `${+p[2]} ${MON[+p[1]] || ""}`; };
    const range = (k) => { const f = d1(k.period_from), t = d1(k.period_to); return f || t ? `${f || "…"} – ${t || "…"}` : "—"; };
    const nameOf = (k) => (roster.find((r) => r.id === k.influencer_id) || {}).name || k.name || ("#" + k.influencer_id);
    const linkTxt = (u) => { u = (u || "").trim(); if (!u) return "—"; return `<a href="${e(u)}" target="_blank" rel="noopener">เปิดโพสต์ ↗</a>`; };
    const kols = (a.kols || []);
    const tot = (f) => kols.reduce((s, k) => s + (Number(k[f]) || 0), 0);
    const grand = tot("rate") + tot("gen_code_price") + tot("boosting_cost");
    const TIER_ORDER = ["Mega", "Micro", "Nano"];
    const ordered = kols.map((k, i) => ({ k, i })).sort((x, y) => {
      const rank = (t) => { const ix = TIER_ORDER.indexOf(t || ""); return ix < 0 ? 99 : ix; };
      return rank(x.k.tier) - rank(y.k.tier);
    });
    const rows = ordered.map(({ k }, n) => `<tr>
      <td class="c">${n + 1}</td><td class="c">${e(k.month) || "—"}</td>
      <td class="c">${k.tier ? `<span class="tier t-${e(k.tier)}">${e(k.tier)}</span>` : "—"}</td>
      <td>${e(k.kol_type) || "—"}</td><td class="b">${e(nameOf(k))}</td>
      <td>${(k.sow || []).length ? (k.sow || []).map(e).join(", ") : "—"}</td>
      <td>${e(k.product_focus) || "—"}</td><td class="c">${e(k.client_approved || "Pending")}</td>
      <td class="c">${e(k.post_date) || "—"}</td><td>${linkTxt(k.link)}</td>
      <td class="n">${baht(k.rate)}</td><td class="n">${baht(k.gen_code_price)}</td><td class="n">${baht(k.boosting_cost)}</td>
      <td class="c">${e(k.objective) || "—"}</td><td class="c">${range(k)}</td>
      <td>${e(k.conditions) || "—"}</td><td>${e(k.caption) || "—"}</td></tr>`).join("");
    const fileRows = files.map((f) => `<tr><td class="b">${e(f.title)}</td><td>${f.linked ? "✅ Linked" : "⬜ Not linked"}</td><td>${f.drive_url ? `<a href="${e(f.drive_url)}" target="_blank" rel="noopener">เปิด ↗</a>` : "—"}</td></tr>`).join("");
    const meta = [["Client", a.client_name], ["Brand", brand || "—"], ["Period", `${a.period_start || "—"} → ${a.period_end || "—"}`], ["Status", (a.status || "draft").toUpperCase()]];
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${e(a.campaign_name)} — KOL Plan</title>
<link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600;700;800&family=Poppins:wght@600;700;800&display=swap" rel="stylesheet"/>
<style>
:root{--ink:#1a1a1a;--mut:#6b6457;--line:#e9e3d6;--gold:#b8924f;--bg:#faf8f3;}
*{box-sizing:border-box;}
body{margin:0;background:var(--bg);color:var(--ink);font-family:'Prompt','Poppins',system-ui,sans-serif;padding:40px;}
.wrap{max-width:1200px;margin:0 auto;}
h1{font-family:'Poppins','Prompt',sans-serif;font-size:30px;font-weight:800;margin:0 0 4px;}
.sub{color:var(--mut);font-size:14px;margin-bottom:24px;}
.meta{display:flex;flex-wrap:wrap;gap:14px 40px;padding:18px 22px;background:#fff;border:1px solid var(--line);border-radius:14px;margin-bottom:30px;}
.meta div{display:flex;flex-direction:column;gap:3px;}
.meta .l{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#9a9488;font-weight:600;}
.meta .v{font-size:15px;font-weight:600;}
h2{font-family:'Poppins','Prompt',sans-serif;font-size:18px;font-weight:700;margin:28px 0 12px;}
h2 .em{color:var(--gold);font-style:italic;margin-right:6px;}
.panel{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;}
table{border-collapse:collapse;width:100%;font-size:12.5px;}
th{background:#faf8f3;text-align:left;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#9a9488;font-weight:700;padding:11px 10px;border-bottom:1px solid var(--line);white-space:nowrap;}
td{padding:9px 10px;border-bottom:1px solid #f1ede4;vertical-align:top;}
tr:last-child td{border-bottom:0;}
.c{text-align:center;white-space:nowrap;}.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;}.b{font-weight:700;}
a{color:#0058be;text-decoration:none;}a:hover{text-decoration:underline;}
.tier{display:inline-block;font-weight:700;font-size:11px;padding:3px 8px;border-radius:999px;}
.t-Nano{background:#e7eefe;color:#0058be;}.t-Micro{background:#fff0d6;color:#9a6700;}.t-Mega{background:#ffd9e2;color:#b90538;}
.tot{display:flex;flex-wrap:wrap;gap:28px;justify-content:flex-end;align-items:center;padding:16px 22px;border-top:1px solid #f1ede4;background:#fdfcf9;}
.tot .item{display:flex;flex-direction:column;gap:2px;text-align:right;}
.tot .l{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#9a9488;font-weight:600;}
.tot .v{font-size:16px;font-weight:700;font-family:'Poppins','Prompt',sans-serif;}
.tot .grand{padding-left:28px;border-left:1px solid var(--line);}
.tot .grand .l{color:#b08a4a;}.tot .grand .v{font-size:22px;font-weight:800;color:var(--gold);}
.foot{margin-top:26px;color:#9a9488;font-size:11px;text-align:center;}
@media print{body{padding:0;background:#fff;}.panel,.meta{box-shadow:none;}}
</style></head><body><div class="wrap">
<h1>${e(a.campaign_name)}</h1>
<div class="sub">KOL Plan Report${a.client_name ? " · " + e(a.client_name) : ""}</div>
<div class="meta">${meta.map(([l, v]) => `<div><span class="l">${e(l)}</span><span class="v">${e(v || "—")}</span></div>`).join("")}</div>
<h2><span class="em">A.</span>Approved Input Files</h2>
<div class="panel"><table><thead><tr><th>File</th><th>Status</th><th>Link</th></tr></thead><tbody>${fileRows || `<tr><td colspan="3">—</td></tr>`}</tbody></table></div>
<h2><span class="em">B.</span>KOL Plan <span style="color:#9a9488;font-weight:600;font-size:13px">· ${kols.length} KOL</span></h2>
<div class="panel"><table><thead><tr>
<th>#</th><th>Month</th><th>Tier</th><th>Type</th><th>KOL</th><th>SOW</th><th>Product Focus</th><th>Approved</th><th>Post Date</th><th>Link</th><th class="n">ค่าตัว</th><th class="n">Gen Code</th><th class="n">Boosting</th><th>Obj.</th><th>Period</th><th>Conditions</th><th>Caption</th>
</tr></thead><tbody>${rows || `<tr><td colspan="17" class="c">ยังไม่มี KOL</td></tr>`}</tbody></table>
<div class="tot">
<div class="item"><span class="l">ค่าตัว</span><span class="v">${baht(tot("rate"))}</span></div>
<div class="item"><span class="l">Gen Code</span><span class="v">${baht(tot("gen_code_price"))}</span></div>
<div class="item"><span class="l">Boosting</span><span class="v">${baht(tot("boosting_cost"))}</span></div>
<div class="item grand"><span class="l">Total Budget</span><span class="v">${baht(grand)}</span></div>
</div></div>
<div class="foot">Generated by Creator Hub · ${e(a.campaign_name)}</div>
</div></body></html>`;
  }

  function openDriveModal(a) {
    const files = sectionAFiles(a).filter((f) => f.key);
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

  // ====================================================== KOL PLAN (Section B) ===
  const money = (n) => "฿" + (Number(n) || 0).toLocaleString("en-US");

  async function saveKols(a, kols) {
    a.kols = kols;
    await api("/assets/" + a.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kols }) });
  }

  function renderKolTable(host, a, roster) {
    const admin = isAdmin();
    const kols = a.kols || [];
    const inf = (id) => roster.find((r) => r.id === id) || {};
    const TIERS = ["", "Nano", "Micro", "Mega"];
    const APPROVE = ["Pending", "Posted", "Approve"];
    const OBJ = ["Awareness", "Consideration", "Conversion"];
    const ro = admin ? "" : "disabled";

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
        <td>${sel("tier", k.tier ?? person.tier ?? "", TIERS)}</td>
        <td>${txt("kol_type", k.kol_type ?? person.niche ?? "", "kol-in sm")}</td>
        <td class="kol-name"><a href="#/influencer/${k.influencer_id}">${esc(name)}</a></td>
        <td><button class="kol-cellbtn" data-sow-edit><span class="material-symbols-outlined text-[15px]">checklist</span>${(k.sow || []).length || "+"}</button></td>
        <td>${txt("product_focus", k.product_focus, "kol-in md")}</td>
        <td>${sel("client_approved", k.client_approved || "Pending", APPROVE)}</td>
        <td>${dt("post_date", k.post_date)}</td>
        <td>${linkCell(k.link)}</td>
        <td><div class="kol-bcell">${num("rate", k.rate)}${eye("rate", show.rate !== false)}</div></td>
        <td><div class="kol-bcell">${num("gen_code_price", k.gen_code_price)}${eye("gen_code_price", show.gen_code_price !== false)}</div></td>
        <td><div class="kol-bcell">${num("boosting_cost", k.boosting_cost)}${eye("boosting_cost", show.boosting_cost !== false)}</div></td>
        <td>${sel("objective", k.objective || "Awareness", OBJ, "kol-in obj")}</td>
        <td>${periodCell(k)}</td>
        <td><button class="kol-cellbtn" data-cond-edit title="เงื่อนไข">${k.conditions ? '<span class="material-symbols-outlined text-[15px]" style="color:#b8924f">sticky_note_2</span>' : '<span class="material-symbols-outlined text-[15px]">add</span>'}</button></td>
        <td><button class="kol-cellbtn" data-media-edit>${thumb ? `<img class="kol-thumb" src="${esc(mediaSrc(thumb))}"/>` : '<span class="material-symbols-outlined text-[15px]">image</span>'}${media.length ? ` ${media.length}` : ""}</button></td>
        ${admin ? `<td><button class="kol-remove" data-remove title="ลบ"><span class="material-symbols-outlined text-[18px]">delete</span></button></td>` : ""}
      </tr>`;
    };

    // Group rows by tier so the table is easy to scan (Mega → Micro → Nano → unspecified).
    const TIER_ORDER = ["Mega", "Micro", "Nano"];
    const effTier = (k) => k.tier || inf(k.influencer_id).tier || "";
    const groups = {};
    kols.forEach((k, i) => { const t = effTier(k) || "—"; (groups[t] = groups[t] || []).push(i); });
    const tierKeys = TIER_ORDER.filter((t) => groups[t])
      .concat(Object.keys(groups).filter((t) => !TIER_ORDER.includes(t)).sort());
    const colspan = admin ? 18 : 17;
    const rows = tierKeys.map((t) => {
      const head = t === "—" ? `<span class="kol-gname">ไม่ระบุ Tier</span>` : `<span class="tier-chip tier-${t}">${t}</span>`;
      const body = groups[t].map((i) => rowHtml(kols[i], i)).join("");
      return `<tr class="kol-group"><td colspan="${colspan}">${head}<span class="kol-gcount">${groups[t].length} KOL</span></td></tr>${body}`;
    }).join("");

    const tot = (f) => kols.reduce((s, k) => s + (Number(k[f]) || 0), 0);
    host.innerHTML = `<div class="kol-panel">
      <div class="kol-wrap"><table class="kol-table">
      <thead><tr>
        <th>#</th><th>Month</th><th>Tier</th><th>Type</th><th>KOL Name</th><th>SOW</th>
        <th>Product Focus</th><th>Approved</th><th>Post Date</th><th>Link</th>
        <th>ค่าตัว</th><th>Gen Code</th><th>Boosting</th><th>Obj.</th><th>Period</th>
        <th>Cond.</th><th>Media</th>${admin ? "<th></th>" : ""}
      </tr></thead>
      <tbody>${rows}</tbody></table></div>
      <div class="kol-foot">
        <div class="kol-tot"><span class="l">ค่าตัว</span><span class="v">${money(tot("rate"))}</span></div>
        <div class="kol-tot"><span class="l">Gen Code</span><span class="v">${money(tot("gen_code_price"))}</span></div>
        <div class="kol-tot"><span class="l">Boosting</span><span class="v">${money(tot("boosting_cost"))}</span></div>
        <div class="kol-tot kol-tot-budget"><span class="l">Total Budget</span><span class="v">${money(tot("rate") + tot("gen_code_price") + tot("boosting_cost"))}</span></div>
      </div></div>`;

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
        if (f === "tier") { // tier drives the grouping — save then re-render to regroup
          clearTimeout(timer);
          saveKols(a, a.kols).then(() => renderKolTable(host, a, roster)).catch((e) => toast(e.message, "err"));
          return;
        }
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
        kols.push({ influencer_id: id, month: "", tier: r.tier || "", kol_type: r.niche || "", sow: [], product_focus: "", client_approved: "Pending", post_date: "", link: "", rate: r.base_rate || 0, gen_code_price: r.code_gen_fee || 0, boosting_cost: 0, objective: "Awareness", period_from: "", period_to: "", conditions: "", caption: "", media: [], show: { rate: true, gen_code_price: true, boosting_cost: true } });
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
      try { await api("/assets/" + a.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sow_options: a.sow_options }) }); } catch (e) { return toast(e.message, "err"); }
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
    const m = modal("KOL Conditions", "sticky_note_2", `<label class="flex flex-col gap-1">${lbl("เงื่อนไขเฉพาะ KOL คนนี้ (ถ้ามี)")}<textarea id="cd" rows="4" class="${inpCls}">${esc(k.conditions || "")}</textarea></label>`, `<button data-close class="ml-auto px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Cancel</button><button data-save class="px-md py-2 rounded-lg font-semibold bg-primary text-on-primary">Save</button>`);
    m.querySelector("[data-save]").addEventListener("click", async () => { k.conditions = m.querySelector("#cd").value; try { await saveKols(a, a.kols); m.remove(); renderKolTable(host, a, roster); } catch (e) { toast(e.message, "err"); } });
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
    const save = (opts) => api("/assets/" + a.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sow_options: opts }) });
    const refresh = () => {
      listEl.innerHTML = (a.sow_options || []).length ? (a.sow_options || []).map((o, i) => `<div class="flex items-center gap-sm py-1 border-b border-outline-variant/50"><span class="flex-1 text-[14px]">${esc(o)}</span><button data-del="${i}" class="text-on-surface-variant hover:text-error"><span class="material-symbols-outlined text-[18px]">delete</span></button></div>`).join("") : `<div class="text-[13px] text-on-surface-variant">ยังไม่มีรายการ</div>`;
      listEl.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => { a.sow_options.splice(+b.getAttribute("data-del"), 1); try { await save(a.sow_options); refresh(); } catch (e) { toast(e.message, "err"); } }));
    };
    m.querySelector("[data-add]").addEventListener("click", async () => { const v = m.querySelector("#son").value.trim(); if (!v) return; a.sow_options = [...(a.sow_options || []), v]; try { await save(a.sow_options); m.querySelector("#son").value = ""; refresh(); } catch (e) { toast(e.message, "err"); } });
    m.querySelector("[data-close]").addEventListener("click", () => render());
    refresh();
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
            <span class="flex-1 font-semibold">${esc(b.name)}</span>
            <button data-logo class="text-on-surface-variant hover:text-primary" title="${b.logo_url ? "เปลี่ยนโลโก้" : "เพิ่มโลโก้"}"><span class="material-symbols-outlined text-[18px]">${b.logo_url ? "photo_camera" : "add_photo_alternate"}</span></button>
            ${b.logo_url ? `<button data-logo-del class="text-on-surface-variant hover:text-error" title="ลบโลโก้"><span class="material-symbols-outlined text-[18px]">hide_image</span></button>` : ""}
            <button data-del class="text-on-surface-variant hover:text-error" title="ลบแบรนด์"><span class="material-symbols-outlined text-[18px]">delete</span></button>
          </div>`).join("")
        : `<div class="text-[13px] text-on-surface-variant">ยังไม่มีแบรนด์</div>`;
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
})();
