// =====================================================================
// Supabase connection — fill these in from:
// Supabase Dashboard > Project Settings > API
// =====================================================================
const SUPABASE_URL = "https://cogzadthvybfgkmduvvx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_pfstG2u5vWRcBU8QI6KSJA_HMcD3ZKX";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
