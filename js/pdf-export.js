// =====================================================================
// PDF Export — renders a full SOP (all stages/steps/images) into an
// off-screen sheet (#print-root), then rasterizes it into a paginated
// A4 PDF via jsPDF + html2canvas. Video links become a small QR code
// so the printed sheet can be scanned on the factory floor.
// =====================================================================
const PdfExport = {

  // ---------------- النسخة المصنعية: صفحة واحدة، صناديق مرقّمة متسلسلة بأسهم ----------------
  async exportFactorySheet(sop, { onProgress } = {}) {
    const root = document.getElementById("print-root");
    root.innerHTML = "";
    const sheet = document.createElement("div");
    sheet.className = "fsheet";
    root.appendChild(sheet);

    // كل الخطوات مسطّحة بالترتيب عبر كل المراحل، مرقّمة تسلسليًا من 1
    const flat = [];
    (sop.stages || []).forEach(stage => (stage.steps || []).forEach(step => flat.push({ stage, step })));

    const roles = [...new Set(flat.map(f => f.step.responsible_role).filter(Boolean))].map(roleLabelPdf).join("، ");
    const toolsTxt = (sop.tools || []).map(t => t.name).join("، ");
    const rejectNotes = [...new Set(flat.map(f => f.step.reject_criteria).filter(Boolean))];

    sheet.innerHTML = `
      <div class="fsheet-head">
        <div class="fsheet-approvals-mini">
          <div><b>اعداد</b><br/>${esc(sop.prepared_by || "-")}</div>
          <div><b>مراجعة</b><br/>${esc(sop.reviewed_by || "-")}</div>
          <div><b>اعتماد</b><br/>${esc(sop.approved_by || "-")}</div>
        </div>
        <div class="fsheet-title">
          <h1>${esc(sop.title_ar || sop.title)}</h1>
          <div class="fsheet-sub">${esc(sop.title || "")}</div>
        </div>
        <div class="fsheet-docno">
          Ver. ${esc(sop.version || 1)}<br/>
          NO. ${esc(sop.code || "-")}
        </div>
      </div>

      <table class="fsheet-info">
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

      ${rejectNotes.length ? `
        <div class="fsheet-note">بعد التفتيش المرفوض كالآتي: ${rejectNotes.map(esc).join(" · ")}</div>
      ` : ""}

      <div class="fsheet-flow"></div>
    `;

    const flowRoot = sheet.querySelector(".fsheet-flow");
    const perRow = flat.length > 10 ? 7 : Math.max(flat.length, 1);
    for (let i = 0; i < flat.length; i += perRow) {
      const rowItems = flat.slice(i, i + perRow);
      const rowEl = document.createElement("div");
      rowEl.className = "fsheet-row";
      rowItems.forEach(({ step }, j) => {
        const idx = i + j + 1;
        const box = document.createElement("div");
        box.className = "fsheet-box" + (step.is_critical ? " fsheet-critical" : "");
        box.innerHTML = `
          <div class="fsheet-num">${idx}</div>
          <div class="fsheet-name">${esc(step.title_ar || step.title)}</div>
          ${step.images && step.images[0] ? `<img class="fsheet-thumb" src="${esc(step.images[0].image_url)}" crossorigin="anonymous"/>` : ""}
          <div class="fsheet-desc">${esc(truncateText(step.description, 130))}</div>
          ${step.spec_value ? `<div class="fsheet-spec">${esc(step.spec_value)}</div>` : ""}
        `;
        rowEl.appendChild(box);
        if (j < rowItems.length - 1) {
          const arrow = document.createElement("div");
          arrow.className = "fsheet-rowarrow";
          arrow.textContent = "←";
          rowEl.appendChild(arrow);
        }
      });
      flowRoot.appendChild(rowEl);
    }

    if (!flat.length) {
      flowRoot.innerHTML = `<div class="hint">لا توجد خطوات مضافة بعد.</div>`;
    }

    if (onProgress) onProgress("جاري تجهيز الصور...");
    await waitForImages(sheet);

    if (onProgress) onProgress("جاري إنشاء ملف PDF...");
    const canvas = await html2canvas(sheet, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 18;
    let w = pageW - margin * 2;
    let h = (w * canvas.height) / canvas.width;
    if (h > pageH - margin * 2) {
      h = pageH - margin * 2;
      w = (h * canvas.width) / canvas.height;
    }
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    doc.addImage(imgData, "PNG", x, y, w, h);

    const filename = `${(sop.code || "SOP")}_factory-sheet.pdf`;
    doc.save(filename);
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
          <td><b>إعداد (Prepared)</b><br/>${esc(sop.prepared_by || "-")}<br/>${esc(sop.prepared_at || "")}</td>
          <td><b>مراجعة (Reviewed)</b><br/>${esc(sop.reviewed_by || "-")}<br/>${esc(sop.reviewed_at || "")}</td>
          <td><b>اعتماد (Approved)</b><br/>${esc(sop.approved_by || "-")}<br/>${esc(sop.approved_at || "")}</td>
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
              ${step.responsible_role ? `<div class="psheet-req"><b>المسؤول:</b> ${esc(roleLabelPdf(step.responsible_role))}</div>` : ""}
              ${step.description ? `<p>${esc(step.description)}</p>` : ""}
              ${step.spec_value ? `<div class="psheet-req"><b>مواصفة فنية:</b> ${esc(step.spec_value)}</div>` : ""}
              ${step.requirements && step.requirements.length ? `
                <div class="psheet-req"><b>المتطلبات:</b> ${step.requirements.map(r => esc(r)).join(" · ")}</div>
              ` : ""}
              ${step.accept_criteria ? `<div class="psheet-req">✔ <b>قبول:</b> ${esc(step.accept_criteria)}</div>` : ""}
              ${step.reject_criteria ? `<div class="psheet-req">✘ <b>رفض:</b> ${esc(step.reject_criteria)}</div>` : ""}
              ${step.defect_code ? `<div class="psheet-req"><b>كود العيب:</b> ${esc(step.defect_code)}</div>` : ""}
              ${step.ppe_notes ? `<div class="psheet-req">⚠️ ${esc(step.ppe_notes)}</div>` : ""}
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
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    await new Promise(resolve => {
      doc.html(sheet, {
        callback: () => resolve(),
        x: 0, y: 0,
        width: 595,               // A4 width in pt
        windowWidth: 794,         // px width of sheet
        autoPaging: "text",
        html2canvas: { scale: 0.75, useCORS: true },
      });
    });

    const filename = `${(sop.code || "SOP")}_${(sop.title || "sop").replace(/[^\w\-]+/g, "_")}.pdf`;
    doc.save(filename);
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
