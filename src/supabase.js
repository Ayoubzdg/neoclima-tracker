import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
export const supabase = createClient(supabaseUrl, supabaseKey);

// ── Paramètres ────────────────────────────────────────────────────────────────
export async function fetchParametre(key) {
  const { data, error } = await supabase.from('parametres').select('value').eq('key', key).single();
  if (error) return null;
  return data.value;
}
export async function setParametre(key, value) {
  const { error } = await supabase.from('parametres').upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ── Équipes ───────────────────────────────────────────────────────────────────
export async function fetchEquipes() {
  const { data, error } = await supabase.from('equipes').select('*').eq('actif', true).order('ordre').order('name');
  if (error) throw error; return data;
}
export async function fetchAllEquipes() {
  const { data, error } = await supabase.from('equipes').select('*').order('ordre').order('name');
  if (error) throw error; return data;
}
export async function createEquipe(payload) {
  const { data, error } = await supabase.from('equipes').insert(payload).select().single();
  if (error) throw error; return data;
}
export async function updateEquipe(id, payload) {
  const { data, error } = await supabase.from('equipes').update(payload).eq('id', id).select().single();
  if (error) throw error; return data;
}
export async function deleteEquipe(id) {
  const { error } = await supabase.from('equipes').delete().eq('id', id);
  if (error) throw error;
}

// ── Utilisateurs ──────────────────────────────────────────────────────────────
export async function fetchUtilisateurs() {
  const { data, error } = await supabase.from('utilisateurs').select('*, equipes(name, couleur)').order('nom');
  if (error) throw error; return data;
}
export async function createUtilisateur(payload) {
  const { data, error } = await supabase.from('utilisateurs').insert(payload).select().single();
  if (error) throw error; return data;
}
export async function updateUtilisateur(id, payload) {
  const { data, error } = await supabase.from('utilisateurs').update(payload).eq('id', id).select().single();
  if (error) throw error; return data;
}
export async function deleteUtilisateur(id) {
  const { error } = await supabase.from('utilisateurs').delete().eq('id', id);
  if (error) throw error;
}

// ── Chantiers ─────────────────────────────────────────────────────────────────
export async function fetchChantiers() {
  const { data, error } = await supabase.from('chantiers').select('*').order('created_at');
  if (error) throw error; return data;
}
export async function createChantier(name) {
  const { data, error } = await supabase.from('chantiers').insert({ name }).select().single();
  if (error) throw error; return data;
}
export async function updateChantier(id, name) {
  const { error } = await supabase.from('chantiers').update({ name }).eq('id', id);
  if (error) throw error;
}
export async function deleteChantier(id) {
  const { error } = await supabase.from('chantiers').delete().eq('id', id);
  if (error) throw error;
}

// ── Bâtiments ─────────────────────────────────────────────────────────────────
export async function fetchBatiments(chantier_id) {
  const { data, error } = await supabase.from('batiments').select('*').eq('chantier_id', chantier_id).order('created_at');
  if (error) throw error; return data;
}
export async function createBatiment(chantier_id, name) {
  const { data, error } = await supabase.from('batiments').insert({ chantier_id, name }).select().single();
  if (error) throw error; return data;
}
export async function updateBatiment(id, name) {
  const { error } = await supabase.from('batiments').update({ name }).eq('id', id);
  if (error) throw error;
}
export async function deleteBatiment(id) {
  const { error } = await supabase.from('batiments').delete().eq('id', id);
  if (error) throw error;
}

// ── Niveaux ───────────────────────────────────────────────────────────────────
export async function fetchNiveaux(batiment_id) {
  const { data, error } = await supabase.from('niveaux').select('*').eq('batiment_id', batiment_id).order('created_at');
  if (error) throw error; return data;
}
export async function createNiveau(batiment_id, name) {
  const { data, error } = await supabase.from('niveaux').insert({ batiment_id, name }).select().single();
  if (error) throw error; return data;
}
export async function updateNiveau(id, name) {
  const { error } = await supabase.from('niveaux').update({ name }).eq('id', id);
  if (error) throw error;
}
export async function deleteNiveau(id) {
  const { error } = await supabase.from('niveaux').delete().eq('id', id);
  if (error) throw error;
}

// ── Zones ─────────────────────────────────────────────────────────────────────
export async function fetchZones(niveau_id) {
  const { data, error } = await supabase.from('zones').select('*').eq('niveau_id', niveau_id).order('created_at');
  if (error) throw error; return data;
}
export async function createZone(niveau_id, name) {
  const { data, error } = await supabase.from('zones').insert({ niveau_id, name }).select().single();
  if (error) throw error; return data;
}
export async function updateZone(id, name) {
  const { error } = await supabase.from('zones').update({ name }).eq('id', id);
  if (error) throw error;
}
export async function deleteZone(id) {
  const { error } = await supabase.from('zones').delete().eq('id', id);
  if (error) throw error;
}
export async function uploadPlan(zoneId, file) {
  const ext  = file.name.split('.').pop();
  const path = "zone-" + zoneId + "/plan." + ext;
  const { error: upErr } = await supabase.storage.from('plans').upload(path, file, { upsert: true });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from('plans').getPublicUrl(path);
  const planType = ext === 'pdf' ? 'pdf' : 'image';
  const pageCount = planType === 'pdf' ? await getPdfPageCount(file) : 1;
  const { error: upd } = await supabase.from('zones').update({ plan_url: data.publicUrl, plan_type: planType, plan_pages: pageCount }).eq('id', zoneId);
  if (upd) throw upd;
  return { plan_url: data.publicUrl, plan_type: planType, plan_pages: pageCount };
}
async function getPdfPageCount(file) {
  try { if (!window.pdfjsLib) return 1; const buf = await file.arrayBuffer(); const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise; return pdf.numPages; } catch { return 1; }
}

// ── Zones de travail ──────────────────────────────────────────────────────────
export async function fetchZonesTravail(zone_id) {
  const { data, error } = await supabase.from('zones_travail').select('*').eq('zone_id', zone_id).order('created_at');
  if (error) throw error; return data;
}
export async function fetchAllZonesTravailByDate(date) {
  const { data, error } = await supabase.from('zones_travail')
    .select('*, zones(name, niveau_id, niveaux:niveau_id(name, batiment_id, batiments:batiment_id(name, chantier_id, chantiers:chantier_id(name))))')
    .eq('date_pose', date);
  if (error) throw error; return data;
}
export async function createZoneTravail(zone_id, payload) {
  const { data, error } = await supabase.from('zones_travail').insert({ zone_id, ...payload }).select().single();
  if (error) throw error; return data;
}
export async function updateZoneTravail(id, payload) {
  const { data, error } = await supabase.from('zones_travail').update(payload).eq('id', id).select().single();
  if (error) throw error; return data;
}
export async function deleteZoneTravail(id) {
  const { error } = await supabase.from('zones_travail').delete().eq('id', id);
  if (error) throw error;
}
export async function fetchHistory(zone_travail_id) {
  const { data, error } = await supabase.from('zt_history').select('*').eq('zone_travail_id', zone_travail_id).order('created_at', { ascending: false }).limit(20);
  if (error) throw error; return data;
}
export async function addHistory(zone_travail_id, role, action, detail) {
  await supabase.from('zt_history').insert({ zone_travail_id, role, action, detail });
}
export function subscribeZonesTravail(zone_id, callback) {
  return supabase.channel('zt-' + zone_id)
    .on('postgres_changes', { event:'*', schema:'public', table:'zones_travail', filter:'zone_id=eq.'+zone_id }, callback)
    .subscribe();
}
