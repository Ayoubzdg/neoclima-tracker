import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey  = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

// ── Chantiers ────────────────────────────────────────────────────────────────
export async function fetchChantiers() {
  const { data, error } = await supabase.from('chantiers').select('*').order('created_at');
  if (error) throw error;
  return data;
}
export async function createChantier(name) {
  const { data, error } = await supabase.from('chantiers').insert({ name }).select().single();
  if (error) throw error;
  return data;
}

// ── Bâtiments ────────────────────────────────────────────────────────────────
export async function fetchBatiments(chantier_id) {
  const { data, error } = await supabase.from('batiments').select('*').eq('chantier_id', chantier_id).order('created_at');
  if (error) throw error;
  return data;
}
export async function createBatiment(chantier_id, name) {
  const { data, error } = await supabase.from('batiments').insert({ chantier_id, name }).select().single();
  if (error) throw error;
  return data;
}

// ── Niveaux ──────────────────────────────────────────────────────────────────
export async function fetchNiveaux(batiment_id) {
  const { data, error } = await supabase.from('niveaux').select('*').eq('batiment_id', batiment_id).order('created_at');
  if (error) throw error;
  return data;
}
export async function createNiveau(batiment_id, name) {
  const { data, error } = await supabase.from('niveaux').insert({ batiment_id, name }).select().single();
  if (error) throw error;
  return data;
}

// ── Zones ────────────────────────────────────────────────────────────────────
export async function fetchZones(niveau_id) {
  const { data, error } = await supabase.from('zones').select('*').eq('niveau_id', niveau_id).order('created_at');
  if (error) throw error;
  return data;
}
export async function createZone(niveau_id, name) {
  const { data, error } = await supabase.from('zones').insert({ niveau_id, name }).select().single();
  if (error) throw error;
  return data;
}
export async function uploadPlan(zoneId, file) {
  const ext  = file.name.split('.').pop();
  const path = `zone-${zoneId}/plan.${ext}`;
  const { error: upErr } = await supabase.storage.from('plans').upload(path, file, { upsert: true });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from('plans').getPublicUrl(path);
  const planType = ext === 'pdf' ? 'pdf' : 'image';
  const { error: upd } = await supabase.from('zones').update({ plan_url: data.publicUrl, plan_type: planType }).eq('id', zoneId);
  if (upd) throw upd;
  return { plan_url: data.publicUrl, plan_type: planType };
}

// ── Zones de travail ─────────────────────────────────────────────────────────
export async function fetchZonesTravail(zone_id) {
  const { data, error } = await supabase.from('zones_travail').select('*').eq('zone_id', zone_id).order('created_at');
  if (error) throw error;
  return data;
}
export async function createZoneTravail(zone_id, payload) {
  const { data, error } = await supabase.from('zones_travail').insert({ zone_id, ...payload }).select().single();
  if (error) throw error;
  return data;
}
export async function updateZoneTravail(id, payload) {
  const { data, error } = await supabase.from('zones_travail').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}
export async function deleteZoneTravail(id) {
  const { error } = await supabase.from('zones_travail').delete().eq('id', id);
  if (error) throw error;
}

// ── Edit / Delete structure ───────────────────────────────────────────────────
export async function updateChantier(id, name) {
  const { error } = await supabase.from('chantiers').update({ name }).eq('id', id);
  if (error) throw error;
}
export async function deleteChantier(id) {
  const { error } = await supabase.from('chantiers').delete().eq('id', id);
  if (error) throw error;
}
export async function updateBatiment(id, name) {
  const { error } = await supabase.from('batiments').update({ name }).eq('id', id);
  if (error) throw error;
}
export async function deleteBatiment(id) {
  const { error } = await supabase.from('batiments').delete().eq('id', id);
  if (error) throw error;
}
export async function updateNiveau(id, name) {
  const { error } = await supabase.from('niveaux').update({ name }).eq('id', id);
  if (error) throw error;
}
export async function deleteNiveau(id) {
  const { error } = await supabase.from('niveaux').delete().eq('id', id);
  if (error) throw error;
}
export async function updateZone(id, name) {
  const { error } = await supabase.from('zones').update({ name }).eq('id', id);
  if (error) throw error;
}
export async function deleteZone(id) {
  const { error } = await supabase.from('zones').delete().eq('id', id);
  if (error) throw error;
}
export function subscribeZonesTravail(zone_id, callback) {
  return supabase.channel('zt-' + zone_id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'zones_travail', filter: 'zone_id=eq.' + zone_id }, callback)
    .subscribe();
}
