// =====================================================================
// Auth — session state + role lookup (admin / editor / viewer)
// =====================================================================
const Auth = {
  session: null,
  profile: null,

  async init() {
    const { data } = await supabaseClient.auth.getSession();
    this.session = data.session;
    if (this.session) await this.loadProfile();
    supabaseClient.auth.onAuthStateChange(async (_event, session) => {
      this.session = session;
      if (session) await this.loadProfile(); else this.profile = null;
      if (window.App) App.render();
    });
  },

  async loadProfile() {
    const { data, error } = await supabaseClient
      .from("profiles").select("*").eq("id", this.session.user.id).single();
    if (!error) this.profile = data;
  },

  isLoggedIn() { return !!this.session; },
  canEdit() { return this.profile && (this.profile.role === "admin" || this.profile.role === "editor"); },
  isAdmin() { return this.profile && this.profile.role === "admin"; },

  async signIn(email, password) {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  async signUp(email, password, fullName) {
    const { error } = await supabaseClient.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
  },

  async signOut() {
    await supabaseClient.auth.signOut();
  },
};
