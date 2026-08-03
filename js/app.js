// =====================================================================
// App — hash router + views: login, SOP list, SOP viewer, SOP editor
// =====================================================================
const App = {
  root: null,

  async init() {
    this.root = document.getElementById("app");
    await Auth.init();
    window.addEventListener("hashchange", () => this.render());
    await this.render();
  },

  navigate(hash, force = false) {
    if (location.hash === hash && !force) return this.render();
    location.hash = hash;
  },

  async render() {
    const hash = location.hash || "#/";
    this.root.innerHTML = "";
    this.root.appendChild(this.topbar());

    const main = document.createElement("main");
    this.root.appendChild(main);

    if (!Auth.isLoggedIn()) {
      return this.renderLogin(main);
    }

    if (hash === "#/" || hash === "") return this.renderList(main);
    if (hash === "#/new") return this.renderNew(main);
    const editMatch = hash.match(/^#\/sop\/([^/]+)\/edit$/);
    if (editMatch) return this.renderEditor(main, editMatch[1]);
    const viewMatch = hash.match(/^#\/sop\/([^/]+)$/);
    if (viewMatch) return this.renderViewer(main, viewMatch[1]);

    main.innerHTML = `<div class="empty-state">الصفحة غير موجودة</div>`;
  },

  topbar() {
    const bar = document.createElement("div");
    bar.className = "topbar";
    bar.innerHTML = `
      <div class="brand"><span>📋</span> نظام تعليمات التشغيل <span class="tag">SOP</span></div>
      <nav id="topbar-nav"></nav>
    `;
    const nav = bar.querySelector("#topbar-nav");
    if (Auth.isLoggedIn()) {
      const home = document.createElement("a");
      home.href = "#/"; home.textContent = "كل الـ SOPs";
      nav.appendChild(home);
      if (Auth.canEdit()) {
        const add = document.createElement("a");
        add.href = "#/new"; add.textContent = "+ SOP جديد";
        nav.appendChild(add);
      }
      const who = document.createElement("span");
      who.className = "who";
      who.textContent = `${Auth.profile?.full_name || Auth.session.user.email} (${roleLabel(Auth.profile?.role)})`;
      nav.appendChild(who);
      const out = document.createElement("button");
      out.textContent = "خروج";
      out.onclick = () => Auth.signOut();
      nav.appendChild(out);
    }
    return bar;
  },

  // ---------------- Login ----------------
  renderLogin(main) {
    main.innerHTML = "";
    const box = document.createElement("div");
    box.className = "auth-box";
    box.innerHTML = `
      <h1>تسجيل الدخول</h1>
      <p>نظام تسجيل تعليمات التشغيل القياسية (SOP) بالمراحل والخطوات والصور والفيديو</p>
      <div class="field"><label>البريد الإلكتروني</label><input id="a-email" type="email"/></div>
      <div class="field"><label>كلمة المرور</label><input id="a-pass" type="password"/></div>
      <button class="btn btn-primary" id="a-submit" style="width:100%;">دخول</button>
      <div class="auth-error" id="a-error" style="display:none;"></div>
      <div class="auth-toggle">مفيش حساب؟ <a href="#" id="a-signup-link">إنشاء حساب جديد</a></div>
    `;
    let mode = "login";
    box.querySelector("#a-signup-link").onclick = (e) => {
      e.preventDefault();
      mode = mode === "login" ? "signup" : "login";
      box.querySelector("#a-submit").textContent = mode === "login" ? "دخول" : "إنشاء حساب";
      box.querySelector("h1").textContent = mode === "login" ? "تسجيل الدخول" : "حساب جديد";
      box.querySelector("#a-signup-link").textContent = mode === "login" ? "إنشاء حساب جديد" : "عندي حساب بالفعل";
    };
    box.querySelector("#a-submit").onclick = async () => {
      const email = box.querySelector("#a-email").value.trim();
      const pass = box.querySelector("#a-pass").value;
      const errEl = box.querySelector("#a-error");
      errEl.style.display = "none";
      try {
        if (mode === "login") await Auth.signIn(email, pass);
        else {
          await Auth.signUp(email, pass, email.split("@")[0]);
          errEl.style.display = "block";
          errEl.style.color = "var(--ok)";
          errEl.textContent = "تم إنشاء الحساب. تحقق من بريدك إن وجد تأكيد، ثم سجّل الدخول. صلاحيتك الافتراضية: مشاهدة فقط.";
          return;
        }
      } catch (e) {
        errEl.style.display = "block";
        errEl.style.color = "";
        errEl.textContent = e.message;
      }
    };
    main.appendChild(box);
  },

  // ---------------- List ----------------
  async renderList(main) {
    main.innerHTML = `
      <div class="page-head">
        <div><h1>تعليمات التشغيل (SOPs)</h1><p>كل مرحلة فيها خطوات، متطلبات، صور، وفيديو للفحص أو التجميع</p></div>
        ${Auth.canEdit() ? `<a href="#/new" class="btn btn-primary">+ SOP جديد</a>` : ""}
      </div>
      <div id="line-flow-dashboard"></div>
      ${Auth.isAdmin() ? `<div id="logo-settings"></div>` : ""}
      <div class="filters">
        <input id="search-box" placeholder="ابحث بالاسم أو الكود..."/>
        <select id="status-filter">
          <option value="">كل الحالات</option>
          <option value="active">معتمدة</option>
          <option value="draft">مسودة</option>
          <option value="archived">مؤرشفة</option>
        </select>
      </div>
      <div id="sop-grid" class="sop-grid"><div class="spinner"></div></div>
    `;

    this.renderLineFlowDashboard(main.querySelector("#line-flow-dashboard"));

    if (Auth.isAdmin()) {
      const logoBox = main.querySelector("#logo-settings");
      this.renderLogoSettings(logoBox);
    }

    const load = async () => {
      const search = main.querySelector("#search-box").value.trim();
      const status = main.querySelector("#status-filter").value;
      const grid = main.querySelector("#sop-grid");
      grid.innerHTML = `<div class="spinner"></div>`;
      try {
        const sops = await DB.listSops({ search, status });
        grid.innerHTML = "";
        if (!sops.length) {
          grid.innerHTML = `<div class="empty-state">لا توجد SOPs بعد. ${Auth.canEdit() ? "ابدأ بإضافة واحدة." : ""}</div>`;
          return;
        }
        sops.forEach(sop => grid.appendChild(this.sopCard(sop)));
      } catch (e) { grid.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`; }
    };
    main.querySelector("#search-box").addEventListener("input", debounce(load, 300));
    main.querySelector("#status-filter").addEventListener("change", load);
    await load();
  },

  // لوحة فلو الخط — كل الـ SOPs (كل واحد = محطة) مرتبة ورا بعض حسب رقم المحطة
  async renderLineFlowDashboard(box) {
    box.innerHTML = `<div class="form-card"><div class="spinner"></div></div>`;
    let lines = [];
    try {
      lines = await DB.listDistinctLines();
    } catch (e) {
      box.innerHTML = "";
      return;
    }
    if (!lines.length) { box.innerHTML = ""; return; }

    box.innerHTML = `
      <div class="form-card">
        <h2 style="margin-top:0;">فلو الخط — ترتيب الـ SOPs (المحطات) ورا بعض</h2>
        <div class="field" style="max-width:280px;">
          <label>اختار الخط</label>
          <select id="line-select">
            ${lines.map(l => `<option value="${attr(l)}">${esc(l)}</option>`).join("")}
          </select>
        </div>
        <div id="line-flow-body"></div>
      </div>
    `;

    const select = box.querySelector("#line-select");
    const flowBody = box.querySelector("#line-flow-body");

    const loadLine = async () => {
      flowBody.innerHTML = `<div class="spinner"></div>`;
      try {
        const sops = await DB.listSops({ station: select.value });
        flowBody.innerHTML = this.buildSopFlowHtml(sops);
      } catch (e) {
        flowBody.innerHTML = `<div class="hint">${esc(e.message)}</div>`;
      }
    };
    select.addEventListener("change", loadLine);
    await loadLine();
  },

  // بناء HTML فلو الـ SOPs مرتبة حسب رقم المحطة (كل SOP = محطة على الخط)
  buildSopFlowHtml(sops) {
    if (!sops || !sops.length) return `<div class="hint">لا توجد SOPs على الخط ده.</div>`;
    const ordered = [...sops].sort((a, b) => {
      const an = a.station_no ?? 999999, bn = b.station_no ?? 999999;
      return an - bn;
    });
    return `
      <div class="station-flow">
        ${ordered.map((sop, i) => `
          ${i > 0 ? `<div class="station-connector"><div class="line"></div><div class="arrowhead"></div></div>` : ""}
          <a href="#/sop/${sop.id}" class="station-node" style="text-decoration:none; display:block;">
            <div class="station-badge">${sop.station_no ?? "؟"}</div>
            <div class="station-label">${esc(sop.title_ar || sop.title)}</div>
            <div class="station-sub">${esc(sop.code || "بدون كود")}</div>
          </a>
        `).join("")}
      </div>
    `;
  },

  // لوجو الشركة — بيتضاف مرة واحدة بس من هنا، وبيظهر تلقائيًا في كل الطباعات بعد كده
  async renderLogoSettings(box) {
    box.innerHTML = `<div class="spinner"></div>`;
    let settings;
    try {
      settings = await DB.getAppSettings();
    } catch (e) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML = `
      <div class="logo-settings-box">
        ${settings.logo_url
          ? `<img src="${esc(settings.logo_url)}" class="logo-preview"/>`
          : `<div class="logo-preview logo-empty">مفيش لوجو لسه</div>`}
        <div>
          <b>لوجو الشركة</b>
          <p class="hint">بيتضاف مرة واحدة بس هنا، وبيظهر تلقائيًا على كل الأوراق المطبوعة بعد كده.</p>
          <label class="btn btn-sm">
            ${settings.logo_url ? "تغيير اللوجو" : "+ رفع اللوجو"}
            <input type="file" id="logo-file" accept="image/*" style="display:none;"/>
          </label>
        </div>
      </div>
    `;
    box.querySelector("#logo-file").addEventListener("change", async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      try {
        await DB.uploadCompanyLogo(file);
        toast("تم حفظ اللوجو");
        await this.renderLogoSettings(box);
      } catch (e) { toast(e.message, true); }
    });
  },

  sopCard(sop) {
    const card = document.createElement("div");
    card.className = `sop-card status-${sop.status}`;
    card.innerHTML = `
      <div class="code">${esc(sop.code || "بدون كود")}</div>
      <h3>${esc(sop.title_ar || sop.title)}</h3>
      <div class="meta">
        <span class="badge ${sop.status}">${statusLabel(sop.status)}</span>
        ${sop.station ? `<span>${esc(sop.station)}${sop.station_no ? ` #${sop.station_no}` : ""}</span>` : ""}
        <span>v${sop.version || 1}</span>
      </div>
      <div class="actions">
        <a class="btn btn-sm" href="#/sop/${sop.id}">عرض</a>
        ${Auth.canEdit() ? `<a class="btn btn-sm btn-ghost" href="#/sop/${sop.id}/edit">تعديل</a>` : ""}
        ${Auth.isAdmin() ? `<button class="btn btn-sm btn-danger del-btn">حذف</button>` : ""}
      </div>
    `;
    if (Auth.isAdmin()) {
      card.querySelector(".del-btn").onclick = async () => {
        if (!confirm(`حذف "${sop.title_ar || sop.title}" نهائيًا؟`)) return;
        await DB.deleteSop(sop.id);
        card.remove();
      };
    }
    return card;
  },

  // ---------------- New ----------------
  async renderNew(main) {
    if (!Auth.canEdit()) { main.innerHTML = `<div class="empty-state">ليس لديك صلاحية الإضافة</div>`; return; }
    main.innerHTML = `<div class="spinner"></div>`;
    try {
      const sop = await DB.createSop({ title: "SOP جديد", title_ar: "SOP جديد", status: "draft" });
      this.navigate(`#/sop/${sop.id}/edit`, true);
    } catch (e) { main.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`; }
  },

  // ---------------- Editor ----------------
  async renderEditor(main, sopId) {
    if (!Auth.canEdit()) { main.innerHTML = `<div class="empty-state">ليس لديك صلاحية التعديل</div>`; return; }
    const head = document.createElement("div");
    head.className = "page-head";
    head.innerHTML = `<div><h1>تعديل SOP</h1><p>عدّل المراحل والخطوات — كل تغيير يُحفظ لحظة الضغط على "حفظ"</p></div>
      <a href="#/sop/${sopId}" class="btn">👁 عرض / طباعة</a>`;
    main.appendChild(head);
    const body = document.createElement("div");
    main.appendChild(body);
    try {
      await Editor.render(body, sopId);
    } catch (e) { body.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`; }
  },

  // ---------------- Viewer ----------------
  async renderViewer(main, sopId) {
    main.innerHTML = `<div class="spinner"></div>`;
    let sop;
    try { sop = await DB.getSopFull(sopId); }
    catch (e) { main.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`; return; }

    main.innerHTML = "";
    const head = document.createElement("div");
    head.className = "page-head";
    head.innerHTML = `
      <div></div>
      <div style="display:flex; gap:8px;">
        ${Auth.canEdit() ? `<a href="#/sop/${sop.id}/edit" class="btn">✏️ تعديل</a>` : ""}
        <button class="btn btn-ghost" id="factory-print-btn">📊 نسخة الجدول (Excel)</button>
        <button class="btn btn-primary" id="print-btn">🖨️ طباعة / PDF</button>
      </div>
    `;
    main.appendChild(head);
    head.querySelector("#print-btn").onclick = async (ev) => {
      const btn = ev.currentTarget;
      btn.disabled = true;
      const original = btn.textContent;
      try {
        await PdfExport.exportSop(sop, { onProgress: (msg) => btn.textContent = msg });
      } catch (e) { toast(e.message, true); }
      btn.disabled = false;
      btn.textContent = original;
    };
    head.querySelector("#factory-print-btn").onclick = async (ev) => {
      const btn = ev.currentTarget;
      btn.disabled = true;
      const original = btn.textContent;
      try {
        await PdfExport.exportFactorySheet(sop, { onProgress: (msg) => btn.textContent = msg });
      } catch (e) { toast(e.message, true); }
      btn.disabled = false;
      btn.textContent = original;
    };

    const fmtDate = (d) => d ? new Date(d).toLocaleDateString("ar-EG") : "-";
    const header = document.createElement("div");
    header.className = "sop-header";
    header.innerHTML = `
      <div class="code">Document No: ${esc(sop.code || "— بدون كود بعد —")}</div>
      <h1>${esc(sop.title_ar || sop.title)}</h1>
      <div class="tags">
        <span>الخط: <b>${esc(sop.station || "-")}</b></span>
        <span>الإصدار: <b>Rev. v${sop.version || 1}</b></span>
        <span>الحالة: <b>${statusLabel(sop.status)}</b></span>
      </div>
      <div class="tags" style="margin-top:8px;">
        <span>أنشأ: <b>${esc(sop.created_by_name || "-")}</b> (${fmtDate(sop.created_at)})</span>
        <span>آخر تعديل: <b>${esc(sop.updated_by_name || "-")}</b> (${fmtDate(sop.updated_at)})</span>
        <span>اعتماد: <b>${esc(sop.approved_by || "لسه ما اتعمدتش")}</b> ${sop.approved_at ? `(${fmtDate(sop.approved_at)})` : ""}</span>
      </div>
      ${sop.video_url ? videoBoxHtml(sop.video_url) : ""}
    `;
    main.appendChild(header);
    wireVideoBox(header);

    // 4) الأدوات والمواد
    if (sop.tools && sop.tools.length) {
      const catLabel = { tool: "أداة", instrument: "جهاز قياس", material: "مادة" };
      main.insertAdjacentHTML("beforeend", `
        <div class="view-section">
          <h2 class="section-title">الأدوات والمواد المطلوبة</h2>
          <ul class="req-list">
            ${sop.tools.map(t => `<li>[${esc(catLabel[t.category] || t.category)}] ${esc(t.name)}${t.spec ? ` — ${esc(t.spec)}` : ""}</li>`).join("")}
          </ul>
        </div>
      `);
    }

    // 7) السلامة
    if (sop.safety_notes) {
      main.insertAdjacentHTML("beforeend", `
        <div class="view-section safety-box">
          <h2 class="section-title">⚠️ السلامة (Safety)</h2>
          <p>${esc(sop.safety_notes)}</p>
        </div>
      `);
    }

    // 8) التعامل مع الانحرافات
    if (sop.deviation_handling) {
      main.insertAdjacentHTML("beforeend", `
        <div class="view-section">
          <h2 class="section-title">التعامل مع الانحرافات (Deviation handling)</h2>
          <p>${esc(sop.deviation_handling)}</p>
        </div>
      `);
    }

    // 5-6) خطوات التشغيل + الفحص
    if (!sop.stages.length) {
      main.insertAdjacentHTML("beforeend", `<div class="empty-state">لا توجد مراحل مضافة بعد.</div>`);
    } else {
      main.insertAdjacentHTML("beforeend", `<h2 class="section-title">خطوات التشغيل</h2>`);
      sop.stages.forEach((stage, sIdx) => {
        const stageEl = document.createElement("div");
        stageEl.className = "stage";
        stageEl.innerHTML = `
          <div class="stage-title">
            <div class="stage-num">${sIdx + 1}</div>
            <div><h2>${esc(stage.title_ar || stage.title)}</h2>
            ${stage.description ? `<div class="stage-desc">${esc(stage.description)}</div>` : ""}</div>
          </div>
        `;
        stage.steps.forEach((step, stIdx) => {
          const stepEl = document.createElement("div");
          stepEl.className = "step-card" + (step.is_critical ? " step-critical" : "");
          stepEl.innerHTML = `
            <div class="step-idx">${stIdx + 1}</div>
            <div class="step-body">
              <h3>${esc(step.title_ar || step.title)} ${step.is_critical ? '<span class="badge critical">حرجة</span>' : ""}</h3>
              ${step.requirements && step.requirements.length ? `
                <div class="hint"><b>المعدات والآلات المستخدمة:</b></div>
                <ul class="req-list">${step.requirements.map(r => `<li>${esc(r)}</li>`).join("")}</ul>
              ` : ""}
              ${step.ppe_notes ? `<div class="hint">⚠️ مهمات وإجراءات الوقاية: ${esc(step.ppe_notes)}</div>` : ""}
              ${step.description ? `<div class="step-desc">${esc(step.description)}</div>` : ""}
              ${step.images && step.images.length ? `
                <div class="step-images">
                  ${step.images.map(img => `
                    <figure>
                      <img src="${esc(img.image_url)}" loading="lazy"/>
                      ${img.caption ? `<figcaption>${esc(img.caption)}</figcaption>` : ""}
                    </figure>
                  `).join("")}
                </div>
              ` : ""}
              ${(step.accept_criteria || step.inspection_method || step.inspection_repeat || step.reject_action) ? `
                <div class="accept-reject">
                  ${step.accept_criteria ? `<div class="ar-ok">✔ معيار القبول: ${esc(step.accept_criteria)}</div>` : ""}
                  ${step.inspection_method ? `<div class="hint">طريقة الفحص: ${esc(step.inspection_method)}</div>` : ""}
                  ${step.inspection_repeat ? `<div class="hint">التكرار: ${esc(step.inspection_repeat)}</div>` : ""}
                  ${step.reject_action ? `<div class="ar-bad">↩ الإجراء عند الرفض: ${esc(step.reject_action)}</div>` : ""}
                </div>
              ` : ""}
              ${step.responsible_role ? `<div class="hint">المسؤول: <b>${stepRoleLabel(step.responsible_role)}</b></div>` : ""}
              ${step.spec_value ? `<div class="hint">مواصفة فنية: <b>${esc(step.spec_value)}</b></div>` : ""}
              ${step.defect_code ? `<div class="hint">كود العيب: <code>${esc(step.defect_code)}</code></div>` : ""}
            </div>
          `;
          stageEl.appendChild(stepEl);
        });
        main.appendChild(stageEl);
      });
    }

    // 9) المراجع
    if (sop.references && sop.references.length) {
      main.insertAdjacentHTML("beforeend", `
        <div class="view-section">
          <h2 class="section-title">المراجع</h2>
          <ul class="req-list">
            ${sop.references.map(r => `<li>${r.ref_url ? `<a href="${esc(r.ref_url)}" target="_blank" rel="noopener">${esc(r.ref_text)}</a>` : esc(r.ref_text)}</li>`).join("")}
          </ul>
        </div>
      `);
    }

    // 10) سجل التعديلات
    if (sop.revisions && sop.revisions.length) {
      main.insertAdjacentHTML("beforeend", `
        <div class="view-section">
          <h2 class="section-title">سجل التعديلات</h2>
          <table class="rev-table">
            <thead><tr><th>Rev.</th><th>التاريخ</th><th>بواسطة</th><th>الوصف</th></tr></thead>
            <tbody>
              ${sop.revisions.map(r => `
                <tr>
                  <td>v${r.revision_no}</td>
                  <td>${new Date(r.revision_date).toLocaleString("ar-EG")}</td>
                  <td>${esc(r.profiles?.full_name || "-")}</td>
                  <td>${esc(r.change_summary || "")}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `);
    }
  },
};

function videoBoxHtml(url) {
  return `
    <div class="sop-video-box">
      <video controls preload="metadata" class="sop-video-player">
        <source src="${esc(url)}"/>
        المتصفح مش بيدعم تشغيل الفيديو مباشرة — <a href="${esc(url)}" target="_blank" rel="noopener">افتح الفيديو في تاب جديد</a>
      </video>
      <a href="${esc(url)}" download class="hint">⬇️ تنزيل الفيديو</a>
    </div>
  `;
}
function wireVideoBox(_container) {
  // الفيديو والتنزيل شغالين بالـ HTML الأساسي (video controls + a download) — مفيش سلوك JS إضافي مطلوب هنا
}

function roleLabel(role) {
  return { admin: "أدمن", editor: "محرر", viewer: "مشاهد" }[role] || "مشاهد";
}
function stepRoleLabel(role) {
  return {
    operator: "عامل تشغيل", supervisor: "مشرف", qc: "مراقبة جودة", maintenance: "صيانة", other: "أخرى",
  }[role] || role;
}
function statusLabel(status) {
  return { draft: "مسودة", active: "معتمدة", archived: "مؤرشفة" }[status] || status;
}
function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

App.init();
