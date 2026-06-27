/* Section C — Performance (per-KOL results, ranked by objective).
 * Self-registers with the content-asset core via window.CA.register().
 *
 * Two header dropdowns drive the ranking:
 *   OBJ    = Awareness | Engagement | Conversion   (which KPI defines "best")
 *   Source = Organic   | AD                          (how it's judged)
 *     - Organic → raw KPI of the objective (higher = better)
 *     - AD      → cost per result = ad spend ÷ result (lower = better)
 *                 ad spend = the KOL's Boosting cost from Section B
 *
 * The 3 media-type boxes (Image / Album / Video) re-rank live and show Top 3.
 * Metrics are stored on each KOL row (kols[i].metrics) — no schema change. */
(() => {
  "use strict";
  const CA = window.CA;
  if (!CA) { console.error("ca-section-c.js: CA connector missing"); return; }
  const { el, esc, toast, isAdmin, modal, saveAsset, inpCls, lbl } = CA;

  // Minimal CSV parser (handles quoted fields + commas + CRLF).
  function csvParse(text) {
    const rows = []; let i = 0, field = "", row = [], q = false;
    while (i < text.length) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
      i++;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  }

  const OBJECTIVES = [
    { id: "Awareness", label: "Awareness" },
    { id: "Engagement", label: "Engagement" },
    { id: "Conversion", label: "Conversion" },
  ];
  const SOURCES = [{ id: "organic", label: "Organic" }, { id: "ad", label: "AD (Paid)" }];

  // Raw, editable metrics captured per KOL.
  const METRICS = [
    { k: "reach", label: "Reach" },
    { k: "impression", label: "Impressions" },
    { k: "video_view", label: "Video View" },
    { k: "likes", label: "Likes" },
    { k: "comments", label: "Comments" },
    { k: "share", label: "Share" },
    { k: "saved", label: "Saved" },
    { k: "repost", label: "Repost" },
    { k: "link_click", label: "Traffic" },
    { k: "lead", label: "Lead" },
    { k: "sale", label: "Sale" },
  ];

  const BOXES = [
    { type: "image", icon: "image", label: "ภาพนิ่ง" },
    { type: "album", icon: "collections", label: "อัลบัม" },
    { type: "video", icon: "movie", label: "วิดีโอ" },
  ];
  const typeLabel = (t) => (BOXES.find((b) => b.type === t) || {}).label || t;
  const ctype = (k) => { const t = (k.media || []).map((x) => x.type); return t.includes("video") ? "video" : t.includes("album") ? "album" : "image"; };

  const N = (v) => Number(v) || 0;
  const engagement = (m) => N(m.likes) + N(m.comments) + N(m.share) + N(m.saved) + N(m.repost);
  const conversions = (m) => N(m.lead) + N(m.sale);
  const adSpend = (k) => N(k.boosting_cost);
  const fmtN = (n) => (n === "" || n == null) ? "" : Number(n).toLocaleString("en-US");
  const baht = (n, dp) => "฿" + (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: dp });
  const hasData = (m) => m && Object.values(m).some((v) => N(v) > 0);

  // The ranking KPI for the active (objective, source). Returns the sort value,
  // whether lower wins, a display string, and validity (enough data to rank).
  function kpi(objId, source, k) {
    const m = k.metrics || {};
    if (source === "ad") {
      const spend = adSpend(k);
      let result, label, unit;
      if (objId === "Awareness") { result = (N(m.impression) || N(m.reach)) / 1000; label = "CPM"; unit = "฿ / 1,000 impressions"; }
      else if (objId === "Engagement") { result = engagement(m); label = "CPE"; unit = "฿ / 1 engagement"; }
      else { result = conversions(m); label = "CPA"; unit = "฿ / 1 conversion"; }
      const ok = spend > 0 && result > 0;
      const cost = ok ? spend / result : 0;
      return { label, unit, dir: "ถูกสุดก่อน", lowerWins: true, value: cost, valid: ok, display: ok ? baht(cost, objId === "Awareness" ? 0 : 2) : "—" };
    }
    let raw, label, unit;
    if (objId === "Awareness") { raw = N(m.reach); label = "Reach"; unit = "จำนวนคนที่เห็น"; }
    else if (objId === "Engagement") { raw = engagement(m); label = "Engagement"; unit = "likes+comments+share+saved+repost"; }
    else { raw = conversions(m); label = "Conversions"; unit = "lead + sale"; }
    return { label, unit, dir: "มากสุดก่อน", lowerWins: false, value: raw, valid: raw > 0, display: fmtN(raw) };
  }
  const probeKpi = () => kpi(objFilter, srcFilter, { metrics: {} });
  const kpiTitle = () => { const k = probeKpi(); return `${k.label} · ${k.dir}`; };

  // Filters (fixed sets). Persist while on the campaign.
  let objFilter = "Awareness", srcFilter = "organic";
  let curHost = null, curAsset = null, curRoster = [];
  const nameOf = (k) => (curRoster.find((r) => r.id === k.influencer_id) || {}).name || k.name || ("#" + k.influencer_id);
  const followersOf = (k) => (curRoster.find((r) => r.id === k.influencer_id) || {}).followers || N((k.metrics || {}).followers);

  const inObj = (k) => (k.objective || "") === objFilter;
  // Organic = no ad spend (no boost); AD = has boost. A boosted post is never organic.
  const srcOK = (k) => srcFilter === "ad" ? adSpend(k) > 0 : adSpend(k) === 0;
  const eligible = (a, type) => (a.kols || []).map((k, i) => ({ k, i })).filter(({ k }) => ctype(k) === type && inObj(k) && srcOK(k));
  const rankIn = (a, type) => eligible(a, type)
    .map((x) => ({ ...x, m: kpi(objFilter, srcFilter, x.k) }))
    .filter((x) => x.m.valid)
    .sort((p, q) => srcFilter === "ad" ? p.m.value - q.m.value : q.m.value - p.m.value);

  function boxesHtml(a) {
    const p = probeKpi();
    const legend = `<div class="perf-legend"><span class="material-symbols-outlined text-[16px]">leaderboard</span>จัดอันดับด้วย <b>${esc(p.label)}</b> <span class="perf-legend-unit">(${esc(p.unit)})</span> · <b>${esc(p.dir)}</b> · เปลี่ยน OBJ / Source แล้วทุกกล่องจัดอันดับใหม่</div>`;
    const cards = BOXES.map((box) => {
      const ranked = rankIn(a, box.type);
      const total = eligible(a, box.type).length;
      const list = ranked.slice(0, 3).map((x, n) => `<li>
          <span class="perf-medal m${n + 1}">${n + 1}</span>
          <span class="perf-rk-nm">${esc(nameOf(x.k))}</span>
          <span class="perf-rk-v">${x.m.display}</span></li>`).join("");
      const body = ranked.length
        ? `<ol class="perf-rank">${list}</ol>`
        : `<div class="perf-empty">${total ? `มี ${total} KOL — ยังไม่กรอกผล` : "ยังไม่มี KOL ในสื่อนี้"}</div>`;
      return `<div class="perf-box" data-type="${box.type}">
        <div class="perf-box-head"><span class="perf-ico t-${box.type}"><span class="material-symbols-outlined">${box.icon}</span></span>
          <div class="perf-box-tw"><span class="perf-box-title">${box.label}</span><span class="perf-box-kpi">${esc(p.label)} · ${esc(p.unit)}</span></div>
          <span class="perf-box-count">${total} KOL</span></div>
        <div class="perf-box-body">${body}</div>
        <button class="perf-expand" data-expand="${box.type}"><span class="material-symbols-outlined text-[16px]">open_in_full</span>ดูตาราง Performance</button>
      </div>`;
    }).join("");
    return `${legend}<div class="ca-cards ca-cards-3">${cards}</div>`;
  }

  function renderSection(host, a) {
    if (curAsset && curAsset.id !== a.id) { objFilter = "Awareness"; srcFilter = "organic"; }
    curHost = host; curAsset = a;
    host.innerHTML = boxesHtml(a);
    host.querySelectorAll("[data-expand]").forEach((b) => b.addEventListener("click", () => openPerfModal(a, b.getAttribute("data-expand"))));
    const sechead = host.previousElementSibling;
    const cnt = sechead && sechead.classList.contains("ca-sechead") && sechead.querySelector(".ca-linkcount");
    if (cnt) cnt.textContent = `${(a.kols || []).filter((k) => hasData(k.metrics)).length} / ${(a.kols || []).length} วัดผล`;
  }
  const rerender = () => { if (curHost && curAsset) renderSection(curHost, curAsset); };

  function openPerfModal(a, type) {
    const box = BOXES.find((b) => b.type === type) || BOXES[0];
    const admin = CA.canEdit(a);   // admin or a manager assigned to this campaign
    const ro = admin ? "" : "disabled";
    const ranked = rankIn(a, type);
    const cell = (i, key, val) => `<input class="kol-in num" inputmode="numeric" data-pf="${key}" data-i="${i}" data-money value="${fmtN(val)}" ${ro}/>`;
    const rows = ranked.map((x, rank) => {
      const m = x.k.metrics || {};
      return `<tr data-i="${x.i}">
        <td class="kol-rownum">${rank + 1}</td>
        <td class="kol-name">${esc(nameOf(x.k))}</td>
        <td class="n">${fmtN(followersOf(x.k))}</td>
        ${METRICS.map((mt) => `<td>${cell(x.i, mt.k, m[mt.k])}</td>`).join("")}
        <td class="n" data-eng="${x.i}">${fmtN(engagement(m))}</td>
        <td class="n" data-conv="${x.i}">${fmtN(conversions(m))}</td>
        <td class="n">${adSpend(x.k) ? baht(adSpend(x.k), 0) : "—"}</td>
        <td class="n perf-kpi" data-kpi="${x.i}"><b>${x.m.display}</b></td>
      </tr>`;
    }).join("");
    const note = `<div class="text-[12px] text-on-surface-variant">OBJ <b>${esc(objFilter)}</b> · <b>${srcFilter === "ad" ? "AD (Paid)" : "Organic"}</b> → จัดอันดับด้วย <b>${esc(kpiTitle())}</b>${srcFilter === "ad" ? " (ad spend = Boosting จาก Section B)" : ""}${admin ? " · แก้ตัวเลขได้ในตาราง" : ""}</div>`;
    const head = `<th>#</th><th>KOL</th><th class="n">Followers</th>${METRICS.map((mt) => `<th class="n">${mt.label}</th>`).join("")}<th class="n">Engagement</th><th class="n">Conversions</th><th class="n">Ad Spend</th><th class="n perf-kpi-h">${esc(kpi(objFilter, srcFilter, { metrics: {} }).label)}</th>`;
    const colspan = METRICS.length + 6;
    const body = `${note}<div class="kol-wrap"><table class="kol-table perf-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${colspan}" style="text-align:center;padding:28px;color:#8a8a8f">ยังไม่มี KOL ที่จัดอันดับได้ในสื่อนี้ (กรอกเมตริก/ปรับ Source)</td></tr>`}</tbody>
      </table></div>`;
    const m = modal(`Performance — ${box.label}`, box.icon, body, `<button data-close class="ml-auto px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Close</button>`, "max-w-7xl");
    if (!admin) return;
    let timer;
    const persist = () => { clearTimeout(timer); timer = setTimeout(() => saveAsset(a.id, { kols: a.kols }, a).then(rerender).catch((e) => toast(e.message, "err")), 600); };
    m.querySelectorAll("[data-pf]").forEach((inp) => {
      const key = inp.getAttribute("data-pf"), i = +inp.getAttribute("data-i");
      inp.addEventListener("input", () => {
        const digits = inp.value.replace(/[^\d]/g, "");
        a.kols[i].metrics = a.kols[i].metrics || {};
        a.kols[i].metrics[key] = digits === "" ? "" : Number(digits);
        const mm = a.kols[i].metrics;
        const setTxt = (sel, v) => { const c = m.querySelector(sel); if (c) c.textContent = v; };
        setTxt(`[data-eng="${i}"]`, fmtN(engagement(mm)));
        setTxt(`[data-conv="${i}"]`, fmtN(conversions(mm)));
        const kc = m.querySelector(`.perf-kpi[data-kpi="${i}"]`);
        if (kc) kc.innerHTML = `<b>${kpi(objFilter, srcFilter, a.kols[i]).display}</b>`;
        persist();
      });
      inp.addEventListener("focus", () => { const v = (a.kols[i].metrics || {})[key]; inp.value = (v === "" || v == null) ? "" : String(v); });
      inp.addEventListener("blur", () => { const v = (a.kols[i].metrics || {})[key]; inp.value = (v === "" || v == null) ? "" : Number(v).toLocaleString("en-US"); });
    });
  }

  // ---- Import performance numbers (CSV exported from the ad back-office) ----
  const FIELD_LABEL = { reach: "Reach", impression: "Impressions", video_view: "Video View", likes: "Likes", comments: "Comments", share: "Share", saved: "Saved", repost: "Repost", link_click: "Traffic", lead: "Lead", sale: "Sale", ad_spend: "Ad Spend" };
  const COLMAP = {
    kol: ["kol", "kols", "kols/channel", "channel", "name", "creator", "ชื่อ"],
    reach: ["reach"], impression: ["impression", "impressions", "impr", "impr."],
    video_view: ["video view", "video views", "views", "vdo view", "view"],
    likes: ["like", "likes"], comments: ["comment", "comments"], share: ["share", "shares"],
    saved: ["save", "saved", "saves"], repost: ["repost", "reposts"],
    link_click: ["link click", "link clicks", "traffic", "click", "clicks"],
    lead: ["lead", "leads"], sale: ["sale", "sales", "purchase", "purchases"],
    ad_spend: ["ad spend", "spend", "cost", "boost", "boosting"],
  };
  const colKey = (h) => { const x = String(h || "").trim().toLowerCase(); for (const f in COLMAP) if (COLMAP[f].includes(x)) return f; return null; };

  function openImportModal(a) {
    const cols = ["KOL", ...Object.values(FIELD_LABEL)];
    const template = cols.join(",") + "\n"
      + "Elena Rodriguez,110407,119517,0,66,23,51,8,7,90,0,0,3000\n"
      + "David Kim,124200,152000,0,2256,52,32,62,0,140,0,0,6000";
    const fmtDoc = `<div class="imp-doc">
      <div class="imp-doc-h">ฟอแมตไฟล์ที่ระบบรับ — CSV (export จากหลังบ้านแอด แล้ว Save as .csv)</div>
      <table class="imp-doc-t"><thead><tr><th>คอลัมน์</th><th>แมชเข้ากับ</th><th>จำเป็น?</th></tr></thead><tbody>
        <tr><td><b>KOL</b></td><td>ชื่อ KOL ในแคมเปญ (ใช้จับคู่)</td><td>จำเป็น</td></tr>
        ${Object.keys(FIELD_LABEL).map((f) => `<tr><td>${FIELD_LABEL[f]}</td><td>metrics.${f}</td><td>ถ้ามี</td></tr>`).join("")}
      </tbody></table>
      <div class="imp-doc-note">• จับคู่ด้วย <b>ชื่อ KOL</b> (ไม่สนตัวพิมพ์เล็ก/ใหญ่) • ตัวเลขใส่ลูกน้ำได้ • หัวคอลัมน์รองรับชื่อใกล้เคียง (Impr., Views, Spend…) • <b>Ad Spend</b> = ค่ายิงแอด จะอัปเดตเข้า Boosting ของ KOL</div>
      <button data-tpl class="imp-btn"><span class="material-symbols-outlined text-[16px]">download</span>ดาวน์โหลด template .csv</button>
    </div>`;
    const body = `
      <div class="text-[13px] text-on-surface-variant">Export ผลจากหลังบ้านแอด (Meta / TikTok ฯลฯ) เป็น CSV แล้วนำเข้าที่นี่ เพื่อแมชค่าเมตริกเข้ากับ KOL — ระบบจับคู่ด้วย <b>ชื่อ KOL</b></div>
      <button data-fmt class="imp-fmt"><span class="imp-bang">!</span> ดูฟอแมตไฟล์ที่รองรับ</button>
      <div id="imp-doc" style="display:none">${fmtDoc}</div>
      <label class="flex flex-col gap-1">${lbl("อัปโหลดไฟล์ CSV")}<input id="imp-file" type="file" accept=".csv,text/csv" class="${inpCls}"/></label>
      <label class="flex flex-col gap-1">${lbl("หรือวางข้อมูล CSV")}<textarea id="imp-paste" rows="4" class="${inpCls}" placeholder="KOL,Reach,Impressions,...&#10;Elena Rodriguez,110407,119517,..."></textarea></label>
      <button data-parse class="imp-btn-primary"><span class="material-symbols-outlined text-[17px]">find_in_page</span>ตรวจ & พรีวิว</button>
      <div id="imp-preview"></div>`;
    const m = modal("นำเข้าผล Performance", "upload_file", body, `
      <button data-close class="ml-auto px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Cancel</button>
      <button data-apply class="px-md py-2 rounded-lg font-semibold bg-primary text-on-primary" disabled style="opacity:.5">นำเข้า</button>`, "max-w-3xl");
    m.querySelector("[data-fmt]").addEventListener("click", () => { const d = m.querySelector("#imp-doc"); d.style.display = d.style.display === "none" ? "" : "none"; });
    m.querySelector("[data-tpl]").addEventListener("click", () => {
      const u = URL.createObjectURL(new Blob([template], { type: "text/csv;charset=utf-8" }));
      const x = document.createElement("a"); x.href = u; x.download = "performance-template.csv"; x.click(); URL.revokeObjectURL(u);
    });
    let parsed = null;
    const doParse = (text) => {
      const rows = csvParse(text);
      if (rows.length < 2) return toast("ไฟล์ว่างหรือไม่มีข้อมูล", "err");
      const headers = rows[0].map(colKey);
      const kolCol = headers.indexOf("kol");
      if (kolCol < 0) return toast("ไม่พบคอลัมน์ KOL (ชื่อ KOL) ในหัวตาราง", "err");
      const fieldCols = headers.map((f, idx) => ({ f, idx })).filter((x) => x.f && x.f !== "kol");
      if (!fieldCols.length) return toast("ไม่พบคอลัมน์เมตริกที่รองรับ", "err");
      const lut = new Map();
      (a.kols || []).forEach((k, i) => { lut.set(nameOf(k).trim().toLowerCase(), i); if (k.name) lut.set(k.name.trim().toLowerCase(), i); });
      const matched = [], unmatched = [];
      for (let r = 1; r < rows.length; r++) {
        const nm = (rows[r][kolCol] || "").trim(); if (!nm) continue;
        const idx = lut.get(nm.toLowerCase());
        const vals = {};
        fieldCols.forEach(({ f, idx: ci }) => { const raw = String(rows[r][ci] || "").replace(/[^\d.-]/g, ""); if (raw !== "") vals[f] = Number(raw); });
        if (idx == null) unmatched.push(nm); else matched.push({ i: idx, name: nm, vals });
      }
      parsed = matched;
      const fieldsFound = fieldCols.map((x) => FIELD_LABEL[x.f]).join(", ");
      m.querySelector("#imp-preview").innerHTML = `<div class="imp-prev">
        <div class="imp-prev-h">พบ <b style="color:#3a7d44">${matched.length}</b> แมชได้ · <b style="color:${unmatched.length ? "#b06a00" : "#8a8a8f"}">${unmatched.length}</b> ไม่พบชื่อในแคมเปญ</div>
        <div class="imp-prev-cols">คอลัมน์ที่จะอัปเดต: ${esc(fieldsFound) || "—"}</div>
        ${matched.length ? `<ul class="imp-prev-list">${matched.slice(0, 12).map((x) => `<li><span class="material-symbols-outlined text-[15px]" style="color:#3a7d44">check_circle</span>${esc(x.name)} <span style="color:#8a8a8f">· ${Object.keys(x.vals).length} ค่า</span></li>`).join("")}${matched.length > 12 ? `<li style="color:#8a8a8f">…และอีก ${matched.length - 12}</li>` : ""}</ul>` : ""}
        ${unmatched.length ? `<div class="imp-prev-warn"><span class="material-symbols-outlined text-[15px]">warning</span>ไม่พบชื่อในแคมเปญ: ${unmatched.slice(0, 8).map(esc).join(", ")}${unmatched.length > 8 ? ` …(+${unmatched.length - 8})` : ""}</div>` : ""}
      </div>`;
      const apply = m.querySelector("[data-apply]");
      apply.disabled = !matched.length; apply.style.opacity = matched.length ? "1" : ".5";
    };
    m.querySelector("[data-parse]").addEventListener("click", async () => {
      const file = m.querySelector("#imp-file").files[0];
      if (file) doParse(await file.text());
      else { const t = m.querySelector("#imp-paste").value.trim(); if (!t) return toast("เลือกไฟล์ หรือวางข้อมูลก่อน", "info"); doParse(t); }
    });
    m.querySelector("[data-apply]").addEventListener("click", async () => {
      if (!parsed || !parsed.length) return;
      parsed.forEach(({ i, vals }) => {
        const k = a.kols[i]; k.metrics = Object.assign({}, k.metrics || {});
        Object.keys(vals).forEach((f) => { if (f === "ad_spend") k.boosting_cost = vals[f]; else k.metrics[f] = vals[f]; });
      });
      try { await saveAsset(a.id, { kols: a.kols }, a); toast(`นำเข้าผล ${parsed.length} KOL แล้ว ✓`); m.remove(); rerender(); }
      catch (e) { toast(e.message, "err"); }
    });
  }

  // ---- HTML report fragment (consumed by the core handoff report) ----
  async function reportHtml(a) {
    curRoster = await CA.roster();
    const ranked = (a.kols || []).filter((k) => hasData(k.metrics) && inObj(k) && srcOK(k))
      .map((k) => ({ k, m: kpi(objFilter, srcFilter, k) }))
      .sort((p, q) => srcFilter === "ad" ? (p.m.valid ? p.m.value : Infinity) - (q.m.valid ? q.m.value : Infinity) : q.m.value - p.m.value);
    if (!ranked.length) return "";
    const f = (v) => (Number(v) || 0).toLocaleString("en-US");
    const rows = ranked.map((x, n) => {
      const m = x.k.metrics || {};
      return `<tr><td class="c">${n + 1}</td><td class="b">${esc(nameOf(x.k))}</td><td class="c">${esc(typeLabel(ctype(x.k)))}</td><td class="n">${f(followersOf(x.k))}</td><td class="n">${f(m.reach)}</td><td class="n">${f(m.impression)}</td><td class="n">${f(engagement(m))}</td><td class="n">${f(conversions(m))}</td><td class="n">${adSpend(x.k) ? "฿" + f(adSpend(x.k)) : "—"}</td><td class="n"><b>${x.m.display}</b></td></tr>`;
    }).join("");
    return `<h2><span class="em">C.</span>Performance <span style="color:#8a8a8f;font-weight:600;font-size:13px">· OBJ ${esc(objFilter)} / ${srcFilter === "ad" ? "AD" : "Organic"}</span></h2>
<div class="panel"><table><thead><tr><th>#</th><th>KOL</th><th>Type</th><th class="n">Followers</th><th class="n">Reach</th><th class="n">Impr.</th><th class="n">Engagement</th><th class="n">Conversions</th><th class="n">Ad Spend</th><th class="n">${esc(kpi(objFilter, srcFilter, { metrics: {} }).label)}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  CA.register({
    id: "section-c",
    order: 3,
    letter: "C.",
    title: "Performance",
    count: (a) => { const n = (a.kols || []).filter((k) => hasData(k.metrics)).length; return `${n} / ${(a.kols || []).length} วัดผล`; },
    controls: (a) => [
      { select: true, value: objFilter, options: OBJECTIVES.map((o) => ({ value: o.id, label: "OBJ: " + o.label })), onChange: (v) => { objFilter = v; rerender(); } },
      { select: true, value: srcFilter, options: SOURCES.map((s) => ({ value: s.id, label: s.label })), onChange: (v) => { srcFilter = v; rerender(); } },
    ],
    actions: (a) => [{ icon: "upload_file", label: "นำเข้าผล", onClick: () => openImportModal(a) }],
    render: async (host, a) => { curRoster = await CA.roster(); renderSection(host, a); },
    reportHtml,
  });
})();
