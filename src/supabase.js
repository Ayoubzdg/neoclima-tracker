import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
export const supabase = createClient(supabaseUrl, supabaseKey);

// ── Paramètres ────────────────────────────────────────────────────────────────
export const fetchParametre = async k => { const { data } = await supabase.from('parametres').select('value').eq('key', k).single(); return data?.value ?? null; };
export const setParametre   = async (k, v) => { const { error } = await supabase.from('parametres').upsert({ key: k, value: v, updated_at: new Date().toISOString() }); if (error) throw error; };

// ── Équipes ───────────────────────────────────────────────────────────────────
export const fetchEquipes    = async () => { const { data, error } = await supabase.from('equipes').select('*').eq('actif', true).order('ordre').order('name'); if (error) throw error; return data; };
export const fetchAllEquipes = async () => { const { data, error } = await supabase.from('equipes').select('*').order('ordre').order('name'); if (error) throw error; return data; };
export const createEquipe    = async p  => { const { data, error } = await supabase.from('equipes').insert(p).select().single(); if (error) throw error; return data; };
export const updateEquipe    = async (id, p) => { const { data, error } = await supabase.from('equipes').update(p).eq('id', id).select().single(); if (error) throw error; return data; };
export const deleteEquipe    = async id => { const { error } = await supabase.from('equipes').delete().eq('id', id); if (error) throw error; };

// ── Utilisateurs ──────────────────────────────────────────────────────────────
export const fetchUtilisateurs  = async () => { const { data, error } = await supabase.from('utilisateurs').select('*, equipes(name,couleur)').order('nom'); if (error) throw error; return data; };
export const createUtilisateur  = async p  => { const { data, error } = await supabase.from('utilisateurs').insert(p).select().single(); if (error) throw error; return data; };
export const updateUtilisateur  = async (id, p) => { const { data, error } = await supabase.from('utilisateurs').update(p).eq('id', id).select().single(); if (error) throw error; return data; };
export const deleteUtilisateur  = async id => { const { error } = await supabase.from('utilisateurs').delete().eq('id', id); if (error) throw error; };

// ── Chantiers ─────────────────────────────────────────────────────────────────
export const fetchChantiers  = async () => { const { data, error } = await supabase.from('chantiers').select('*').order('created_at'); if (error) throw error; return data; };
export const createChantier  = async n  => { const { data, error } = await supabase.from('chantiers').insert({ name: n }).select().single(); if (error) throw error; return data; };
export const updateChantier  = async (id, n) => { const { error } = await supabase.from('chantiers').update({ name: n }).eq('id', id); if (error) throw error; };
export const deleteChantier  = async id => { const { error } = await supabase.from('chantiers').delete().eq('id', id); if (error) throw error; };

// ── Bâtiments ─────────────────────────────────────────────────────────────────
export const fetchBatiments  = async cid => { const { data, error } = await supabase.from('batiments').select('*').eq('chantier_id', cid).order('created_at'); if (error) throw error; return data; };
export const createBatiment  = async (cid, n) => { const { data, error } = await supabase.from('batiments').insert({ chantier_id: cid, name: n }).select().single(); if (error) throw error; return data; };
export const updateBatiment  = async (id, n) => { const { error } = await supabase.from('batiments').update({ name: n }).eq('id', id); if (error) throw error; };
export const deleteBatiment  = async id => { const { error } = await supabase.from('batiments').delete().eq('id', id); if (error) throw error; };

// ── Niveaux ───────────────────────────────────────────────────────────────────
export const fetchNiveaux   = async bid => { const { data, error } = await supabase.from('niveaux').select('*').eq('batiment_id', bid).order('created_at'); if (error) throw error; return data; };
export const createNiveau   = async (bid, n) => { const { data, error } = await supabase.from('niveaux').insert({ batiment_id: bid, name: n }).select().single(); if (error) throw error; return data; };
export const updateNiveau   = async (id, n) => { const { error } = await supabase.from('niveaux').update({ name: n }).eq('id', id); if (error) throw error; };
export const deleteNiveau   = async id => { const { error } = await supabase.from('niveaux').delete().eq('id', id); if (error) throw error; };

// ── Zones ─────────────────────────────────────────────────────────────────────
export const fetchZones  = async nid => { const { data, error } = await supabase.from('zones').select('*').eq('niveau_id', nid).order('created_at'); if (error) throw error; return data; };
export const createZone  = async (nid, n) => { const { data, error } = await supabase.from('zones').insert({ niveau_id: nid, name: n }).select().single(); if (error) throw error; return data; };
export const updateZone  = async (id, n) => { const { error } = await supabase.from('zones').update({ name: n }).eq('id', id); if (error) throw error; };
export const deleteZone  = async id => { const { error } = await supabase.from('zones').delete().eq('id', id); if (error) throw error; };
export const uploadPlan  = async (zoneId, file) => {
  const ext = file.name.split('.').pop(), path = `zone-${zoneId}/plan.${ext}`;
  const { error: upErr } = await supabase.storage.from('plans').upload(path, file, { upsert: true });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from('plans').getPublicUrl(path);
  const planType = ext === 'pdf' ? 'pdf' : 'image';
  const pageCount = planType === 'pdf' ? await getPdfPageCount(file) : 1;
  const { error: upd } = await supabase.from('zones').update({ plan_url: data.publicUrl, plan_type: planType, plan_pages: pageCount }).eq('id', zoneId);
  if (upd) throw upd;
  return { plan_url: data.publicUrl, plan_type: planType, plan_pages: pageCount };
};
const getPdfPageCount = async file => { try { if (!window.pdfjsLib) return 1; const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise; return pdf.numPages; } catch { return 1; } };

// ── Zones de travail ──────────────────────────────────────────────────────────
export const fetchZonesTravail = async zid => { const { data, error } = await supabase.from('zones_travail').select('*').eq('zone_id', zid).order('created_at'); if (error) throw error; return data; };
export const fetchAllZTByDate  = async date => { const { data, error } = await supabase.from('zones_travail').select('*, zones(name,niveau_id,niveaux:niveau_id(name,batiment_id,batiments:batiment_id(name,chantier_id,chantiers:chantier_id(name))))').eq('date_pose', date); if (error) throw error; return data; };
export const fetchAllZTByChantier = async cid => {
  const { data, error } = await supabase.from('zones_travail')
    .select('*, zones(name,niveau_id,niveaux:niveau_id(name,batiment_id,batiments:batiment_id(name,chantier_id)))')
    .filter('zones.niveaux.batiments.chantier_id', 'eq', cid)
    .order('date_pose');
  if (error) throw error; return data || [];
};
export const createZoneTravail = async (zid, p) => { const { data, error } = await supabase.from('zones_travail').insert({ zone_id: zid, ...p }).select().single(); if (error) throw error; return data; };
export const updateZoneTravail = async (id, p) => { const { data, error } = await supabase.from('zones_travail').update(p).eq('id', id).select().single(); if (error) throw error; return data; };
export const deleteZoneTravail = async id => { const { error } = await supabase.from('zones_travail').delete().eq('id', id); if (error) throw error; };
export const subscribeZonesTravail = (zid, cb) => supabase.channel('zt-' + zid).on('postgres_changes', { event: '*', schema: 'public', table: 'zones_travail', filter: 'zone_id=eq.' + zid }, cb).subscribe();

// ── Historique ────────────────────────────────────────────────────────────────
export const fetchHistory = async ztid => { const { data, error } = await supabase.from('zt_history').select('*').eq('zone_travail_id', ztid).order('created_at', { ascending: false }).limit(20); if (error) throw error; return data; };
export const addHistory   = async (ztid, role, action, detail) => { await supabase.from('zt_history').insert({ zone_travail_id: ztid, role, action, detail }); };

// ── Effectifs ─────────────────────────────────────────────────────────────────
export const fetchEffectifs  = async (cid, date) => { const { data, error } = await supabase.from('effectifs').select('*, equipes(name,couleur)').eq('chantier_id', cid).eq('date', date); if (error) throw error; return data; };
export const upsertEffectif  = async p => { const { data, error } = await supabase.from('effectifs').upsert(p, { onConflict: 'chantier_id,date,equipe_id' }).select().single(); if (error) throw error; return data; };

// ── Matériaux manquants ───────────────────────────────────────────────────────
export const fetchMateriaux  = async ztid => { const { data, error } = await supabase.from('materiaux_manquants').select('*').eq('zone_travail_id', ztid).order('created_at'); if (error) throw error; return data; };
export const createMateriau  = async p => { const { data, error } = await supabase.from('materiaux_manquants').insert(p).select().single(); if (error) throw error; return data; };
export const updateMateriau  = async (id, p) => { const { data, error } = await supabase.from('materiaux_manquants').update(p).eq('id', id).select().single(); if (error) throw error; return data; };
export const deleteMateriau  = async id => { const { error } = await supabase.from('materiaux_manquants').delete().eq('id', id); if (error) throw error; };

// ── Annotations ───────────────────────────────────────────────────────────────
export const fetchAnnotations  = async zid => { const { data, error } = await supabase.from('annotations').select('*').eq('zone_id', zid).order('created_at'); if (error) throw error; return data; };
export const createAnnotation  = async p => { const { data, error } = await supabase.from('annotations').insert(p).select().single(); if (error) throw error; return data; };
export const deleteAnnotation  = async id => { const { error } = await supabase.from('annotations').delete().eq('id', id); if (error) throw error; };

// ── Photos ────────────────────────────────────────────────────────────────────
export const fetchPhotos  = async zid => { const { data, error } = await supabase.from('photos').select('*').eq('zone_id', zid).order('created_at'); if (error) throw error; return data; };
export const uploadPhoto  = async (zoneId, file, meta) => {
  const ext = file.name.split('.').pop(), path = `zone-${zoneId}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from('photos').upload(path, file, { upsert: false });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from('photos').getPublicUrl(path);
  const { data: row, error } = await supabase.from('photos').insert({ zone_id: zoneId, url: data.publicUrl, ...meta }).select().single();
  if (error) throw error; return row;
};
export const deletePhoto  = async (id, url) => {
  const path = url.split('/photos/')[1];
  if (path) await supabase.storage.from('photos').remove([path]);
  const { error } = await supabase.from('photos').delete().eq('id', id);
  if (error) throw error;
};

// ── Non-conformités ───────────────────────────────────────────────────────────
export const fetchNCs   = async zid => { const { data, error } = await supabase.from('non_conformites').select('*, equipes(name)').eq('zone_id', zid).order('created_at'); if (error) throw error; return data; };
export const fetchAllNCs = async cid => {
  const { data, error } = await supabase.from('non_conformites')
    .select('*, equipes(name), zones(name,niveau_id,niveaux:niveau_id(name,batiment_id,batiments:batiment_id(name,chantier_id)))')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).filter(nc => nc.zones?.niveaux?.batiments?.chantier_id === cid);
};
export const createNC   = async p => { const { data, error } = await supabase.from('non_conformites').insert(p).select().single(); if (error) throw error; return data; };
export const updateNC   = async (id, p) => { const { data, error } = await supabase.from('non_conformites').update(p).eq('id', id).select().single(); if (error) throw error; return data; };
export const deleteNC   = async id => { const { error } = await supabase.from('non_conformites').delete().eq('id', id); if (error) throw error; };

// ── Essais et mesures ─────────────────────────────────────────────────────────
export const fetchEssais  = async cid => { const { data, error } = await supabase.from('essais').select('*').eq('chantier_id', cid).order('created_at', { ascending: false }); if (error) throw error; return data; };
export const createEssai  = async p => { const { data, error } = await supabase.from('essais').insert(p).select().single(); if (error) throw error; return data; };
export const updateEssai  = async (id, p) => { const { data, error } = await supabase.from('essais').update(p).eq('id', id).select().single(); if (error) throw error; return data; };
export const deleteEssai  = async id => { const { error } = await supabase.from('essais').delete().eq('id', id); if (error) throw error; };

// ── Bons de travail ───────────────────────────────────────────────────────────
export const fetchBonsTravail = async (cid, date) => {
  const { data, error } = await supabase.from('bons_travail').select('*, bons_travail_zones(*, zones_travail(*), equipes(name,couleur))').eq('chantier_id', cid).eq('date', date);
  if (error) throw error; return data;
};
export const createBonTravail = async p => { const { data, error } = await supabase.from('bons_travail').insert(p).select().single(); if (error) throw error; return data; };
export const updateBonTravail = async (id, p) => { const { data, error } = await supabase.from('bons_travail').update(p).eq('id', id).select().single(); if (error) throw error; return data; };
export const addZoneToBon     = async p => { const { data, error } = await supabase.from('bons_travail_zones').insert(p).select().single(); if (error) throw error; return data; };
export const updateBonZone    = async (id, p) => { const { data, error } = await supabase.from('bons_travail_zones').update(p).eq('id', id).select().single(); if (error) throw error; return data; };
export const removeBonZone    = async id => { const { error } = await supabase.from('bons_travail_zones').delete().eq('id', id); if (error) throw error; };
