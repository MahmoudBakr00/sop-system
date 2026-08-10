// =====================================================================
// PDF Export — renders a full SOP (all stages/steps/images) into an
// off-screen sheet (#print-root), then rasterizes it into a paginated
// A4 PDF via jsPDF + html2canvas. Video links become a small QR code
// so the printed sheet can be scanned on the factory floor.
// =====================================================================
// يلتقط عنصر الـ HTML كصورة واحدة عالية الدقة، ويقصّه على شكل صفحات A4 (بدون أي
// اعتماد على نصوص جسPDF الداخلية) — ده اللي بيمنع تشويه الحروف العربية اللي بيحصل
// مع doc.html()'s autoPaging لإنها بتحاول ترسم نص حقيقي بخط لاتيني افتراضي.
async function renderPagedPdf({ sheet, orientation = "p", filename, scale = 2, footerEl = null, format = "a4", singlePage = false, rowSelector = null }) {
  const canvas = await html2canvas(sheet, { scale, useCORS: true, backgroundColor: "#ffffff" });

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format, orientation });
  const margin = 28.35; // 1 سم بالظبط (1cm = 72/2.54 pt) — نفس المسافة من كل الاتجاهات الأربعة
  const pageW = doc.internal.pageSize.getWidth() - margin * 2;
  const fullPageH = doc.internal.pageSize.getHeight() - margin * 2;

  // الفوتر الثابت (لو موجود) بيتلقّط مرة واحدة بس وبيتكرر في كل صفحة
  let footerCanvas = null;
  let footerHPt = 0;
  if (footerEl) {
    const root = document.getElementById("print-root");
    footerEl.style.width = sheet.offsetWidth + "px";
    root.appendChild(footerEl);
    footerCanvas = await html2canvas(footerEl, { scale, useCORS: true, backgroundColor: "#ffffff" });
    footerEl.remove();
    footerHPt = (footerCanvas.height / footerCanvas.width) * pageW;
  }
  const contentPageH = fullPageH - (footerCanvas ? footerHPt + 8 : 0);

  // وضع "صفحة واحدة" — بيضغط المحتوى كله (مهما كان طوله) عشان يتحشر في صفحة واحدة بدل ما يتقسم
  if (singlePage) {
    let w = pageW;
    let h = (w * canvas.height) / canvas.width;
    if (h > contentPageH) {
      h = contentPageH;
      w = (h * canvas.width) / canvas.height;
    }
    const x = margin + (pageW - w) / 2;
    const imgData = canvas.toDataURL("image/png");
    doc.addImage(imgData, "PNG", x, margin, w, h);
    if (footerCanvas) {
      const footerData = footerCanvas.toDataURL("image/png");
      doc.addImage(footerData, "PNG", margin, margin + fullPageH - footerHPt, pageW, footerHPt);
    }
    doc.save(filename);
    return;
  }

  const pxPerPt = canvas.width / pageW;       // px-per-pt عند نفس عرض الصفحة
  const pageHeightPx = Math.floor(contentPageH * pxPerPt);

  // حدود نهاية كل صف (لو اتحددت) — عشان التقسيم بين الصفحات يحصل عند نهاية صف كامل مش وسط الكلام
  let rowBottoms = null;
  if (rowSelector) {
    const sheetRect = sheet.getBoundingClientRect();
    rowBottoms = Array.from(sheet.querySelectorAll(rowSelector))
      .map(r => Math.round((r.getBoundingClientRect().bottom - sheetRect.top) * scale))
      .filter(v => v > 0);
  }

  let renderedPx = 0;
  let pageIndex = 0;
  while (renderedPx < canvas.height) {
    let sliceEnd = Math.min(renderedPx + pageHeightPx, canvas.height);
    if (rowBottoms && rowBottoms.length && sliceEnd < canvas.height) {
      const candidates = rowBottoms.filter(b => b > renderedPx && b <= sliceEnd);
      if (candidates.length) sliceEnd = candidates[candidates.length - 1];
    }
    const sliceHeightPx = sliceEnd - renderedPx;

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeightPx;
    const ctx = pageCanvas.getContext("2d");
    ctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);

    const imgData = pageCanvas.toDataURL("image/png");
    if (pageIndex > 0) doc.addPage();
    doc.addImage(imgData, "PNG", margin, margin, pageW, sliceHeightPx / pxPerPt);

    if (footerCanvas) {
      const footerData = footerCanvas.toDataURL("image/png");
      const footerY = margin + fullPageH - footerHPt;
      doc.addImage(footerData, "PNG", margin, footerY, pageW, footerHPt);
    }

    renderedPx = sliceEnd;
    pageIndex++;
  }

  doc.save(filename);
}

// يصغّر خط ومسافات الجدول (بدون ما يلمس عمود الصورة) عشان المحتوى كله
// يتحشر طبيعي في صفحة واحدة بعرض كامل، بدل ما نصغّر الصورة النهائية المُصوّرة
// (اللي كانت بتسيب فراغات على الجنبين). بيقيس الطول الفعلي ويحسب نسبة التصغير المطلوبة.
async function fitSheetToOnePage(sheet, orientation, format) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format, orientation });
  const margin = 28.35; // نفس هامش renderPagedPdf (1 سم)
  const pageW = doc.internal.pageSize.getWidth() - margin * 2;
  const pageH = doc.internal.pageSize.getHeight() - margin * 2;

  const sheetWidthPx = sheet.offsetWidth;
  const idealHeightPx = sheetWidthPx * (pageH / pageW);
  const actualHeightPx = sheet.scrollHeight;

  if (actualHeightPx <= idealHeightPx) return; // أصلًا هيتحشر عادي، مش محتاج تصغير

  let ratio = Math.max(idealHeightPx / actualHeightPx, 0.4); // مايصغرش عن 40% من حجمه الأصلي عشان يفضل مقروء
  applySheetScale(sheet, ratio);

  await new Promise(r => requestAnimationFrame(r));
  const after = sheet.scrollHeight;
  if (after > idealHeightPx * 1.03) {
    const extra = Math.max(idealHeightPx / after, 0.85);
    applySheetScale(sheet, ratio * extra);
  }
}

function applySheetScale(sheet, ratio) {
  sheet.querySelectorAll(".xsheet-fit-style").forEach(s => s.remove());
  const style = document.createElement("style");
  style.className = "xsheet-fit-style";
  style.textContent = `
    .xsheet-table{ font-size:${Math.max(16 * ratio, 9).toFixed(1)}px !important; }
    .xsheet-table thead th{ font-size:${Math.max(15 * ratio, 9).toFixed(1)}px !important; }
    .xsheet-table td, .xsheet-table th{
      padding:${Math.max(10 * ratio, 4).toFixed(1)}px ${Math.max(12 * ratio, 4).toFixed(1)}px !important;
      line-height:${Math.max(1.5 * ratio, 1.15).toFixed(2)} !important;
    }
    .xsheet-table .xsheet-img-cell{ padding:6px !important; } /* عمود الصورة يفضل زي ما هو */
    .xsheet-info, .xsheet-sign{ font-size:${Math.max(15 * ratio, 9).toFixed(1)}px !important; }
    .xsheet-info td, .xsheet-info th, .xsheet-sign td, .xsheet-sign th{
      padding:${Math.max(10 * ratio, 4).toFixed(1)}px ${Math.max(12 * ratio, 4).toFixed(1)}px !important;
    }
    .xsheet-bar{ font-size:${Math.max(15 * ratio, 9).toFixed(1)}px !important; padding:${Math.max(10 * ratio, 4).toFixed(1)}px 16px !important; }
  `;
  sheet.appendChild(style);
}

// كود الفورم الثابت اللي بيظهر أسفل كل صفحة مطبوعة
function buildFormFooter() {
  const el = document.createElement("div");
  el.className = "form-footer";
  el.innerHTML = `
    <span>Midea Electric Egypt</span>
    <span>FR-08-05-01-05</span>
    <span>Issue: 1.0</span>
    <span>ISO 9001:2015</span>
  `;
  return el;
}

const PdfExport = {

  // ---------------- نسخة الجدول (Excel-style): صف لكل خطوة، كل تفصيلة في خانة ----------------
  async exportFactorySheet(sop, { onProgress } = {}) {
    const root = document.getElementById("print-root");
    root.innerHTML = "";
    const sheet = document.createElement("div");
    sheet.className = "xsheet";
    root.appendChild(sheet);

    const roles = [...new Set(
      (sop.stages || []).flatMap(s => (s.steps || []).map(st => st.responsible_role)).filter(Boolean)
    )].map(roleLabelPdf).join("، ");
    const toolsTxt = (sop.tools || []).map(t => t.name).join("، ");
    let logoUrl = "";
    try { logoUrl = (await DB.getAppSettings()).logo_url || ""; } catch (_) { /* no logo yet */ }

    const approvalLabels = {
      draft: "مسودة / Draft", pending_head: "بانتظار مراجعة الهيد / Pending Head Review",
      pending_director: "بانتظار اعتماد الدايركتور / Pending Director Approval",
      approved: "معتمد / Approved", rejected_by_head: "مرفوض من الهيد / Rejected by Head",
      rejected_by_director: "مرفوض من الدايركتور / Rejected by Director",
    };

    const rejectionComment = sop.approval_status === "rejected_by_head" ? sop.head_comment
      : sop.approval_status === "rejected_by_director" ? sop.director_comment : null;
    const rejectionBy = sop.approval_status === "rejected_by_head" ? "الهيد"
      : sop.approval_status === "rejected_by_director" ? "الدايركتور" : null;

    sheet.innerHTML = `
      <div class="xsheet-head">
        ${logoUrl ? `<img class="xsheet-logo" src="${esc(logoUrl)}" crossorigin="anonymous"/>` : `<div class="xsheet-logo"></div>`}
        <div class="xsheet-approvals-mini">
          <div><b>إعداد</b><br/>${esc(sop.created_by_name || "-")}</div>
          <div><b>مراجعة</b><br/>${esc(sop.head_reviewed_by ? "✔" : "-")}</div>
          <div><b>اعتماد</b><br/>${esc(sop.approved_by || "لم يُعتمد بعد")}${sop.approved_at ? ` — ${esc(sop.approved_at)}` : ""}</div>
        </div>
        <div class="xsheet-title">
          <h1>${esc(sop.title_ar || sop.title)}</h1>
          <div class="xsheet-sub">${esc(sop.title || "")}</div>
        </div>
        <div class="xsheet-docno">
          Ver. ${esc(sop.version || 1)}<br/>
          <b>NO. ${esc(sop.code || "بدون كود")}</b>
        </div>
      </div>

      ${rejectionComment ? `
        <div class="xsheet-bar xsheet-reject-bar">
          <b>سبب الرفض (${esc(rejectionBy)}):</b> ${esc(rejectionComment)}
        </div>
      ` : ""}

      <table class="xsheet-info">
        <tr>
          <th${sop.video_url ? ' style="width:110px;"' : ""}>${sop.video_url ? `فيديو الفحص<br/><span class="en">Video — Scan</span>` : `المسؤولية<br/><span class="en">Responsibility</span>`}</th>
          <th>بيئة الفحص<br/><span class="en">Inspection Environment</span></th>
          <th>عدد مرات الفحص<br/><span class="en">Inspection Frequency</span></th>
          <th>المعدات المستخدمة<br/><span class="en">Equipment Used</span></th>
          <th>الخط<br/><span class="en">Line</span></th>
          <th>حالة الاعتماد<br/><span class="en">Approval Status</span></th>
        </tr>
        <tr>
          <td>${sop.video_url ? `<img class="qr-target xsheet-info-qr" data-video="${esc(sopViewUrl(sop))}" />` : esc(roles || "-")}</td>
          <td>${esc(sop.inspection_environment || "-")}</td>
          <td>${esc(sop.inspection_frequency || "-")}</td>
          <td>${esc(toolsTxt || "-")}</td>
          <td>${esc(sop.station || "-")}</td>
          <td>${esc(approvalLabels[sop.approval_status] || sop.approval_status || "-")}</td>
        </tr>
      </table>

      ${sop.pre_work_procedure ? `
        <div class="xsheet-bar">
          <b>قبل العمل / Pre-work:</b> ${esc(sop.pre_work_procedure)}
        </div>
      ` : ""}

      <table class="xsheet-table">
        <thead>
          <tr>
            <th style="width:2%;">م<br/><span class="en">No.</span></th>
            <th style="width:8%;">الخطوات<br/><span class="en">Steps</span></th>
            <th style="width:14%;">محتوى الفحص<br/><span class="en">Inspection Content</span></th>
            <th style="width:7%;">المعدات<br/><span class="en">Equipment</span></th>
            <th style="width:16%;">الفحص القياسي<br/><span class="en">Standard Inspection</span></th>
            <th style="width:18%;">متطلبات العمل<br/><span class="en">Work Requirements</span></th>
            <th style="width:12%;">الصور<br/><span class="en">Photos</span></th>
            <th style="width:8%;">إجراءات السلامة<br/><span class="en">Safety</span></th>
            <th style="width:5%;">معدل التكرار<br/><span class="en">Repetition</span></th>
            <th style="width:10%;">الإجراء عند الرفض<br/><span class="en">Action if Rejected</span></th>
          </tr>
        </thead>
        <tbody id="xsheet-body"></tbody>
      </table>

      ${sop.post_work_procedure ? `
        <div class="xsheet-bar">
          <b>بعد العمل / Post-work:</b> ${esc(sop.post_work_procedure)}
        </div>
      ` : ""}

      <table class="xsheet-sign">
        <thead>
          <tr>
            <th>الدور<br/><span class="en">Role</span></th>
            <th>الاسم<br/><span class="en">Name</span></th>
            <th>الوظيفة<br/><span class="en">Position</span></th>
            <th>التوقيع<br/><span class="en">Signature</span></th>
          </tr>
        </thead>
        <tbody>
          <tr><td>المدرب / Trainer</td><td>${esc(sop.trainer_name || "-")}</td><td>${esc(sop.trainer_position || "-")}</td><td></td></tr>
          <tr><td>المفتش / Inspector</td><td>${esc(sop.inspector_name || "-")}</td><td>${esc(sop.inspector_position || "-")}</td><td></td></tr>
          <tr><td>المشرف / Supervisor</td><td>${esc(sop.supervisor_name || "-")}</td><td>${esc(sop.supervisor_position || "-")}</td><td></td></tr>
        </tbody>
      </table>
      ${sop.notes ? `<div class="xsheet-bar"><b>ملاحظات / Notes:</b> ${esc(sop.notes)}</div>` : ""}
    `;

    const tbody = sheet.querySelector("#xsheet-body");
    let idx = 0;
    (sop.stages || []).forEach(stage => {
      (stage.steps || []).forEach(step => {
        idx++;
        const tr = document.createElement("tr");
        if (step.is_critical) tr.className = "xsheet-critical-row";
        tr.innerHTML = `
          <td>${idx}</td>
          <td><b>${esc(step.title_ar || step.title)}</b></td>
          <td>${esc(step.inspection_method || "-")}</td>
          <td>${(step.requirements || []).map(esc).join("<br/>") || "-"}</td>
          <td>${esc(step.accept_criteria || "-")}</td>
          <td>${esc(step.description || "-")}</td>
          <td class="xsheet-img-cell">
            ${step.images && step.images[0] ? `<img class="xsheet-thumb" src="${esc(step.images[0].image_url)}" crossorigin="anonymous"/>` : "-"}
          </td>
          <td>${esc(sop.safety_notes || "-")}</td>
          <td>${esc(step.inspection_repeat || "-")}</td>
          <td>${esc(step.reject_action || "-")}</td>
        `;
        tbody.appendChild(tr);
      });
    });

    if (!idx) {
      tbody.innerHTML = `<tr><td colspan="10" class="hint">لا توجد خطوات مضافة بعد.</td></tr>`;
    }

    // Render QR code للفيديو (لو موجود) قبل الالتقاط
    sheet.querySelectorAll(".qr-target").forEach(img => {
      const tmp = document.createElement("div");
      new QRCode(tmp, { text: img.dataset.video, width: 130, height: 130 });
      requestAnimationFrame(() => {
        const c = tmp.querySelector("canvas") || tmp.querySelector("img");
        if (c && c.tagName === "CANVAS") img.src = c.toDataURL("image/png");
        else if (c) img.src = c.src;
      });
    });

    if (onProgress) onProgress("جاري تجهيز الصور...");
    await waitForImages(sheet);

    if (onProgress) onProgress("جاري ضبط المقاس عشان يتحشر في صفحة واحدة...");
    await fitSheetToOnePage(sheet, "l", "a3");

    if (onProgress) onProgress("جاري إنشاء ملف PDF...");
    await renderPagedPdf({
      sheet,
      orientation: "l",
      format: "a3",
      filename: `${(sop.code || "SOP")}_table-sheet.pdf`,
      scale: 2,
      footerEl: buildFormFooter(),
      rowSelector: "#xsheet-body tr",
      singlePage: true,
    });
    root.innerHTML = "";
  },

  async exportSop(sop, { onProgress } = {}) {
    const root = document.getElementById("print-root");
    root.innerHTML = "";
    const sheet = document.createElement("div");
    sheet.className = "psheet";
    root.appendChild(sheet);

    let logoUrl = "";
    try { logoUrl = (await DB.getAppSettings()).logo_url || ""; } catch (_) { /* no logo yet */ }

    sheet.innerHTML = `
      <div class="psheet-head">
        ${logoUrl ? `<img class="psheet-logo" src="${esc(logoUrl)}" crossorigin="anonymous"/>` : `<div class="psheet-logo"></div>`}
        <div style="flex:1;">
          <div class="code"><b>Document No: ${esc(sop.code || "بدون كود")}</b></div>
          <h1>${esc(sop.title_ar || sop.title)}</h1>
          <div class="code">${esc(sop.title_ar ? sop.title : "")}</div>
        </div>
        <div class="meta">
          الخط: <b>${esc(sop.station || "-")}</b><br/>
          الإصدار: Rev. v${sop.version || 1}<br/>
          الحالة: ${esc(statusLabel(sop.status))}<br/>
          تاريخ الطباعة: ${new Date().toLocaleDateString("ar-EG")}
        </div>
      </div>
      <table class="psheet-approvals">
        <tr>
          <td><b>إعداد</b><br/>${esc(sop.created_by_name || "-")}<br/>${sop.created_at ? new Date(sop.created_at).toLocaleDateString("ar-EG") : ""}</td>
          <td><b>مراجعة</b><br/>${esc(sop.head_reviewed_by ? "تمت المراجعة" : "لم تتم المراجعة بعد")}<br/>${sop.head_reviewed_at ? new Date(sop.head_reviewed_at).toLocaleDateString("ar-EG") : ""}</td>
          <td><b>اعتماد</b><br/>${esc(sop.approved_by || "لم يُعتمد بعد")}<br/>${sop.approved_at ? new Date(sop.approved_at).toLocaleDateString("ar-EG") : ""}</td>
        </tr>
      </table>

      ${(() => {
        const comment = sop.approval_status === "rejected_by_head" ? sop.head_comment
          : sop.approval_status === "rejected_by_director" ? sop.director_comment : null;
        const by = sop.approval_status === "rejected_by_head" ? "الهيد"
          : sop.approval_status === "rejected_by_director" ? "الدايركتور" : null;
        return comment ? `<div class="psheet-block" style="border-color:#a3372c; color:#7a281f;"><b>سبب الرفض (${esc(by)}):</b> ${esc(comment)}</div>` : "";
      })()}
      ${sop.video_url ? `
        <div class="psheet-video">
          <img class="qr-target" data-video="${esc(sopViewUrl(sop))}" />
          <span>امسح الكود لفتح صفحة الـ SOP ومشاهدة الفيديو<br/><span style="color:#888;">${esc(sopViewUrl(sop))}</span></span>
        </div>
      ` : ""}
      ${sop.pre_work_procedure ? `
        <div class="psheet-block"><b>قبل العمل (Pre-work):</b> ${esc(sop.pre_work_procedure)}</div>
      ` : ""}
      ${(sop.tools && sop.tools.length) ? `
        <div class="psheet-block">
          <b>الأدوات والمواد المطلوبة:</b>
          <ul class="psheet-list">
            ${sop.tools.map(t => `<li>${esc(t.name)}${t.spec ? ` — ${esc(t.spec)}` : ""}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
      ${sop.safety_notes ? `
        <div class="psheet-block psheet-safety"><b>⚠️ السلامة:</b> ${esc(sop.safety_notes)}</div>
      ` : ""}
      ${sop.deviation_handling ? `
        <div class="psheet-block"><b>التعامل مع الانحرافات:</b> ${esc(sop.deviation_handling)}</div>
      ` : ""}
    `;

    let stepNo = 0;
    for (const stage of (sop.stages || [])) {
      for (const step of (stage.steps || [])) {
        stepNo++;
        const stepEl = document.createElement("div");
        stepEl.className = "psheet-step";
        stepEl.innerHTML = `
          <div class="prow">
            <div class="pnum">${stepNo}</div>
            <div style="flex:1;">
              <h3>${esc(step.title_ar || step.title)} ${step.is_critical ? '<span class="psheet-critical">حرجة</span>' : ""}</h3>
              ${step.requirements && step.requirements.length ? `
                <div class="psheet-req"><b>المعدات والآلات المستخدمة:</b> ${step.requirements.map(r => esc(r)).join(" · ")}</div>
              ` : ""}
              ${sop.safety_notes ? `<div class="psheet-req">⚠️ <b>مهمات وإجراءات الوقاية:</b> ${esc(sop.safety_notes)}</div>` : ""}
              ${step.description ? `<p>${esc(step.description)}</p>` : ""}
              ${step.accept_criteria ? `<div class="psheet-req">✔ <b>معيار القبول:</b> ${esc(step.accept_criteria)}</div>` : ""}
              ${step.inspection_method ? `<div class="psheet-req"><b>طريقة الفحص:</b> ${esc(step.inspection_method)}</div>` : ""}
              ${step.inspection_repeat ? `<div class="psheet-req"><b>التكرار:</b> ${esc(step.inspection_repeat)}</div>` : ""}
              ${step.reject_action ? `<div class="psheet-req">↩ <b>الإجراء عند الرفض:</b> ${esc(step.reject_action)}</div>` : ""}
              ${step.responsible_role ? `<div class="psheet-req"><b>المسؤول:</b> ${esc(roleLabelPdf(step.responsible_role))}</div>` : ""}
              ${step.spec_value ? `<div class="psheet-req"><b>مواصفة فنية:</b> ${esc(step.spec_value)}</div>` : ""}
              ${step.defect_code ? `<div class="psheet-req"><b>كود العيب:</b> ${esc(step.defect_code)}</div>` : ""}
              <div class="psheet-imgs">
                ${(step.images || []).map(img => `
                  <figure style="margin:0;">
                    <img src="${esc(img.image_url)}" crossorigin="anonymous" />
                  </figure>
                `).join("")}
              </div>
            </div>
          </div>
        `;
        sheet.appendChild(stepEl);
      }
    }

    if (sop.post_work_procedure) {
      const postEl = document.createElement("div");
      postEl.className = "psheet-block";
      postEl.innerHTML = `<b>بعد العمل (Post-work):</b> ${esc(sop.post_work_procedure)}`;
      sheet.appendChild(postEl);
    }

    if (sop.trainer_name || sop.inspector_name || sop.supervisor_name) {
      const signEl = document.createElement("div");
      signEl.className = "psheet-block";
      signEl.innerHTML = `
        <table class="xsheet-sign">
          <thead><tr><th>الدور</th><th>الاسم</th><th>الوظيفة</th><th>التوقيع</th></tr></thead>
          <tbody>
            <tr><td>المدرب</td><td>${esc(sop.trainer_name || "-")}</td><td>${esc(sop.trainer_position || "-")}</td><td></td></tr>
            <tr><td>المفتش</td><td>${esc(sop.inspector_name || "-")}</td><td>${esc(sop.inspector_position || "-")}</td><td></td></tr>
            <tr><td>المشرف</td><td>${esc(sop.supervisor_name || "-")}</td><td>${esc(sop.supervisor_position || "-")}</td><td></td></tr>
          </tbody>
        </table>
        ${sop.notes ? `<p style="margin-top:8px;"><b>ملاحظات:</b> ${esc(sop.notes)}</p>` : ""}
      `;
      sheet.appendChild(signEl);
    }

    if (sop.references && sop.references.length) {
      const refsEl = document.createElement("div");
      refsEl.className = "psheet-block";
      refsEl.innerHTML = `
        <b>المراجع:</b>
        <ul class="psheet-list">${sop.references.map(r => `<li>${esc(r.ref_text)}</li>`).join("")}</ul>
      `;
      sheet.appendChild(refsEl);
    }

    if (sop.revisions && sop.revisions.length) {
      const revEl = document.createElement("div");
      revEl.className = "psheet-block";
      revEl.innerHTML = `
        <b>سجل التعديلات:</b>
        <table class="psheet-rev-table">
          <thead><tr><th>Rev.</th><th>التاريخ</th><th>بواسطة</th><th>الوصف</th></tr></thead>
          <tbody>
            ${sop.revisions.map(r => `
              <tr>
                <td>v${r.revision_no}</td>
                <td>${new Date(r.revision_date).toLocaleDateString("ar-EG")}</td>
                <td>${esc(r.profiles?.full_name || "-")}</td>
                <td>${esc(r.change_summary || "")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
      sheet.appendChild(revEl);
    }

    // Render QR codes into the placeholder <img> tags
    const qrTargets = sheet.querySelectorAll(".qr-target");
    qrTargets.forEach(img => {
      const tmp = document.createElement("div");
      new QRCode(tmp, { text: img.dataset.video, width: 108, height: 108 });
      // QRCode.js renders either a <canvas> or an <img> depending on browser
      requestAnimationFrame(() => {
        const c = tmp.querySelector("canvas") || tmp.querySelector("img");
        if (c && c.tagName === "CANVAS") img.src = c.toDataURL("image/png");
        else if (c) img.src = c.src;
      });
    });

    if (onProgress) onProgress("جاري تجهيز الصور...");
    await waitForImages(sheet);

    if (onProgress) onProgress("جاري إنشاء ملف PDF...");
    const filename = `${(sop.code || "SOP")}_${(sop.title || "sop").replace(/[^\w\-]+/g, "_")}.pdf`;
    await renderPagedPdf({ sheet, orientation: "p", filename, scale: 2, footerEl: buildFormFooter() });
    root.innerHTML = "";
  },
};

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));
}

function statusLabel(status) {
  return { draft: "مسودة", active: "معتمدة", archived: "مؤرشفة" }[status] || status;
}

function roleLabelPdf(role) {
  return {
    operator: "عامل تشغيل", supervisor: "مشرف", qc: "مراقبة جودة", maintenance: "صيانة", other: "أخرى",
  }[role] || role;
}

// رابط صفحة عرض الـ SOP على النظام — ده اللي بيتحط في QR (بدل رابط الفيديو المباشر)
// عشان أي حد يمسحه يدخل على الصفحة نفسها (عرض بدون تعديل، مع مشغّل الفيديو جواها)
function sopViewUrl(sop) {
  return `${window.location.origin}${window.location.pathname}#/sop/${sop.id}`;
}

function truncateText(str, max) {
  const s = String(str || "").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function waitForImages(container) {
  const imgs = Array.from(container.querySelectorAll("img"));
  return Promise.all(imgs.map(img => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise(resolve => {
      img.addEventListener("load", resolve, { once: true });
      img.addEventListener("error", resolve, { once: true });
      // QR images get their src set slightly after — give it a moment
      setTimeout(resolve, 3000);
    });
  }));
}
