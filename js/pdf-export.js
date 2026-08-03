// =====================================================================
// PDF Export — renders a full SOP (all stages/steps/images) into an
// off-screen sheet (#print-root), then rasterizes it into a paginated
// A4 PDF via jsPDF + html2canvas. Video links become a small QR code
// so the printed sheet can be scanned on the factory floor.
// =====================================================================
// يلتقط عنصر الـ HTML كصورة واحدة عالية الدقة، ويقصّه على شكل صفحات A4 (بدون أي
// اعتماد على نصوص جسPDF الداخلية) — ده اللي بيمنع تشويه الحروف العربية اللي بيحصل
// مع doc.html()'s autoPaging لإنها بتحاول ترسم نص حقيقي بخط لاتيني افتراضي.
async function renderPagedPdf({ sheet, orientation = "p", filename, scale = 2 }) {
  const canvas = await html2canvas(sheet, { scale, useCORS: true, backgroundColor: "#ffffff" });

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation });
  const margin = 18;
  const pageW = doc.internal.pageSize.getWidth() - margin * 2;
  const pageH = doc.internal.pageSize.getHeight() - margin * 2;

  const pxPerPt = canvas.width / pageW;       // px-per-pt عند نفس عرض الصفحة
  const pageHeightPx = Math.floor(pageH * pxPerPt);

  let renderedPx = 0;
  let pageIndex = 0;
  while (renderedPx < canvas.height) {
    const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedPx);

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeightPx;
    const ctx = pageCanvas.getContext("2d");
    ctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);

    const imgData = pageCanvas.toDataURL("image/png");
    if (pageIndex > 0) doc.addPage();
    doc.addImage(imgData, "PNG", margin, margin, pageW, sliceHeightPx / pxPerPt);

    renderedPx += sliceHeightPx;
    pageIndex++;
  }

  doc.save(filename);
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

    sheet.innerHTML = `
      <div class="xsheet-head">
        <div class="xsheet-approvals-mini">
          <div><b>أنشأ</b><br/>${esc(sop.created_by_name || "-")}</div>
          <div><b>آخر تعديل</b><br/>${esc(sop.updated_by_name || "-")}</div>
          <div><b>اعتماد</b><br/>${esc(sop.approved_by || "لسه")}</div>
        </div>
        <div class="xsheet-title">
          <h1>${esc(sop.title_ar || sop.title)}</h1>
          <div class="xsheet-sub">${esc(sop.title || "")}</div>
        </div>
        <div class="xsheet-docno">
          Ver. ${esc(sop.version || 1)}<br/>
          NO. ${esc(sop.code || "-")}
        </div>
      </div>

      <table class="xsheet-info">
        <tr>
          <th>المسؤولية</th><th>بيئة الفحص</th><th>عدد مرات الفحص</th><th>فحص العدة</th><th>المكان</th>
        </tr>
        <tr>
          <td>${esc(roles || "-")}</td>
          <td>${esc(sop.inspection_environment || "-")}</td>
          <td>${esc(sop.inspection_frequency || "-")}</td>
          <td>${esc(toolsTxt || "-")}</td>
          <td>${esc(sop.station || "-")}</td>
        </tr>
      </table>

      <table class="xsheet-table">
        <thead>
          <tr>
            <th style="width:26px;">م</th>
            <th style="width:110px;">الخطوة</th>
            <th style="width:110px;">المعدات والآلات</th>
            <th>شرح الخطوة</th>
            <th style="width:160px;">صورة الخطوة</th>
            <th style="width:120px;">معيار القبول</th>
            <th style="width:110px;">طريقة الفحص</th>
            <th style="width:70px;">التكرار</th>
            <th style="width:120px;">معيار الرفض</th>
            <th style="width:120px;">الإجراء عند الرفض</th>
            <th style="width:110px;">السيفتي</th>
          </tr>
        </thead>
        <tbody id="xsheet-body"></tbody>
      </table>
    `;

    const tbody = sheet.querySelector("#xsheet-body");
    let idx = 0;
    (sop.stages || []).forEach(stage => {
      const stageRow = document.createElement("tr");
      stageRow.innerHTML = `<td colspan="11" class="xsheet-stage-row">${esc(stage.title_ar || stage.title || "مرحلة")}</td>`;
      tbody.appendChild(stageRow);

      (stage.steps || []).forEach(step => {
        idx++;
        const tr = document.createElement("tr");
        if (step.is_critical) tr.className = "xsheet-critical-row";
        tr.innerHTML = `
          <td>${idx}</td>
          <td><b>${esc(step.title_ar || step.title)}</b></td>
          <td>${(step.requirements || []).map(esc).join("<br/>") || "-"}</td>
          <td>${esc(step.description || "-")}</td>
          <td class="xsheet-img-cell">
            ${step.images && step.images[0] ? `<img class="xsheet-thumb" src="${esc(step.images[0].image_url)}" crossorigin="anonymous"/>` : "-"}
          </td>
          <td>${esc(step.accept_criteria || "-")}</td>
          <td>${esc(step.inspection_method || "-")}</td>
          <td>${esc(step.inspection_repeat || "-")}</td>
          <td>${esc(step.reject_criteria || "-")}</td>
          <td>${esc(step.reject_action || "-")}</td>
          <td>${esc(step.ppe_notes || "-")}</td>
        `;
        tbody.appendChild(tr);
      });
    });

    if (!idx) {
      tbody.innerHTML = `<tr><td colspan="11" class="hint">لا توجد خطوات مضافة بعد.</td></tr>`;
    }

    if (onProgress) onProgress("جاري تجهيز الصور...");
    await waitForImages(sheet);

    if (onProgress) onProgress("جاري إنشاء ملف PDF...");
    await renderPagedPdf({
      sheet,
      orientation: "l",
      filename: `${(sop.code || "SOP")}_table-sheet.pdf`,
      scale: 2,
    });
    root.innerHTML = "";
  },

  async exportSop(sop, { onProgress } = {}) {
    const root = document.getElementById("print-root");
    root.innerHTML = "";
    const sheet = document.createElement("div");
    sheet.className = "psheet";
    root.appendChild(sheet);

    sheet.innerHTML = `
      <div class="psheet-head">
        <div>
          <div class="code">Document No: ${esc(sop.code || "-")}</div>
          <h1>${esc(sop.title_ar || sop.title)}</h1>
          <div class="code">${esc(sop.title_ar ? sop.title : "")}</div>
        </div>
        <div class="meta">
          خط الإنتاج: <b>${esc(sop.product_line || "-")}</b><br/>
          المحطة: <b>${esc(sop.station || "-")}</b><br/>
          الإصدار: Rev. v${sop.version || 1}<br/>
          الحالة: ${esc(statusLabel(sop.status))}<br/>
          تاريخ الطباعة: ${new Date().toLocaleDateString("ar-EG")}
        </div>
      </div>
      <table class="psheet-approvals">
        <tr>
          <td><b>أنشأ (Created)</b><br/>${esc(sop.created_by_name || "-")}<br/>${sop.created_at ? new Date(sop.created_at).toLocaleDateString("ar-EG") : ""}</td>
          <td><b>آخر تعديل (Updated)</b><br/>${esc(sop.updated_by_name || "-")}<br/>${sop.updated_at ? new Date(sop.updated_at).toLocaleDateString("ar-EG") : ""}</td>
          <td><b>اعتماد (Approved)</b><br/>${esc(sop.approved_by || "لسه ما اتعمدتش")}<br/>${esc(sop.approved_at || "")}</td>
        </tr>
      </table>
      ${(sop.description || sop.scope) ? `
        <div class="psheet-block">
          ${sop.description ? `<p><b>الهدف:</b> ${esc(sop.description)}</p>` : ""}
          ${sop.scope ? `<p><b>النطاق:</b> ${esc(sop.scope)}</p>` : ""}
        </div>
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

    let stageNo = 0;
    for (const stage of (sop.stages || [])) {
      stageNo++;
      const stageEl = document.createElement("div");
      stageEl.className = "psheet-stage";
      stageEl.textContent = `المرحلة ${stageNo} — ${stage.title_ar || stage.title}`;
      sheet.appendChild(stageEl);

      let stepNo = 0;
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
              ${step.description ? `<p>${esc(step.description)}</p>` : ""}
              ${step.accept_criteria ? `<div class="psheet-req">✔ <b>معيار القبول:</b> ${esc(step.accept_criteria)}</div>` : ""}
              ${step.inspection_method ? `<div class="psheet-req"><b>طريقة الفحص:</b> ${esc(step.inspection_method)}</div>` : ""}
              ${step.inspection_repeat ? `<div class="psheet-req"><b>التكرار:</b> ${esc(step.inspection_repeat)}</div>` : ""}
              ${step.reject_criteria ? `<div class="psheet-req">✘ <b>معيار الرفض:</b> ${esc(step.reject_criteria)}</div>` : ""}
              ${step.reject_action ? `<div class="psheet-req">↩ <b>الإجراء عند الرفض:</b> ${esc(step.reject_action)}</div>` : ""}
              ${step.ppe_notes ? `<div class="psheet-req">⚠️ <b>السيفتي:</b> ${esc(step.ppe_notes)}</div>` : ""}
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
              ${step.video_url ? `
                <div class="psheet-video">
                  <img class="qr-target" data-video="${esc(step.video_url)}" />
                  <span>امسح الكود لمشاهدة فيديو الفحص / التجميع<br/><span style="color:#888;">${esc(step.video_url)}</span></span>
                </div>
              ` : ""}
            </div>
          </div>
        `;
        sheet.appendChild(stepEl);
      }
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
    await renderPagedPdf({ sheet, orientation: "p", filename, scale: 2 });
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
