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
    container.appendChild(this.buildSopForm(sop));
    container.appendChild(this.buildToolsSection(sop));
    container.appendChild(this.buildReferencesSection(sop));

    const stageHead = document.createElement("h2");
    stageHead.className = "section-title";
    stageHead.textContent = "5) خطوات التشغيل — المراحل والخطوات";
    container.appendChild(stageHead);

    const stagesWrap = document.createElement("div");
    stagesWrap.id = "editor-stages";
    container.appendChild(stagesWrap);
    this.renderStages(stagesWrap, sop);

    const addStageBtn = document.createElement("button");
    addStageBtn.className = "btn btn-primary";
    addStageBtn.textContent = "+ إضافة مرحلة جديدة";
    addStageBtn.onclick = async () => {
      await DB.createStage(sop.id, { title: "مرحلة جديدة", title_ar: "مرحلة جديدة" }, sop.stages.length);
      await this.bump(sop.id, "إضافة مرحلة جديدة");
      await this.render(container, sopId);
    };
    container.appendChild(addStageBtn);

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

  buildSopForm(sop) {
    const card = document.createElement("div");
    card.className = "form-card";
    card.innerHTML = `
      <h2>1) البيانات الأساسية (Header)</h2>
      <div class="field-row">
        <div class="field"><label>رقم/كود المستند (Document No.)</label><input id="f-code" value="${attr(sop.code)}" placeholder="SOP-QC-014"/></div>
        <div class="field"><label>الحالة</label>
          <select id="f-status">
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
      <div class="field-row">
        <div class="field"><label>خط الإنتاج / الخط</label><input id="f-line" value="${attr(sop.product_line)}"/></div>
        <div class="field"><label>المحطة</label><input id="f-station" value="${attr(sop.station)}"/></div>
      </div>
      <div class="field hint">رقم الإصدار الحالي (Revision No.): <b>v${sop.version || 1}</b> — بيزيد تلقائيًا مع كل حفظ، وتلاقي تفاصيل كل تعديل في "سجل التعديلات" تحت.</div>

      <div class="field-row" style="margin-top:10px;">
        <div class="field"><label>إعداد (Prepared by)</label><input id="f-prep-by" value="${attr(sop.prepared_by)}"/></div>
        <div class="field"><label>تاريخ الإعداد</label><input type="date" id="f-prep-at" value="${attr(sop.prepared_at)}"/></div>
      </div>
      <div class="field-row">
        <div class="field"><label>مراجعة (Reviewed by)</label><input id="f-rev-by" value="${attr(sop.reviewed_by)}"/></div>
        <div class="field"><label>تاريخ المراجعة</label><input type="date" id="f-rev-at" value="${attr(sop.reviewed_at)}"/></div>
      </div>
      <div class="field-row">
        <div class="field"><label>اعتماد (Approved by)</label><input id="f-appr-by" value="${attr(sop.approved_by)}"/></div>
        <div class="field"><label>تاريخ الاعتماد</label><input type="date" id="f-appr-at" value="${attr(sop.approved_at)}"/></div>
      </div>

      <h2 style="margin-top:20px;">2) الهدف والنطاق (Purpose &amp; Scope)</h2>
      <div class="field"><label>الهدف من الإجراء (Purpose)</label><textarea id="f-desc">${esc(sop.description)}</textarea></div>
      <div class="field"><label>النطاق — المنتجات/المحطات اللي بيتطبق عليها (Scope)</label><textarea id="f-scope">${esc(sop.scope)}</textarea></div>

      <h2 style="margin-top:20px;">7) السلامة (Safety precautions)</h2>
      <div class="field"><label>تحذيرات عامة ومعدات الحماية الشخصية المطلوبة (PPE)</label><textarea id="f-safety" placeholder="مثال: نظارة واقية، قفازات مقاومة للحرارة، حذاء أمان...">${esc(sop.safety_notes)}</textarea></div>

      <h2 style="margin-top:20px;">8) التعامل مع الانحرافات (Deviation handling)</h2>
      <div class="field"><label>الإجراء عند حدوث عيب أو توقف خط (ممكن يتربط بنظام الـ Andon)</label><textarea id="f-deviation" placeholder="مثال: أوقف الخط فورًا، بلّغ المشرف، افتح تذكرة في نظام تتبع العيوب...">${esc(sop.deviation_handling)}</textarea></div>

      <button class="btn btn-primary" id="save-sop-btn">حفظ بيانات الـ SOP</button>
    `;
    card.querySelector("#save-sop-btn").onclick = async () => {
      const payload = {
        code: card.querySelector("#f-code").value.trim() || null,
        status: card.querySelector("#f-status").value,
        title_ar: card.querySelector("#f-title-ar").value.trim(),
        title: card.querySelector("#f-title").value.trim() || card.querySelector("#f-title-ar").value.trim(),
        product_line: card.querySelector("#f-line").value.trim(),
        station: card.querySelector("#f-station").value.trim(),
        description: card.querySelector("#f-desc").value.trim(),
        scope: card.querySelector("#f-scope").value.trim(),
        prepared_by: card.querySelector("#f-prep-by").value.trim() || null,
        prepared_at: card.querySelector("#f-prep-at").value || null,
        reviewed_by: card.querySelector("#f-rev-by").value.trim() || null,
        reviewed_at: card.querySelector("#f-rev-at").value || null,
        approved_by: card.querySelector("#f-appr-by").value.trim() || null,
        approved_at: card.querySelector("#f-appr-at").value || null,
        safety_notes: card.querySelector("#f-safety").value.trim(),
        deviation_handling: card.querySelector("#f-deviation").value.trim(),
      };
      try {
        await DB.updateSop(sop.id, payload);
        await this.bump(sop.id, "تعديل البيانات الأساسية / الهدف / السلامة / الانحرافات");
        Object.assign(sop, payload);
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
          await this.bump(sop.id, "حذف أداة/مادة");
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
        await this.bump(sop.id, `إضافة أداة/مادة: ${name}`);
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
          await this.bump(sop.id, "حذف مرجع");
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
        await this.bump(sop.id, `إضافة مرجع: ${ref_text}`);
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
          <div class="field"><label>عنوان المرحلة ${sIdx + 1} (عربي)</label><input class="st-title-ar" value="${attr(stage.title_ar)}"/></div>
          <div class="field"><label>Title (English)</label><input class="st-title" value="${attr(stage.title)}"/></div>
        </div>
        <div class="editor-toolbar">
          <button class="btn btn-sm save-stage">حفظ عنوان المرحلة</button>
          <button class="btn btn-sm btn-ghost move-up" ${sIdx === 0 ? "disabled" : ""}>▲ لأعلى</button>
          <button class="btn btn-sm btn-ghost move-down" ${sIdx === sop.stages.length - 1 ? "disabled" : ""}>▼ لأسفل</button>
          <button class="btn btn-sm btn-danger del-stage">حذف المرحلة</button>
        </div>
        <div class="steps-wrap"></div>
        <button class="btn btn-sm add-step">+ إضافة خطوة</button>
      `;
      wrap.appendChild(el);

      el.querySelector(".save-stage").onclick = async () => {
        await DB.updateStage(stage.id, {
          title_ar: el.querySelector(".st-title-ar").value.trim(),
          title: el.querySelector(".st-title").value.trim(),
        });
        await this.bump(sop.id, `تعديل مرحلة: ${el.querySelector(".st-title-ar").value.trim()}`);
        toast("تم حفظ عنوان المرحلة");
      };
      el.querySelector(".del-stage").onclick = async () => {
        if (!confirm("حذف المرحلة وكل خطواتها؟")) return;
        await DB.deleteStage(stage.id);
        await this.bump(sop.id, "حذف مرحلة");
        await this.render(wrap.parentElement, sop.id);
      };
      el.querySelector(".move-up").onclick = async () => {
        const ids = sop.stages.map(s => s.id);
        [ids[sIdx - 1], ids[sIdx]] = [ids[sIdx], ids[sIdx - 1]];
        await DB.reorderStages(ids);
        await this.bump(sop.id, "إعادة ترتيب المراحل");
        await this.render(wrap.parentElement, sop.id);
      };
      el.querySelector(".move-down").onclick = async () => {
        const ids = sop.stages.map(s => s.id);
        [ids[sIdx + 1], ids[sIdx]] = [ids[sIdx], ids[sIdx + 1]];
        await DB.reorderStages(ids);
        await this.bump(sop.id, "إعادة ترتيب المراحل");
        await this.render(wrap.parentElement, sop.id);
      };
      el.querySelector(".add-step").onclick = async () => {
        await DB.createStep(stage.id, { title: "خطوة جديدة", title_ar: "خطوة جديدة", requirements: [] }, stage.steps.length);
        await this.bump(sop.id, "إضافة خطوة جديدة");
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
        <div class="field"><label>عنوان الخطوة ${stIdx + 1} (عربي)</label><input class="sp-title-ar" value="${attr(step.title_ar)}"/></div>
        <div class="field"><label>Title (English)</label><input class="sp-title" value="${attr(step.title)}"/></div>
      </div>
      <div class="field"><label>الوصف / طريقة التنفيذ</label><textarea class="sp-desc">${esc(step.description)}</textarea></div>

      <div class="field-row">
        <div class="field"><label>3) المسؤول عن الخطوة (Responsibility)</label>
          <select class="sp-role">
            ${roleOptions.map(([v, l]) => `<option value="${v}" ${step.responsible_role === v ? "selected" : ""}>${l}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>مواصفة فنية (Torque / أبعاد / قيمة مطلوبة)</label><input class="sp-spec" value="${attr(step.spec_value)}" placeholder="مثال: 2.5 N·m ± 0.3"/></div>
      </div>

      <div class="field">
        <label>المتطلبات (أدوات / مواد لهذه الخطوة) — اكتب واضغط Enter</label>
        <div class="chip-input" data-reqs='${JSON.stringify(step.requirements || [])}'>
          ${(step.requirements || []).map((r, i) => `<span class="chip" data-i="${i}">${esc(r)}<button type="button">×</button></span>`).join("")}
          <input class="req-input" placeholder="أضف متطلب..." style="border:none; flex:1; min-width:120px; padding:4px;"/>
        </div>
      </div>

      <div class="field-row">
        <div class="field"><label>6) معيار القبول (Accept criteria)</label><textarea class="sp-accept" placeholder="مثال: لا يوجد خدوش، الفجوة 0.5-1mm">${esc(step.accept_criteria)}</textarea></div>
        <div class="field"><label>معيار الرفض (Reject criteria)</label><textarea class="sp-reject" placeholder="مثال: صوت طرقعة، فجوة أكبر من 1.5mm">${esc(step.reject_criteria)}</textarea></div>
      </div>
      <div class="field-row">
        <div class="field"><label>كود العيب المرتبط (Defect code)</label><input class="sp-defect" value="${attr(step.defect_code)}" placeholder="مثال: DEF-COND-014"/></div>
        <div class="field"><label><input type="checkbox" class="sp-critical" ${step.is_critical ? "checked" : ""}/> خطوة حرجة (Critical / وقفة إلزامية)</label></div>
      </div>

      <div class="field"><label>ملاحظة سلامة خاصة بالخطوة (فوق السلامة العامة) — اختياري</label><input class="sp-ppe" value="${attr(step.ppe_notes)}" placeholder="مثال: افصل الكهرباء قبل الفتح"/></div>

      <div class="field">
        <label>رابط الفيديو (يوتيوب / درايف) لطريقة الفحص أو التجميع</label>
        <input class="sp-video" value="${attr(step.video_url)}" placeholder="https://..."/>
      </div>
      <div class="field">
        <label>الصور</label>
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
      <div class="editor-toolbar">
        <button class="btn btn-sm save-step">حفظ الخطوة</button>
        <button class="btn btn-sm btn-ghost move-up" ${stIdx === 0 ? "disabled" : ""}>▲</button>
        <button class="btn btn-sm btn-ghost move-down" ${stIdx === stage.steps.length - 1 ? "disabled" : ""}>▼</button>
        <button class="btn btn-sm btn-danger del-step">حذف الخطوة</button>
      </div>
    `;
    wrap.appendChild(el);

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
        await Editor.bump(sop.id, "حذف صورة من خطوة");
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
            await Editor.bump(sop.id, "حذف صورة من خطوة");
            thumb.remove();
          };
          uploadRow.insertBefore(thumb, uploadRow.lastElementChild);
          await Editor.bump(sop.id, `رفع صورة لخطوة: ${step.title_ar || step.title}`);
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
          video_url: el.querySelector(".sp-video").value.trim() || null,
          requirements: reqs,
          responsible_role: el.querySelector(".sp-role").value || null,
          spec_value: el.querySelector(".sp-spec").value.trim() || null,
          accept_criteria: el.querySelector(".sp-accept").value.trim() || null,
          reject_criteria: el.querySelector(".sp-reject").value.trim() || null,
          defect_code: el.querySelector(".sp-defect").value.trim() || null,
          ppe_notes: el.querySelector(".sp-ppe").value.trim() || null,
          is_critical: el.querySelector(".sp-critical").checked,
        };
        await DB.updateStep(step.id, payload);
        Object.assign(step, payload);
        await Editor.bump(sop.id, `تعديل خطوة: ${payload.title_ar || payload.title}`);
        toast("تم حفظ الخطوة");
      } catch (e) { toast(e.message, true); }
    };
    el.querySelector(".del-step").onclick = async () => {
      if (!confirm("حذف الخطوة؟")) return;
      await DB.deleteStep(step.id);
      await Editor.bump(sop.id, "حذف خطوة");
      await App.navigate(`#/sop/${sop.id}/edit`, true);
    };
    el.querySelector(".move-up").onclick = async () => {
      const ids = stage.steps.map(s => s.id);
      [ids[stIdx - 1], ids[stIdx]] = [ids[stIdx], ids[stIdx - 1]];
      await DB.reorderSteps(ids);
      await Editor.bump(sop.id, "إعادة ترتيب خطوات");
      await App.navigate(`#/sop/${sop.id}/edit`, true);
    };
    el.querySelector(".move-down").onclick = async () => {
      const ids = stage.steps.map(s => s.id);
      [ids[stIdx + 1], ids[stIdx]] = [ids[stIdx], ids[stIdx + 1]];
      await DB.reorderSteps(ids);
      await Editor.bump(sop.id, "إعادة ترتيب خطوات");
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

function toast(msg, isError = false) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = isError ? "show error" : "show";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = ""; }, 3000);
}
