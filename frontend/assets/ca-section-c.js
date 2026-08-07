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
 * New imports are stored in asset.performance_results so one creator can have
 * separate image / album / video results without duplicating Section B budgets. */
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
  // Media bucket: an explicit media_type (set on import) wins; otherwise it is
  // inferred from the media uploaded in Section B, defaulting to "image".
  const ctype = (k) => {
    if (k.media_type && BOXES.some((b) => b.type === k.media_type)) return k.media_type;
    const t = (k.media || []).map((x) => x.type);
    return t.includes("video") ? "video" : t.includes("album") ? "album" : "image";
  };
  // Accepted values for the import "Type" column (TH + EN) → canonical bucket.
  const TYPE_ALIASES = {
    image: ["image", "images", "photo", "photos", "picture", "still", "img", "single", "ภาพนิ่ง", "ภาพ", "รูป", "รูปภาพ"],
    album: ["album", "albums", "carousel", "gallery", "อัลบั้ม", "อัลบัม", "หลายรูป"],
    video: ["video", "videos", "vdo", "reel", "reels", "clip", "movie", "วิดีโอ", "วีดีโอ", "คลิป"],
  };
  const normType = (v) => { const x = String(v || "").trim().toLowerCase(); for (const t in TYPE_ALIASES) if (TYPE_ALIASES[t].includes(x)) return t; return null; };

  const N = (v) => Number(v) || 0;
  const engagement = (m) => N(m.likes) + N(m.comments) + N(m.share) + N(m.saved) + N(m.repost);
  const conversions = (m) => N(m.lead) + N(m.sale);
  const adSpend = (k) => N(k.boosting_cost);
  const fmtN = (n) => (n === "" || n == null) ? "" : Number(n).toLocaleString("en-US");
  const baht = (n, dp) => "฿" + (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: dp });
  const hasData = (m) => m && Object.values(m).some((v) => N(v) > 0);
  const hasPerfLayer = (a) => Array.isArray(a.performance_results) && a.performance_results.length > 0;
  const perfItems = (a) => hasPerfLayer(a) ? a.performance_results : (a.kols || []);
  const perfPatchKey = (a) => hasPerfLayer(a) ? "performance_results" : "kols";

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
  const followersOf = (k) => (curRoster.find((r) => r.id === k.influencer_id) || {}).followers || k.followers || N((k.metrics || {}).followers);
  const nameKey = (v) => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");

  const inObj = (k) => !k.objective || k.objective === objFilter;
  // Organic = no ad spend (no boost); AD = has boost. A boosted post is never organic.
  const srcOK = (k) => srcFilter === "ad" ? adSpend(k) > 0 : adSpend(k) === 0;
  const eligible = (a, type) => perfItems(a).map((k, i) => ({ k, i })).filter(({ k }) => ctype(k) === type && inObj(k) && srcOK(k));
  const rankIn = (a, type) => eligible(a, type)
    .map((x) => ({ ...x, m: kpi(objFilter, srcFilter, x.k) }))
    .filter((x) => x.m.valid)
    .sort((p, q) => srcFilter === "ad" ? p.m.value - q.m.value : q.m.value - p.m.value);

  function boxesHtml(a) {
    const p = probeKpi();
    const usingPerfLayer = hasPerfLayer(a);
    const legend = `<div class="perf-legend"><span class="material-symbols-outlined text-[16px]">leaderboard</span>จัดอันดับด้วย <b>${esc(p.label)}</b> <span class="perf-legend-unit">(${esc(p.unit)})</span> · <b>${esc(p.dir)}</b> · ${usingPerfLayer ? "อ่านผลจากไฟล์ Performance แยกตามสื่อ" : "ยังใช้ข้อมูลเดิมจาก KOL Plan"}</div>`;
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
    if (cnt) cnt.textContent = `${perfItems(a).filter((k) => hasData(k.metrics)).length} / ${perfItems(a).length} วัดผล`;
  }
  const rerender = () => { if (curHost && curAsset) renderSection(curHost, curAsset); };

  function openPerfModal(a, type) {
    const box = BOXES.find((b) => b.type === type) || BOXES[0];
    const admin = CA.canEdit(a);   // admin or a manager assigned to this campaign
    const ro = admin ? "" : "disabled";
    const ranked = rankIn(a, type);
    const rowsRef = perfItems(a);
    const patchKey = perfPatchKey(a);
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
    const note = `<div class="text-[12px] text-on-surface-variant">OBJ <b>${esc(objFilter)}</b> · <b>${srcFilter === "ad" ? "AD (Paid)" : "Organic"}</b> → จัดอันดับด้วย <b>${esc(kpiTitle())}</b>${srcFilter === "ad" ? " (ad spend = Boosting จาก Section B/ไฟล์ Performance)" : ""}${admin ? " · แก้ตัวเลขได้ในตาราง" : ""}</div>`;
    const head = `<th>#</th><th>KOL</th><th class="n">Followers</th>${METRICS.map((mt) => `<th class="n">${mt.label}</th>`).join("")}<th class="n">Engagement</th><th class="n">Conversions</th><th class="n">Ad Spend</th><th class="n perf-kpi-h">${esc(kpi(objFilter, srcFilter, { metrics: {} }).label)}</th>`;
    const colspan = METRICS.length + 6;
    const body = `${note}<div class="kol-wrap"><table class="kol-table perf-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${colspan}" style="text-align:center;padding:28px;color:#8a8a8f">ยังไม่มี KOL ที่จัดอันดับได้ในสื่อนี้ (กรอกเมตริก/ปรับ Source)</td></tr>`}</tbody>
      </table></div>`;
    const m = modal(`Performance — ${box.label}`, box.icon, body, `<button data-close class="ml-auto px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Close</button>`, "max-w-7xl");
    if (!admin) return;
    let timer;
    const persist = () => { clearTimeout(timer); timer = setTimeout(() => saveAsset(a.id, { [patchKey]: rowsRef }, a).then(rerender).catch((e) => toast(e.message, "err")), 600); };
    m.querySelectorAll("[data-pf]").forEach((inp) => {
      const key = inp.getAttribute("data-pf"), i = +inp.getAttribute("data-i");
      inp.addEventListener("input", () => {
        const digits = inp.value.replace(/[^\d]/g, "");
        rowsRef[i].metrics = rowsRef[i].metrics || {};
        rowsRef[i].metrics[key] = digits === "" ? "" : Number(digits);
        const mm = rowsRef[i].metrics;
        const setTxt = (sel, v) => { const c = m.querySelector(sel); if (c) c.textContent = v; };
        setTxt(`[data-eng="${i}"]`, fmtN(engagement(mm)));
        setTxt(`[data-conv="${i}"]`, fmtN(conversions(mm)));
        const kc = m.querySelector(`.perf-kpi[data-kpi="${i}"]`);
        if (kc) kc.innerHTML = `<b>${kpi(objFilter, srcFilter, rowsRef[i]).display}</b>`;
        persist();
      });
      inp.addEventListener("focus", () => { const v = (rowsRef[i].metrics || {})[key]; inp.value = (v === "" || v == null) ? "" : String(v); });
      inp.addEventListener("blur", () => { const v = (rowsRef[i].metrics || {})[key]; inp.value = (v === "" || v == null) ? "" : Number(v).toLocaleString("en-US"); });
    });
  }

  // ---- Import performance numbers (CSV exported from the ad back-office) ----
  const FIELD_LABEL = { reach: "Reach", impression: "Impressions", video_view: "Video View", likes: "Likes", comments: "Comments", share: "Share", saved: "Saved", repost: "Repost", link_click: "Traffic", lead: "Lead", sale: "Sale", ad_spend: "Ad Spend" };
  const IMPORT_HEADER_MATCH_THRESHOLD = 95;
  const COLMAP = {
    kol: ["kol", "kols", "kols/channel", "channel", "name", "creator", "ชื่อ"],
    type: ["type", "media", "media type", "media_type", "format", "content type", "content", "ประเภท", "ประเภทสื่อ", "รูปแบบ", "สื่อ"],
    reach: ["reach"], impression: ["impression", "impressions", "impr", "impr."],
    video_view: ["video view", "video views", "views", "vdo view", "view"],
    likes: ["like", "likes"], comments: ["comment", "comments"], share: ["share", "shares"],
    saved: ["save", "saved", "saves"], repost: ["repost", "reposts"],
    link_click: ["link click", "link clicks", "traffic", "click", "clicks"],
    lead: ["lead", "leads"], sale: ["sale", "sales", "purchase", "purchases"],
    ad_spend: ["ad spend", "spend", "cost", "boost", "boosting"],
  };
  COLMAP.kol.push("kol name", "kols name", "creator name", "influencer name");
  COLMAP.impression.push("total impression", "total impressions");
  COLMAP.link_click.push("traffic click", "traffic clicks");
  COLMAP.ad_spend.push("ad spend thb", "boosting cost", "boosting cost thb");
  const headerText = (v) => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
  const headerKey = (v) => headerText(v).replace(/[^\p{L}\p{N}]+/gu, "");
  function levScore(a, b) {
    if (a === b) return 100;
    if (!a || !b) return 0;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      prev = cur;
    }
    return ((Math.max(a.length, b.length) - prev[b.length]) / Math.max(a.length, b.length)) * 100;
  }
  const sortedHeader = (v) => headerText(v).split(/\s+/).filter(Boolean).sort().join(" ");
  function headerScore(raw, alias) {
    const rk = headerKey(raw), ak = headerKey(alias);
    if (!rk || !ak) return 0;
    if (rk === ak) return 100;
    return Math.max(levScore(rk, ak), levScore(sortedHeader(raw), sortedHeader(alias)));
  }
  const colKey = (h) => {
    let bestField = null, bestScore = 0;
    for (const f in COLMAP) {
      COLMAP[f].forEach((alias) => {
        const score = headerScore(h, alias);
        if (score > bestScore) { bestField = f; bestScore = score; }
      });
    }
    return bestScore >= IMPORT_HEADER_MATCH_THRESHOLD ? bestField : null;
  };

  const seedPerfResults = (a) => (a.performance_results || []).length
    ? (a.performance_results || []).map((x) => ({ ...x, metrics: { ...(x.metrics || {}) } }))
    : (a.kols || []).filter((k) => hasData(k.metrics)).map((k) => ({
        influencer_id: k.influencer_id,
        name: nameOf(k),
        followers: followersOf(k),
        tier: k.tier,
        objective: k.objective || objFilter,
        media_type: ctype(k),
        boosting_cost: k.boosting_cost,
        metrics: { ...(k.metrics || {}) },
      }));
  const baseKolFor = (a, name) => (a.kols || []).find((k) => nameKey(nameOf(k)) === nameKey(name) || nameKey(k.name) === nameKey(name)) || {};
  const makePerfResult = (a, name, mediaType) => {
    const base = baseKolFor(a, name);
    return {
      influencer_id: base.influencer_id,
      name: name || base.name || nameOf(base),
      followers: base.followers || followersOf(base),
      tier: base.tier,
      objective: base.objective || objFilter,
      media_type: mediaType,
      boosting_cost: base.boosting_cost || 0,
      metrics: {},
    };
  };
  const rowKey = (row) => `${nameKey(nameOf(row))}::${ctype(row)}`;

  function clearLegacyMetrics(a, type) {
    (a.kols || []).forEach((k) => {
      if (type === "all" || ctype(k) === type) {
        k.metrics = {};
        if (type === "all" && k.media_type) delete k.media_type;
      }
    });
  }

  function openClearModal(a) {
    if (!CA.canEdit(a)) return toast("คุณมีสิทธิ์ดูแคมเปญนี้เท่านั้น (ล้างผลไม่ได้)", "err");
    const items = perfItems(a);
    const counts = Object.fromEntries(BOXES.map((b) => [b.type, items.filter((k) => hasData(k.metrics) && ctype(k) === b.type).length]));
    const total = items.filter((k) => hasData(k.metrics)).length;
    const body = `<div class="text-[13px] text-on-surface-variant">ใช้ตอนอัปไฟล์ผิดหรือต้องเริ่มนำเข้าผลใหม่ ระบบจะล้างเฉพาะ Performance ใน Section C/D ไม่ลบ KOL Plan หรือไฟล์สื่อใน Section B</div>
      <div class="grid grid-cols-2 gap-sm">
        ${BOXES.map((b) => `<button data-clear="${b.type}" class="imp-btn"><span class="material-symbols-outlined text-[16px]">${b.icon}</span>ล้าง ${b.label} (${counts[b.type]})</button>`).join("")}
        <button data-clear="all" class="imp-btn" style="border-color:#f0b4b4;color:#ba1a1a"><span class="material-symbols-outlined text-[16px]">delete_sweep</span>ล้างทั้งหมด (${total})</button>
      </div>`;
    const m = modal("ล้างผล Performance", "delete_sweep", body, `<button data-close class="ml-auto px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Cancel</button>`, "max-w-xl");
    m.querySelectorAll("[data-clear]").forEach((btn) => btn.addEventListener("click", async () => {
      const type = btn.getAttribute("data-clear");
      const label = type === "all" ? "ทั้งหมด" : typeLabel(type);
      if (!confirm(`ล้างผล Performance: ${label}?`)) return;
      try {
        let patch;
        if (hasPerfLayer(a)) {
          a.performance_results = type === "all" ? [] : (a.performance_results || []).filter((k) => ctype(k) !== type);
          clearLegacyMetrics(a, type);
          patch = { performance_results: a.performance_results, kols: a.kols || [] };
        } else {
          clearLegacyMetrics(a, type);
          patch = { kols: a.kols || [] };
        }
        await saveAsset(a.id, patch, a);
        toast(`ล้างผล ${label} แล้ว`);
        m.remove();
        rerender();
      } catch (e) { toast(e.message, "err"); }
    }));
  }

  function openImportModal(a) {
    const cols = ["KOL", "Type", ...Object.values(FIELD_LABEL)];
    const template = cols.join(",") + "\n"
      + "Elena Rodriguez,ภาพนิ่ง,110407,119517,0,66,23,51,8,7,90,0,0,3000\n"
      + "Elena Rodriguez,อัลบั้ม,90000,120000,0,1200,40,20,30,0,80,0,0,2500\n"
      + "Elena Rodriguez,วิดีโอ,124200,152000,540000,2256,52,32,62,0,140,0,0,6000";
    const fmtDoc = `<div class="imp-doc">
      <div class="imp-doc-h">ฟอแมตไฟล์ที่ระบบรับ — CSV (export จากหลังบ้านแอด แล้ว Save as .csv)</div>
      <table class="imp-doc-t"><thead><tr><th>คอลัมน์</th><th>แมชเข้ากับ</th><th>จำเป็น?</th></tr></thead><tbody>
        <tr><td><b>KOL</b></td><td>ชื่อ KOL ในแคมเปญ (ใช้จับคู่)</td><td>จำเป็น</td></tr>
        <tr><td><b>Type</b></td><td>ประเภทสื่อ → แยกกล่อง ภาพนิ่ง / อัลบั้ม / วิดีโอ</td><td>แนะนำมาก</td></tr>
        ${Object.keys(FIELD_LABEL).map((f) => `<tr><td>${FIELD_LABEL[f]}</td><td>metrics.${f}</td><td>ถ้ามี</td></tr>`).join("")}
      </tbody></table>
      <div class="imp-doc-note">• จับคู่ด้วย <b>ชื่อ KOL</b> + <b>Type</b> ดังนั้นชื่อซ้ำทำได้ เช่น Elena มีทั้งภาพนิ่ง/อัลบั้ม/วิดีโอ • ถ้าไม่มี Type ระบบจะลงสื่อที่เลือกในช่อง fallback • ตัวเลขใส่ลูกน้ำได้ • <b>Ad Spend</b> = ค่ายิงแอดของ performance row นั้น</div>
      <button data-tpl class="imp-btn"><span class="material-symbols-outlined text-[16px]">download</span>ดาวน์โหลด template .csv</button>
    </div>`;
    const body = `
      <div class="text-[13px] text-on-surface-variant">นำเข้าแบบเพิ่ม/อัปเดต: ถ้าเจอ <b>ชื่อ KOL + ประเภทสื่อ</b> เดิมจะอัปเดตแถวนั้น ถ้าเป็นสื่อใหม่ของชื่อเดิมจะเพิ่มเป็นผลอีกแถวให้ Section C/D แยกกัน</div>
      <button data-fmt class="imp-fmt"><span class="imp-bang">!</span> ดูฟอแมตไฟล์ที่รองรับ</button>
      <div id="imp-doc" style="display:none">${fmtDoc}</div>
      <div class="grid grid-cols-2 gap-sm">
        <label class="flex flex-col gap-1">${lbl("ถ้าไฟล์ไม่มี Type ให้ลงสื่อ")}<select id="imp-default-type" class="${inpCls}">${BOXES.map((b) => `<option value="${b.type}">${b.label}</option>`).join("")}</select></label>
        <label class="flex flex-col gap-1">${lbl("โหมดนำเข้า")}<select id="imp-mode" class="${inpCls}"><option value="merge">เพิ่ม/อัปเดต (แนะนำ)</option><option value="replace-types">แทนที่เฉพาะสื่อในไฟล์นี้</option><option value="replace-all">ล้างทั้งหมดแล้วนำเข้าใหม่</option></select></label>
      </div>
      <label class="flex flex-col gap-1">${lbl("อัปโหลดไฟล์ CSV")}<input id="imp-file" type="file" accept=".csv,text/csv" class="${inpCls}"/></label>
      <label class="flex flex-col gap-1">${lbl("หรือวางข้อมูล CSV")}<textarea id="imp-paste" rows="4" class="${inpCls}" placeholder="KOL,Type,Reach,Impressions,...&#10;Elena Rodriguez,ภาพนิ่ง,110407,119517,..."></textarea></label>
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
      const fallbackType = m.querySelector("#imp-default-type").value || "image";
      const headers = rows[0].map(colKey);
      const kolCol = headers.indexOf("kol");
      if (kolCol < 0) return toast("ไม่พบคอลัมน์ KOL (ชื่อ KOL) ในหัวตาราง", "err");
      const typeCol = headers.indexOf("type");
      const fieldCols = headers.map((f, idx) => ({ f, idx })).filter((x) => x.f && x.f !== "kol" && x.f !== "type");
      if (!fieldCols.length) return toast("ไม่พบคอลัมน์เมตริกที่รองรับ", "err");
      const baseNames = new Set((a.kols || []).flatMap((k) => [nameOf(k), k.name]).filter(Boolean).map(nameKey));
      const matched = [], unmatched = [];
      for (let r = 1; r < rows.length; r++) {
        const nm = (rows[r][kolCol] || "").trim(); if (!nm) continue;
        const mediaType = (typeCol >= 0 ? normType(rows[r][typeCol]) : null) || fallbackType;
        const vals = {};
        fieldCols.forEach(({ f, idx: ci }) => { const raw = String(rows[r][ci] || "").replace(/[^\d.-]/g, ""); if (raw !== "") vals[f] = Number(raw); });
        if (!baseNames.has(nameKey(nm))) unmatched.push(nm); else matched.push({ name: nm, vals, mediaType });
      }
      parsed = matched;
      const fieldsFound = fieldCols.map((x) => FIELD_LABEL[x.f]).join(", ");
      const byType = Object.fromEntries(BOXES.map((b) => [b.type, matched.filter((x) => x.mediaType === b.type).length]));
      m.querySelector("#imp-preview").innerHTML = `<div class="imp-prev">
        <div class="imp-prev-h">พบ <b style="color:#3a7d44">${matched.length}</b> แมชได้ · <b style="color:${unmatched.length ? "#b06a00" : "#8a8a8f"}">${unmatched.length}</b> ไม่พบชื่อในแคมเปญ</div>
        <div class="imp-prev-cols">คอลัมน์ที่จะอัปเดต: ${esc(fieldsFound) || "—"}</div>
        <div class="imp-prev-cols">แยกสื่อ: ${BOXES.map((b) => `${b.label} <b>${byType[b.type]}</b>`).join(" · ")}</div>
        ${typeCol >= 0
          ? `<div class="imp-prev-cols">ใช้คอลัมน์ Type จากไฟล์ ถ้าค่าอ่านไม่ได้จะลง fallback ที่เลือกไว้</div>`
          : `<div class="imp-prev-cols" style="color:#b06a00">⚠ ไม่มีคอลัมน์ <b>Type</b> → ทุกแถวจะลง <b>${esc(typeLabel(fallbackType))}</b></div>`}
        ${matched.length ? `<ul class="imp-prev-list">${matched.slice(0, 12).map((x) => `<li><span class="material-symbols-outlined text-[15px]" style="color:#3a7d44">check_circle</span>${esc(x.name)} <span style="color:#8a8a8f">· ${esc(typeLabel(x.mediaType))} · ${Object.keys(x.vals).length} ค่า</span></li>`).join("")}${matched.length > 12 ? `<li style="color:#8a8a8f">…และอีก ${matched.length - 12}</li>` : ""}</ul>` : ""}
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
      const mode = m.querySelector("#imp-mode").value;
      let results = seedPerfResults(a);
      const importTypes = new Set(parsed.map((x) => x.mediaType));
      if (mode === "replace-all") results = [];
      else if (mode === "replace-types") results = results.filter((r) => !importTypes.has(ctype(r)));
      const index = new Map(results.map((r, i) => [rowKey(r), i]));
      parsed.forEach(({ name, vals, mediaType }) => {
        const key = `${nameKey(name)}::${mediaType}`;
        let i = index.get(key);
        if (i == null) {
          results.push(makePerfResult(a, name, mediaType));
          i = results.length - 1;
          index.set(key, i);
        }
        const row = results[i];
        row.name = row.name || name;
        row.media_type = mediaType;
        row.objective = row.objective || objFilter;
        row.metrics = Object.assign({}, row.metrics || {});
        Object.keys(vals).forEach((f) => { if (f === "ad_spend") row.boosting_cost = vals[f]; else row.metrics[f] = vals[f]; });
      });
      try {
        a.performance_results = results;
        await saveAsset(a.id, { performance_results: results }, a);
        toast(`นำเข้าผล ${parsed.length} แถวแล้ว ✓`);
        m.remove();
        rerender();
      } catch (e) { toast(e.message, "err"); }
    });
  }

  // ---- HTML report fragment (consumed by the core handoff report) ----
  async function reportHtml(a) {
    curRoster = await CA.roster();
    const ranked = perfItems(a).filter((k) => hasData(k.metrics) && inObj(k) && srcOK(k))
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
    count: (a) => { const n = perfItems(a).filter((k) => hasData(k.metrics)).length; return `${n} / ${perfItems(a).length} วัดผล`; },
    controls: (a) => [
      { select: true, value: objFilter, options: OBJECTIVES.map((o) => ({ value: o.id, label: "OBJ: " + o.label })), onChange: (v) => { objFilter = v; rerender(); } },
      { select: true, value: srcFilter, options: SOURCES.map((s) => ({ value: s.id, label: s.label })), onChange: (v) => { srcFilter = v; rerender(); } },
    ],
    actions: (a) => [
      { icon: "upload_file", label: "นำเข้าผล", onClick: () => openImportModal(a) },
      { icon: "delete_sweep", label: "ล้างผล", onClick: () => openClearModal(a) },
    ],
    render: async (host, a) => { curRoster = await CA.roster(); renderSection(host, a); },
    reportHtml,
  });
})();