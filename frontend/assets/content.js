/* Content DB — separate feature module.
 *
 * Registers its own routes through the window.CH bridge and reuses shared
 * helpers; it does not modify app.js logic. A ContentBrief has two flexible,
 * JSON-backed sections driven entirely by the config below, so topics/fields
 * can be added or changed here without touching the rest of the code or the DB.
 */
(() => {
  "use strict";

  const CH = window.CH;
  if (!CH) { console.error("content.js: CH bridge missing"); return; }
  const { route, api, el, esc, toast, isAdmin, fmtMoney } = CH;

  // ---------------------------------------------------------------- config ----
  // Section A — overview/inputs. Add topic #3's real fields here when defined.
  const SECTION_A = {
    product: {
      label: "1. Product Information", icon: "inventory_2",
      fields: [
        { k: "name", label: "ชื่อสินค้า" }, { k: "brand", label: "แบรนด์" },
        { k: "category", label: "หมวดหมู่" }, { k: "price", label: "ราคา" },
        { k: "url", label: "ลิงก์สินค้า" }, { k: "usp", label: "จุดขาย / USP", ta: true },
      ],
    },
    kol_brief: {
      label: "2. KOL Brief", icon: "campaign",
      fields: [
        { k: "objective", label: "วัตถุประสงค์", ta: true }, { k: "audience", label: "กลุ่มเป้าหมาย" },
        { k: "tone", label: "โทน / มู้ด" }, { k: "key_message", label: "Key message", ta: true },
        { k: "do", label: "สิ่งที่ต้องพูด (Do)", ta: true }, { k: "dont", label: "สิ่งที่ห้ามพูด (Don't)", ta: true },
        { k: "hashtags", label: "Hashtags / Mentions" },
      ],
    },
    extra: {
      label: "3. หัวข้อเพิ่มเติม (รอกำหนด)", icon: "add_notes",
      fields: [{ k: "note", label: "รายละเอียดเพิ่มเติม", ta: true }],
    },
  };

  // Section B — scalar/nested fields (dot-paths) + repeatable lists.
  const SECTION_B_FIELDS = [
    { p: "budget.amount", label: "Budget (฿)", type: "number", half: true },
    { p: "budget.note", label: "Budget note", half: true },
    { p: "timeline", label: "Timeline (key dates)", ta: true },
    { p: "audience", label: "Target Audience", ta: true },
    { p: "approval.approver", label: "ผู้อนุมัติ", half: true },
    { p: "approval.note", label: "หมายเหตุอนุมัติ", half: true },
  ];
  const SECTION_B_LISTS = [
    { key: "deliverables", label: "Deliverables", icon: "checklist",
      cols: [{ k: "platform", ph: "Platform" }, { k: "format", ph: "Format" }, { k: "qty", ph: "จำนวน" }] },
    { key: "kpis", label: "KPIs", icon: "query_stats",
      cols: [{ k: "metric", ph: "Metric" }, { k: "target", ph: "เป้าหมาย" }] },
    { key: "references", label: "References / Mood board", icon: "link",
      cols: [{ k: "label", ph: "ชื่อ" }, { k: "url", ph: "ลิงก์ (https://)" }] },
  ];

  const STATUS_META = {
    draft: { label: "Draft", cls: "bg-surface-container text-on-surface-variant" },
    review: { label: "Review", cls: "bg-primary-fixed text-primary" },
    approved: { label: "Approved", cls: "bg-secondary-container text-on-secondary-container" },
  };

  // --------------------------------------------------------------- helpers ----
  const inpCls = "bg-surface-container-lowest border border-outline-variant rounded-lg px-sm py-2 text-[14px] focus:border-primary focus:ring-1 focus:ring-primary w-full";

  const statusBadge = (s) => {
    const m = STATUS_META[s] || STATUS_META.draft;
    return `<span class="${m.cls} text-[11px] font-bold px-sm py-1 rounded-full">${m.label}</span>`;
  };

  const getPath = (obj, path) =>
    path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
  const setPath = (obj, path, val) => {
    const keys = path.split(".");
    let cur = obj;
    keys.slice(0, -1).forEach((k) => { cur[k] = cur[k] || {}; cur = cur[k]; });
    cur[keys[keys.length - 1]] = val;
  };

  // <input>/<textarea> bound to a data-path for deterministic read-back.
  const fieldHTML = (dataAttr, path, value, label, opts = {}) => {
    const span = `<span class="text-[12px] font-semibold text-on-surface-variant">${esc(label)}</span>`;
    const attr = `${dataAttr}="${path}"`;
    const span2 = opts.ta || opts.full ? "sm:col-span-2" : "";
    const control = opts.ta
      ? `<textarea ${attr} rows="2" class="${inpCls}">${esc(value ?? "")}</textarea>`
      : `<input ${attr} type="${opts.type || "text"}" value="${esc(value ?? "")}" class="${inpCls}"/>`;
    return `<label class="flex flex-col gap-1 ${span2}">${span}${control}</label>`;
  };

  let campaignsCache = [];
  const campaignName = (id) => campaignsCache.find((c) => c.id === id)?.name || (id ? `#${id}` : "—");
  const loadCampaigns = async () => {
    try { campaignsCache = (await api("/campaigns?limit=500")).items; } catch (_) { campaignsCache = []; }
  };

  // ============================================================= LIST ROUTE ===
  const cFilter = { status: "" };

  route("content", async (view) => {
    view.appendChild(el(`
      <section class="flex flex-wrap gap-md items-end justify-between">
        <div>
          <h1 class="text-[32px] leading-10 font-semibold tracking-tight">Content DB</h1>
          <p class="text-on-surface-variant mt-xs">คลังเอกสาร Brief / คอนเทนต์ ผูกกับแคมเปญ — Section A (ตั้งต้น) + Section B (รายละเอียด)</p>
        </div>
        <div class="flex gap-sm items-end">
          <div class="flex flex-col">
            <label class="text-[12px] tracking-wider font-semibold text-on-surface-variant mb-1">Status</label>
            <select id="c-status" class="bg-surface-container-lowest border border-outline-variant rounded-lg px-sm py-2 text-[15px] focus:border-primary focus:ring-1 focus:ring-primary min-w-[150px]">
              ${["All Statuses", "Draft", "Review", "Approved"].map((o) => `<option>${o}</option>`).join("")}
            </select>
          </div>
          ${isAdmin() ? `<button id="c-new" class="bg-primary text-on-primary font-semibold rounded-lg py-2 px-md hover:bg-primary-container shadow-sm flex items-center gap-1 h-[42px]"><span class="material-symbols-outlined text-[20px]">add</span>New Brief</button>` : ""}
        </div>
      </section>`));

    const grid = el(`<section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter"></section>`);
    view.appendChild(grid);

    const sel = view.querySelector("#c-status");
    sel.value = cFilter.status || "All Statuses";
    sel.addEventListener("change", () => { cFilter.status = sel.value; loadList(grid); });
    view.querySelector("#c-new")?.addEventListener("click", () => openForm());

    await loadList(grid);
  });

  async function loadList(grid) {
    await loadCampaigns();
    const params = new URLSearchParams();
    if (cFilter.status && !cFilter.status.startsWith("All")) params.set("status", cFilter.status.toLowerCase());
    const data = await api("/content?" + params.toString());

    grid.innerHTML = "";
    if (!data.items.length) {
      grid.appendChild(el(`<div class="col-span-full text-center py-3xl text-on-surface-variant">
        <span class="material-symbols-outlined text-[48px] opacity-40">description</span>
        <p class="mt-sm">ยังไม่มี content brief${isAdmin() ? " — กด New Brief เพื่อเริ่ม" : ""}</p></div>`));
      return;
    }
    data.items.forEach((b) => grid.appendChild(listCard(b)));
  }

  function listCard(b) {
    const product = b.section_a?.product || {};
    const card = el(`
      <article class="bg-surface-container-lowest rounded-xl border border-outline-variant elevation-1 lift overflow-hidden flex flex-col cursor-pointer">
        <div class="p-md flex flex-col flex-1 gap-sm">
          <div class="flex justify-between items-start gap-2">
            <h3 class="text-[18px] font-semibold leading-tight truncate flex-1">${esc(b.title)}</h3>
            ${statusBadge(b.status)}
          </div>
          <div class="text-[13px] text-on-surface-variant flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">rocket_launch</span>${esc(campaignName(b.campaign_id))}</div>
          ${product.name ? `<div class="text-[13px] text-on-surface-variant flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">inventory_2</span>${esc(product.name)}</div>` : ""}
        </div>
      </article>`);
    card.addEventListener("click", () => (location.hash = `#/contentbrief/${b.id}`));
    return card;
  }

  // =========================================================== DETAIL ROUTE ===
  route("contentbrief", async (view, id) => {
    const brief = await api("/content/" + id);
    await loadCampaigns();
    const a = brief.section_a || {};
    const b = brief.section_b || {};

    view.appendChild(el(`<button data-back class="self-start flex items-center gap-1 text-on-surface-variant hover:text-on-surface text-[14px] font-semibold"><span class="material-symbols-outlined text-[18px]">arrow_back</span> Back to Content DB</button>`));

    view.appendChild(el(`
      <article class="bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-1 p-lg flex flex-wrap items-start gap-md">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-sm flex-wrap"><h1 class="text-[30px] font-semibold tracking-tight">${esc(brief.title)}</h1>${statusBadge(brief.status)}</div>
          <p class="text-on-surface-variant mt-1 flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">rocket_launch</span>${esc(campaignName(brief.campaign_id))}</p>
        </div>
        ${isAdmin() ? `<div class="flex gap-sm">
          <button data-edit class="bg-primary text-on-primary text-[14px] font-semibold rounded-lg py-2 px-md hover:bg-primary-container flex items-center gap-1"><span class="material-symbols-outlined text-[18px]">edit</span>Edit</button>
          <button data-del class="bg-surface border border-error text-error text-[14px] font-semibold rounded-lg py-2 px-md hover:bg-error-container flex items-center gap-1"><span class="material-symbols-outlined text-[18px]">delete</span>Delete</button>
        </div>` : ""}
      </article>`));

    // Section A — driven by config
    const secA = el(`<section><h2 class="text-[20px] font-bold mb-md flex items-center gap-sm"><span class="bg-primary text-on-primary text-[13px] px-sm py-1 rounded-full">Section A</span> ข้อมูลตั้งต้น</h2><div class="grid grid-cols-1 lg:grid-cols-3 gap-gutter"></div></section>`);
    const aGrid = secA.querySelector("div");
    Object.entries(SECTION_A).forEach(([key, cfg]) => {
      const data = a[key] || {};
      const rows = cfg.fields
        .filter((f) => data[f.k])
        .map((f) => `<div class="py-1"><div class="text-[12px] font-semibold text-on-surface-variant">${esc(f.label)}</div><div class="text-[14px] whitespace-pre-wrap break-words">${esc(data[f.k])}</div></div>`)
        .join("");
      aGrid.appendChild(el(`
        <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-1 overflow-hidden">
          <div class="px-md py-sm border-b border-outline-variant flex items-center gap-sm"><span class="material-symbols-outlined text-primary text-[18px]">${cfg.icon}</span><span class="font-semibold text-[15px]">${esc(cfg.label)}</span></div>
          <div class="p-md">${rows || `<div class="text-[13px] text-on-surface-variant">— ยังไม่มีข้อมูล —</div>`}</div>
        </div>`));
    });
    view.appendChild(secA);

    // Section B
    const block = (icon, title, body) => `
      <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-1 overflow-hidden">
        <div class="px-md py-sm border-b border-outline-variant flex items-center gap-sm"><span class="material-symbols-outlined text-primary text-[18px]">${icon}</span><span class="font-semibold text-[15px]">${title}</span></div>
        <div class="p-md text-[14px]">${body}</div></div>`;
    const rowList = (arr, renderRow) =>
      arr && arr.length ? `<ul class="flex flex-col gap-1">${arr.map(renderRow).join("")}</ul>` : `<div class="text-[13px] text-on-surface-variant">—</div>`;
    const text = (v) => (v ? `<div class="whitespace-pre-wrap">${esc(v)}</div>` : "—");
    const budget = b.budget || {};
    const approval = b.approval || {};

    const secB = el(`<section><h2 class="text-[20px] font-bold mb-md mt-lg flex items-center gap-sm"><span class="bg-secondary text-on-secondary text-[13px] px-sm py-1 rounded-full">Section B</span> รายละเอียดแจกแจง</h2><div class="grid grid-cols-1 lg:grid-cols-2 gap-gutter"></div></section>`);
    const bGrid = secB.querySelector("div");
    bGrid.appendChild(el(block("checklist", "Deliverables", rowList(b.deliverables, (d) => `<li class="flex justify-between border-b border-outline-variant/50 py-1"><span>${esc(d.platform || "")}${d.format ? " · " + esc(d.format) : ""}</span><span class="font-semibold">${esc(d.qty || "")}</span></li>`))));
    bGrid.appendChild(el(block("payments", "Budget", budget.amount ? `<div class="text-[20px] font-bold font-poppins">${fmtMoney(budget.amount, budget.currency || "THB")}</div>${budget.note ? `<div class="text-on-surface-variant mt-1">${esc(budget.note)}</div>` : ""}` : "—")));
    bGrid.appendChild(el(block("calendar_month", "Timeline", text(b.timeline))));
    bGrid.appendChild(el(block("groups", "Target Audience", text(b.audience))));
    bGrid.appendChild(el(block("query_stats", "KPIs", rowList(b.kpis, (k) => `<li class="flex justify-between border-b border-outline-variant/50 py-1"><span>${esc(k.metric || "")}</span><span class="font-semibold">${esc(k.target || "")}</span></li>`))));
    bGrid.appendChild(el(block("link", "References / Mood board", rowList(b.references, (r) => `<li><a href="${esc(r.url || "#")}" target="_blank" rel="noopener" class="text-primary hover:underline flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">open_in_new</span>${esc(r.label || r.url || "")}</a></li>`))));
    bGrid.appendChild(el(block("verified", "Approval", (approval.approver || approval.note) ? `${approval.approver ? `<div>ผู้อนุมัติ: <b>${esc(approval.approver)}</b></div>` : ""}${approval.note ? `<div class="text-on-surface-variant mt-1">${esc(approval.note)}</div>` : ""}` : "—")));
    view.appendChild(secB);

    view.querySelector("[data-back]").addEventListener("click", () => CH.goBack("#/content"));
    view.querySelector("[data-edit]")?.addEventListener("click", () => openForm(brief));
    view.querySelector("[data-del]")?.addEventListener("click", async () => {
      if (!confirm(`ลบ brief "${brief.title}"?`)) return;
      await api("/content/" + brief.id, { method: "DELETE" });
      toast("ลบแล้ว");
      location.hash = "#/content";
    });
  });

  // ============================================================= FORM MODAL ===
  async function openForm(existing = null) {
    const brief = existing || {};
    const a = brief.section_a || {};
    const b = brief.section_b || {};
    await loadCampaigns();

    const aSectionsHTML = Object.entries(SECTION_A).map(([key, cfg]) => `
      <div class="sm:col-span-2 mt-sm border-t border-outline-variant pt-md">
        <div class="flex items-center gap-sm mb-sm"><span class="material-symbols-outlined text-primary text-[18px]">${cfg.icon}</span><span class="font-bold text-[14px]">${esc(cfg.label)}</span></div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-sm">
          ${cfg.fields.map((f) => fieldHTML("data-a", `${key}.${f.k}`, (a[key] || {})[f.k], f.label, { ta: f.ta })).join("")}
        </div>
      </div>`).join("");

    const bFieldsHTML = SECTION_B_FIELDS
      .map((f) => fieldHTML("data-b", f.p, getPath(b, f.p), f.label, { ta: f.ta, type: f.type }))
      .join("");

    const bListsHTML = SECTION_B_LISTS.map((l) => `
      <div class="sm:col-span-2">
        <div class="flex items-center justify-between mb-sm"><span class="text-[12px] font-semibold text-on-surface-variant flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">${l.icon}</span>${l.label}</span><button type="button" data-add="${l.key}" class="text-primary text-[13px] font-semibold hover:underline">+ เพิ่ม</button></div>
        <div data-rows="${l.key}" class="flex flex-col gap-sm"></div>
      </div>`).join("");

    const modal = el(`
      <div class="fixed inset-0 z-50 bg-on-surface/50 backdrop-blur-sm flex items-center justify-center p-md">
        <div class="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden max-h-[92vh]">
          <div class="px-lg py-md border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
            <h2 class="text-[22px] font-bold flex items-center gap-sm"><span class="material-symbols-outlined text-primary">${existing ? "edit" : "note_add"}</span>${existing ? "แก้ไข" : "สร้าง"} Content Brief</h2>
            <button data-close class="text-on-surface-variant hover:text-on-surface"><span class="material-symbols-outlined">close</span></button>
          </div>
          <form id="c-form" class="p-lg overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-md">
            <label class="flex flex-col gap-1"><span class="text-[12px] font-semibold text-on-surface-variant">Title *</span><input data-title value="${esc(brief.title || "")}" class="${inpCls}"/></label>
            <label class="flex flex-col gap-1"><span class="text-[12px] font-semibold text-on-surface-variant">Campaign</span>
              <select data-campaign class="${inpCls}"><option value="">— ไม่ผูก —</option>${campaignsCache.map((c) => `<option value="${c.id}" ${brief.campaign_id === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
            <label class="flex flex-col gap-1"><span class="text-[12px] font-semibold text-on-surface-variant">Status</span>
              <select data-status class="${inpCls}">${Object.keys(STATUS_META).map((s) => `<option value="${s}" ${(brief.status || "draft") === s ? "selected" : ""}>${STATUS_META[s].label}</option>`).join("")}</select></label>

            <div class="sm:col-span-2 mt-sm"><span class="bg-primary text-on-primary text-[12px] font-bold px-sm py-1 rounded-full">Section A · ข้อมูลตั้งต้น</span></div>
            ${aSectionsHTML}

            <div class="sm:col-span-2 mt-md border-t border-outline-variant pt-md"><span class="bg-secondary text-on-secondary text-[12px] font-bold px-sm py-1 rounded-full">Section B · รายละเอียด</span></div>
            ${bFieldsHTML}
            ${bListsHTML}
          </form>
          <div class="px-lg py-md border-t border-outline-variant flex justify-end gap-md bg-surface-container-lowest">
            <button data-close class="px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Cancel</button>
            <button data-save class="px-md py-2 rounded-lg font-semibold bg-primary text-on-primary hover:bg-primary-container shadow-sm flex items-center gap-1"><span class="material-symbols-outlined text-[20px]">save</span>Save</button>
          </div>
        </div>
      </div>`);

    document.querySelector("#modal-root").appendChild(modal);
    const close = () => modal.remove();
    modal.querySelectorAll("[data-close]").forEach((x) => x.addEventListener("click", close));
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

    // repeatable list rows
    const addRow = (list, values = {}) => {
      const host = modal.querySelector(`[data-rows="${list.key}"]`);
      const row = el(`<div class="rep-row flex gap-sm items-center">
        ${list.cols.map((c) => `<input data-col="${c.k}" placeholder="${c.ph}" value="${esc(values[c.k] || "")}" class="${inpCls}"/>`).join("")}
        <button type="button" class="shrink-0 text-on-surface-variant hover:text-error"><span class="material-symbols-outlined text-[20px]">delete</span></button>
      </div>`);
      row.querySelector("button").addEventListener("click", () => row.remove());
      host.appendChild(row);
    };
    SECTION_B_LISTS.forEach((list) => {
      (b[list.key] || []).forEach((v) => addRow(list, v));
      modal.querySelector(`[data-add="${list.key}"]`).addEventListener("click", () => addRow(list));
    });

    const readList = (list) =>
      [...modal.querySelectorAll(`[data-rows="${list.key}"] .rep-row`)]
        .map((row) => {
          const obj = {};
          list.cols.forEach((c) => { obj[c.k] = row.querySelector(`[data-col="${c.k}"]`).value.trim(); });
          return obj;
        })
        .filter((obj) => Object.values(obj).some(Boolean));

    modal.querySelector("[data-save]").addEventListener("click", async () => {
      const title = modal.querySelector("[data-title]").value.trim();
      if (!title) return toast("กรุณาใส่ Title", "err");

      // Section A: collect non-empty data-a paths into a nested object.
      const section_a = {};
      modal.querySelectorAll("[data-a]").forEach((inp) => {
        const v = inp.value.trim();
        if (v) setPath(section_a, inp.getAttribute("data-a"), v);
      });

      // Section B: scalar/nested data-b paths (+ number coercion) and lists.
      const section_b = {};
      modal.querySelectorAll("[data-b]").forEach((inp) => {
        const path = inp.getAttribute("data-b");
        const raw = inp.value.trim();
        if (!raw) return;
        setPath(section_b, path, inp.type === "number" ? Number(raw) || 0 : raw);
      });
      if (section_b.budget && !section_b.budget.currency) section_b.budget.currency = "THB";
      SECTION_B_LISTS.forEach((list) => {
        const rows = readList(list);
        if (rows.length) section_b[list.key] = rows;
      });

      const payload = {
        title,
        campaign_id: modal.querySelector("[data-campaign]").value ? Number(modal.querySelector("[data-campaign]").value) : null,
        status: modal.querySelector("[data-status]").value,
        section_a,
        section_b,
      };
      try {
        const path = existing ? "/content/" + existing.id : "/content";
        await api(path, { method: existing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        toast(existing ? "อัปเดต brief แล้ว" : "สร้าง brief แล้ว");
        close();
        CH.render();
      } catch (e) { toast(e.message, "err"); }
    });
  }
})();
