// =====================================================================
// Editor — builds the create/edit form for an SOP: stages, steps,
// requirement chips, image upload, video link. Every mutation re-fetches
// the SOP and re-renders the editor section (simple, predictable).
// =====================================================================
const Editor = {
  _saveFns: [],
  registerSave(fn) {
    this._saveFns.push(fn);
  },

  async render(container, sopId) {
    container.innerHTML = `<div class="spinner"></div>`;
    const sop = await DB.getSopFull(sopId);
    await this.ensureSingleStage(sop);
    this._saveFns = [];
    container.innerHTML = "";
    container.appendChild(this.buildHeaderForm(sop));
    container.appendChild(this.buildWorkflowBox(sop));

    const stageHead = document.createElement("h2");
    stageHead.className = "section-title";
    stageHead.textContent = "خطوات التشغيل";
    container.appendChild(stageHead);

    const stepsContainerWrap = document.createElement("div");
    stepsContainerWrap.id = "editor-stages";
    container.appendChild(stepsContainerWrap);
    this.renderSteps(stepsContainerWrap, sop);

    const addStepBtn = document.createElement("button");
    addStepBtn.className = "btn btn-primary";
    addStepBtn.textContent = "+ إضافة خطوة جديدة";
    addStepBtn.onclick = async () => {
      const stage = sop.stages[0];
      await DB.createStep(stage.id, { title: "خطوة جديدة", title_ar: "خطوة جديدة", requirements: [] }, stage.steps.length);
      await this.render(container, sopId);
    };
    container.appendChild(addStepBtn);

    container.appendChild(this.buildDetailsForm(sop));
    container.appendChild(this.buildToolsSection(sop));
    container.appendChild(this.buildReferencesSection(sop));
    container.appendChild(this.buildRevisionHistory(sop));

    // زرار الحفظ الوحيد لكل الفورم — تحت خالص، بيحفظ كل حاجة كتبتها وبيبعت الـ SOP للمراجعة على طول
    const saveBar = document.createElement("div");
    saveBar.className = "save-bar";
    saveBar.innerHTML = `
      <button class="btn btn-primary btn-lg" id="master-save-btn">💾 حفظ وإرسال للمراجعة</button>
      <span class="hint">يحفظ هذا الزر جميع البيانات المُدخلة في الصفحة (البيانات الأساسية، كل الخطوات، التفاصيل الإضافية)، ويُرسل الـ SOP إلى الهيد للمراجعة، ويزيد رقم الإصدار (Rev.).</span>
    `;
    saveBar.querySelector("#master-save-btn").onclick = async () => {
      const btn = saveBar.querySelector("#master-save-btn");
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "جاري الحفظ...";
      try {
        for (const fn of this._saveFns) await fn();
        await this.bump(sop.id, "حفظ وإرسال للمراجعة");
        if (Auth.canEdit()) {
          try { await DB.submitForReview(sop.id); } catch (_) { /* لو مش قابل لإعادة الإرسال دلوقتي، مش مشكلة */ }
        }
        toast("تم الحفظ والإرسال للمراجعة");
        await this.render(container, sopId);
      } catch (e) {
        toast(e.message, true);
        btn.disabled = false;
        btn.textContent = original;
      }
    };
    container.appendChild(saveBar);
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
      <div class="field-row">
        <div class="field"><label>الخط</label><input id="f-station" value="${attr(sop.station)}" placeholder="مثال: التجميع النهائي"/></div>
        <div class="field" style="max-width:150px;"><label>رقم المحطة على الخط (فريد)</label><input id="f-station-no" type="number" min="1" value="${sop.station_no ?? ""}" placeholder="مثال: 1"/></div>
      </div>
      <div class="field-row">
        <div class="field"><label>عدد مرات الفحص</label><input id="f-freq" value="${attr(sop.inspection_frequency)}" placeholder="مثال: طبقًا لخطط العينات"/></div>
        <div class="field"><label>بيئة الفحص</label><input id="f-env" value="${attr(sop.inspection_environment)}" placeholder="مثال: الفحص على بعد 400 مم من اللوحة"/></div>
      </div>
      <div class="field hint">رقم الإصدار الحالي (Revision No.): <b>v${sop.version || 1}</b> — يزداد فقط عند الضغط على زر "💾 حفظ وإرسال للمراجعة" أسفل الصفحة.</div>

      <div class="field">
        <label>فيديو الـ SOP (طريقة الفحص أو التجميع — فيديو واحد للـ SOP كله)</label>
        <div class="video-row">
          <input id="f-video" value="${attr(sop.video_url)}" placeholder="الصق رابط فيديو (يوتيوب / درايف)..."/>
          <label class="btn btn-sm btn-ghost">
            📹 رفع فيديو <input type="file" accept="video/*" id="sop-video-file" style="display:none;"/>
          </label>
        </div>
        <p class="hint" id="sop-video-status"></p>
        ${sop.video_url ? videoBoxHtml(sop.video_url) : ""}
      </div>

      <div class="field">
        <label>معدات وإجراءات السلامة (تُكتب مرة واحدة وتتكرر تلقائيًا بجانب كل خطوة في التقرير)</label>
        <textarea id="f-safety" placeholder="مثال: نظارة واقية، قفازات مقاومة للحرارة، حذاء أمان...">${esc(sop.safety_notes)}</textarea>
      </div>

      <div class="field-row">
        <div class="field"><label>إجراء قبل العمل (Pre-work)</label><textarea id="f-pre" placeholder="مثال: شغّل معدات الفحص الأمني وتأكد من صلاحيتها">${esc(sop.pre_work_procedure)}</textarea></div>
        <div class="field"><label>إجراء بعد انتهاء العمل (Post-work)</label><textarea id="f-post" placeholder="مثال: أوقف تشغيل الجهاز، ضع لوحات تعريف العملية">${esc(sop.post_work_procedure)}</textarea></div>
      </div>

      <h2 style="margin-top:16px;">التوقيعات والمسؤوليات</h2>
      <div class="field-row">
        <div class="field"><label>اسم المدرب</label><input id="f-trainer-name" value="${attr(sop.trainer_name)}"/></div>
        <div class="field"><label>الوظيفة (Position)</label><input id="f-trainer-pos" value="${attr(sop.trainer_position)}"/></div>
      </div>
      <div class="field-row">
        <div class="field"><label>اسم المفتش</label><input id="f-inspector-name" value="${attr(sop.inspector_name)}"/></div>
        <div class="field"><label>الوظيفة (Position)</label><input id="f-inspector-pos" value="${attr(sop.inspector_position)}"/></div>
      </div>
      <div class="field-row">
        <div class="field"><label>اسم المشرف</label><input id="f-supervisor-name" value="${attr(sop.supervisor_name)}"/></div>
        <div class="field"><label>الوظيفة (Position)</label><input id="f-supervisor-pos" value="${attr(sop.supervisor_position)}"/></div>
      </div>
      <div class="field"><label>ملاحظات</label><textarea id="f-notes" placeholder="أي ملاحظات عامة على الـ SOP">${esc(sop.notes)}</textarea></div>

      <div class="identity-box">
        <div>📝 <b>أنشأ بواسطة:</b> ${esc(sop.created_by_name || "-")} — ${fmtDate(sop.created_at)}</div>
        <div>✏️ <b>آخر تعديل بواسطة:</b> ${esc(sop.updated_by_name || "-")} — ${fmtDate(sop.updated_at)}</div>
        <p class="hint" style="margin:6px 0 0;">يأخذ النظام الاسم والتاريخ تلقائيًا من حساب المستخدم المسجّل دخوله — لا حاجة لإدخالهما يدويًا.</p>
      </div>
    `;
    wireAutoTranslate(card.querySelector("#f-title-ar"), card.querySelector("#f-title"));
    wireVideoBox(card);

    card.querySelector("#sop-video-file").addEventListener("change", async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      const statusEl = card.querySelector("#sop-video-status");
      const videoInput = card.querySelector("#f-video");
      statusEl.textContent = "جاري رفع الفيديو...";
      try {
        const url = await DB.uploadSopVideo(sop.id, file);
        videoInput.value = url;
        statusEl.textContent = "تم رفع الفيديو، وسيُحفظ عند الضغط على زر الحفظ أسفل الصفحة";
      } catch (e) {
        statusEl.textContent = "";
        toast(e.message, true);
      }
      ev.target.value = "";
    });

    this.registerSave(async () => {
      const stationNoRaw = card.querySelector("#f-station-no").value.trim();
      const payload = {
        status: Auth.isAdmin() ? card.querySelector("#f-status").value : sop.status,
        title_ar: card.querySelector("#f-title-ar").value.trim(),
        title: card.querySelector("#f-title").value.trim() || card.querySelector("#f-title-ar").value.trim(),
        station: card.querySelector("#f-station").value.trim(),
        station_no: stationNoRaw === "" ? null : Number(stationNoRaw),
        inspection_frequency: card.querySelector("#f-freq").value.trim() || null,
        inspection_environment: card.querySelector("#f-env").value.trim() || null,
        video_url: card.querySelector("#f-video").value.trim() || null,
        safety_notes: card.querySelector("#f-safety").value.trim(),
        pre_work_procedure: card.querySelector("#f-pre").value.trim() || null,
        post_work_procedure: card.querySelector("#f-post").value.trim() || null,
        trainer_name: card.querySelector("#f-trainer-name").value.trim() || null,
        trainer_position: card.querySelector("#f-trainer-pos").value.trim() || null,
        inspector_name: card.querySelector("#f-inspector-name").value.trim() || null,
        inspector_position: card.querySelector("#f-inspector-pos").value.trim() || null,
        supervisor_name: card.querySelector("#f-supervisor-name").value.trim() || null,
        supervisor_position: card.querySelector("#f-supervisor-pos").value.trim() || null,
        notes: card.querySelector("#f-notes").value.trim() || null,
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
      } catch (e) {
        if (String(e.message).includes("uq_sop_station_no") || e.code === "23505") {
          throw new Error("رقم المحطة هذا مُستخدم بالفعل في نفس الخط — يُرجى اختيار رقم آخر");
        }
        throw e;
      }
    });
    return card;
  },

  // ---------------- صندوق سايكل الموافقات: إرسال للمراجعة / قرار الهيد / قرار الدايركتور ----------------
  buildWorkflowBox(sop) {
    const card = document.createElement("div");
    card.className = "form-card workflow-box";
    const fmtDate = (d) => d ? new Date(d).toLocaleString("ar-EG") : "-";
    const statusLabels = {
      draft: "مسودة — لم تُرسل للمراجعة بعد",
      pending_head: "⏳ في انتظار مراجعة الهيد",
      pending_director: "⏳ في انتظار اعتماد الدايركتور",
      approved: "✅ معتمد نهائيًا",
      rejected_by_head: "❌ مرفوض من الهيد — يحتاج تعديل",
      rejected_by_director: "❌ مرفوض من الدايركتور — يحتاج تعديل",
    };
    const stepLabels = {
      submitted: "أُرسل للمراجعة", head_approved: "وافق الهيد", head_rejected: "رفض الهيد",
      director_approved: "اعتمد الدايركتور", director_rejected: "رفض الدايركتور",
    };

    let actionsHtml = "";
    if (Auth.canEdit() && ["draft", "rejected_by_head", "rejected_by_director"].includes(sop.approval_status)) {
      actionsHtml = `<button class="btn btn-primary" id="submit-review-btn">📤 إرسال للمراجعة (الهيد)</button>`;
    } else if (Auth.isHead() && sop.approval_status === "pending_head") {
      actionsHtml = `
        <textarea id="head-comment" placeholder="ملاحظة (اختياري)"></textarea>
        <div class="editor-toolbar">
          <button class="btn btn-primary" id="head-approve-btn">✅ موافقة — إرسال للدايركتور</button>
          <button class="btn btn-danger" id="head-reject-btn">❌ رفض</button>
        </div>
      `;
    } else if (Auth.isDirector() && sop.approval_status === "pending_director") {
      actionsHtml = `
        <textarea id="director-comment" placeholder="ملاحظة (اختياري)"></textarea>
        <div class="editor-toolbar">
          <button class="btn btn-primary" id="director-approve-btn">✅ اعتماد نهائي (إصدار فيرجن جديد)</button>
          <button class="btn btn-danger" id="director-reject-btn">❌ رفض</button>
        </div>
      `;
    }

    card.innerHTML = `
      <h2 style="margin-top:0;">سايكل الموافقات</h2>
      <div class="workflow-status status-${sop.approval_status}">${statusLabels[sop.approval_status] || sop.approval_status}</div>
      ${sop.head_comment ? `<p class="hint">💬 ملاحظة الهيد: ${esc(sop.head_comment)}</p>` : ""}
      ${sop.director_comment ? `<p class="hint">💬 ملاحظة الدايركتور: ${esc(sop.director_comment)}</p>` : ""}
      <div class="workflow-actions">${actionsHtml}</div>
      ${(sop.approvals && sop.approvals.length) ? `
        <table class="rev-table" style="margin-top:14px;">
          <thead><tr><th>الخطوة</th><th>بواسطة</th><th>التاريخ</th><th>ملاحظة</th></tr></thead>
          <tbody>
            ${sop.approvals.map(a => `
              <tr>
                <td>${esc(stepLabels[a.step] || a.step)}</td>
                <td>${esc(a.profiles?.full_name || "-")}</td>
                <td>${fmtDate(a.created_at)}</td>
                <td>${esc(a.comment || "-")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      ` : ""}
    `;

    const submitBtn = card.querySelector("#submit-review-btn");
    if (submitBtn) submitBtn.onclick = async () => {
      try {
        await DB.submitForReview(sop.id);
        toast("أُرسل الـ SOP إلى الهيد للمراجعة");
        await App.navigate(`#/sop/${sop.id}/edit`, true);
      } catch (e) { toast(e.message, true); }
    };
    const headApprove = card.querySelector("#head-approve-btn");
    if (headApprove) headApprove.onclick = async () => {
      try {
        await DB.headDecide(sop.id, true, card.querySelector("#head-comment").value.trim());
        toast("تمت الموافقة — أُرسل الـ SOP إلى الدايركتور");
        await App.navigate(`#/sop/${sop.id}/edit`, true);
      } catch (e) { toast(e.message, true); }
    };
    const headReject = card.querySelector("#head-reject-btn");
    if (headReject) headReject.onclick = async () => {
      if (!confirm("تأكيد رفض الـ SOP؟")) return;
      try {
        await DB.headDecide(sop.id, false, card.querySelector("#head-comment").value.trim());
        toast("تم الرفض");
        await App.navigate(`#/sop/${sop.id}/edit`, true);
      } catch (e) { toast(e.message, true); }
    };
    const dirApprove = card.querySelector("#director-approve-btn");
    if (dirApprove) dirApprove.onclick = async () => {
      try {
        await DB.directorDecide(sop.id, true, card.querySelector("#director-comment").value.trim());
        toast("تم الاعتماد النهائي — تم إصدار نسخة جديدة");
        await App.navigate(`#/sop/${sop.id}/edit`, true);
      } catch (e) { toast(e.message, true); }
    };
    const dirReject = card.querySelector("#director-reject-btn");
    if (dirReject) dirReject.onclick = async () => {
      if (!confirm("تأكيد رفض الـ SOP؟")) return;
      try {
        await DB.directorDecide(sop.id, false, card.querySelector("#director-comment").value.trim());
        toast("تم الرفض");
        await App.navigate(`#/sop/${sop.id}/edit`, true);
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
      <div class="field"><label>التعامل مع الانحرافات — الإجراء العام عند حدوث عيب أو توقف خط (ممكن يتربط بنظام الـ Andon)</label><textarea id="f-deviation" placeholder="مثال: أوقف الخط فورًا، بلّغ المشرف، افتح تذكرة في نظام تتبع العيوب...">${esc(sop.deviation_handling)}</textarea></div>
    `;
    this.registerSave(async () => {
      const payload = {
        deviation_handling: card.querySelector("#f-deviation").value.trim(),
      };
      const updated = await DB.updateSop(sop.id, payload);
      Object.assign(sop, updated);
    });
    return card;
  },

  // ---------------- 4) الأدوات والمواد المطلوبة ----------------
  buildToolsSection(sop) {
    const card = document.createElement("div");
    card.className = "form-card";
    card.innerHTML = `
      <h2>4) الأدوات والمواد المطلوبة</h2>
      <p class="hint">العدد، الأجهزة، أدوات القياس، المواد الخام أو المكوّنات — عدّل أي حقل مباشرة، وسيُحفظ مع بقية بيانات النموذج عند الضغط على زر الحفظ أسفل الصفحة</p>
      <div class="list-rows" id="tools-rows"></div>
      <div class="editor-toolbar">
        <select id="tool-cat" style="width:130px;">
          <option value="tool">أداة</option>
          <option value="instrument">جهاز قياس</option>
          <option value="material">مادة/مكوّن</option>
        </select>
        <input id="tool-name" placeholder="الاسم" style="flex:1; padding:8px 10px; border:1px solid var(--blueprint-line); border-radius:3px;">
        <input id="tool-spec" placeholder="مواصفة/معايرة (اختياري)" style="flex:1; padding:8px 10px; border:1px solid var(--blueprint-line); border-radius:3px;">
        <button class="btn btn-sm btn-primary" id="tool-add">+ إضافة</button>
      </div>
    `;
    const rows = card.querySelector("#tools-rows");
    const paint = () => {
      rows.innerHTML = (sop.tools || []).map(t => `
        <div class="list-row" data-id="${t.id}">
          <select class="tool-cat-edit" style="width:110px;">
            <option value="tool" ${t.category === "tool" ? "selected" : ""}>أداة</option>
            <option value="instrument" ${t.category === "instrument" ? "selected" : ""}>جهاز قياس</option>
            <option value="material" ${t.category === "material" ? "selected" : ""}>مادة/مكوّن</option>
          </select>
          <input class="tool-name-edit" value="${attr(t.name)}" style="flex:1; min-width:110px; padding:6px 8px; border:1px solid var(--blueprint-line); border-radius:3px;">
          <input class="tool-spec-edit" value="${attr(t.spec || "")}" placeholder="مواصفة (اختياري)" style="flex:1; min-width:110px; padding:6px 8px; border:1px solid var(--blueprint-line); border-radius:3px;">
          <button class="btn btn-sm btn-danger rm" style="margin-inline-start:auto;">حذف</button>
        </div>
      `).join("") || `<div class="hint">لا توجد أدوات أو مواد مضافة بعد</div>`;
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

    this.registerSave(async () => {
      for (const rowEl of Array.from(rows.querySelectorAll(".list-row"))) {
        const id = rowEl.dataset.id;
        const payload = {
          category: rowEl.querySelector(".tool-cat-edit").value,
          name: rowEl.querySelector(".tool-name-edit").value.trim(),
          spec: rowEl.querySelector(".tool-spec-edit").value.trim() || null,
        };
        if (!payload.name) continue;
        await DB.updateTool(id, payload);
        const t = sop.tools.find(x => x.id === id);
        if (t) Object.assign(t, payload);
      }
    });
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
          <input class="ref-text-edit" value="${attr(r.ref_text)}" style="flex:1; min-width:140px; padding:6px 8px; border:1px solid var(--blueprint-line); border-radius:3px;">
          <input class="ref-url-edit" value="${attr(r.ref_url || "")}" placeholder="رابط (اختياري)" style="flex:1; min-width:140px; padding:6px 8px; border:1px solid var(--blueprint-line); border-radius:3px;">
          <button class="btn btn-sm btn-danger rm" style="margin-inline-start:auto;">حذف</button>
        </div>
      `).join("") || `<div class="hint">لا توجد مراجع مضافة بعد</div>`;
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

    this.registerSave(async () => {
      for (const rowEl of Array.from(rows.querySelectorAll(".list-row"))) {
        const id = rowEl.dataset.id;
        const payload = {
          ref_text: rowEl.querySelector(".ref-text-edit").value.trim(),
          ref_url: rowEl.querySelector(".ref-url-edit").value.trim() || null,
        };
        if (!payload.ref_text) continue;
        await DB.updateReference(id, payload);
        const r = sop.references.find(x => x.id === id);
        if (r) Object.assign(r, payload);
      }
    });
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
          `).join("") || `<tr><td colspan="4" class="hint">لا توجد تعديلات مسجّلة بعد</td></tr>`}
        </tbody>
      </table>
    `;
    return card;
  },

  // يتأكد إن الـ SOP عنده "حاوية" واحدة بس للخطوات (شغالة تحت الستار كـ stage واحد)
  // — لو فيه أكتر من مرحلة من بيانات قديمة، بيدمجهم كلهم في واحدة من غير ما يفقد أي خطوة
  async ensureSingleStage(sop) {
    if (!sop.stages.length) {
      const stage = await DB.createStage(sop.id, { title: "خطوات", title_ar: "خطوات" }, 0);
      stage.steps = [];
      sop.stages = [stage];
      return;
    }
    if (sop.stages.length === 1) return;
    const primary = sop.stages[0];
    const rest = sop.stages.slice(1);
    let order = primary.steps.length;
    for (const stage of rest) {
      for (const step of stage.steps) {
        await DB.updateStep(step.id, { stage_id: primary.id, order_index: order++ });
        primary.steps.push(step);
      }
      await DB.deleteStage(stage.id);
    }
    sop.stages = [primary];
  },

  renderSteps(wrap, sop) {
    wrap.innerHTML = "";
    const stage = sop.stages[0];
    if (!stage) return;
    const stepsWrap = document.createElement("div");
    stepsWrap.className = "steps-wrap";
    wrap.appendChild(stepsWrap);
    stage.steps.forEach((step, stIdx) => this.renderStep(stepsWrap, sop, stage, step, stIdx));
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

      <div class="field">
        <label>2) المعدات والآلات المستخدمة الخاصة بهذه الخطوة — اكتب واضغط Enter لإضافة كل عنصر</label>
        <div class="chip-input" data-reqs='${JSON.stringify(step.requirements || [])}'>
          ${(step.requirements || []).map((r, i) => `<span class="chip" data-i="${i}">${esc(r)}<button type="button">×</button></span>`).join("")}
          <input class="req-input" placeholder="أضف أداة أو آلة..." style="border:none; flex:1; min-width:120px; padding:4px;"/>
        </div>
        <label class="sp-use-general-label" style="display:flex; align-items:center; gap:6px; margin-top:8px; font-size:12.5px;">
          <input type="checkbox" class="sp-use-general" ${step.use_general_equipment ? "checked" : ""}/>
          لو الحقل فوق فاضي، استخدم قائمة المعدات العامة (من بيانات الـ SOP) لهذه الخطوة — لو مش متأشّر، هتفضل فاضية.
        </label>
        <p class="hint">تُؤخذ معدات وإجراءات السلامة تلقائيًا من بيانات الـ SOP أعلاه — لا حاجة لكتابتها هنا.</p>
      </div>

      <div class="field"><label>3) متطلبات العمل (Work Requirements)</label><textarea class="sp-desc" placeholder="اكتب خطوات التنفيذ الفعلية بالتفصيل...">${esc(step.description)}</textarea></div>

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
        <div class="field"><label>5) الفحص القياسي (Standard Inspection)</label><textarea class="sp-accept" placeholder="مثال: 1. يتطابق مع نموذج المديل 2. لا يوجد خدوش أو كسور">${esc(step.accept_criteria)}</textarea></div>
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

    this.registerSave(async () => {
      const payload = {
        title_ar: el.querySelector(".sp-title-ar").value.trim(),
        title: el.querySelector(".sp-title").value.trim(),
        description: el.querySelector(".sp-desc").value.trim(),
        requirements: reqs,
        use_general_equipment: el.querySelector(".sp-use-general").checked,
        responsible_role: el.querySelector(".sp-role").value || null,
        spec_value: el.querySelector(".sp-spec").value.trim() || null,
        accept_criteria: el.querySelector(".sp-accept").value.trim() || null,
        inspection_method: el.querySelector(".sp-method").value.trim() || null,
        inspection_repeat: el.querySelector(".sp-repeat").value.trim() || null,
        reject_action: el.querySelector(".sp-reject-action").value.trim() || null,
        defect_code: el.querySelector(".sp-defect").value.trim() || null,
        is_critical: el.querySelector(".sp-critical").checked,
      };
      await DB.updateStep(step.id, payload);
      Object.assign(step, payload);
    });
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

// ---------------- فيديو الـ SOP: تشغيل + تنزيل موثوق (مستخدمة في editor.js و app.js) ----------------
function guessVideoType(url) {
  const ext = (String(url).split("?")[0].split(".").pop() || "").toLowerCase();
  return { mp4: "video/mp4", webm: "video/webm", ogg: "video/ogg", mov: "video/quicktime" }[ext] || "";
}

// بعض المتصفحات بتتجاهل خاصية download العادية لو الرابط من دومين تاني (زي Supabase) —
// الطريقة الموثوقة إنك تجيب الملف كـ blob وتنزّله من عندك
async function downloadFile(url, filename) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("تعذر الوصول للملف (HTTP " + res.status + ")");
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename || "video";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  } catch (e) {
    toast("تعذر تنزيل الفيديو: " + e.message, true);
  }
}

function videoBoxHtml(url) {
  const type = guessVideoType(url);
  return `
    <div class="sop-video-box">
      <video controls preload="metadata" class="sop-video-player">
        <source src="${esc(url)}" ${type ? `type="${type}"` : ""}/>
      </video>
      <div class="video-error hint" style="display:none;">
        ⚠️ الفيديو مش شغّال هنا مباشرة (ممكن الصيغة مش مدعومة في المتصفح، أو فيه مشكلة صلاحيات على التخزين). جرب "تنزيل" أو "فتح في تاب جديد".
      </div>
      <div style="display:flex; gap:10px; margin-top:6px; flex-wrap:wrap;">
        <button type="button" class="btn btn-sm btn-ghost video-download-btn" data-url="${esc(url)}">⬇️ تنزيل الفيديو</button>
        <a href="${esc(url)}" target="_blank" rel="noopener" class="btn btn-sm btn-ghost">↗️ فتح في تاب جديد</a>
      </div>
    </div>
  `;
}

function wireVideoBox(container) {
  const video = container.querySelector(".sop-video-player");
  if (video) {
    video.addEventListener("error", () => {
      const err = container.querySelector(".video-error");
      if (err) err.style.display = "block";
    });
  }
  const btn = container.querySelector(".video-download-btn");
  if (btn) {
    btn.addEventListener("click", () => downloadFile(btn.dataset.url, "sop-video.mp4"));
  }
}
