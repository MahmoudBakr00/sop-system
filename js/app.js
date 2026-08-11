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
    I18N.watch(this.root);
  },

  navigate(hash, force = false) {
    if (location.hash === hash && !force) return this.render();
    location.hash = hash;
  },

  async render() {
    const hash = location.hash || "#/";
    this.root.innerHTML = "";
    const viewMatch = hash.match(/^#\/sop\/([^/]+)$/);

    const main = document.createElement("main");

    if (!Auth.isLoggedIn()) {
      this.root.appendChild(this.topbar());
      this.root.appendChild(main);
      // عرض عام للـ SOP بدون تسجيل دخول — عشان لينك QR يفتح مباشرة لأي حد يمسحه
      if (viewMatch) return this.renderViewer(main, viewMatch[1]);
      return this.renderLogin(main);
    }

    this.root.appendChild(this.topbar());
    this.root.appendChild(main);

    if (hash === "#/" || hash === "") return this.renderList(main);
    if (hash === "#/new") return this.renderNew(main);
    if (hash === "#/users") return this.renderUsers(main);
    const editMatch = hash.match(/^#\/sop\/([^/]+)\/edit$/);
    if (editMatch) return this.renderEditor(main, editMatch[1]);
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

    const langBtn = document.createElement("button");
    langBtn.textContent = I18N.lang === "ar" ? "🌐 EN" : "🌐 AR";
    langBtn.className = "lang-toggle-btn";
    langBtn.onclick = () => {
      I18N.toggle();
      langBtn.textContent = I18N.lang === "ar" ? "🌐 EN" : "🌐 AR";
    };
    nav.appendChild(langBtn);

    if (Auth.isLoggedIn()) {
      const home = document.createElement("a");
      home.href = "#/"; home.textContent = "كل الـ SOPs";
      nav.appendChild(home);
      if (Auth.canEdit()) {
        const add = document.createElement("a");
        add.href = "#/new"; add.textContent = "+ SOP جديد";
        nav.appendChild(add);
      }
      if (Auth.isAdmin()) {
        const users = document.createElement("a");
        users.href = "#/users"; users.textContent = "👥 المستخدمون";
        nav.appendChild(users);
      }
      const who = document.createElement("span");
      who.className = "who";
      who.textContent = `${Auth.profile?.full_name || Auth.session.user.email} (${roleLabel(Auth.profile?.role)})`;
      nav.appendChild(who);

      const bell = document.createElement("div");
      bell.className = "notif-bell";
      bell.innerHTML = `<button id="notif-btn">🔔<span class="notif-count" style="display:none;"></span></button><div class="notif-panel" style="display:none;"></div>`;
      nav.appendChild(bell);
      this.wireNotifications(bell);

      const out = document.createElement("button");
      out.textContent = "خروج";
      out.onclick = async () => {
        out.disabled = true;
        await Auth.signOut();
        location.reload(); // ريفريش حقيقي — نفس اللي كان بيحل المشكلة يدوي
      };
      nav.appendChild(out);
    }
    return bar;
  },

  // ---------------- جرس الإشعارات ----------------
  async wireNotifications(bell) {
    const btn = bell.querySelector("#notif-btn");
    const countEl = bell.querySelector(".notif-count");
    const panel = bell.querySelector(".notif-panel");
    const userId = Auth.session?.user?.id;
    if (!userId) return;

    const refreshCount = async () => {
      const c = await DB.unreadNotificationsCount(userId);
      if (c > 0) { countEl.textContent = c > 9 ? "9+" : c; countEl.style.display = "inline-block"; }
      else { countEl.style.display = "none"; }
    };
    await refreshCount();

    btn.onclick = async () => {
      const isHidden = panel.style.display === "none";
      if (!isHidden) { panel.style.display = "none"; return; }
      panel.style.display = "block";
      panel.innerHTML = `<div class="spinner"></div>`;
      try {
        const items = await DB.listNotifications(userId);
        panel.innerHTML = items.length ? `
          <div class="notif-head">
            <b>الإشعارات</b>
            <button class="btn btn-sm btn-ghost" id="notif-mark-all">تعليم الكل كمقروء</button>
          </div>
          ${items.map(n => `
            <a href="${n.sop_id ? `#/sop/${n.sop_id}/edit` : "#/"}" class="notif-item ${n.is_read ? "" : "unread"}" data-id="${n.id}">
              <div>${esc(n.message)}</div>
              <div class="hint">${new Date(n.created_at).toLocaleString("ar-EG")}</div>
            </a>
          `).join("")}
        ` : `<div class="notif-empty hint">لا توجد إشعارات</div>`;
        panel.querySelectorAll(".notif-item").forEach(item => {
          item.addEventListener("click", async () => { await DB.markNotificationRead(item.dataset.id); });
        });
        const markAllBtn = panel.querySelector("#notif-mark-all");
        if (markAllBtn) markAllBtn.onclick = async () => {
          await DB.markAllNotificationsRead(userId);
          await refreshCount();
          panel.querySelectorAll(".notif-item.unread").forEach(el => el.classList.remove("unread"));
        };
      } catch (e) {
        panel.innerHTML = `<div class="hint">تعذر تحميل الإشعارات</div>`;
      }
      await refreshCount();
    };
    document.addEventListener("click", (ev) => {
      if (!bell.contains(ev.target)) panel.style.display = "none";
    });
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
      <div class="auth-toggle">ليس لديك حساب؟ <a href="#" id="a-signup-link">إنشاء حساب جديد</a></div>
    `;
    let mode = "login";
    box.querySelector("#a-signup-link").onclick = (e) => {
      e.preventDefault();
      mode = mode === "login" ? "signup" : "login";
      box.querySelector("#a-submit").textContent = mode === "login" ? "دخول" : "إنشاء حساب";
      box.querySelector("h1").textContent = mode === "login" ? "تسجيل الدخول" : "حساب جديد";
      box.querySelector("#a-signup-link").textContent = mode === "login" ? "إنشاء حساب جديد" : "لدي حساب بالفعل";
    };
    box.querySelector("#a-submit").onclick = async () => {
      const email = box.querySelector("#a-email").value.trim();
      const pass = box.querySelector("#a-pass").value;
      const errEl = box.querySelector("#a-error");
      const submitBtn = box.querySelector("#a-submit");
      const originalLabel = submitBtn.textContent;
      errEl.style.display = "none";
      submitBtn.disabled = true;
      submitBtn.textContent = mode === "login" ? "جاري الدخول..." : "جاري الإنشاء...";
      try {
        if (mode === "login") {
          await Auth.signIn(email, pass);
          location.reload(); // ريفريش حقيقي — بيضمن قراءة الجلسة صح حتى لو المتصفح بطّأ حفظها
          return;
        } else {
          await Auth.signUp(email, pass, email.split("@")[0]);
          errEl.style.display = "block";
          errEl.style.color = "var(--ok)";
          errEl.textContent = "تم إنشاء الحساب. تحقق من بريدك إن وجد تأكيد، ثم سجّل الدخول. صلاحيتك الافتراضية: مشاهدة فقط.";
          submitBtn.disabled = false;
          submitBtn.textContent = originalLabel;
          return;
        }
      } catch (e) {
        errEl.style.display = "block";
        errEl.style.color = "";
        errEl.textContent = e.message;
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
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
        <select id="factory-filter">
          <option value="">كل المصانع</option>
        </select>
        <select id="doctype-filter">
          <option value="">SOP و SIP</option>
          <option value="SOP">SOP فقط (تجميع)</option>
          <option value="SIP">SIP فقط (فحص)</option>
        </select>
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

    try {
      const factories = await DB.listDistinctFactories();
      const factorySelect = main.querySelector("#factory-filter");
      factories.forEach(f => {
        const opt = document.createElement("option");
        opt.value = f; opt.textContent = f;
        factorySelect.appendChild(opt);
      });
    } catch (_) { /* غير حرِج */ }

    const load = async () => {
      const search = main.querySelector("#search-box").value.trim();
      const status = main.querySelector("#status-filter").value;
      const factory = main.querySelector("#factory-filter").value;
      const docType = main.querySelector("#doctype-filter").value;
      const grid = main.querySelector("#sop-grid");
      grid.innerHTML = `<div class="spinner"></div>`;
      try {
        let sops = await DB.listSops({ search, status, factory });
        if (docType) sops = sops.filter(s => (s.doc_type || "SOP") === docType);
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
    main.querySelector("#factory-filter").addEventListener("change", load);
    main.querySelector("#doctype-filter").addEventListener("change", load);
    await load();
  },

  // لوحة فلو الخط — فلترة على مستويين: المصنع أولاً، وبعدين الخط جوّاه
  async renderLineFlowDashboard(box) {
    box.innerHTML = `<div class="form-card"><div class="spinner"></div></div>`;
    let factories = [];
    try {
      factories = await DB.listDistinctFactories();
    } catch (e) {
      box.innerHTML = "";
      return;
    }

    box.innerHTML = `
      <div class="form-card">
        <h2 style="margin-top:0;">فلو الخط — ترتيب الـ SOPs (المحطات) ورا بعض</h2>
        <p class="hint">اختر المصنع، وبعدين الخط جوّاه. اضغط أي زر "+" حول أي محطة: يمين/يسار يضيف محطة قبلها أو بعدها في التسلسل، وأعلى/أسفل يضيف محطة تعمل بالتوازي معها في نفس النقطة.</p>
        <div class="field-row">
          <div class="field" style="max-width:260px;">
            <label>المصنع</label>
            <select id="factory-select">
              ${factories.length ? "" : `<option value="">— لا توجد مصانع مسجّلة —</option>`}
              ${factories.map(f => `<option value="${attr(f)}">${esc(f)}</option>`).join("")}
            </select>
          </div>
          <div class="field" style="max-width:260px;">
            <label>الخط</label>
            <select id="line-select"></select>
          </div>
        </div>
        <div id="line-flow-body"></div>
      </div>
    `;

    const factorySelect = box.querySelector("#factory-select");
    const lineSelect = box.querySelector("#line-select");
    const flowBody = box.querySelector("#line-flow-body");

    const loadLine = async () => {
      if (!lineSelect.value) { flowBody.innerHTML = `<div class="hint">اختر خطًا لعرض الفلو بتاعه.</div>`; return; }
      flowBody.innerHTML = `<div class="spinner"></div>`;
      try {
        const sops = await DB.listSops({ station: lineSelect.value });
        flowBody.innerHTML = "";
        flowBody.appendChild(this.buildSopFlowGrid(sops, lineSelect.value, loadLine));
      } catch (e) {
        flowBody.innerHTML = `<div class="hint">${esc(e.message)}</div>`;
      }
    };

    const loadLinesForFactory = async () => {
      lineSelect.innerHTML = `<option value="">جاري التحميل...</option>`;
      try {
        const lines = await DB.listDistinctLines(factorySelect.value);
        lineSelect.innerHTML = lines.length
          ? lines.map(l => `<option value="${attr(l)}">${esc(l)}</option>`).join("")
          : `<option value="">— لا توجد خطوط —</option>`;
      } catch (_) {
        lineSelect.innerHTML = `<option value="">— تعذّر التحميل —</option>`;
      }
      await loadLine();
    };

    factorySelect.addEventListener("change", loadLinesForFactory);
    lineSelect.addEventListener("change", loadLine);

    if (factories.length) await loadLinesForFactory();
    else flowBody.innerHTML = `<div class="hint">أضف "المصنع" لأي SOP الأول عشان فلو الخط يظهر هنا.</div>`;
  },

  // بناء شبكة فلو الـ SOPs: أعمدة = رقم المحطة (تسلسل)، وكل عمود ممكن فيه أكتر من مسار موازي (flow_lane)
  buildSopFlowGrid(sops, line, onChanged) {
    const root = document.createElement("div");
    if (!sops || !sops.length) {
      root.innerHTML = `<div class="hint">لا توجد SOPs على الخط ده.</div>`;
      return root;
    }

    // تجميع حسب (رقم المحطة + نوع المستند) كعمود، وترتيب كل عمود حسب المسار الموازي (صف)
    // لو SOP وSIP بنفس رقم المحطة، بيبقوا عمودين متتاليين (SOP الأول ثم SIP) مش مسار موازي واحد
    const columns = {};
    sops.forEach(s => {
      const dt = s.doc_type || "SOP";
      const key = `${s.station_no ?? "none"}::${dt}`;
      (columns[key] = columns[key] || []).push(s);
    });
    Object.values(columns).forEach(col => col.sort((a, b) => a.flow_lane - b.flow_lane));
    const typeOrder = { SOP: 0, SIP: 1 };
    const colKeys = Object.keys(columns).sort((a, b) => {
      const [aNoRaw, aType] = a.split("::");
      const [bNoRaw, bType] = b.split("::");
      if (aNoRaw === "none" && bNoRaw === "none") return 0;
      if (aNoRaw === "none") return 1;
      if (bNoRaw === "none") return -1;
      const aNo = Number(aNoRaw), bNo = Number(bNoRaw);
      if (aNo !== bNo) return aNo - bNo;
      return (typeOrder[aType] ?? 0) - (typeOrder[bType] ?? 0);
    });

    const addNode = async (refSop, dir) => {
      try {
        const docType = refSop.doc_type || "SOP";
        let newStationNo = refSop.station_no ?? 0;
        let newLane = 0;
        if (dir === "before") {
          await DB.shiftStationNos(line, newStationNo, docType);
        } else if (dir === "after") {
          newStationNo = newStationNo + 1;
          await DB.shiftStationNos(line, newStationNo, docType);
        } else if (dir === "lane-up" || dir === "lane-down") {
          const col = columns[`${refSop.station_no ?? "none"}::${docType}`] || [refSop];
          const lanes = col.map(s => s.flow_lane ?? 0);
          newLane = dir === "lane-up" ? Math.min(...lanes) - 1 : Math.max(...lanes) + 1;
        }
        const created = await DB.createSop({
          title: `${docType} جديد`, title_ar: `${docType} جديد`, status: "draft", doc_type: docType,
          station: line, station_no: newStationNo, flow_lane: newLane,
        });
        location.hash = `#/sop/${created.id}/edit`;
      } catch (e) { toast(e.message, true); }
    };

    const flowEl = document.createElement("div");
    flowEl.className = "station-flow-grid";
    colKeys.forEach((key, colIdx) => {
      if (colIdx > 0) {
        const connector = document.createElement("div");
        connector.className = "station-connector";
        connector.innerHTML = `<div class="line"></div><div class="arrowhead"></div>`;
        flowEl.appendChild(connector);
      }
      const colEl = document.createElement("div");
      colEl.className = "station-col";
      columns[key].forEach(sop => {
        const dt = sop.doc_type || "SOP";
        const cell = document.createElement("div");
        cell.className = "station-cell";
        cell.innerHTML = `
          <button class="node-plus plus-top" title="أضف محطة موازية فوق">+</button>
          <button class="node-plus plus-right" title="أضف محطة قبلها (نفس النوع)">+</button>
          <button class="node-plus plus-left" title="أضف محطة بعدها (نفس النوع)">+</button>
          <button class="node-plus plus-bottom" title="أضف محطة موازية تحت">+</button>
          <a href="#/sop/${sop.id}" class="station-node ${dt === "SIP" ? "station-node-sip" : ""}">
            <div class="station-badge">${sop.station_no ?? "؟"} <span class="station-doctype">${dt}</span></div>
            <div class="station-label">${esc(sop.title_ar || sop.title)}</div>
            <div class="station-sub">${esc(sop.code || "بدون كود")}</div>
          </a>
        `;
        cell.querySelector(".plus-top").onclick = (e) => { e.preventDefault(); addNode(sop, "lane-up"); };
        cell.querySelector(".plus-bottom").onclick = (e) => { e.preventDefault(); addNode(sop, "lane-down"); };
        cell.querySelector(".plus-right").onclick = (e) => { e.preventDefault(); addNode(sop, "before"); };
        cell.querySelector(".plus-left").onclick = (e) => { e.preventDefault(); addNode(sop, "after"); };
        colEl.appendChild(cell);
      });
      flowEl.appendChild(colEl);
    });
    root.appendChild(flowEl);
    return root;
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
          : `<div class="logo-preview logo-empty">لا يوجد شعار بعد</div>`}
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
      <div class="code">${esc(sop.code || "بدون كود")} <span class="badge doctype-${(sop.doc_type || "SOP").toLowerCase()}">${sop.doc_type || "SOP"}</span></div>
      <h3>${esc(sop.title_ar || sop.title)}</h3>
      <div class="meta">
        <span class="badge ${sop.status}">${statusLabel(sop.status)}</span>
        ${sop.factory ? `<span>🏭 ${esc(sop.factory)}</span>` : ""}
        ${sop.station ? `<span>${esc(sop.station)}${sop.station_no ? ` #${sop.station_no}` : ""}</span>` : ""}
        <span>v${sop.version || 1}</span>
      </div>
      <div class="actions">
        <a class="btn btn-sm" href="#/sop/${sop.id}">عرض</a>
        ${Auth.canEdit() ? `<a class="btn btn-sm btn-ghost" href="#/sop/${sop.id}/edit">تعديل</a>` : ""}
        ${Auth.canEdit() ? `<button class="btn btn-sm btn-ghost dup-btn">📋 نسخ</button>` : ""}
        ${Auth.isAdmin() ? `<button class="btn btn-sm btn-danger del-btn">حذف</button>` : ""}
      </div>
    `;
    if (Auth.canEdit()) {
      card.querySelector(".dup-btn").onclick = async () => {
        const factory = prompt(`انسخ "${sop.title_ar || sop.title}" لمصنع (سيب الحقل فاضي عشان يفضل نفس المصنع):`, sop.factory || "");
        if (factory === null) return; // اتلغى
        try {
          const created = await DB.duplicateSop(sop.id, { factory: factory.trim() || null });
          toast("تم نسخ الـ SOP بنجاح");
          location.hash = `#/sop/${created.id}/edit`;
        } catch (e) { toast(e.message, true); }
      };
    }
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
    main.innerHTML = `
      <div class="page-head">
        <div><h1>إنشاء مستند جديد</h1><p>اختار نوع المستند الأول</p></div>
      </div>
      <div class="doc-type-choice">
        <button class="doc-type-card" id="choose-sop">
          <div class="doc-type-icon">📋</div>
          <div class="doc-type-title">SOP</div>
          <div class="doc-type-sub">لإجراءات التجميع (Assembly)</div>
        </button>
        <button class="doc-type-card" id="choose-sip">
          <div class="doc-type-icon">🔍</div>
          <div class="doc-type-title">SIP</div>
          <div class="doc-type-sub">لإجراءات الفحص (Inspection)</div>
        </button>
      </div>
    `;
    const createDoc = async (docType) => {
      main.innerHTML = `<div class="spinner"></div>`;
      try {
        const sop = await DB.createSop({
          title: `${docType} جديد`, title_ar: `${docType} جديد`, status: "draft", doc_type: docType,
        });
        this.navigate(`#/sop/${sop.id}/edit`, true);
      } catch (e) { main.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`; }
    };
    main.querySelector("#choose-sop").onclick = () => createDoc("SOP");
    main.querySelector("#choose-sip").onclick = () => createDoc("SIP");
  },

  // ---------------- إدارة المستخدمين (admin فقط) ----------------
  async renderUsers(main) {
    if (!Auth.isAdmin()) { main.innerHTML = `<div class="empty-state">هذه الصفحة للأدمن فقط</div>`; return; }

    main.innerHTML = `
      <div class="page-head">
        <div><h1>إدارة المستخدمين</h1><p>أنشئ حسابات جديدة (إيميل وباسورد) وعدّل صلاحيات المستخدمين الحاليين</p></div>
      </div>

      <div class="form-card">
        <h2 style="margin-top:0;">+ إنشاء مستخدم جديد</h2>
        <p class="hint">أنشئ الحساب هنا، وابعت الإيميل والباسورد للمستخدم يدويًا عشان يسجّل دخوله بيهم.</p>
        <div class="field-row">
          <div class="field"><label>الإيميل</label><input id="u-email" type="email" placeholder="name@example.com"/></div>
          <div class="field"><label>الباسورد</label><input id="u-password" type="text" placeholder="6 أحرف على الأقل"/></div>
        </div>
        <div class="field-row">
          <div class="field"><label>الاسم الكامل</label><input id="u-name" placeholder="مثال: محمد أحمد"/></div>
          <div class="field"><label>الصلاحية</label>
            <select id="u-role">
              <option value="viewer">مشاهد</option>
              <option value="engineer">مهندس</option>
              <option value="head">هيد</option>
              <option value="director">دايركتور</option>
              <option value="admin">أدمن</option>
            </select>
          </div>
        </div>
        <button class="btn btn-primary" id="u-create-btn">إنشاء الحساب</button>
      </div>

      <div class="form-card">
        <h2 style="margin-top:0;">المستخدمون الحاليون</h2>
        <div id="users-rows"><div class="spinner"></div></div>
      </div>
    `;

    main.querySelector("#u-create-btn").onclick = async (ev) => {
      const btn = ev.currentTarget;
      const email = main.querySelector("#u-email").value.trim();
      const password = main.querySelector("#u-password").value;
      const full_name = main.querySelector("#u-name").value.trim() || null;
      const role = main.querySelector("#u-role").value;
      if (!email || password.length < 6) {
        toast("الإيميل مطلوب، والباسورد لازم يكون 6 أحرف على الأقل", true);
        return;
      }
      btn.disabled = true;
      btn.textContent = "جاري الإنشاء...";
      try {
        await DB.createUserAsAdmin({ email, password, full_name, role });
        toast("تم إنشاء الحساب بنجاح");
        main.querySelector("#u-email").value = "";
        main.querySelector("#u-password").value = "";
        main.querySelector("#u-name").value = "";
        await loadUsers();
      } catch (e) {
        toast(e.message, true);
      }
      btn.disabled = false;
      btn.textContent = "إنشاء الحساب";
    };

    const rowsBox = main.querySelector("#users-rows");
    const roleOptions = [
      ["viewer", "مشاهد"], ["engineer", "مهندس"], ["head", "هيد"],
      ["director", "دايركتور"], ["admin", "أدمن"],
    ];
    const loadUsers = async () => {
      rowsBox.innerHTML = `<div class="spinner"></div>`;
      try {
        const users = await DB.listAllProfiles();
        rowsBox.innerHTML = users.map(u => `
          <div class="list-row" data-id="${u.id}">
            <input class="u-name-edit" value="${attr(u.full_name || "")}" placeholder="بدون اسم" style="flex:1; min-width:130px; padding:6px 8px; border:1px solid var(--blueprint-line); border-radius:3px;">
            <select class="u-role-edit" style="width:120px;">
              ${roleOptions.map(([v, l]) => `<option value="${v}" ${u.role === v ? "selected" : ""}>${l}</option>`).join("")}
            </select>
            <button class="btn btn-sm u-save">حفظ</button>
          </div>
        `).join("") || `<div class="hint">لا يوجد مستخدمون</div>`;
        rowsBox.querySelectorAll(".u-save").forEach(btn => {
          btn.onclick = async () => {
            const row = btn.closest(".list-row");
            const id = row.dataset.id;
            const full_name = row.querySelector(".u-name-edit").value.trim() || null;
            const role = row.querySelector(".u-role-edit").value;
            try {
              await DB.updateProfile(id, { full_name, role });
              toast("تم الحفظ");
            } catch (e) { toast(e.message, true); }
          };
        });
      } catch (e) {
        rowsBox.innerHTML = `<div class="hint">${esc(e.message)}</div>`;
      }
    };
    await loadUsers();
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
  // بيترجم نسخة كاملة من بيانات الـ SOP للإنجليزي (بيستخدم نفس خدمة الترجمة المجانية المستخدمة في التعديل)
  async translateSopClone(sop) {
    const clone = JSON.parse(JSON.stringify(sop));
    const jobs = [];
    const tr = (obj, key) => {
      const val = obj[key];
      if (val && typeof val === "string" && /[\u0600-\u06FF]/.test(val)) {
        jobs.push((async () => {
          try { obj[key] = (await autoTranslate(val)) || val; } catch (_) { /* سيب النص الأصلي لو الترجمة فشلت */ }
        })());
      }
    };

    // العنوان: استخدم الإنجليزي المخزّن لو موجود، وإلا تُرجم النسخة العربية
    clone.title_ar = (clone.title && clone.title.trim()) ? clone.title : clone.title_ar;
    tr(clone, "title_ar");
    ["description", "safety_notes", "deviation_handling", "pre_work_procedure", "post_work_procedure",
      "station", "notes", "inspection_frequency", "inspection_environment"].forEach(k => tr(clone, k));

    (clone.stages || []).forEach(stage => {
      stage.title_ar = (stage.title && stage.title.trim()) ? stage.title : stage.title_ar;
      tr(stage, "title_ar");
      (stage.steps || []).forEach(step => {
        step.title_ar = (step.title && step.title.trim()) ? step.title : step.title_ar;
        tr(step, "title_ar");
        ["description", "accept_criteria", "inspection_method", "inspection_repeat", "reject_action", "spec_value"]
          .forEach(k => tr(step, k));
      });
    });
    (clone.tools || []).forEach(t => { tr(t, "name"); tr(t, "spec"); });
    (clone.references || []).forEach(r => tr(r, "ref_text"));

    await Promise.all(jobs);

    // مصفوفات المتطلبات (كل عنصر لوحده) بعد باقي الحقول
    const reqJobs = [];
    (clone.stages || []).forEach(stage => (stage.steps || []).forEach(step => {
      if (Array.isArray(step.requirements) && step.requirements.length) {
        reqJobs.push((async () => {
          step.requirements = await Promise.all(step.requirements.map(async r => {
            if (r && /[\u0600-\u06FF]/.test(r)) {
              try { return (await autoTranslate(r)) || r; } catch (_) { return r; }
            }
            return r;
          }));
        })());
      }
    }));
    await Promise.all(reqJobs);

    return clone;
  },

  async renderViewer(main, sopId, opts = {}) {
    main.innerHTML = `<div class="spinner"></div>`;
    let sop = opts.sop;
    if (!sop) {
      try { sop = await DB.getSopFull(sopId); }
      catch (e) { main.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`; return; }
    }
    const originalSop = opts.originalSop || sop;
    const isTranslated = !!opts.isTranslated;

    main.innerHTML = "";
    const head = document.createElement("div");
    head.className = "page-head";
    head.innerHTML = `
      <div></div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-ghost" id="translate-btn">${isTranslated ? "🇸🇦 العربية" : "🌐 English"}</button>
        ${Auth.canEdit() ? `<a href="#/sop/${sop.id}/edit" class="btn">✏️ تعديل</a>` : ""}
        ${Auth.canEdit() ? `<button class="btn btn-ghost" id="dup-btn">📋 نسخ لمصنع تاني</button>` : ""}
        <button class="btn btn-ghost" id="factory-print-btn">📊 نسخة الجدول (Excel)</button>
        <button class="btn btn-primary" id="print-btn">🖨️ طباعة / PDF</button>
      </div>
    `;
    main.appendChild(head);
    const dupBtn = head.querySelector("#dup-btn");
    if (dupBtn) dupBtn.onclick = async () => {
      const factory = prompt(`انسخ "${sop.title_ar || sop.title}" لمصنع (سيب الحقل فاضي عشان يفضل نفس المصنع):`, sop.factory || "");
      if (factory === null) return;
      dupBtn.disabled = true;
      dupBtn.textContent = "جاري النسخ...";
      try {
        const created = await DB.duplicateSop(sop.id, { factory: factory.trim() || null });
        toast("تم نسخ الـ SOP بنجاح");
        location.hash = `#/sop/${created.id}/edit`;
      } catch (e) {
        toast(e.message, true);
        dupBtn.disabled = false;
        dupBtn.textContent = "📋 نسخ لمصنع تاني";
      }
    };
    head.querySelector("#translate-btn").onclick = async (ev) => {
      if (isTranslated) {
        return this.renderViewer(main, sopId, { sop: originalSop, isTranslated: false });
      }
      const btn = ev.currentTarget;
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Translating...";
      try {
        const translated = await this.translateSopClone(originalSop);
        await this.renderViewer(main, sopId, { sop: translated, originalSop, isTranslated: true });
      } catch (e) {
        toast(e.message, true);
        btn.disabled = false;
        btn.textContent = original;
      }
    };
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
        <span>اعتماد: <b>${esc(sop.approved_by || "لم يُعتمد بعد")}</b> ${sop.approved_at ? `(${fmtDate(sop.approved_at)})` : ""}</span>
      </div>
      ${sop.video_url ? videoBoxHtml(sop.video_url) : ""}
    `;
    main.appendChild(header);
    wireVideoBox(header);

    // حالة الموافقة
    if (sop.approval_status) {
      const statusLabels = {
        draft: "مسودة", pending_head: "⏳ في انتظار مراجعة الهيد", pending_director: "⏳ في انتظار اعتماد الدايركتور",
        approved: "✅ معتمد نهائيًا", rejected_by_head: "❌ مرفوض من الهيد", rejected_by_director: "❌ مرفوض من الدايركتور",
      };
      main.insertAdjacentHTML("beforeend", `
        <div class="workflow-status status-${sop.approval_status}">${statusLabels[sop.approval_status] || sop.approval_status}</div>
      `);
    }

    // إجراء قبل العمل
    if (sop.pre_work_procedure) {
      main.insertAdjacentHTML("beforeend", `
        <div class="view-section">
          <h2 class="section-title">إجراء قبل العمل (Pre-work)</h2>
          <p>${esc(sop.pre_work_procedure)}</p>
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
    const allSteps = (sop.stages || []).flatMap(s => s.steps || []);
    if (!allSteps.length) {
      main.insertAdjacentHTML("beforeend", `<div class="empty-state">لا توجد خطوات مضافة بعد.</div>`);
    } else {
      main.insertAdjacentHTML("beforeend", `<h2 class="section-title">خطوات التشغيل</h2>`);
      const stepsWrapEl = document.createElement("div");
      allSteps.forEach((step, stIdx) => {
        const stepEl = document.createElement("div");
        stepEl.className = "step-card" + (step.is_critical ? " step-critical" : "");
        stepEl.innerHTML = `
          <div class="step-idx">${stIdx + 1}</div>
          <div class="step-body">
            <h3>${esc(step.title_ar || step.title)} ${step.is_critical ? '<span class="badge critical">حرجة</span>' : ""}</h3>
            ${(step.requirements && step.requirements.length) ? `
              <div class="hint"><b>المعدات والآلات المستخدمة:</b></div>
              <ul class="req-list">${step.requirements.map(r => `<li>${esc(r)}</li>`).join("")}</ul>
            ` : (step.use_general_equipment && sop.tools && sop.tools.length) ? `
              <div class="hint"><b>المعدات والآلات المستخدمة (عام):</b></div>
              <ul class="req-list">${sop.tools.map(t => `<li>${esc(t.name)}${t.spec ? ` — ${esc(t.spec)}` : ""}</li>`).join("")}</ul>
            ` : ""}
            ${sop.safety_notes ? `<div class="hint">⚠️ مهمات وإجراءات الوقاية: ${esc(sop.safety_notes)}</div>` : ""}
            ${step.process_sequence ? `<div class="step-desc"><b>تسلسل الإجراءات:</b> ${esc(step.process_sequence)}</div>` : ""}
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
            ${(step.accept_criteria || step.criteria_definition || step.inspection_method || step.inspection_repeat || step.reject_action) ? `
              <div class="accept-reject">
                ${step.accept_criteria ? `<div class="ar-ok">✔ ${(sop.doc_type === "SOP") ? "مضمون الفحص" : "معيار القبول"}: ${esc(step.accept_criteria)}</div>` : ""}
                ${step.criteria_definition ? `<div class="hint">تحديد المعيار: ${esc(step.criteria_definition)}</div>` : ""}
                ${step.inspection_method ? `<div class="hint">طريقة الفحص: ${esc(step.inspection_method)}</div>` : ""}
                ${step.inspection_repeat ? `<div class="hint">التكرار: ${esc(step.inspection_repeat)}</div>` : ""}
                ${step.time_seconds != null ? `<div class="hint">الزمن: ${esc(step.time_seconds)} ثانية</div>` : ""}
                ${step.accident_prevention ? `<div class="hint">⚠️ تجنب الحوادث: ${esc(step.accident_prevention)}</div>` : ""}
                ${step.reject_action ? `<div class="ar-bad">↩ الإجراء عند الرفض: ${esc(step.reject_action)}</div>` : ""}
              </div>
            ` : ""}
            ${step.responsible_role ? `<div class="hint">المسؤول: <b>${stepRoleLabel(step.responsible_role)}</b></div>` : ""}
            ${step.spec_value ? `<div class="hint">مواصفة فنية: <b>${esc(step.spec_value)}</b></div>` : ""}
            ${step.defect_code ? `<div class="hint">كود العيب: <code>${esc(step.defect_code)}</code></div>` : ""}
          </div>
        `;
        stepsWrapEl.appendChild(stepEl);
      });
      main.appendChild(stepsWrapEl);
    }

    // إجراء بعد انتهاء العمل
    if (sop.post_work_procedure) {
      main.insertAdjacentHTML("beforeend", `
        <div class="view-section">
          <h2 class="section-title">إجراء بعد انتهاء العمل (Post-work)</h2>
          <p>${esc(sop.post_work_procedure)}</p>
        </div>
      `);
    }

    // التوقيعات والملاحظات
    if (sop.trainer_name || sop.inspector_name || sop.supervisor_name || sop.notes) {
      main.insertAdjacentHTML("beforeend", `
        <div class="view-section">
          <h2 class="section-title">التوقيعات والمسؤوليات</h2>
          <table class="rev-table">
            <thead><tr><th>الدور</th><th>الاسم</th><th>الوظيفة</th></tr></thead>
            <tbody>
              ${sop.trainer_name ? `<tr><td>المدرب</td><td>${esc(sop.trainer_name)}</td><td>${esc(sop.trainer_position || "-")}</td></tr>` : ""}
              ${sop.inspector_name ? `<tr><td>المفتش</td><td>${esc(sop.inspector_name)}</td><td>${esc(sop.inspector_position || "-")}</td></tr>` : ""}
              ${sop.supervisor_name ? `<tr><td>المشرف</td><td>${esc(sop.supervisor_name)}</td><td>${esc(sop.supervisor_position || "-")}</td></tr>` : ""}
            </tbody>
          </table>
          ${sop.notes ? `<p style="margin-top:10px;"><b>ملاحظات:</b> ${esc(sop.notes)}</p>` : ""}
        </div>
      `);
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
  return {
    admin: "أدمن", editor: "محرر", viewer: "مشاهد",
    engineer: "مهندس", head: "هيد", director: "دايركتور",
  }[role] || "مشاهد";
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
