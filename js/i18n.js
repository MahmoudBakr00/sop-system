// =====================================================================
// I18N — ترجمة "واجهة النظام" بس (عناوين الأقسام، اللابلز، الأزرار)
// مش بيترجم أي محتوى بيانات المستخدم (زي متطلبات العمل أو المعدات) —
// ده موجود في زرار "🌐 English" التاني جوه صفحة عرض الـ SOP.
// بيشتغل بطريقة "استبدال نصوص معروفة" على أي صفحة تتعرض، فمش محتاج
// تعديل كل ملف؛ بيتفعّل بزرار واحد في التوب بار ظاهر في كل الصفحات.
// =====================================================================
const I18N = {
  lang: localStorage.getItem("sop_ui_lang") || "ar",
  _observer: null,

  dict: {
    // ---------- Topbar / navigation ----------
    "نظام تعليمات التشغيل": "SOP Instructions System",
    "كل الـ SOPs": "All SOPs",
    "+ SOP جديد": "+ New SOP",
    "👥 المستخدمون": "👥 Users",
    "خروج": "Log out",
    "الإشعارات": "Notifications",
    "تعليم الكل كمقروء": "Mark all as read",
    "مفيش إشعارات": "No notifications",
    "لا توجد إشعارات": "No notifications",

    // ---------- Login ----------
    "تسجيل الدخول": "Log in",
    "إنشاء حساب جديد": "Create new account",
    "البريد الإلكتروني": "Email",
    "كلمة المرور": "Password",
    "ليس لديك حساب؟": "Don't have an account?",
    "لدي حساب بالفعل": "I already have an account",

    // ---------- Dashboard / list ----------
    "تعليمات التشغيل (SOPs)": "Operating Instructions (SOPs)",
    "كل مرحلة فيها خطوات، متطلبات، صور، وفيديو للفحص أو التجميع": "Each stage has steps, requirements, photos, and inspection/assembly video",
    "لوجو الشركة": "Company Logo",
    "رفع اللوجو": "Upload logo",
    "تغيير اللوجو": "Change logo",
    "كل الحالات": "All statuses",
    "معتمدة": "Approved",
    "مسودة": "Draft",
    "مؤرشفة": "Archived",
    "عرض": "View",
    "تعديل": "Edit",
    "حذف": "Delete",
    "فلو الخط — ترتيب الـ SOPs (المحطات) ورا بعض": "Line Flow — SOPs (stations) in order",
    "اختر الخط": "Select the line",

    // ---------- Users page ----------
    "إدارة المستخدمين": "User Management",
    "أنشئ حسابات جديدة (إيميل وباسورد) وعدّل صلاحيات المستخدمين الحاليين": "Create new accounts (email and password) and edit existing users' roles",
    "+ إنشاء مستخدم جديد": "+ Create new user",
    "الإيميل": "Email",
    "الباسورد": "Password",
    "الاسم الكامل": "Full name",
    "الصلاحية": "Role",
    "إنشاء الحساب": "Create account",
    "المستخدمون الحاليون": "Current users",
    "مشاهد": "Viewer", "مهندس": "Engineer", "هيد": "Head", "دايركتور": "Director", "أدمن": "Admin",

    // ---------- SOP header / editor sections ----------
    "البيانات الأساسية": "Basic Information",
    "الخط": "Line",
    "الحالة": "Status",
    "العنوان (عربي)": "Title (Arabic)",
    "رقم المحطة على الخط (فريد)": "Station number on line (unique)",
    "رقم/كود المستند (يتولّد تلقائيًا من اسم الخط)": "Document No. (auto-generated from line name)",
    "عدد مرات الفحص": "Inspection frequency",
    "بيئة الفحص": "Inspection environment",
    "سايكل الموافقات": "Approval Cycle",
    "خطوات التشغيل": "Operating Steps",
    "تفاصيل إضافية": "Additional Details",
    "التعامل مع الانحرافات — الإجراء العام عند حدوث عيب أو توقف خط (ممكن يتربط بنظام الـ Andon)": "Deviation handling — general procedure for defects or line stops (can relate to the Andon system)",
    "التعامل مع الانحرافات (Deviation handling)": "Deviation Handling",
    "4) الأدوات والمواد المطلوبة": "4) Required Tools & Materials",
    "9) المراجع (References)": "9) References",
    "10) سجل التعديلات (Revision history)": "10) Revision History",
    "سجل التعديلات": "Revision History",
    "المراجع": "References",
    "التوقيعات والمسؤوليات": "Signatures & Responsibilities",
    "اسم المدرب": "Trainer name",
    "اسم المفتش": "Inspector name",
    "اسم المشرف": "Supervisor name",
    "الوظيفة (Position)": "Position",
    "إجراء قبل العمل (Pre-work)": "Pre-work Procedure",
    "إجراء بعد انتهاء العمل (Post-work)": "Post-work Procedure",
    "فيديو الـ SOP (طريقة الفحص أو التجميع — فيديو واحد للـ SOP كله)": "SOP Video (inspection/assembly method — one video for the whole SOP)",
    "معدات وإجراءات السلامة (تُكتب مرة واحدة وتتكرر تلقائيًا بجانب كل خطوة في التقرير)": "Safety Equipment & Procedures (entered once, repeats automatically next to every step in the report)",
    "⚠️ السلامة (Safety)": "⚠️ Safety",
    "ملاحظات": "Notes",

    // ---------- Step form fields ----------
    "2) المعدات والآلات المستخدمة الخاصة بهذه الخطوة — اكتب واضغط Enter لإضافة كل عنصر": "2) Equipment & Tools specific to this step — type and press Enter to add each item",
    "3) متطلبات العمل (Work Requirements)": "3) Work Requirements",
    "4) صورة الخطوة": "4) Step Photo",
    "5) الفحص القياسي (Standard Inspection)": "5) Standard Inspection",
    "6) طريقة الفحص": "6) Inspection Method",
    "7) التكرار": "7) Repetition",
    "8) الإجراء عند الرفض": "8) Action if Rejected",
    "المسؤول عن الخطوة": "Step responsible",
    "مواصفة فنية (Torque / أبعاد)": "Technical Specification (Torque / Dimensions)",
    "كود العيب المرتبط": "Related Defect Code",
    "Title (English)": "Title (English)",
    "Title (English) — تلقائي": "Title (English) — automatic",
    "بيانات إضافية (اختياري)": "Additional Data (optional)",
    "تعديل SOP": "Edit SOP",
    "عدّل المراحل والخطوات — كل تغيير يُحفظ لحظة الضغط على \"حفظ\"": "Edit stages and steps — every change is saved the moment you press \"Save\"",

    // ---------- Buttons ----------
    "حفظ": "Save",
    "إضافة": "Add",
    "+ إضافة": "+ Add",
    "+ إضافة خطوة جديدة": "+ Add new step",
    "حذف الخطوة": "Delete step",
    "👁 عرض / طباعة": "👁 View / Print",
    "✏️ تعديل": "✏️ Edit",
    "📊 نسخة الجدول (Excel)": "📊 Table Version (Excel)",
    "🖨️ طباعة / PDF": "🖨️ Print / PDF",
    "🌐 English": "🌐 English",
    "🇸🇦 العربية": "🇸🇦 Arabic",
  },

  toggle() {
    this.lang = this.lang === "ar" ? "en" : "ar";
    localStorage.setItem("sop_ui_lang", this.lang);
    this.translateDom(document.getElementById("app"));
  },

  // بيدوّر على أي نص جوه العنصر مطابق تمامًا لحاجة في القاموس ويستبدله
  translateDom(root) {
    if (!root) return;
    if (this.lang !== "en") return; // العربي هو النص الأصلي، مفيش حاجة نعملها
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(node => {
      const trimmed = node.textContent.trim();
      if (!trimmed) return;
      const translated = this.dict[trimmed];
      if (translated) node.textContent = node.textContent.replace(trimmed, translated);
    });
    // placeholders برضه محتاجة تترجم لو موجودة في القاموس
    root.querySelectorAll("[placeholder]").forEach(el => {
      const t = this.dict[el.getAttribute("placeholder")];
      if (t) el.setAttribute("placeholder", t);
    });
  },

  // بيراقب أي تغييرات جوه الصفحة (لإن أغلب الصفحات بترندر بشكل async على مراحل)
  // ويطبّق الترجمة تلقائيًا على أي محتوى جديد يتضاف طول ما اللغة إنجليزي.
  // ملاحظة مهمة: بنأجّل (debounce) الفحص لحد ما التغييرات تهدى، بدل ما نفحص
  // الصفحة كاملة مع كل تغيير صغير — عشان كده كان بيعلّق الصفحة أثناء التحميل.
  watch(root) {
    if (this._observer) this._observer.disconnect();
    this.translateDom(root);
    let timer = null;
    this._observer = new MutationObserver(() => {
      if (this.lang !== "en") return;
      clearTimeout(timer);
      timer = setTimeout(() => this.translateDom(root), 120);
    });
    this._observer.observe(root, { childList: true, subtree: true, characterData: true });
  },
};
