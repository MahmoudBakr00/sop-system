// =====================================================================
// Data access layer — every Supabase query lives here so views stay thin.
// =====================================================================
const DB = {
  // ---------- إدارة المستخدمين (admin فقط) ----------
  async listAllProfiles() {
    const { data, error } = await supabaseClient
      .from("profiles").select("id, full_name, role, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
  async updateProfile(id, payload) {
    const { data, error } = await supabaseClient.from("profiles").update(payload).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },
  async createUserAsAdmin({ email, password, full_name, role }) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) throw new Error("لازم تكون مسجّل دخول");
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-create-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, password, full_name, role }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "فشل إنشاء المستخدم");
    return data;
  },

  // ---------- SOPs ----------
  async listSops({ search = "", status = "", station = "", factory = "" } = {}) {
    let q = supabaseClient.from("sops").select("*").order("updated_at", { ascending: false });
    if (status) q = q.eq("status", status);
    if (station) q = q.eq("station", station);
    if (factory) q = q.eq("factory", factory);
    if (search) q = q.or(`title.ilike.%${search}%,title_ar.ilike.%${search}%,code.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },

  async listDistinctFactories() {
    const { data, error } = await supabaseClient.from("sops").select("factory").not("factory", "is", null);
    if (error) throw error;
    return [...new Set(data.map(r => r.factory).filter(Boolean))].sort();
  },

  async listDistinctLines(factory = "") {
    let q = supabaseClient.from("sops").select("station").not("station", "is", null);
    if (factory) q = q.eq("factory", factory);
    const { data, error } = await q;
    if (error) throw error;
    return [...new Set(data.map(r => r.station).filter(Boolean))].sort();
  },

  async getSopFull(sopId) {
    const { data: sop, error: e1 } = await supabaseClient.from("sops").select("*").eq("id", sopId).single();
    if (e1) throw e1;

    const { data: stages, error: e2 } = await supabaseClient
      .from("stages").select("*").eq("sop_id", sopId).order("order_index");
    if (e2) throw e2;

    const stageIds = stages.map(s => s.id);
    let steps = [];
    if (stageIds.length) {
      const { data, error } = await supabaseClient
        .from("steps").select("*").in("stage_id", stageIds).order("order_index");
      if (error) throw error;
      steps = data;
    }

    const stepIds = steps.map(s => s.id);
    let images = [];
    if (stepIds.length) {
      const { data, error } = await supabaseClient
        .from("step_images").select("*").in("step_id", stepIds).order("order_index");
      if (error) throw error;
      images = data;
    }

    // Assemble nested structure
    for (const step of steps) {
      step.images = images.filter(i => i.step_id === step.id);
      step.requirements = Array.isArray(step.requirements) ? step.requirements : [];
    }
    for (const stage of stages) {
      stage.steps = steps.filter(s => s.stage_id === stage.id);
    }
    sop.stages = stages;

    const [tools, refs, revisions, approvals] = await Promise.all([
      this.listTools(sopId),
      this.listReferences(sopId),
      this.listRevisions(sopId),
      this.listApprovals(sopId),
    ]);
    sop.tools = tools;
    sop.references = refs;
    sop.revisions = revisions;
    sop.approvals = approvals;

    // أسماء المُنشئ وآخر معدِّل (بيتاخدوا تلقائي من الحساب، مفيش إدخال يدوي)
    const identityIds = [...new Set([sop.created_by, sop.updated_by].filter(Boolean))];
    if (identityIds.length) {
      const { data: profs } = await supabaseClient.from("profiles").select("id, full_name").in("id", identityIds);
      const map = Object.fromEntries((profs || []).map(p => [p.id, p.full_name]));
      sop.created_by_name = map[sop.created_by] || null;
      sop.updated_by_name = map[sop.updated_by] || null;
    }

    return sop;
  },

  // ---------- لوج الاعتمادات ----------
  async listApprovals(sopId) {
    const { data, error } = await supabaseClient
      .from("sop_approvals")
      .select("*, profiles(full_name)")
      .eq("sop_id", sopId)
      .order("created_at", { ascending: false });
    if (error) return [];
    return data;
  },

  // ---------- سايكل الموافقات: مهندس يرسل → هيد يراجع → دايركتور يعتمد ----------
  async submitForReview(sopId) {
    const { error } = await supabaseClient.rpc("submit_sop_for_review", { p_sop_id: sopId });
    if (error) throw error;
  },
  async headDecide(sopId, approve, comment) {
    const { error } = await supabaseClient.rpc("head_decide", {
      p_sop_id: sopId, p_approve: approve, p_comment: comment || null,
    });
    if (error) throw error;
  },
  async directorDecide(sopId, approve, comment) {
    const { error } = await supabaseClient.rpc("director_decide", {
      p_sop_id: sopId, p_approve: approve, p_comment: comment || null,
    });
    if (error) throw error;
  },

  // ---------- الإشعارات ----------
  async listNotifications(userId) {
    const { data, error } = await supabaseClient
      .from("notifications").select("*")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
    if (error) throw error;
    return data;
  },
  async unreadNotificationsCount(userId) {
    const { count, error } = await supabaseClient
      .from("notifications").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("is_read", false);
    if (error) return 0;
    return count || 0;
  },
  async markNotificationRead(id) {
    await supabaseClient.from("notifications").update({ is_read: true }).eq("id", id);
  },
  async markAllNotificationsRead(userId) {
    await supabaseClient.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
  },

  // ---------- إزاحة أرقام المحطات (لإفساح مكان لمحطة جديدة تتحط بينهم) ----------
  async shiftStationNos(station, fromStationNoInclusive, docType = "SOP") {
    const { data: rows, error: e1 } = await supabaseClient
      .from("sops").select("id, station_no").eq("station", station).eq("doc_type", docType).gte("station_no", fromStationNoInclusive);
    if (e1) throw e1;
    // من الأكبر للأصغر عشان مايحصلش تصادم مؤقت مع الـ unique index
    const sorted = [...rows].sort((a, b) => b.station_no - a.station_no);
    for (const r of sorted) {
      await supabaseClient.from("sops").update({ station_no: r.station_no + 1 }).eq("id", r.id);
    }
  },

  // ---------- كود تلقائي من اسم المحطة ----------
  async generateSopCode(sopId, station, docType = "SOP") {
    const { data, error } = await supabaseClient.rpc("generate_sop_code", {
      p_sop_id: sopId, p_station: station, p_doc_type: docType,
    });
    if (error) throw error;
    return data; // الكود الجديد
  },

  // ---------- اعتماد الـ SOP (admin فقط) — بيسجل الاسم والتاريخ أوتوماتيك ----------
  async approveSop(sopId, approverName) {
    const payload = {
      approved_by: approverName,
      approved_at: new Date().toISOString().slice(0, 10),
      status: "active",
    };
    return this.updateSop(sopId, payload);
  },

  // ---------- Revision bump (call after ANY successful save) ----------
  async bumpRevision(sopId, summary) {
    const { data, error } = await supabaseClient.rpc("bump_sop_revision", {
      p_sop_id: sopId, p_summary: summary || null,
    });
    if (error) throw error;
    return data; // new version number
  },

  async listRevisions(sopId) {
    const { data, error } = await supabaseClient
      .from("sop_revisions")
      .select("*, profiles(full_name)")
      .eq("sop_id", sopId)
      .order("revision_no", { ascending: false });
    if (error) return []; // non-fatal, embed may fail if FK name differs
    return data;
  },

  // ---------- Tools & materials ----------
  async listTools(sopId) {
    const { data, error } = await supabaseClient
      .from("sop_tools").select("*").eq("sop_id", sopId).order("order_index");
    if (error) throw error;
    return data;
  },
  async addTool(sopId, payload, orderIndex) {
    const { data, error } = await supabaseClient
      .from("sop_tools").insert({ sop_id: sopId, order_index: orderIndex, ...payload }).select().single();
    if (error) throw error;
    return data;
  },
  async updateTool(id, payload) {
    const { data, error } = await supabaseClient.from("sop_tools").update(payload).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },
  async deleteTool(id) {
    const { error } = await supabaseClient.from("sop_tools").delete().eq("id", id);
    if (error) throw error;
  },

  // ---------- References ----------
  async listReferences(sopId) {
    const { data, error } = await supabaseClient
      .from("sop_references").select("*").eq("sop_id", sopId).order("order_index");
    if (error) throw error;
    return data;
  },
  async addReference(sopId, payload, orderIndex) {
    const { data, error } = await supabaseClient
      .from("sop_references").insert({ sop_id: sopId, order_index: orderIndex, ...payload }).select().single();
    if (error) throw error;
    return data;
  },
  async updateReference(id, payload) {
    const { data, error } = await supabaseClient.from("sop_references").update(payload).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },
  async deleteReference(id) {
    const { error } = await supabaseClient.from("sop_references").delete().eq("id", id);
    if (error) throw error;
  },

  // ---------- نسخ SOP كاملة (بيانات + خطوات + صور + أدوات + مراجع) لمصنع/خط تاني ----------
  async duplicateSop(sopId, overrides = {}) {
    const original = await this.getSopFull(sopId);
    const { data: userData } = await supabaseClient.auth.getUser();
    const uid = userData?.user?.id;

    const { data: newSop, error: e1 } = await supabaseClient.from("sops").insert({
      title: original.title, title_ar: original.title_ar ? `${original.title_ar} (نسخة)` : original.title_ar,
      doc_type: original.doc_type || "SOP",
      factory: overrides.factory ?? original.factory,
      station: overrides.station ?? original.station,
      station_no: null, flow_lane: 0, // عشان مايتصدمش مع رقم محطة مستخدم أصلًا
      inspection_frequency: original.inspection_frequency,
      inspection_environment: original.inspection_environment,
      video_url: original.video_url,
      safety_notes: original.safety_notes,
      pre_work_procedure: original.pre_work_procedure,
      post_work_procedure: original.post_work_procedure,
      trainer_name: original.trainer_name, trainer_position: original.trainer_position,
      inspector_name: original.inspector_name, inspector_position: original.inspector_position,
      supervisor_name: original.supervisor_name, supervisor_position: original.supervisor_position,
      notes: original.notes,
      deviation_handling: original.deviation_handling,
      status: "draft", approval_status: "draft", version: 1, code: null,
      created_by: uid, updated_by: uid,
    }).select().single();
    if (e1) throw e1;

    const { data: newStage, error: e2 } = await supabaseClient.from("stages")
      .insert({ sop_id: newSop.id, order_index: 0, title: "خطوات", title_ar: "خطوات" }).select().single();
    if (e2) throw e2;

    const originalSteps = (original.stages || []).flatMap(s => s.steps || []);
    let order = 0;
    for (const step of originalSteps) {
      const { data: newStep, error: e3 } = await supabaseClient.from("steps").insert({
        stage_id: newStage.id, order_index: order++,
        title: step.title, title_ar: step.title_ar,
        description: step.description,
        requirements: step.requirements || [],
        use_general_equipment: step.use_general_equipment,
        responsible_role: step.responsible_role,
        spec_value: step.spec_value,
        accept_criteria: step.accept_criteria,
        inspection_method: step.inspection_method,
        inspection_repeat: step.inspection_repeat,
        reject_action: step.reject_action,
        defect_code: step.defect_code,
        is_critical: step.is_critical,
      }).select().single();
      if (e3) throw e3;

      if (step.images && step.images.length) {
        await supabaseClient.from("step_images").insert(
          step.images.map((img, i) => ({
            step_id: newStep.id, order_index: i, image_url: img.image_url, caption: img.caption,
          }))
        );
      }
    }

    if (original.tools && original.tools.length) {
      await supabaseClient.from("sop_tools").insert(
        original.tools.map((t, i) => ({ sop_id: newSop.id, order_index: i, category: t.category, name: t.name, spec: t.spec }))
      );
    }
    if (original.references && original.references.length) {
      await supabaseClient.from("sop_references").insert(
        original.references.map((r, i) => ({ sop_id: newSop.id, order_index: i, ref_text: r.ref_text, ref_url: r.ref_url }))
      );
    }

    return newSop;
  },

  async createSop(payload) {
    const { data: userData } = await supabaseClient.auth.getUser();
    const { data, error } = await supabaseClient.from("sops").insert({
      ...payload,
      created_by: userData?.user?.id,
      updated_by: userData?.user?.id,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async updateSop(id, payload) {
    const { data: userData } = await supabaseClient.auth.getUser();
    const { data, error } = await supabaseClient.from("sops")
      .update({ ...payload, updated_by: userData?.user?.id })
      .eq("id", id).select().single();
    if (error) throw error;
    return data;
  },

  async deleteSop(id) {
    const { error } = await supabaseClient.from("sops").delete().eq("id", id);
    if (error) throw error;
  },

  // ---------- Stages ----------
  async createStage(sopId, payload, orderIndex) {
    const { data, error } = await supabaseClient.from("stages")
      .insert({ sop_id: sopId, order_index: orderIndex, ...payload }).select().single();
    if (error) throw error;
    return data;
  },
  async updateStage(id, payload) {
    const { error } = await supabaseClient.from("stages").update(payload).eq("id", id);
    if (error) throw error;
  },
  async deleteStage(id) {
    const { error } = await supabaseClient.from("stages").delete().eq("id", id);
    if (error) throw error;
  },
  async reorderStages(stageIdsInOrder) {
    await Promise.all(stageIdsInOrder.map((id, idx) =>
      supabaseClient.from("stages").update({ order_index: idx }).eq("id", id)));
  },

  // ---------- Steps ----------
  async createStep(stageId, payload, orderIndex) {
    const { data, error } = await supabaseClient.from("steps")
      .insert({ stage_id: stageId, order_index: orderIndex, ...payload }).select().single();
    if (error) throw error;
    return data;
  },
  async updateStep(id, payload) {
    const { error } = await supabaseClient.from("steps").update(payload).eq("id", id);
    if (error) throw error;
  },
  async deleteStep(id) {
    const { error } = await supabaseClient.from("steps").delete().eq("id", id);
    if (error) throw error;
  },
  async reorderSteps(stepIdsInOrder) {
    await Promise.all(stepIdsInOrder.map((id, idx) =>
      supabaseClient.from("steps").update({ order_index: idx }).eq("id", id)));
  },

  // ---------- Step images ----------
  async uploadStepImage(stepId, file, orderIndex, caption = "") {
    const ext = file.name.split(".").pop();
    const path = `${stepId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await supabaseClient.storage.from("sop-images").upload(path, file);
    if (upErr) throw upErr;
    const { data: pub } = supabaseClient.storage.from("sop-images").getPublicUrl(path);
    const { data, error } = await supabaseClient.from("step_images")
      .insert({ step_id: stepId, image_url: pub.publicUrl, caption, order_index: orderIndex })
      .select().single();
    if (error) throw error;
    return data;
  },
  async deleteStepImage(id, imageUrl) {
    const { error } = await supabaseClient.from("step_images").delete().eq("id", id);
    if (error) throw error;
    // best-effort storage cleanup
    try {
      const marker = "/sop-images/";
      const idx = imageUrl.indexOf(marker);
      if (idx !== -1) {
        const path = imageUrl.slice(idx + marker.length);
        await supabaseClient.storage.from("sop-images").remove([path]);
      }
    } catch (_) { /* non-fatal */ }
  },

  // ---------- رفع فيديو للـ SOP مباشرة (فيديو واحد لكل SOP، بديل عن رابط خارجي) ----------
  async uploadSopVideo(sopId, file) {
    const ext = file.name.split(".").pop();
    const path = `${sopId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await supabaseClient.storage.from("sop-videos").upload(path, file);
    if (upErr) throw upErr;
    const { data: pub } = supabaseClient.storage.from("sop-videos").getPublicUrl(path);
    return pub.publicUrl;
  },

  // ---------- إعدادات النظام العامة (لوجو الشركة — يتضاف مرة واحدة ويتظهر في كل مكان) ----------
  async getAppSettings() {
    const { data, error } = await supabaseClient.from("app_settings").select("*").eq("id", "default").maybeSingle();
    if (error) throw error;
    return data || { id: "default", logo_url: null };
  },
  async uploadCompanyLogo(file) {
    const ext = file.name.split(".").pop();
    const path = `app-logo/logo-${Date.now()}.${ext}`;
    const { error: upErr } = await supabaseClient.storage.from("sop-images").upload(path, file, { upsert: true });
    if (upErr) throw upErr;
    const { data: pub } = supabaseClient.storage.from("sop-images").getPublicUrl(path);
    const { data: userData } = await supabaseClient.auth.getUser();
    const { data, error } = await supabaseClient
      .from("app_settings")
      .update({ logo_url: pub.publicUrl, updated_by: userData?.user?.id, updated_at: new Date().toISOString() })
      .eq("id", "default")
      .select().single();
    if (error) throw error;
    return data;
  },
};
