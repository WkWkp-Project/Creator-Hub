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
    await saveAsset(a.id, { kols });
  }

  function renderKolTable(host, a, roster) {
    const admin = CA.canEdit(a);   // admin or a manager assigned to this campaign
    const kols = a.kols || [];
    const inf = (id) => roster.find((r) => r.id === id) || {};
    const TIERS = ["", "Nano", "Micro", "Mega"];
    const APPROVE = ["Pending", "Posted", "Approve"];
    const OBJ = ["Awareness", "Engagement", "Conversion"];
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
        <td><button class="kol-cellbtn" data-cond-edit title="เงื่อนไข">${k.conditions ? '<span class="material-symbols-outlined text-[15px]" style="color:#e1121c">sticky_note_2</span>' : '<span class="material-symbols-outlined text-[15px]">add</span>'}</button></td>
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
      const head = t === "—" ? `<span class="kol-gname">ไม่ระบุ Tier</span>` : `<span class="tier-chip tier-${["Nano", "Micro", "Mega"].includes(t) ? t : "custom"}">${esc(t)}</span>`;
      const body = groups[t].map((i) => rowHtml(kols[i], i)).join("");
      return `<tr class="kol-group"><td colspan="${colspan}">${head}<span class="kol-gcount">${groups[t].length} KOL</span></td></tr>${body}`;
    }).join("");

    const tot = (f) => kols.reduce((s, k) => s + (Number(k[f]) || 0), 0);
    // Budget visibility for the customer — admins/managers can hide any figure
    // (incl. Total Budget). Missing/true = shown; false = hidden from viewers.
    const bshow = a.budget_show || {};
    const bvis = (f) => bshow[f] !== false;
    const bEye = (f) => admin
      ? `<button class="kol-eye ${bvis(f) ? "on" : ""}" data-budget-eye="${f}" title="โชว์/ซ่อนยอดนี้ตอนส่งลูกค้า"><span class="material-symbols-outlined text-[16px]">${bvis(f) ? "visibility" : "visibility_off"}</span></button>`
      : "";
    const footItem = (f, label, value, extraCls = "") => {
      if (!admin && !bvis(f)) return "";   // viewers never see a hidden figure
      return `<div class="kol-tot ${extraCls} ${admin && !bvis(f) ? "is-cust-hidden" : ""}"><span class="l">${label}</span><span class="kol-tot-vrow"><span class="v">${value}</span>${bEye(f)}</span></div>`;
    };
    const anyBudgetVisible = admin || ["rate", "gen_code_price", "boosting_cost", "total"].some(bvis);
    host.innerHTML = `<div class="kol-panel">
      <div class="kol-wrap"><table class="kol-table">
      <thead><tr>
        <th>#</th><th>Month</th><th>Tier</th><th>Type</th><th>KOL Name</th><th>SOW</th>
        <th>Product Focus</th><th>Approved</th><th>Post Date</th><th>Link</th>
        <th>ค่าตัว</th><th>Gen Code</th><th>Boosting</th><th>Obj.</th><th>Period</th>
        <th>Cond.</th><th>Media</th>${admin ? "<th></th>" : ""}
      </tr></thead>
      <tbody>${rows}</tbody></table></div>
      ${anyBudgetVisible ? `<div class="kol-foot"><div class="kol-foot-items">
        ${footItem("rate", "ค่าตัว", money(tot("rate")))}
        ${footItem("gen_code_price", "Gen Code", money(tot("gen_code_price")))}
        ${footItem("boosting_cost", "Boosting", money(tot("boosting_cost")))}
        ${footItem("total", "Total Budget", money(tot("rate") + tot("gen_code_price") + tot("boosting_cost")), "kol-tot-budget")}
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
      saveAsset(a.id, { budget_show: a.budget_show }).catch((e) => toast(e.message, "err"));
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
      try { await saveAsset(a.id, { sow_options: a.sow_options }); } catch (e) { return toast(e.message, "err"); }
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
    const save = (opts) => saveAsset(a.id, { sow_options: opts });
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
    const linkTxt = (u) => { u = (u || "").trim(); if (!u) return "—"; return `<a href="${esc(u)}" target="_blank" rel="noopener">เปิดโพสต์ ↗</a>`; };
    const kols = a.kols || [];
    const tot = (f) => kols.reduce((s, k) => s + (Number(k[f]) || 0), 0);
    const grand = tot("rate") + tot("gen_code_price") + tot("boosting_cost");
    const bshow = a.budget_show || {};
    const bvis = (f) => bshow[f] !== false;   // hidden figures don't go to the customer
    const TIER_ORDER = ["Mega", "Micro", "Nano"];
    const ordered = kols.map((k, i) => ({ k, i })).sort((x, y) => {
      const rank = (t) => { const ix = TIER_ORDER.indexOf(t || ""); return ix < 0 ? 99 : ix; };
      return rank(x.k.tier) - rank(y.k.tier);
    });
    const rows = ordered.map(({ k }, n) => `<tr>
      <td class="c">${n + 1}</td><td class="c">${esc(k.month) || "—"}</td>
      <td class="c">${k.tier ? `<span class="tier t-${esc(k.tier)}">${esc(k.tier)}</span>` : "—"}</td>
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
      { icon: "person_add", label: "Assign KOL", gold: true, onClick: () => openAssignKolModal(a, lastRoster) },
    ],
    render: async (host, a) => { lastRoster = await CA.roster(); renderKolTable(host, a, lastRoster); },
    reportHtml,
  });
})();
