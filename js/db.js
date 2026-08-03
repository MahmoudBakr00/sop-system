// =====================================================================
// Data access layer — every Supabase query lives here so views stay thin.
// =====================================================================
const DB = {
  // ---------- SOPs ----------
  async listSops({ search = "", status = "" } = {}) {
    let q = supabaseClient.from("sops").select("*").order("updated_at", { ascending: false });
    if (status) q = q.eq("status", status);
    if (search) q = q.or(`title.ilike.%${search}%,title_ar.ilike.%${search}%,code.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    return data;
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

    const [tools, refs, revisions] = await Promise.all([
      this.listTools(sopId),
      this.listReferences(sopId),
      this.listRevisions(sopId),
    ]);
    sop.tools = tools;
    sop.references = refs;
    sop.revisions = revisions;

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

  // ---------- كود تلقائي من اسم المحطة ----------
  async generateSopCode(sopId, station) {
    const { data, error } = await supabaseClient.rpc("generate_sop_code", {
      p_sop_id: sopId, p_station: station,
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
  async deleteReference(id) {
    const { error } = await supabaseClient.from("sop_references").delete().eq("id", id);
    if (error) throw error;
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
