/* Section A — Approved Input Files (cover thumbnails + Drive links).
 * Self-registers with the content-asset core via window.CA.register(). */
(() => {
  "use strict";
  const CA = window.CA;
  if (!CA) { console.error("ca-section-a.js: CA connector missing"); return; }
  const { api, el, esc, toast, isAdmin, uploadFile, mediaSrc, modal, inpCls, lbl, sectionAFiles, saveAsset } = CA;

  const NUM_COLORS = ["#e1121c", "#18181b", "#e1121c", "#18181b"];
  const SRC_LABEL = { google_drive: "GOOGLE DRIVE", uploaded: "UPLOADED", notion: "NOTION", none: "—" };

  // Persist a cover thumbnail onto one input-file slot (sends the full array).
  async function saveSlotThumb(a, slotIndex, thumbUrl) {
    const inputFiles = (a.input_files || []).map((f) => ({ ...f }));
    while (inputFiles.length <= slotIndex) inputFiles.push({ key: "slot_" + inputFiles.length, linked: false });
    inputFiles[slotIndex].thumb = thumbUrl;
    await saveAsset(a.id, { input_files: inputFiles });
  }

  function cardsHtml(a) {
    const canEdit = CA.canEdit(a);   // admin or a manager assigned to this campaign
    return sectionAFiles(a).map((f, i) => {
      const color = NUM_COLORS[i % NUM_COLORS.length];
      const thumbSrc = f.thumb ? mediaSrc(f.thumb) : "";
      const thumbInner = thumbSrc
        ? `<img class="ca-thumb-img" src="${esc(thumbSrc)}" alt="${esc(f.title)}"/>
           ${canEdit ? `<div class="ca-thumb-actions">
             <button class="ca-thumb-btn" data-change="${i}" title="เปลี่ยนรูป"><span class="material-symbols-outlined" style="font-size:16px">photo_camera</span></button>
             <button class="ca-thumb-btn" data-remove="${i}" title="ลบรูป"><span class="material-symbols-outlined" style="font-size:16px">delete</span></button>
           </div>` : ""}`
        : `<div class="ca-thumb-empty">
             <span class="material-symbols-outlined" style="font-size:30px">add_photo_alternate</span>
             <div class="ca-thumb-hint">${canEdit ? "อัปโหลดรูปหน้าปก" : "ยังไม่มีรูปหน้าปก"}</div>
             <div class="ca-thumb-dim">อัตราส่วน 16:9 · แนะนำ 1280×720px · JPG/PNG/WebP</div>
             ${canEdit ? `<button class="ca-thumb-up" data-up="${i}"><span class="material-symbols-outlined" style="font-size:16px">upload</span>เลือกรูป</button>` : ""}
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
  }

  function renderSection(host, a) {
    host.innerHTML = `<div class="ca-cards ca-cards-3">${cardsHtml(a)}</div>`;

    host.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
      const url = b.getAttribute("data-view");
      if (url) window.open(url, "_blank", "noopener");
      else toast("ยังไม่ได้ลิงก์ไฟล์นี้", "info");
    }));

    if (!CA.canEdit(a)) return;
    const pickThumb = (slotIndex) => {
      const inp = document.createElement("input");
      inp.type = "file"; inp.accept = "image/png,image/jpeg,image/webp,image/gif";
      inp.addEventListener("change", async () => {
        const file = inp.files && inp.files[0];
        if (!file) return;
        try {
          const { url } = await uploadFile("/uploads/campaign-media", file);
          await saveSlotThumb(a, slotIndex, url);
          toast("อัปโหลดรูปหน้าปกแล้ว"); CA.render();
        } catch (e) { toast(e.message, "err"); }
      });
      inp.click();
    };
    host.querySelectorAll("[data-up]").forEach((b) => b.addEventListener("click", () => pickThumb(+b.getAttribute("data-up"))));
    host.querySelectorAll("[data-change]").forEach((b) => b.addEventListener("click", () => pickThumb(+b.getAttribute("data-change"))));
    host.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("ลบรูปหน้าปกนี้?")) return;
      try { await saveSlotThumb(a, +b.getAttribute("data-remove"), ""); toast("ลบรูปแล้ว"); CA.render(); }
      catch (e) { toast(e.message, "err"); }
    }));
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
      try { await api("/assets/" + a.id + "/drive-links", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(links) }); toast("บันทึกลิงก์แล้ว"); m.remove(); CA.render(); }
      catch (e) { toast(e.message, "err"); }
    });
  }

  // ---- HTML report fragment (consumed by the core handoff report) ----
  function reportHtml(a) {
    const rows = sectionAFiles(a).map((f) => `<tr><td class="b">${esc(f.title)}</td><td>${f.linked ? "✅ Linked" : "⬜ Not linked"}</td><td>${f.drive_url ? `<a href="${esc(f.drive_url)}" target="_blank" rel="noopener">เปิด ↗</a>` : "—"}</td></tr>`).join("");
    return `<h2><span class="em">A.</span>Approved Input Files</h2>
<div class="panel"><table><thead><tr><th>File</th><th>Status</th><th>Link</th></tr></thead><tbody>${rows || `<tr><td colspan="3">—</td></tr>`}</tbody></table></div>`;
  }

  CA.register({
    id: "section-a",
    order: 1,
    letter: "A.",
    title: "Approved Input Files",
    count: (a) => { const f = sectionAFiles(a); return `${f.filter((x) => x.linked).length} OF ${f.length} LINKED`; },
    actions: (a) => [{ icon: "link", label: "Connect Drive", onClick: () => openDriveModal(a) }],
    render: renderSection,
    reportHtml,
  });
})();
