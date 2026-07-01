/* Section D — All Results (one combined table of every KOL's performance,
 * regardless of media type or objective). Collapsed by default; expand to see
 * the full overview. Read-only display (edit numbers in Section C / Import). */
(() => {
  "use strict";
  const CA = window.CA;
  if (!CA) { console.error("ca-section-d.js: CA connector missing"); return; }
  const { el, esc, isAdmin } = CA;

  const COLS = [
    { k: "reach", label: "Reach" },
    { k: "impression", label: "Impr." },
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
  const N = (v) => Number(v) || 0;
  const engagement = (m) => N(m.likes) + N(m.comments) + N(m.share) + N(m.saved) + N(m.repost);
  const conversions = (m) => N(m.lead) + N(m.sale);
  // Media type — mirror Section C: an explicit media_type (set on import) wins,
  // otherwise infer from Section B media, defaulting to ภาพนิ่ง.
  const TYPE_LABEL = { image: "ภาพนิ่ง", album: "อัลบัม", video: "วิดีโอ" };
  const ctype = (k) => {
    if (k.media_type && TYPE_LABEL[k.media_type]) return TYPE_LABEL[k.media_type];
    const t = (k.media || []).map((x) => x.type);
    return t.includes("video") ? "วิดีโอ" : t.includes("album") ? "อัลบัม" : "ภาพนิ่ง";
  };
  const fmtN = (n) => (n === "" || n == null) ? "" : Number(n).toLocaleString("en-US");
  const hasData = (m) => m && Object.values(m).some((v) => N(v) > 0);

  let expanded = false, curAsset = null, curHost = null, curRoster = [];
  let sortKey = "engagement", sortDir = "desc";
  const tierRank = (t) => ({ Mega: 5, Macro: 4, "Mid-Tier": 3, Micro: 2, Nano: 1 }[t] || 0);
  const nameOf = (k) => (curRoster.find((r) => r.id === k.influencer_id) || {}).name || k.name || ("#" + k.influencer_id);
  const followersOf = (k) => (curRoster.find((r) => r.id === k.influencer_id) || {}).followers || N((k.metrics || {}).followers);
  const tierOf = (k) => (curRoster.find((r) => r.id === k.influencer_id) || {}).tier || k.tier || "";
  const tierChip = (k) => { const t = tierOf(k); return t ? `<span class="tier-chip tier-${["Nano", "Micro", "Mid-Tier", "Macro", "Mega"].includes(t) ? t : "custom"}">${esc(t)}</span>` : "—"; };

  // Sortable columns (every header is clickable to toggle asc/desc).
  const SORT_COLS = [
    { key: "kol", label: "KOL", text: true },
    { key: "tier", label: "Tier", cls: "c" },
    { key: "type", label: "Type", text: true, cls: "c" },
    { key: "source", label: "Source", cls: "c" },
    { key: "followers", label: "Followers", cls: "n" },
    ...COLS.map((c) => ({ key: c.k, label: c.label, cls: "n" })),
    { key: "engagement", label: "Engagement", cls: "n" },
    { key: "conversions", label: "Conversions", cls: "n" },
    { key: "ad_spend", label: "Ad Spend", cls: "n" },
  ];
  const colLabel = (key) => (SORT_COLS.find((c) => c.key === key) || {}).label || key;
  const isText = (key) => !!(SORT_COLS.find((c) => c.key === key) || {}).text;
  function sortVal(k, key) {
    const m = k.metrics || {};
    if (key === "kol") return nameOf(k).toLowerCase();
    if (key === "type") return ctype(k);
    if (key === "tier") return tierRank(tierOf(k));
    if (key === "source") return N(k.boosting_cost) > 0 ? 1 : 0;
    if (key === "followers") return followersOf(k);
    if (key === "engagement") return engagement(m);
    if (key === "conversions") return conversions(m);
    if (key === "ad_spend") return N(k.boosting_cost);
    return N(m[key]);
  }
  const ranked = (a) => (a.kols || []).slice().sort((p, q) => {
    const va = sortVal(p, sortKey), vb = sortVal(q, sortKey);
    const c = (typeof va === "string") ? String(va).localeCompare(String(vb)) : (va - vb);
    return sortDir === "asc" ? c : -c;
  }).map((k) => ({ k }));

  function tableHtml(a) {
    const rows = ranked(a).map((x, n) => {
      const m = x.k.metrics || {};
      const paid = N(x.k.boosting_cost) > 0;
      return `<tr>
        <td class="kol-rownum">${n + 1}</td>
        <td class="kol-name">${esc(nameOf(x.k))}</td>
        <td class="c">${tierChip(x.k)}</td>
        <td class="c">${ctype(x.k)}</td>
        <td class="c">${paid ? '<span class="d-src d-paid">Paid</span>' : '<span class="d-src d-org">Organic</span>'}</td>
        <td class="n">${fmtN(followersOf(x.k))}</td>
        ${COLS.map((c) => `<td class="n">${fmtN(m[c.k]) || "—"}</td>`).join("")}
        <td class="n"><b>${fmtN(engagement(m)) || "—"}</b></td>
        <td class="n"><b>${fmtN(conversions(m)) || "—"}</b></td>
        <td class="n">${N(x.k.boosting_cost) ? "฿" + fmtN(x.k.boosting_cost) : "—"}</td>
      </tr>`;
    }).join("");
    const colspan = SORT_COLS.length + 1;
    const arrow = (key) => sortKey === key ? `<span class="d-arrow">${sortDir === "asc" ? "▲" : "▼"}</span>` : `<span class="d-arrow d-arrow-dim">↕</span>`;
    const heads = SORT_COLS.map((c) => `<th class="d-sort ${c.cls || ""}${sortKey === c.key ? " d-sort-on" : ""}" data-sort="${c.key}">${c.label}${arrow(c.key)}</th>`).join("");
    return `<div class="kol-wrap"><table class="kol-table perf-table d-table">
      <thead><tr><th>#</th>${heads}</tr></thead>
      <tbody>${rows || `<tr><td colspan="${colspan}" style="text-align:center;padding:24px;color:#8a8a8f">ยังไม่มี KOL</td></tr>`}</tbody>
    </table></div>`;
  }

  function renderSection(host, a) {
    if (curAsset && curAsset.id !== a.id) expanded = false;
    curHost = host; curAsset = a;
    const total = (a.kols || []).length;
    const measured = (a.kols || []).filter((k) => hasData(k.metrics)).length;
    if (!expanded) {
      host.innerHTML = `<div class="d-collapsed">
        <div class="d-collapsed-info"><span class="material-symbols-outlined">table_view</span>
          <div><div class="d-collapsed-title">ตารางผลรวมทุก KOL</div>
            <div class="d-collapsed-sub">${total} KOL · วัดผลแล้ว ${measured} · ทุกประเภทสื่อรวมในตารางเดียว</div></div></div>
        <button class="d-toggle" data-toggle><span class="material-symbols-outlined text-[18px]">expand_more</span>ขยายดูภาพรวม</button>
      </div>`;
    } else {
      host.innerHTML = `<div class="d-bar"><span class="d-bar-info">ผลรวมทุก KOL (${total}) · เรียงตาม <b>${esc(colLabel(sortKey))}</b> (${sortDir === "asc" ? "น้อย→มาก" : "มาก→น้อย"}) · คลิกหัวคอลัมน์เพื่อจัดเรียง</span>
        <button class="d-toggle" data-toggle><span class="material-symbols-outlined text-[18px]">expand_less</span>หุบ</button></div>${tableHtml(a)}`;
      host.querySelectorAll(".d-sort").forEach((th) => th.addEventListener("click", () => {
        const key = th.getAttribute("data-sort");
        if (sortKey === key) sortDir = sortDir === "asc" ? "desc" : "asc";
        else { sortKey = key; sortDir = isText(key) ? "asc" : "desc"; }
        renderSection(host, a);
      }));
    }
    host.querySelector("[data-toggle]").addEventListener("click", () => { expanded = !expanded; renderSection(host, a); });
  }

  async function reportHtml(a) {
    curRoster = await CA.roster();
    const list = (a.kols || []).filter((k) => hasData(k.metrics))
      .sort((p, q) => engagement(q.metrics || {}) - engagement(p.metrics || {})).map((k) => ({ k }));
    if (!list.length) return "";
    const f = (v) => N(v) ? Number(v).toLocaleString("en-US") : "—";
    const rows = list.map((x, n) => {
      const m = x.k.metrics || {};
      return `<tr><td class="c">${n + 1}</td><td class="b">${esc(nameOf(x.k))}</td><td class="c">${esc(tierOf(x.k)) || "—"}</td><td class="c">${ctype(x.k)}</td><td class="c">${N(x.k.boosting_cost) > 0 ? "Paid" : "Organic"}</td><td class="n">${f(followersOf(x.k))}</td>${COLS.map((c) => `<td class="n">${f(m[c.k])}</td>`).join("")}<td class="n">${f(engagement(m))}</td><td class="n">${f(conversions(m))}</td><td class="n">${N(x.k.boosting_cost) ? "฿" + f(x.k.boosting_cost) : "—"}</td></tr>`;
    }).join("");
    return `<h2><span class="em">D.</span>ผลรวมทุก KOL <span style="color:#8a8a8f;font-weight:600;font-size:13px">· ${list.length} KOL</span></h2>
<div class="panel"><table><thead><tr><th>#</th><th>KOL</th><th>Tier</th><th>Type</th><th>Source</th><th class="n">Followers</th>${COLS.map((c) => `<th class="n">${c.label}</th>`).join("")}<th class="n">Engagement</th><th class="n">Conversions</th><th class="n">Ad Spend</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  CA.register({
    id: "section-d",
    order: 4,
    letter: "D.",
    title: "ผลรวมทุก KOL",
    count: (a) => `${(a.kols || []).length} KOL`,
    render: async (host, a) => { curRoster = await CA.roster(); renderSection(host, a); },
    reportHtml,
  });
})();
