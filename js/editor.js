// =====================================================================
// Editor — builds the create/edit form for an SOP: stages, steps,
// requirement chips, image upload, video link. Every mutation re-fetches
// the SOP and re-renders the editor section (simple, predictable).
// =====================================================================
const Editor = {
  async render(container, sopId) {
    container.innerHTML = `<div class="spinner"></div>`;
    const sop = await DB.getSopFull(sopId);
    container.innerHTML = "";
    container.appendChild(this.buildHeaderForm(sop));

    // زرار الحفظ الرئيسي — الوحيد اللي بيحدّث رقم الإصدار (Rev.)
    const saveBar = document.createElement("div");
    saveBar.className = "save-bar";
    saveBar.innerHTML = `
      <button class="btn btn-primary btn-lg" id="master-save-btn">💾 حفظ التعديلات (تحديث الإصدار)</button>
      <span class="hint">كل التعديلات بتتحفظ فورًا أول ما تدوس "حفظ" في أي قسم، لكن رقم الإصدار (Rev.) مش بيزيد إلا لما تدوس الزرار ده.</span>
    `;
    saveBar.querySelector("#master-save-btn").onclick = async () => {
      const btn = saveBar.querySelector("#master-save-btn");
      btn.disabled = true;
      try {
        await this.bump(sop.id, "حفظ التعديلات");
        toast("تم حفظ التعديلات وتحديث الإصدار");
        await this.render(container, sopId);
      } catch (e) { toast(e.message, true); btn.disabled = false; }
    };
    container.appendChild(saveBar);

    const stageHead = document.createElement("h2");
    stageHead.className = "section-title";
    stageHead.textContent = "خطوات التشغيل — المراحل والخطوات";
    container.appendChild(stageHead);

    const stagesWrap = document.createElement("div");
    stagesWrap.id = "editor-stages";
    container.appendChild(stagesWrap);
    this.renderStages(stagesWrap, sop);

    const addStageBtn = document.createElement("button");
    addStageBtn.className = "btn btn-primary";
    addStageBtn.textContent = "+ إضافة مرحلة جديدة";
    addStageBtn.onclick = async () => {
      const stage = await DB.createStage(sop.id, { title: "مرحلة جديدة", title_ar: "مرحلة جديدة" }, sop.stages.length);
      // نضيف أول خطوة على طول عشان تقدر تكتب فيها فورًا من غير خطوة زيادة
      await DB.createStep(stage.id, { title: "خطوة جديدة", title_ar: "خطوة جديدة", requirements: [] }, 0);
      await this.render(container, sopId);
    };
    container.appendChild(addStageBtn);

    container.appendChild(this.buildDetailsForm(sop));
    container.appendChild(this.buildToolsSection(sop));
    container.appendChild(this.buildReferencesSection(sop));
    container.appendChild(this.buildRevisionHistory(sop));
  },

  // تُستدعى بعد أي حفظ ناجح — بتزود رقم الإصدار وتسجّله في سجل التعديلات
  async bump(sopId, summary) {
    try {
      await DB.bumpRevision(sopId, summary);
    } catch (e) {
      // لو المستخدم مش عنده صلاحية أو حصل خطأ، منمنعش الحفظ الأساسي من النجاح
      console.warn("bumpRevision failed:", e.message);
    }
  },

  buildHeaderForm(sop) {
    const card = document.createElement("div");
    card.className = "form-card";
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString("ar-EG") : "-";
    card.innerHTML = `
      <h2>البيانات الأساسية</h2>
      <div class="field-row">
        <div class="field"><label>رقم/كود المستند (يتولّد تلقائيًا من اسم الخط)</label>
          <input id="f-code" value="${attr(sop.code || "— هيتولّد بعد ما تحفظ اسم الخط —")}" disabled/>
        </div>
        <div class="field"><label>الحالة</label>
          <select id="f-status" ${Auth.isAdmin() ? "" : "disabled"}>
            <option value="draft" ${sop.status === "draft" ? "selected" : ""}>مسودة</option>
            <option value="active" ${sop.status === "active" ? "selected" : ""}>معتمدة</option>
            <option value="archived" ${sop.status === "archived" ? "selected" : ""}>مؤرشفة</option>
          </select>
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label>العنوان (عربي)</label><input id="f-title-ar" value="${attr(sop.title_ar)}"/></div>
        <div class="field"><label>Title (English)</label><input id="f-title" value="${attr(sop.title)}"/></div>
      </div>
      <div class="field"><label>الخط</label><input id="f-station" value="${attr(sop.station)}" placeholder="مثال: التجميع النهائي"/></div>
      <div class="field-row">
        <div class="field"><label>عدد مرات الفحص</label><input id="f-freq" value="${attr(sop.inspection_frequency)}" placeholder="مثال: طبقًا لخطط العينات"/></div>
        <div class="field"><label>بيئة الفحص</label><input id="f-env" value="${attr(sop.inspection_environment)}" placeholder="مثال: الفحص على بعد 400 مم من اللوحة"/></div>
      </div>
      <div class="field hint">رقم الإصدار الحالي (Revision No.): <b>v${sop.version || 1}</b> — بيزيد بس لما تدوس زرار "💾 حفظ التعديلات" تحت.</div>

      <div class="field">
        <label>فيديو الـ SOP (طريقة الفحص أو التجميع — فيديو واحد للـ SOP كله)</label>
        <div class="video-row">
          <input id="f-video" value="${attr(sop.video_url)}" placeholder="الصق رابط فيديو (يوتيوب / درايف)..."/>
          <label class="btn btn-sm btn-ghost">
            📹 رفع فيديو <input type="file" accept="video/*" id="sop-video-file" style="display:none;"/>
          </label>
        </div>
        <p class="hint" id="sop-video-status"></p>
        ${sop.video_url ? `<a href="${attr(sop.video_url)}" target="_blank" rel="noopener" class="hint">▶️ الفيديو الحالي</a>` : ""}
      </div>

      <div class="identity-box">
        <div>📝 <b>أنشأ بواسطة:</b> ${esc(sop.created_by_name || "-")} — ${fmtDate(sop.created_at)}</div>
        <div>✏️ <b>آخر تعديل بواسطة:</b> ${esc(sop.updated_by_name || "-")} — ${fmtDate(sop.updated_at)}</div>
        <div>✅ <b>اعتماد:</b> ${sop.approved_by ? `${esc(sop.approved_by)} — ${fmtDate(sop.approved_at)}` : "لسه ما اتعمدتش"}
          ${Auth.isAdmin() ? `<button class="btn btn-sm btn-primary" id="approve-btn" style="margin-inline-start:8px;">${sop.approved_by ? "إعادة الاعتماد" : "✅ اعتماد الـ SOP"}</button>` : ""}
        </div>
        <p class="hint" style="margin:6px 0 0;">الاسم والتاريخ بياخدهم النظام تلقائيًا من حساب المستخدم المسجّل دخول — مفيش إدخال يدوي.</p>
      </div>

      <button class="btn" id="save-header-btn">حفظ بيانات الخط والعنوان</button>
    `;
    wireAutoTranslate(card.querySelector("#f-title-ar"), card.querySelector("#f-title"));

    card.querySelector("#sop-video-file").addEventListener("change", async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      const statusEl = card.querySelector("#sop-video-status");
      const videoInput = card.querySelector("#f-video");
      statusEl.textContent = "جاري رفع الفيديو...";
      try {
        const url = await DB.uploadSopVideo(sop.id, file);
        videoInput.value = url;
        statusEl.textContent = "تم رفع الفيديو — متنساش تدوس \"حفظ\" تحت";
      } catch (e) {
        statusEl.textContent = "";
        toast(e.message, true);
      }
      ev.target.value = "";
    });

    const approveBtn = card.querySelector("#approve-btn");
    if (approveBtn) {
      approveBtn.onclick = async () => {
        try {
          const name = Auth.profile?.full_name || Auth.session?.user?.email || "أدمن";
          const updated = await DB.approveSop(sop.id, name);
          await this.bump(sop.id, "اعتماد الـ SOP");
          Object.assign(sop, updated);
          toast("تم اعتماد الـ SOP");
          await App.navigate(`#/sop/${sop.id}/edit`, true);
        } catch (e) { toast(e.message, true); }
      };
    }

    card.querySelector("#save-header-btn").onclick = async () => {
      const payload = {
        status: Auth.isAdmin() ? card.querySelector("#f-status").value : sop.status,
        title_ar: card.querySelector("#f-title-ar").value.trim(),
        title: card.querySelector("#f-title").value.trim() || card.querySelector("#f-title-ar").value.trim(),
        station: card.querySelector("#f-station").value.trim(),
        inspection_frequency: card.querySelector("#f-freq").value.trim() || null,
        inspection_environment: card.querySelector("#f-env").value.trim() || null,
        video_url: card.querySelector("#f-video").value.trim() || null,
      };
      try {
        const updated = await DB.updateSop(sop.id, payload);
        Object.assign(sop, updated);
        // لو الكود لسه مش متولّد وفيه اسم خط، ولّده دلوقتي
        if (!sop.code && payload.station) {
          const newCode = await DB.generateSopCode(sop.id, payload.station);
          sop.code = newCode;
          card.querySelector("#f-code").value = newCode;
        }
        toast("تم الحفظ");
      } catch (e) { toast(e.message, true); }
    };
    return card;
  },

  // ---------------- تفاصيل إضافية: السلامة/الانحرافات (بعد الخطوات) ----------------
  buildDetailsForm(sop) {
    const card = document.createElement("div");
    card.className = "form-card";
    card.innerHTML = `
      <h2>تفاصيل إضافية</h2>
      <div class="field"><label>السلامة — تحذيرات عامة ومعدات الحماية الشخصية المطلوبة (PPE)</label><textarea id="f-safety" placeholder="مثال: نظارة واقية، قفازات مقاومة للحرارة، حذاء أمان...">${esc(sop.safety_notes)}</textarea></div>
      <div class="field"><label>التعامل مع الانحرافات — الإجراء العام عند حدوث عيب أو توقف خط (ممكن يتربط بنظام الـ Andon)</label><textarea id="f-deviation" placeholder="مثال: أوقف الخط فورًا، بلّغ المشرف، افتح تذكرة في نظام تتبع العيوب...">${esc(sop.deviation_handling)}</textarea></div>
      <button class="btn" id="save-details-btn">حفظ التفاصيل الإضافية</button>
    `;
    card.querySelector("#save-details-btn").onclick = async () => {
      const payload = {
        safety_notes: card.querySelector("#f-safety").value.trim(),
        deviation_handling: card.querySelector("#f-deviation").value.trim(),
      };
      try {
        const updated = await DB.updateSop(sop.id, payload);
        Object.assign(sop, updated);
        toast("تم الحفظ");
      } catch (e) { toast(e.message, true); }
    };
    return card;
  },

  // ---------------- 4) الأدوات والمواد المطلوبة ----------------
  buildToolsSection(sop) {
    const card = document.createElement("div");
    card.className = "form-card";
    card.innerHTML = `
      <h2>4) الأدوات والمواد المطلوبة</h2>
      <p class="hint">العدد، الأجهزة، أدوات القياس، المواد الخام أو المكونات</p>
      <div class="list-rows" id="tools-rows"></div>
      <div class="editor-toolbar">
        <select id="tool-cat" style="width:130px;">
          <option value="tool">أداة/عدة</option>
          <option value="instrument">جهاز قياس</option>
          <option value="material">مادة/مكوّن</option>
        </select>
        <input id="tool-name" placeholder="الاسم" style="flex:1; padding:8px 10px; border:1px solid var(--blueprint-line); border-radius:3px;">
        <input id="tool-spec" placeholder="مواصفة/معايرة (اختياري)" style="flex:1; padding:8px 10px; border:1px solid var(--blueprint-line); border-radius:3px;">
        <button class="btn btn-sm btn-primary" id="tool-add">+ إضافة</button>
      </div>
    `;
    const rows = card.querySelector("#tools-rows");
    const catLabel = { tool: "أداة", instrument: "قياس", material: "مادة" };
    const paint = () => {
      rows.innerHTML = (sop.tools || []).map(t => `
        <div class="list-row" data-id="${t.id}">
          <span class="badge tool-cat">${catLabel[t.category] || t.category}</span>
          <b>${esc(t.name)}</b>
          ${t.spec ? `<span class="hint">— ${esc(t.spec)}</span>` : ""}
          <button class="btn btn-sm btn-danger rm" style="margin-inline-start:auto;">حذف</button>
        </div>
      `).join("") || `<div class="hint">لسه مفيش أدوات/مواد مضافة</div>`;
      rows.querySelectorAll(".rm").forEach(btn => {
        btn.onclick = async () => {
          const id = btn.closest(".list-row").dataset.id;
          await DB.deleteTool(id);
          sop.tools = sop.tools.filter(t => t.id !== id);
          paint();
        };
      });
    };
    card.querySelector("#tool-add").onclick = async () => {
      const name = card.querySelector("#tool-name").value.trim();
      if (!name) return;
      const category = card.querySelector("#tool-cat").value;
      const spec = card.querySelector("#tool-spec").value.trim() || null;
      try {
        const t = await DB.addTool(sop.id, { name, category, spec }, (sop.tools || []).length);
        sop.tools = [...(sop.tools || []), t];
        card.querySelector("#tool-name").value = "";
        card.querySelector("#tool-spec").value = "";
        paint();
      } catch (e) { toast(e.message, true); }
    };
    paint();
    return card;
  },

  // ---------------- 9) المراجع ----------------
  buildReferencesSection(sop) {
    const card = document.createElement("div");
    card.className = "form-card";
    card.innerHTML = `
      <h2>9) المراجع (References)</h2>
      <p class="hint">المعايير أو المستندات المرتبطة (IEC standards، رسومات هندسية...)</p>
      <div class="list-rows" id="refs-rows"></div>
      <div class="editor-toolbar">
        <input id="ref-text" placeholder="مثال: IEC 60335-2-24:2025" style="flex:1; padding:8px 10px; border:1px solid var(--blueprint-line); border-radius:3px;">
        <input id="ref-url" placeholder="رابط (اختياري)" style="flex:1; padding:8px 10px; border:1px solid var(--blueprint-line); border-radius:3px;">
        <button class="btn btn-sm btn-primary" id="ref-add">+ إضافة</button>
      </div>
    `;
    const rows = card.querySelector("#refs-rows");
    const paint = () => {
      rows.innerHTML = (sop.references || []).map(r => `
        <div class="list-row" data-id="${r.id}">
          <b>${esc(r.ref_text)}</b>
          ${r.ref_url ? `<a href="${attr(r.ref_url)}" target="_blank" rel="noopener" class="hint">فتح الرابط</a>` : ""}
          <button class="btn btn-sm btn-danger rm" style="margin-inline-start:auto;">حذف</button>
        </div>
      `).join("") || `<div class="hint">لسه مفيش مراجع مضافة</div>`;
      rows.querySelectorAll(".rm").forEach(btn => {
        btn.onclick = async () => {
          const id = btn.closest(".list-row").dataset.id;
          await DB.deleteReference(id);
          sop.references = sop.references.filter(r => r.id !== id);
          paint();
        };
      });
    };
    card.querySelector("#ref-add").onclick = async () => {
      const ref_text = card.querySelector("#ref-text").value.trim();
      if (!ref_text) return;
      const ref_url = card.querySelector("#ref-url").value.trim() || null;
      try {
        const r = await DB.addReference(sop.id, { ref_text, ref_url }, (sop.references || []).length);
        sop.references = [...(sop.references || []), r];
        card.querySelector("#ref-text").value = "";
        card.querySelector("#ref-url").value = "";
        paint();
      } catch (e) { toast(e.message, true); }
    };
    paint();
    return card;
  },

  // ---------------- 10) سجل التعديلات ----------------
  buildRevisionHistory(sop) {
    const card = document.createElement("div");
    card.className = "form-card";
    card.innerHTML = `
      <h2>10) سجل التعديلات (Revision history)</h2>
      <table class="rev-table">
        <thead><tr><th>Rev.</th><th>التاريخ</th><th>بواسطة</th><th>الوصف</th></tr></thead>
        <tbody>
          ${(sop.revisions || []).map(r => `
            <tr>
              <td>v${r.revision_no}</td>
              <td>${new Date(r.revision_date).toLocaleString("ar-EG")}</td>
              <td>${esc(r.profiles?.full_name || "-")}</td>
              <td>${esc(r.change_summary || "")}</td>
            </tr>
          `).join("") || `<tr><td colspan="4" class="hint">لسه مفيش تعديلات مسجلة</td></tr>`}
        </tbody>
      </table>
    `;
    return card;
  },

  renderStages(wrap, sop) {
    wrap.innerHTML = "";
    sop.stages.forEach((stage, sIdx) => {
      const el = document.createElement("div");
      el.className = "editor-stage";
      el.innerHTML = `
        <div class="field-row" style="align-items:flex-end;">
          <div class="field" style="max-width:130px;"><label>رقم المحطة (فريد)</label><input class="st-station-no" type="number" min="1" value="${stage.station_no ?? ""}" placeholder="مثال: 1"/></div>
          <div class="field"><label>عنوان المرحلة ${sIdx + 1} (عربي)</label><input class="st-title-ar" value="${attr(stage.title_ar)}"/></div>
          <div class="field"><label>Title (English)</label><input class="st-title" value="${attr(stage.title)}"/></div>
        </div>
        <div class="editor-toolbar">
          <button class="btn btn-sm save-stage">حفظ المرحلة</button>
          <button class="btn btn-sm btn-ghost move-up" ${sIdx === 0 ? "disabled" : ""}>▲ لأعلى</button>
          <button class="btn btn-sm btn-ghost move-down" ${sIdx === sop.stages.length - 1 ? "disabled" : ""}>▼ لأسفل</button>
          <button class="btn btn-sm btn-danger del-stage">حذف المرحلة</button>
        </div>
        <div class="steps-wrap"></div>
        <button class="btn btn-sm add-step">+ إضافة خطوة</button>
      `;
      wireAutoTranslate(el.querySelector(".st-title-ar"), el.querySelector(".st-title"));
      wrap.appendChild(el);

      el.querySelector(".save-stage").onclick = async () => {
        const stationNoRaw = el.querySelector(".st-station-no").value.trim();
        const stationNo = stationNoRaw === "" ? null : Number(stationNoRaw);
        try {
          await DB.updateStage(stage.id, {
            title_ar: el.querySelector(".st-title-ar").value.trim(),
            title: el.querySelector(".st-title").value.trim(),
            station_no: stationNo,
          });
          stage.station_no = stationNo;
          toast("تم حفظ المرحلة");
        } catch (e) {
          if (String(e.message).includes("uq_stage_station_no") || e.code === "23505") {
            toast("رقم المحطة ده مستخدم قبل كده في نفس الـ SOP — اختار رقم تاني", true);
          } else {
            toast(e.message, true);
          }
        }
      };
      el.querySelector(".del-stage").onclick = async () => {
        if (!confirm("حذف المرحلة وكل خطواتها؟")) return;
        await DB.deleteStage(stage.id);
        await this.render(wrap.parentElement, sop.id);
      };
      el.querySelector(".move-up").onclick = async () => {
        const ids = sop.stages.map(s => s.id);
        [ids[sIdx - 1], ids[sIdx]] = [ids[sIdx], ids[sIdx - 1]];
        await DB.reorderStages(ids);
        await this.render(wrap.parentElement, sop.id);
      };
      el.querySelector(".move-down").onclick = async () => {
        const ids = sop.stages.map(s => s.id);
        [ids[sIdx + 1], ids[sIdx]] = [ids[sIdx], ids[sIdx + 1]];
        await DB.reorderStages(ids);
        await this.render(wrap.parentElement, sop.id);
      };
      el.querySelector(".add-step").onclick = async () => {
        await DB.createStep(stage.id, { title: "خطوة جديدة", title_ar: "خطوة جديدة", requirements: [] }, stage.steps.length);
        await this.render(wrap.parentElement, sop.id);
      };

      const stepsWrap = el.querySelector(".steps-wrap");
      stage.steps.forEach((step, stIdx) => this.renderStep(stepsWrap, sop, stage, step, stIdx));
    });
  },

  renderStep(wrap, sop, stage, step, stIdx) {
    const el = document.createElement("div");
    el.className = "editor-step";
    const roleOptions = [
      ["", "— اختر —"], ["operator", "عامل تشغيل (Operator)"], ["supervisor", "مشرف (Supervisor)"],
      ["qc", "مراقبة جودة (QC)"], ["maintenance", "صيانة (Maintenance)"], ["other", "أخرى"],
    ];
    el.innerHTML = `
      <div class="field-row">
        <div class="field"><label>1) الخطوة ${stIdx + 1} (عربي)</label><input class="sp-title-ar" value="${attr(step.title_ar)}"/></div>
        <div class="field"><label>Title (English) — تلقائي</label><input class="sp-title" value="${attr(step.title)}"/></div>
      </div>

      <div class="field-row">
        <div class="field">
          <label>2) المعدات والآلات المستخدمة — اكتب واضغط Enter لإضافة كل عنصر</label>
          <div class="chip-input" data-reqs='${JSON.stringify(step.requirements || [])}'>
            ${(step.requirements || []).map((r, i) => `<span class="chip" data-i="${i}">${esc(r)}<button type="button">×</button></span>`).join("")}
            <input class="req-input" placeholder="أضف أداة أو آلة..." style="border:none; flex:1; min-width:120px; padding:4px;"/>
          </div>
        </div>
        <div class="field"><label>مهمات وإجراءات الوقاية (السيفتي)</label><input class="sp-ppe" value="${attr(step.ppe_notes)}" placeholder="مثال: افصل الكهرباء قبل الفتح، ارتدِ نظارة واقية"/></div>
      </div>

      <div class="field"><label>3) شرح الخطوة</label><textarea class="sp-desc">${esc(step.description)}</textarea></div>

      <div class="field">
        <label>4) صورة الخطوة</label>
        <div class="img-upload-row">
          ${(step.images || []).map(img => `
            <div class="img-thumb" data-img-id="${img.id}" data-url="${attr(img.image_url)}">
              <img src="${attr(img.image_url)}"/>
              <button type="button" class="rm-img">×</button>
            </div>
          `).join("")}
          <label class="btn btn-sm btn-ghost" style="display:flex;align-items:center;">
            + رفع صورة <input type="file" accept="image/*" multiple class="img-file" style="display:none;"/>
          </label>
        </div>
      </div>

      <div class="field-row">
        <div class="field"><label>5) معيار القبول</label><textarea class="sp-accept" placeholder="مثال: لا يوجد خدوش، الفجوة 0.5-1mm">${esc(step.accept_criteria)}</textarea></div>
        <div class="field"><label>6) طريقة الفحص</label><textarea class="sp-method" placeholder="مثال: فحص بصري بمصباح يدوي على بعد 400 مم">${esc(step.inspection_method)}</textarea></div>
      </div>
      <div class="field-row">
        <div class="field"><label>7) التكرار</label><input class="sp-repeat" value="${attr(step.inspection_repeat)}" placeholder="مثال: كل قطعة / كل ساعة / عينة عشوائية"/></div>
        <div class="field"><label>8) الإجراء عند الرفض</label><input class="sp-reject-action" value="${attr(step.reject_action)}" placeholder="مثال: أوقف المحطة، ضع بطاقة رفض، بلّغ المشرف"/></div>
      </div>

      <details class="editor-extra">
        <summary>بيانات إضافية (اختياري)</summary>
        <div class="field-row" style="margin-top:10px;">
          <div class="field"><label>المسؤول عن الخطوة</label>
            <select class="sp-role">
              ${roleOptions.map(([v, l]) => `<option value="${v}" ${step.responsible_role === v ? "selected" : ""}>${l}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>مواصفة فنية (Torque / أبعاد)</label><input class="sp-spec" value="${attr(step.spec_value)}" placeholder="مثال: 2.5 N·m ± 0.3"/></div>
        </div>
        <div class="field-row">
          <div class="field"><label>كود العيب المرتبط</label><input class="sp-defect" value="${attr(step.defect_code)}" placeholder="مثال: DEF-COND-014"/></div>
          <div class="field"><label><input type="checkbox" class="sp-critical" ${step.is_critical ? "checked" : ""}/> خطوة حرجة (وقفة إلزامية)</label></div>
        </div>
      </details>

      <div class="editor-toolbar">
        <button class="btn btn-sm save-step">حفظ الخطوة</button>
        <button class="btn btn-sm btn-ghost move-up" ${stIdx === 0 ? "disabled" : ""}>▲</button>
        <button class="btn btn-sm btn-ghost move-down" ${stIdx === stage.steps.length - 1 ? "disabled" : ""}>▼</button>
        <button class="btn btn-sm btn-danger del-step">حذف الخطوة</button>
      </div>
    `;
    wrap.appendChild(el);
    wireAutoTranslate(el.querySelector(".sp-title-ar"), el.querySelector(".sp-title"));

    // requirement chips
    const chipInput = el.querySelector(".chip-input");
    let reqs = [...(step.requirements || [])];
    const reqInput = chipInput.querySelector(".req-input");
    reqInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && reqInput.value.trim()) {
        ev.preventDefault();
        reqs.push(reqInput.value.trim());
        reqInput.value = "";
        refreshChips();
      }
    });
    function refreshChips() {
      chipInput.querySelectorAll(".chip").forEach(c => c.remove());
      reqs.forEach((r, i) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.innerHTML = `${esc(r)}<button type="button">×</button>`;
        chip.querySelector("button").onclick = () => { reqs.splice(i, 1); refreshChips(); };
        chipInput.insertBefore(chip, reqInput);
      });
    }

    // image delete
    el.querySelectorAll(".rm-img").forEach(btn => {
      btn.onclick = async () => {
        const thumb = btn.closest(".img-thumb");
        if (!confirm("حذف الصورة؟")) return;
        await DB.deleteStepImage(thumb.dataset.imgId, thumb.dataset.url);
        thumb.remove();
      };
    });

    // image upload
    el.querySelector(".img-file").addEventListener("change", async (ev) => {
      const files = Array.from(ev.target.files);
      const uploadRow = el.querySelector(".img-upload-row");
      for (const file of files) {
        try {
          const img = await DB.uploadStepImage(step.id, file, (step.images || []).length);
          const thumb = document.createElement("div");
          thumb.className = "img-thumb";
          thumb.dataset.imgId = img.id;
          thumb.dataset.url = img.image_url;
          thumb.innerHTML = `<img src="${attr(img.image_url)}"/><button type="button" class="rm-img">×</button>`;
          thumb.querySelector(".rm-img").onclick = async () => {
            if (!confirm("حذف الصورة؟")) return;
            await DB.deleteStepImage(img.id, img.image_url);
            thumb.remove();
          };
          uploadRow.insertBefore(thumb, uploadRow.lastElementChild);
        } catch (e) { toast(e.message, true); }
      }
      ev.target.value = "";
    });

    el.querySelector(".save-step").onclick = async () => {
      try {
        const payload = {
          title_ar: el.querySelector(".sp-title-ar").value.trim(),
          title: el.querySelector(".sp-title").value.trim(),
          description: el.querySelector(".sp-desc").value.trim(),
          requirements: reqs,
          responsible_role: el.querySelector(".sp-role").value || null,
          spec_value: el.querySelector(".sp-spec").value.trim() || null,
          accept_criteria: el.querySelector(".sp-accept").value.trim() || null,
          inspection_method: el.querySelector(".sp-method").value.trim() || null,
          inspection_repeat: el.querySelector(".sp-repeat").value.trim() || null,
          reject_action: el.querySelector(".sp-reject-action").value.trim() || null,
          defect_code: el.querySelector(".sp-defect").value.trim() || null,
          ppe_notes: el.querySelector(".sp-ppe").value.trim() || null,
          is_critical: el.querySelector(".sp-critical").checked,
        };
        await DB.updateStep(step.id, payload);
        Object.assign(step, payload);
        toast("تم حفظ الخطوة");
      } catch (e) { toast(e.message, true); }
    };
    el.querySelector(".del-step").onclick = async () => {
      if (!confirm("حذف الخطوة؟")) return;
      await DB.deleteStep(step.id);
      await App.navigate(`#/sop/${sop.id}/edit`, true);
    };
    el.querySelector(".move-up").onclick = async () => {
      const ids = stage.steps.map(s => s.id);
      [ids[stIdx - 1], ids[stIdx]] = [ids[stIdx], ids[stIdx - 1]];
      await DB.reorderSteps(ids);
      await App.navigate(`#/sop/${sop.id}/edit`, true);
    };
    el.querySelector(".move-down").onclick = async () => {
      const ids = stage.steps.map(s => s.id);
      [ids[stIdx + 1], ids[stIdx]] = [ids[stIdx], ids[stIdx + 1]];
      await DB.reorderSteps(ids);
      await App.navigate(`#/sop/${sop.id}/edit`, true);
    };
  },
};

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));
}
function attr(str) { return esc(str); }

// ترجمة تلقائية عربي → إنجليزي (مجانية بدون مفتاح API — MyMemory)
// بتتنفذ بس لو حقل الإنجليزي فاضي وقت ما المستخدم يخرج من حقل العربي
async function autoTranslate(text) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ar|en`;
  const res = await fetch(url);
  const data = await res.json();
  return data?.responseData?.translatedText || "";
}

// يربط حقل عربي بحقل إنجليزي: يترجم تلقائيًا لو الإنجليزي لسه فاضي
function wireAutoTranslate(arInput, enInput) {
  arInput.addEventListener("blur", async () => {
    const ar = arInput.value.trim();
    if (!ar || enInput.value.trim()) return; // فاضي أو الإنجليزي متكتب يدويًا بالفعل
    enInput.placeholder = "جاري الترجمة...";
    try {
      const en = await autoTranslate(ar);
      if (en && !enInput.value.trim()) enInput.value = en;
    } catch (e) { /* فشل الترجمة صامت — المستخدم يقدر يكتبها يدوي */ }
    enInput.placeholder = "";
  });
}

function toast(msg, isError = false) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = isError ? "show error" : "show";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = ""; }, 3000);
}
