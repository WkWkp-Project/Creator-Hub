/* Members directory — separate module (registers route via window.CH).
 * Lightweight people list (admins + customers); no photos, minimal fields. */
(() => {
  "use strict";
  const CH = window.CH;
  if (!CH) { console.error("members.js: CH bridge missing"); return; }
  const { route, api, el, esc, toast, isAdmin, render } = CH;

  const inpCls = "w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-sm py-2 text-[14px] focus:border-primary focus:ring-1 focus:ring-primary";
  const lbl = (t) => `<span class="text-[12px] font-semibold text-on-surface-variant">${t}</span>`;
  const roleBadge = (r) => r === "admin"
    ? `<span class="bg-primary-fixed text-primary text-[11px] font-bold px-sm py-1 rounded-full">Admin</span>`
    : `<span class="bg-surface-container text-on-surface-variant text-[11px] font-bold px-sm py-1 rounded-full">Customer</span>`;

  function modal(title, icon, body, foot) {
    const m = el(`
      <div class="fixed inset-0 z-50 bg-on-surface/50 backdrop-blur-sm flex items-center justify-center p-md">
        <div class="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
          <div class="px-lg py-md border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
            <h2 class="text-[20px] font-bold flex items-center gap-sm"><span class="material-symbols-outlined text-primary">${icon}</span>${esc(title)}</h2>
            <button data-close class="text-on-surface-variant hover:text-on-surface"><span class="material-symbols-outlined">close</span></button>
          </div>
          <div class="p-lg flex flex-col gap-sm">${body}</div>
          <div class="px-lg py-md border-t border-outline-variant flex justify-end gap-sm">${foot}</div>
        </div>
      </div>`);
    document.querySelector("#modal-root").appendChild(m);
    m.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => m.remove()));
    m.addEventListener("click", (e) => { if (e.target === m) m.remove(); });
    return m;
  }

  route("members", async (view) => {
    const members = await api("/members");
    view.appendChild(el(`
      <section class="flex flex-wrap gap-md items-end justify-between">
        <div>
          <h1 class="text-[32px] leading-10 font-semibold tracking-tight">Members</h1>
          <p class="text-on-surface-variant mt-xs">รายชื่อทีม (Admin) และลูกค้า (Customer)</p>
        </div>
        ${isAdmin() ? `<button id="m-new" class="bg-primary text-on-primary font-semibold rounded-lg py-2 px-md hover:bg-primary-container shadow-sm flex items-center gap-1 h-[42px]"><span class="material-symbols-outlined text-[20px]">person_add</span>Add Member</button>` : ""}
      </section>`));

    const groupEl = (title, arr) => {
      const sec = el(`
        <div class="bg-surface-container-lowest rounded-2xl border border-outline-variant elevation-1 overflow-hidden">
          <div class="px-lg py-md border-b border-outline-variant flex justify-between items-center">
            <h3 class="text-[18px] font-semibold">${title}</h3>
            <span class="bg-surface-container text-on-surface-variant text-[12px] font-semibold px-sm py-1 rounded-full">${arr.length}</span>
          </div>
          <div class="p-lg flex flex-col gap-sm"></div>
        </div>`);
      const list = sec.querySelector("div.flex");
      if (!arr.length) { list.innerHTML = `<p class="text-[13px] text-on-surface-variant">— ไม่มี —</p>`; return sec; }
      arr.forEach((m) => {
        const row = el(`
          <div class="flex items-center gap-md py-2 border-b border-outline-variant/60" data-id="${m.id}">
            <span class="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold font-poppins">${esc((m.name || "?")[0].toUpperCase())}</span>
            <div class="flex-1 min-w-0">
              <div class="font-semibold truncate">${esc(m.name)}</div>
              <div class="text-[12px] text-on-surface-variant truncate">${esc(m.email || "—")}${m.organization ? " · " + esc(m.organization) : ""}</div>
            </div>
            ${roleBadge(m.role)}
            ${isAdmin() ? `<button data-edit class="text-on-surface-variant hover:text-primary" title="แก้ไข"><span class="material-symbols-outlined text-[20px]">edit</span></button>
            <button data-del class="text-on-surface-variant hover:text-error" title="ลบ"><span class="material-symbols-outlined text-[20px]">delete</span></button>` : ""}
          </div>`);
        row.querySelector("[data-edit]")?.addEventListener("click", () => openMemberForm(m));
        row.querySelector("[data-del]")?.addEventListener("click", async () => {
          if (!confirm(`ลบ "${m.name}"?`)) return;
          try { await api("/members/" + m.id, { method: "DELETE" }); toast("ลบแล้ว"); render(); }
          catch (e) { toast(e.message, "err"); }
        });
        list.appendChild(row);
      });
      return sec;
    };

    const grid = el(`<section class="grid grid-cols-1 lg:grid-cols-2 gap-gutter"></section>`);
    grid.appendChild(groupEl("👤 Admins (ทีมงาน)", members.filter((m) => m.role === "admin")));
    grid.appendChild(groupEl("🏢 Customers (ลูกค้า)", members.filter((m) => m.role === "customer")));
    view.appendChild(grid);

    view.querySelector("#m-new")?.addEventListener("click", () => openMemberForm());
  });

  function openMemberForm(existing = null) {
    const m0 = existing || {};
    const dlg = modal(existing ? "Edit Member" : "Add Member", existing ? "manage_accounts" : "person_add", `
      <label class="flex flex-col gap-1">${lbl("Name *")}<input id="mf-name" class="${inpCls}" value="${esc(m0.name || "")}"/></label>
      <label class="flex flex-col gap-1">${lbl("Email")}<input id="mf-email" class="${inpCls}" value="${esc(m0.email || "")}" placeholder="name@company.com"/></label>
      <label class="flex flex-col gap-1">${lbl("Role")}<select id="mf-role" class="${inpCls}">
        <option value="customer" ${m0.role === "customer" ? "selected" : ""}>Customer (ลูกค้า)</option>
        <option value="admin" ${m0.role === "admin" ? "selected" : ""}>Admin (ทีมงาน)</option></select></label>
      <label class="flex flex-col gap-1">${lbl("Organization (optional)")}<input id="mf-org" class="${inpCls}" value="${esc(m0.organization || "")}"/></label>
      <label class="flex flex-col gap-1">${lbl("Note (optional)")}<input id="mf-note" class="${inpCls}" value="${esc(m0.note || "")}"/></label>
    `, `
      <button data-close class="px-md py-2 rounded-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Cancel</button>
      <button data-save class="px-md py-2 rounded-lg font-semibold bg-primary text-on-primary hover:bg-primary-container">Save</button>`);
    dlg.querySelector("[data-save]").addEventListener("click", async () => {
      const payload = {
        name: dlg.querySelector("#mf-name").value.trim(),
        email: dlg.querySelector("#mf-email").value.trim(),
        role: dlg.querySelector("#mf-role").value,
        organization: dlg.querySelector("#mf-org").value.trim(),
        note: dlg.querySelector("#mf-note").value.trim(),
      };
      if (!payload.name) return toast("กรุณาใส่ชื่อ", "err");
      try {
        if (existing) await api("/members/" + existing.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        else await api("/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        toast(existing ? "อัปเดตแล้ว" : "เพิ่มสมาชิกแล้ว"); dlg.remove(); render();
      } catch (e) { toast(e.message, "err"); }
    });
  }
})();
