import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  fetchChantiers, createChantier,
  fetchBatiments, createBatiment,
  fetchNiveaux,   createNiveau,
  fetchZones,     createZone, uploadPlan,
  fetchZonesTravail, createZoneTravail, updateZoneTravail, deleteZoneTravail,
  subscribeZonesTravail,
  updateChantier, deleteChantier,
  updateBatiment, deleteBatiment,
  updateNiveau, deleteNiveau,
  updateZone, deleteZone,
} from './supabase';

const NC = {
  red:"#C0392B", redBg:"rgba(192,57,43,0.10)",
  dark:"#2C3E50",
  gray:"#7F8C8D",
  green:"#27AE60", greenBg:"rgba(39,174,96,0.12)",
  amber:"#E67E22", amberBg:"rgba(230,126,34,0.14)",
  purple:"#8E44AD", purpleBg:"rgba(142,68,173,0.13)",
  blue:"#2980B9",  blueBg:"rgba(41,128,185,0.13)",
  orange:"#D35400",orangeBg:"rgba(211,84,0,0.13)",
};

const PINS = { ca:"1234", chef:"5678", monteur:"9999" };
const ROLE_LABELS = { ca:"Chargé d'affaire", chef:"Chef de chantier", monteur:"Monteur" };
const ROLE_COLORS = { ca:NC.red, chef:NC.dark, monteur:NC.amber };
const STATUSES = {
  todo:       { label:"Prévu",        color:NC.gray,   bg:"rgba(127,140,141,0.10)" },
  inprogress: { label:"En cours",     color:NC.blue,   bg:NC.blueBg },
  nappe_h:    { label:"Nappe haute",  color:NC.amber,  bg:NC.amberBg },
  nappe_b:    { label:"Nappe basse",  color:NC.orange, bg:NC.orangeBg },
  terminaux:  { label:"Terminaux",    color:NC.purple, bg:NC.purpleBg },
  done:       { label:"Terminé",      color:NC.green,  bg:NC.greenBg },
  blocked:    { label:"Bloqué",       color:NC.red,    bg:NC.redBg },
};

const fmtDate = (d) => {
  if (!d) return "—";
  const p = d.split("-");
  return p[2] + "." + p[1] + "." + p[0];
};

// ── Small UI helpers ──────────────────────────────────────────────────────────
function SBtn({ children, onClick, primary, danger, style }) {
  return (
    <button onClick={onClick} style={{ padding:"8px 12px", borderRadius:7, border:"1px solid "+(primary?NC.red:danger?NC.red:"#ddd"), background:primary?NC.red:"white", color:primary?"white":danger?NC.red:NC.dark, cursor:"pointer", fontSize:13, fontWeight:primary?700:400, fontFamily:"Arial,sans-serif", ...style }}>
      {children}
    </button>
  );
}
function Field({ label, children }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:11, color:NC.gray, marginBottom:4, fontWeight:700, textTransform:"uppercase", letterSpacing:0.3 }}>{label}</div>
      {children}
      {/* Modal renommage */}
      {editingItem && (
        <Modal title={"Renommer — "+editingItem.item.name} onClose={()=>setEditingItem(null)}>
          <Field label="Nouveau nom">
            <input autoFocus value={editingName} onChange={e=>setEditingName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleRename()} style={{ width:"100%", fontSize:13, boxSizing:"border-box" }} />
          </Field>
          <div style={{ display:"flex", gap:8 }}>
            <SBtn primary onClick={handleRename} style={{ flex:1 }}>{saving?"…":"Renommer"}</SBtn>
            <SBtn onClick={()=>setEditingItem(null)} style={{ flex:1 }}>Annuler</SBtn>
          </div>
        </Modal>
      )}

      {/* Footer */}
      <div style={{ textAlign:"center", padding:"18px 0 10px", fontSize:11, color:"#bbb", borderTop:"1px solid #e8e8e8", marginTop:24, fontFamily:"Arial,sans-serif" }}>
        © {new Date().getFullYear()} Propriété de <strong style={{ color:NC.gray }}>Neoclima Sàrl</strong> — Tous droits réservés
      </div>
function SCard({ title, children, accent }) {
  const a = accent || NC.red;
  return (
    <div style={{ background:"white", border:"1px solid #e8e8e8", borderRadius:8, padding:14, marginBottom:12 }}>
      <div style={{ fontSize:13, fontWeight:700, color:a, marginBottom:12, borderLeft:"3px solid "+a, paddingLeft:8 }}>{title}</div>
      {children}
    </div>
  );
}
function Muted({ children }) { return <div style={{ fontSize:13, color:NC.gray }}>{children}</div>; }
function Modal({ title, children, onClose }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }}>
      <div style={{ background:"white", borderRadius:10, padding:20, width:320, border:"1px solid #ddd", maxHeight:"90vh", overflowY:"auto", fontFamily:"Arial,sans-serif" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, borderBottom:"2px solid "+NC.red, paddingBottom:10 }}>
          <span style={{ fontSize:14, fontWeight:700, color:NC.dark }}>{title}</span>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:NC.gray }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function NavCol({ title, items, selId, onSel, canAdd, onAdd, onEdit, onDelete, badge, loading }) {
  return (
    <div style={{ flex:"1 1 140px", minWidth:120 }}>
      <div style={{ fontSize:11, color:NC.gray, marginBottom:6, fontWeight:700, letterSpacing:0.5, textTransform:"uppercase" }}>{title}</div>
      {loading && <div style={{ fontSize:12, color:NC.gray, padding:"8px 0" }}>Chargement…</div>}
      {items.map((item) => (
        <div key={item.id}
          style={{ padding:"9px 10px", borderRadius:6, border:"1px solid "+(selId===item.id?NC.red:"#e0e0e0"), borderLeft:selId===item.id?"3px solid "+NC.red:"1px solid #e0e0e0", background:selId===item.id?NC.redBg:"white", marginBottom:5, fontSize:13, color:selId===item.id?NC.red:NC.dark, display:"flex", justifyContent:"space-between", alignItems:"center", gap:4 }}>
          <span onClick={() => onSel(item.id)} style={{ fontWeight:selId===item.id?700:400, cursor:"pointer", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.name}</span>
          <div style={{ display:"flex", gap:3, flexShrink:0 }}>
            {badge && badge(item) != null && <span style={{ fontSize:11, background:NC.dark, color:"white", borderRadius:10, padding:"1px 7px", fontWeight:700 }}>{badge(item)}</span>}
            {canAdd && <>
              <button onClick={e=>{e.stopPropagation();onEdit(item);}} title="Renommer" style={{ width:22, height:22, borderRadius:4, border:"1px solid #e0e0e0", background:"white", color:NC.gray, cursor:"pointer", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}>✎</button>
              <button onClick={e=>{e.stopPropagation();onDelete(item);}} title="Supprimer" style={{ width:22, height:22, borderRadius:4, border:"1px solid #fcc", background:"#fff5f5", color:NC.red, cursor:"pointer", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}>×</button>
            </>}
          </div>
        </div>
      ))}
      {canAdd && <button onClick={onAdd} style={{ fontSize:12, padding:"5px 8px", borderRadius:6, border:"1px dashed "+NC.red, background:"transparent", color:NC.red, cursor:"pointer", width:"100%", fontFamily:"Arial,sans-serif" }}>+ {title.slice(0,-1)}</button>}
    </div>
  );
}

// ── PlanViewer ────────────────────────────────────────────────────────────────
function PlanViewer({ zone, role, onZTClick, onNewZT }) {
  const containerRef = useRef(null);
  const canvasRef    = useRef(null);
  const [tf, setTf]  = useState({ x:0, y:0, s:1 });
  const [pdfReady, setPdfReady] = useState(false);
  const [imgSz, setImgSz]       = useState({ w:800, h:600 });
  const [mode, setMode]         = useState("pan");
  const [pdfLib, setPdfLib]     = useState(null);
  const [drawRect, setDrawRect] = useState(null);
  const panRef  = useRef({ on:false, sx:0, sy:0, tx:0, ty:0 });
  const drwRef  = useRef({ on:false, sx:0, sy:0 });
  const pnchRef = useRef({ on:false, d:0, s:1, tx:0, ty:0, mx:0, my:0 });

  useEffect(() => {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      setPdfLib(window.pdfjsLib); return;
    }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; setPdfLib(window.pdfjsLib); };
    document.head.appendChild(s);
  }, []);

  useEffect(() => { setTf({ x:0, y:0, s:1 }); setPdfReady(false); setDrawRect(null); setMode("pan"); }, [zone && zone.id]);

  useEffect(() => {
    if (!zone || !zone.plan_url || zone.plan_type !== "pdf" || !pdfLib || !canvasRef.current) return;
    setPdfReady(false);
    fetch(zone.plan_url).then(r => r.arrayBuffer()).then(buf => {
      pdfLib.getDocument({ data: buf }).promise.then(pdf => {
        pdf.getPage(1).then(page => {
          const vp = page.getViewport({ scale: 2 });
          const cv = canvasRef.current; if (!cv) return;
          cv.width = vp.width; cv.height = vp.height;
          setImgSz({ w: vp.width, h: vp.height });
          page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise.then(() => setPdfReady(true));
        });
      });
    });
  }, [zone && zone.plan_url, pdfLib]);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const el = containerRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const mx = e.clientX - r.left - r.width/2, my = e.clientY - r.top - r.height/2;
    const f = e.deltaY < 0 ? 1.12 : 0.89;
    setTf(t => { const ns = Math.max(0.15, Math.min(12, t.s*f)); return { x:mx-(mx-t.x)*(ns/t.s), y:my-(my-t.y)*(ns/t.s), s:ns }; });
  }, []);
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    el.addEventListener("wheel", onWheel, { passive:false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  const gcp   = e => e.touches ? { x:e.touches[0].clientX, y:e.touches[0].clientY } : { x:e.clientX, y:e.clientY };
  const gdist = t => Math.hypot(t[0].clientX-t[1].clientX, t[0].clientY-t[1].clientY);
  const gmid  = t => ({ x:(t[0].clientX+t[1].clientX)/2, y:(t[0].clientY+t[1].clientY)/2 });

  const s2p = (sx, sy) => {
    const el = containerRef.current; if (!el) return { x:0, y:0 };
    const r = el.getBoundingClientRect();
    const px = (sx - r.left - r.width/2 - tf.x) / tf.s;
    const py = (sy - r.top  - r.height/2 - tf.y) / tf.s;
    const rw = Math.min(r.width, imgSz.w), rh = rw * imgSz.h / imgSz.w;
    return { x:(px/rw+0.5)*100, y:(py/rh+0.5)*100 };
  };

  const onDown = e => {
    if (e.touches && e.touches.length === 2) {
      const mid = gmid(e.touches), el = containerRef.current, r = el.getBoundingClientRect();
      pnchRef.current = { on:true, d:gdist(e.touches), s:tf.s, tx:tf.x, ty:tf.y, mx:mid.x-r.left-r.width/2, my:mid.y-r.top-r.height/2 };
      return;
    }
    const p = gcp(e);
    if (mode === "pan" || !zone || !zone.plan_url) { panRef.current = { on:true, sx:p.x, sy:p.y, tx:tf.x, ty:tf.y }; }
    else if (mode === "draw" && role === "ca") { const pp = s2p(p.x, p.y); drwRef.current = { on:true, sx:pp.x, sy:pp.y }; setDrawRect({ x:pp.x, y:pp.y, w:0, h:0 }); }
    e.preventDefault();
  };
  const onMove = e => {
    if (e.touches && e.touches.length === 2 && pnchRef.current.on) {
      const nd = gdist(e.touches), ns = Math.max(0.15, Math.min(12, pnchRef.current.s * nd / pnchRef.current.d));
      const mid = gmid(e.touches), el = containerRef.current, r = el.getBoundingClientRect();
      const mx = mid.x-r.left-r.width/2, my = mid.y-r.top-r.height/2;
      setTf({ x:pnchRef.current.tx+mx-pnchRef.current.mx+(pnchRef.current.mx-pnchRef.current.tx)*(1-ns/pnchRef.current.s), y:pnchRef.current.ty+my-pnchRef.current.my+(pnchRef.current.my-pnchRef.current.ty)*(1-ns/pnchRef.current.s), s:ns });
      e.preventDefault(); return;
    }
    const p = gcp(e);
    if (panRef.current.on) setTf(t => ({ ...t, x:panRef.current.tx+p.x-panRef.current.sx, y:panRef.current.ty+p.y-panRef.current.sy }));
    else if (drwRef.current.on) { const pp = s2p(p.x, p.y); setDrawRect({ x:Math.min(drwRef.current.sx,pp.x), y:Math.min(drwRef.current.sy,pp.y), w:Math.abs(pp.x-drwRef.current.sx), h:Math.abs(pp.y-drwRef.current.sy) }); }
    e.preventDefault();
  };
  const onUp = () => {
    pnchRef.current.on = false; panRef.current.on = false;
    if (drwRef.current.on) { drwRef.current.on = false; if (drawRect && drawRect.w > 0.5 && drawRect.h > 0.5) onNewZT(drawRect); setDrawRect(null); }
  };

  const cw = containerRef.current ? containerRef.current.clientWidth : 700;

  return (
    <div style={{ position:"relative", borderRadius:8, overflow:"hidden", border:"0.5px solid #ddd", background:"#1a1a1a", height:"62vh" }}>
      <div style={{ position:"absolute", top:8, right:8, zIndex:20, display:"flex", flexDirection:"column", gap:3 }}>
        {[["−",()=>setTf(t=>({...t,s:Math.max(0.15,t.s/1.3)}))],["+",()=>setTf(t=>({...t,s:Math.min(12,t.s*1.3)}))],["⊡",()=>setTf({x:0,y:0,s:1})]].map(([l,fn])=>(
          <button key={l} onClick={fn} style={{ width:30, height:30, borderRadius:5, border:"0.5px solid #ccc", background:"white", color:NC.dark, cursor:"pointer", fontSize:15, display:"flex", alignItems:"center", justifyContent:"center" }}>{l}</button>
        ))}
      </div>
      {role === "ca" && zone && zone.plan_url && (
        <div style={{ position:"absolute", top:8, left:8, zIndex:20, display:"flex", gap:4 }}>
          {[["pan","✥ Naviguer"],["draw","⬜ Dessiner"]].map(([m,l])=>(
            <button key={m} onClick={()=>setMode(m)} style={{ fontSize:11, padding:"4px 9px", borderRadius:5, border:"1px solid "+(mode===m?NC.red:"#ccc"), background:mode===m?NC.red:"white", color:mode===m?"white":NC.gray, cursor:"pointer", fontWeight:mode===m?700:400 }}>{l}</button>
          ))}
        </div>
      )}
      <div style={{ position:"absolute", bottom:8, right:8, zIndex:20, fontSize:11, color:"#aaa", background:"rgba(0,0,0,0.55)", padding:"2px 6px", borderRadius:4 }}>{Math.round(tf.s*100)}%</div>
      <div ref={containerRef} style={{ width:"100%", height:"100%", overflow:"hidden", cursor:mode==="draw"&&role==="ca"?"crosshair":"grab", touchAction:"none" }}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}>
        {!zone || !zone.plan_url ? (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", fontSize:13, color:"#888" }}>
            {role==="ca" ? "Importez un plan PDF pour commencer." : "Aucun plan importé."}
          </div>
        ) : (
          <div style={{ position:"absolute", left:"50%", top:"50%", transform:"translate(calc(-50% + "+tf.x+"px), calc(-50% + "+tf.y+"px)) scale("+tf.s+")", transformOrigin:"center center", pointerEvents:"none" }}>
            {zone.plan_type==="pdf"
              ? <canvas ref={canvasRef} style={{ display:"block", maxWidth:cw+"px", opacity:pdfReady?1:0 }} />
              : <img src={zone.plan_url} alt="plan" style={{ display:"block", maxWidth:cw+"px" }} onLoad={e=>setImgSz({w:e.target.naturalWidth,h:e.target.naturalHeight})} />
            }
            {zone.plan_type==="pdf" && !pdfReady && <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"#aaa" }}>Rendu PDF…</div>}
            {(zone.zones_travail || []).map(zt => (
              <div key={zt.id} onClick={e=>{e.stopPropagation();onZTClick(zt);}}
                style={{ position:"absolute", left:zt.rect.x+"%", top:zt.rect.y+"%", width:zt.rect.w+"%", height:zt.rect.h+"%", border:"1.5px solid "+STATUSES[zt.status].color, background:STATUSES[zt.status].bg, borderRadius:2, cursor:"pointer", boxSizing:"border-box", pointerEvents:"all" }}>
                <div style={{ fontSize:9, color:STATUSES[zt.status].color, fontWeight:500, padding:"1px 3px", background:"rgba(255,255,255,0.90)", borderRadius:2, display:"inline-block", maxWidth:"100%", overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>{zt.label||"—"}</div>
              </div>
            ))}
            {drawRect && drawRect.w > 0 && <div style={{ position:"absolute", left:drawRect.x+"%", top:drawRect.y+"%", width:drawRect.w+"%", height:drawRect.h+"%", border:"1px dashed "+NC.red, background:NC.redBg, borderRadius:2, pointerEvents:"none", boxSizing:"border-box" }} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ── LoginScreen ───────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [selRole, setSelRole] = useState(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const tryLogin = () => { if (pin === PINS[selRole]) onLogin(selRole); else { setErr("Code PIN incorrect."); setPin(""); } };

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"#f4f4f4", padding:16, fontFamily:"Arial,sans-serif" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:36 }}>
        <div style={{ width:40, height:40, borderRadius:8, background:NC.red, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <svg width="22" height="22" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="1" fill="white" opacity="0.95"/><rect x="9" y="2" width="5" height="5" rx="1" fill="white" opacity="0.55"/><rect x="2" y="9" width="5" height="5" rx="1" fill="white" opacity="0.55"/><rect x="9" y="9" width="5" height="5" rx="1" fill="white" opacity="0.95"/></svg>
        </div>
        <div><div style={{ fontSize:18, fontWeight:700, color:NC.dark }}>NEOCLIMA</div><div style={{ fontSize:11, color:NC.gray, letterSpacing:1 }}>FIELD TRACKER</div></div>
      </div>
      {!selRole ? (
        <div style={{ width:"100%", maxWidth:320 }}>
          <div style={{ fontSize:13, color:NC.gray, marginBottom:14, textAlign:"center" }}>Sélectionnez votre rôle</div>
          {Object.entries(ROLE_LABELS).map(([k,v]) => (
            <button key={k} onClick={()=>setSelRole(k)} style={{ width:"100%", padding:"13px 18px", borderRadius:8, border:"1px solid #ddd", background:"white", cursor:"pointer", fontSize:14, color:NC.dark, display:"flex", alignItems:"center", gap:12, marginBottom:8, fontFamily:"Arial,sans-serif" }}>
              <div style={{ width:10, height:10, borderRadius:"50%", background:ROLE_COLORS[k] }} />{v}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ width:"100%", maxWidth:290, background:"white", borderRadius:10, border:"1px solid #ddd", padding:24 }}>
          <button onClick={()=>{setSelRole(null);setPin("");setErr("");}} style={{ fontSize:12, color:NC.gray, background:"none", border:"none", cursor:"pointer", padding:0, marginBottom:18 }}>← Retour</button>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20 }}>
            <div style={{ width:10, height:10, borderRadius:"50%", background:ROLE_COLORS[selRole] }} />
            <span style={{ fontSize:15, fontWeight:700, color:NC.dark }}>{ROLE_LABELS[selRole]}</span>
          </div>
          <div style={{ fontSize:12, color:NC.gray, marginBottom:6 }}>Code PIN</div>
          <input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&tryLogin()} autoFocus placeholder="• • • •"
            style={{ width:"100%", fontSize:24, letterSpacing:10, textAlign:"center", marginBottom:10, boxSizing:"border-box", border:"1.5px solid "+(err?NC.red:"#ddd"), borderRadius:7, padding:"8px 0", outline:"none" }} />
          {err && <div style={{ fontSize:12, color:NC.red, marginBottom:8 }}>{err}</div>}
          <button onClick={tryLogin} style={{ width:"100%", padding:10, borderRadius:8, border:"none", background:NC.red, color:"white", cursor:"pointer", fontSize:14, fontWeight:700 }}>Connexion</button>
          <div style={{ fontSize:11, color:"#bbb", marginTop:10, textAlign:"center" }}>Démo — CA: 1234 · Chef: 5678 · Monteur: 9999</div>
        </div>
      )}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({ allZT, data }) {
  const cnt = {};
  Object.keys(STATUSES).forEach(k => { cnt[k] = allZT.filter(x => x.status===k).length; });
  const blocked = allZT.filter(x => x.status==="blocked");
  const pct = (a,b) => b===0?0:Math.round(a/b*100);

  const byBat = {};
  (data.batiments||[]).forEach(b => {
    const bzt = allZT.filter(x => x.batiment_id===b.id);
    byBat[b.name] = { total:bzt.length, done:bzt.filter(x=>x.status==="done").length, blocked:bzt.filter(x=>x.status==="blocked").length };
  });

  const byDate = {};
  allZT.forEach(zt => { const d=zt.date_pose||"Sans date"; if(!byDate[d])byDate[d]={}; byDate[d][zt.status]=(byDate[d][zt.status]||0)+1; });
  const dates = Object.keys(byDate).sort();

  const byEq = {};
  allZT.forEach(zt => { const eq=zt.equipe||"Non assigné"; if(!byEq[eq])byEq[eq]={total:0,done:0,blocked:0}; byEq[eq].total++; if(zt.status==="done")byEq[eq].done++; if(zt.status==="blocked")byEq[eq].blocked++; });

  return (
    <div style={{ padding:14, fontFamily:"Arial,sans-serif" }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(90px,1fr))", gap:8, marginBottom:14 }}>
        <div style={{ background:"white", border:"1px solid #e8e8e8", borderRadius:8, padding:"10px 12px", borderTop:"3px solid "+NC.dark }}>
          <div style={{ fontSize:11, color:NC.gray, marginBottom:3 }}>Total</div>
          <div style={{ fontSize:22, fontWeight:700, color:NC.dark }}>{allZT.length}</div>
        </div>
        {Object.entries(STATUSES).map(([k,v]) => (
          <div key={k} style={{ background:"white", border:"1px solid #e8e8e8", borderRadius:8, padding:"10px 12px", borderTop:"3px solid "+v.color }}>
            <div style={{ fontSize:11, color:NC.gray, marginBottom:3 }}>{v.label}</div>
            <div style={{ fontSize:22, fontWeight:700, color:v.color }}>{cnt[k]||0}</div>
          </div>
        ))}
      </div>
      <SCard title="Avancement par bâtiment">
        {Object.keys(byBat).length===0?<Muted>Aucune donnée.</Muted>:Object.entries(byBat).map(([name,s])=>(
          <div key={name} style={{ marginBottom:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:5 }}>
              <span style={{ color:NC.dark, fontWeight:500 }}>{name}</span>
              <span style={{ color:NC.gray, fontSize:12 }}>{s.done}/{s.total} ({pct(s.done,s.total)}%)</span>
            </div>
            <div style={{ height:8, borderRadius:4, background:"#f0f0f0", overflow:"hidden" }}>
              <div style={{ height:"100%", width:pct(s.done,s.total)+"%", background:NC.green, borderRadius:4 }} />
            </div>
            {s.blocked>0&&<div style={{ fontSize:11, color:NC.red, marginTop:3 }}>{s.blocked} bloquée{s.blocked>1?"s":""}</div>}
          </div>
        ))}
      </SCard>
      <SCard title="Planning par date de pose">
        {dates.length===0?<Muted>Aucune zone avec date.</Muted>:(
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead><tr style={{ background:"#f8f8f8" }}>
                <th style={{ textAlign:"left", padding:"5px 8px", color:NC.gray, fontWeight:400, borderBottom:"1px solid #eee" }}>Date</th>
                {Object.entries(STATUSES).map(([k,v])=><th key={k} style={{ padding:"5px 6px", color:v.color, fontWeight:500, borderBottom:"1px solid #eee", whiteSpace:"nowrap", fontSize:11 }}>{v.label}</th>)}
                <th style={{ padding:"5px 8px", color:NC.dark, fontWeight:500, borderBottom:"1px solid #eee" }}>Total</th>
              </tr></thead>
              <tbody>{dates.map((d,i)=>{const row=byDate[d],tot=Object.values(row).reduce((a,b)=>a+b,0);return(
                <tr key={d} style={{ background:i%2===0?"#fafafa":"white" }}>
                  <td style={{ padding:"5px 8px", color:NC.dark, whiteSpace:"nowrap", fontWeight:500 }}>{fmtDate(d==="Sans date"?null:d)}</td>
                  {Object.keys(STATUSES).map(k=><td key={k} style={{ padding:"5px 6px", textAlign:"center", color:row[k]?STATUSES[k].color:"#ddd" }}>{row[k]||"—"}</td>)}
                  <td style={{ padding:"5px 8px", textAlign:"center", fontWeight:700, color:NC.dark }}>{tot}</td>
                </tr>
              );})}
              </tbody>
            </table>
          </div>
        )}
      </SCard>
      <SCard title="Statistiques par équipe">
        {Object.keys(byEq).length===0?<Muted>Aucune équipe.</Muted>:Object.entries(byEq).map(([eq,s])=>(
          <div key={eq} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0", borderBottom:"1px solid #f0f0f0", flexWrap:"wrap" }}>
            <div style={{ width:32, height:32, borderRadius:6, background:NC.redBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:NC.red, flexShrink:0 }}>{eq.slice(0,2).toUpperCase()}</div>
            <div style={{ flex:1, minWidth:80 }}><div style={{ fontSize:13, color:NC.dark, fontWeight:500 }}>{eq}</div><div style={{ fontSize:11, color:NC.gray }}>{s.total} zone{s.total>1?"s":""}</div></div>
            <div style={{ display:"flex", alignItems:"center", gap:6, flex:2, minWidth:120 }}>
              <div style={{ flex:1, height:7, borderRadius:4, background:"#f0f0f0", overflow:"hidden" }}><div style={{ height:"100%", width:pct(s.done,s.total)+"%", background:NC.green }} /></div>
              <span style={{ fontSize:12, color:NC.gray, minWidth:32 }}>{pct(s.done,s.total)}%</span>
            </div>
            {s.blocked>0&&<span style={{ fontSize:11, color:NC.red, background:NC.redBg, padding:"2px 7px", borderRadius:4 }}>{s.blocked} bloqué{s.blocked>1?"s":""}</span>}
          </div>
        ))}
      </SCard>
      <SCard title={"Zones bloquées"+(blocked.length>0?" ("+blocked.length+")":"  — aucune")} accent={blocked.length>0?NC.red:NC.gray}>
        {blocked.length===0?<Muted>Aucune zone bloquée.</Muted>:blocked.map(zt=>(
          <div key={zt.id} style={{ padding:"8px 0", borderBottom:"1px solid #f5f5f5" }}>
            <div style={{ fontSize:13, fontWeight:500, color:NC.red }}>{zt.label||"—"}</div>
            <div style={{ fontSize:12, color:NC.gray }}>{zt.equipe?" · "+zt.equipe:""}</div>
            {zt.comment&&<div style={{ fontSize:12, color:NC.gray, marginTop:2, fontStyle:"italic" }}>« {zt.comment} »</div>}
          </div>
        ))}
      </SCard>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [role, setRole]           = useState(null);
  const [view, setView]           = useState("nav");
  const [chantiers, setChantiers] = useState([]);
  const [batiments, setBatiments] = useState([]);
  const [niveaux, setNiveaux]     = useState([]);
  const [zones, setZones]         = useState([]);
  const [currentZone, setCurrentZone] = useState(null);
  const [allZT, setAllZT]         = useState([]);
  const [sel, setSel]             = useState({ chantier:null, batiment:null, niveau:null, zone:null });
  const [loading, setLoading]     = useState({});
  const [editZT, setEditZT]       = useState(null);
  const [addingWhat, setAddingWhat] = useState(null);
  const [newName, setNewName]     = useState("");
  const [editingItem, setEditingItem] = useState(null); // { type, item }
  const [editingName, setEditingName] = useState("");
  const fileInputRef = useRef(null);
  const realtimeSub  = useRef(null);

  // Load chantiers on login
  useEffect(() => {
    if (!role) return;
    setLoading(l=>({...l,chantiers:true}));
    fetchChantiers().then(d=>{ setChantiers(d); setLoading(l=>({...l,chantiers:false})); }).catch(console.error);
  }, [role]);

  // Load batiments
  useEffect(() => {
    if (!sel.chantier) { setBatiments([]); return; }
    setLoading(l=>({...l,batiments:true}));
    fetchBatiments(sel.chantier).then(d=>{ setBatiments(d); setLoading(l=>({...l,batiments:false})); });
  }, [sel.chantier]);

  // Load niveaux
  useEffect(() => {
    if (!sel.batiment) { setNiveaux([]); return; }
    setLoading(l=>({...l,niveaux:true}));
    fetchNiveaux(sel.batiment).then(d=>{ setNiveaux(d); setLoading(l=>({...l,niveaux:false})); });
  }, [sel.batiment]);

  // Load zones
  useEffect(() => {
    if (!sel.niveau) { setZones([]); return; }
    setLoading(l=>({...l,zones:true}));
    fetchZones(sel.niveau).then(d=>{ setZones(d); setLoading(l=>({...l,zones:false})); });
  }, [sel.niveau]);

  // Load zones_travail + realtime
  useEffect(() => {
    if (!sel.zone) { setCurrentZone(null); setAllZT([]); return; }
    const z = zones.find(x=>x.id===sel.zone);
    setCurrentZone(z ? { ...z, zones_travail:[] } : null);
    fetchZonesTravail(sel.zone).then(zt => {
      setAllZT(zt);
      setCurrentZone(prev => prev ? { ...prev, zones_travail:zt } : null);
    });
    if (realtimeSub.current) realtimeSub.current.unsubscribe();
    realtimeSub.current = subscribeZonesTravail(sel.zone, () => {
      fetchZonesTravail(sel.zone).then(zt => {
        setAllZT(zt);
        setCurrentZone(prev => prev ? { ...prev, zones_travail:zt } : null);
      });
    });
    return () => { if (realtimeSub.current) realtimeSub.current.unsubscribe(); };
  }, [sel.zone]);

  const openZone  = (zid) => { setSel(s=>({...s,zone:zid})); setView("plan"); };
  const backToNav = ()    => { setSel(s=>({...s,zone:null})); setView("nav"); };
  const goToNav   = ()    => { setSel(s=>({...s,zone:null})); setView("nav"); };

  const handlePlanUpload = async (e) => {
    const file = e.target.files[0]; if (!file || !sel.zone) return;
    setSaving(true);
    try {
      const res = await uploadPlan(sel.zone, file);
      setCurrentZone(prev => prev ? { ...prev, plan_url:res.plan_url, plan_type:res.plan_type } : null);
      setZones(prev => prev.map(z => z.id===sel.zone ? { ...z, ...res } : z));
    } catch(err) { alert("Erreur upload: " + err.message); }
    setSaving(false);
    e.target.value = "";
  };

  const saveZT = async () => {
    if (!editZT) return;
    setSaving(true);
    try {
      if (editZT.isNew) {
        const zt = await createZoneTravail(sel.zone, { label:editZT.label, equipe:editZT.equipe, rect:editZT.rect, status:"todo", comment:"", date_pose:null });
        setAllZT(prev=>[...prev,zt]);
        setCurrentZone(prev=>prev?{...prev,zones_travail:[...prev.zones_travail,zt]}:null);
      } else {
        const updated = await updateZoneTravail(editZT.id, { label:editZT.label, equipe:editZT.equipe, status:editZT.status, comment:editZT.comment, date_pose:editZT.date_pose||null });
        setAllZT(prev=>prev.map(x=>x.id===updated.id?updated:x));
        setCurrentZone(prev=>prev?{...prev,zones_travail:prev.zones_travail.map(x=>x.id===updated.id?updated:x)}:null);
      }
    } catch(err) { alert("Erreur sauvegarde: " + err.message); }
    setSaving(false);
    setEditZT(null);
  };

  const deleteZT = async (id) => {
    setSaving(true);
    try {
      await deleteZoneTravail(id);
      setAllZT(prev=>prev.filter(x=>x.id!==id));
      setCurrentZone(prev=>prev?{...prev,zones_travail:prev.zones_travail.filter(x=>x.id!==id)}:null);
    } catch(err) { alert("Erreur suppression: " + err.message); }
    setSaving(false);
    setEditZT(null);
  };

  const addItem = async () => {
    const name = newName.trim(); if (!name) return;
    setSaving(true);
    try {
      if (addingWhat==="chantier")  { const r=await createChantier(name);              setChantiers(p=>[...p,r]); }
      if (addingWhat==="batiment")  { const r=await createBatiment(sel.chantier,name); setBatiments(p=>[...p,r]); }
      if (addingWhat==="niveau")    { const r=await createNiveau(sel.batiment,name);   setNiveaux(p=>[...p,r]); }
      if (addingWhat==="zone")      { const r=await createZone(sel.niveau,name);       setZones(p=>[...p,r]); }
    } catch(err) { alert("Erreur création: " + err.message); }
    setSaving(false);
    setAddingWhat(null); setNewName("");
  };

  const canEdit = role==="ca";
  const dashData = { batiments, allZT };

  if (!role) return <LoginScreen onLogin={r=>setRole(r)} />;

  const nbtn = active => ({ fontSize:12, padding:"5px 12px", borderRadius:5, border:"1px solid "+(active?NC.red:"#ddd"), background:active?NC.red:"white", color:active?"white":NC.dark, cursor:"pointer", fontFamily:"Arial,sans-serif", fontWeight:active?700:400 });

  return (
    <div style={{ minHeight:"100vh", background:"#f4f4f4", fontFamily:"Arial,sans-serif" }}>
      {/* Header */}
      <div style={{ background:"white", borderBottom:"2px solid "+NC.red, padding:"9px 14px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:28, height:28, borderRadius:6, background:NC.red, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="1" fill="white" opacity="0.95"/><rect x="9" y="2" width="5" height="5" rx="1" fill="white" opacity="0.55"/><rect x="2" y="9" width="5" height="5" rx="1" fill="white" opacity="0.55"/><rect x="9" y="9" width="5" height="5" rx="1" fill="white" opacity="0.95"/></svg>
          </div>
          <div><div style={{ fontSize:13, fontWeight:700, color:NC.dark }}>NEOCLIMA</div><div style={{ fontSize:9, color:NC.gray, letterSpacing:1 }}>FIELD TRACKER</div></div>
          <div style={{ fontSize:11, padding:"2px 8px", borderRadius:4, background:NC.redBg, color:NC.red, border:"1px solid rgba(192,57,43,0.2)", marginLeft:4 }}>{ROLE_LABELS[role]}</div>
          {saving && <div style={{ fontSize:11, color:NC.gray }}>Sauvegarde…</div>}
        </div>
        <div style={{ display:"flex", gap:5 }}>
          <button onClick={goToNav} style={nbtn(view==="nav"||view==="plan")}>Plans</button>
          <button onClick={()=>setView("dashboard")} style={nbtn(view==="dashboard")}>Dashboard</button>
          <button onClick={()=>setRole(null)} style={{ fontSize:12, padding:"5px 10px", borderRadius:5, border:"1px solid "+NC.dark, background:NC.dark, color:"white", cursor:"pointer" }}>Déco.</button>
        </div>
      </div>

      {/* Dashboard */}
      {view==="dashboard" && <Dashboard allZT={allZT} data={{ batiments }} />}

      {/* Nav */}
      {view==="nav" && (
        <div style={{ padding:14 }}>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            <NavCol title="Chantiers" items={chantiers} selId={sel.chantier} loading={loading.chantiers}
              onSel={id=>setSel({chantier:id,batiment:null,niveau:null,zone:null})}
              canAdd={canEdit} onAdd={()=>setAddingWhat("chantier")}
              onEdit={item=>handleEdit("chantier",item)} onDelete={item=>handleDelete("chantier",item)} />
            {sel.chantier && <NavCol title="Bâtiments" items={batiments} selId={sel.batiment} loading={loading.batiments}
              onSel={id=>setSel(s=>({...s,batiment:id,niveau:null,zone:null}))}
              canAdd={canEdit} onAdd={()=>setAddingWhat("batiment")}
              onEdit={item=>handleEdit("batiment",item)} onDelete={item=>handleDelete("batiment",item)} />}
            {sel.batiment && <NavCol title="Niveaux" items={niveaux} selId={sel.niveau} loading={loading.niveaux}
              onSel={id=>setSel(s=>({...s,niveau:id,zone:null}))}
              canAdd={canEdit} onAdd={()=>setAddingWhat("niveau")}
              onEdit={item=>handleEdit("niveau",item)} onDelete={item=>handleDelete("niveau",item)} />}
            {sel.niveau && <NavCol title="Zones" items={zones} selId={sel.zone} loading={loading.zones}
              onSel={id=>openZone(id)}
              canAdd={canEdit} onAdd={()=>setAddingWhat("zone")}
              onEdit={item=>handleEdit("zone",item)} onDelete={item=>handleDelete("zone",item)}
              badge={z=>z.zones_travail_count||null} />}
          </div>
          {!sel.chantier && <div style={{ fontSize:13, color:NC.gray, marginTop:16 }}>Sélectionnez un chantier pour commencer.</div>}
        </div>
      )}

      {/* Plan */}
      {view==="plan" && currentZone && (
        <div style={{ padding:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, flexWrap:"wrap" }}>
            <button onClick={backToNav} style={{ fontSize:12, padding:"4px 10px", borderRadius:5, border:"1px solid #ddd", background:"white", color:NC.dark, cursor:"pointer" }}>← Retour</button>
            <span style={{ fontSize:13, fontWeight:700, color:NC.dark }}>{currentZone.name}</span>
            {canEdit && <button onClick={()=>fileInputRef.current&&fileInputRef.current.click()} style={{ fontSize:12, padding:"4px 12px", borderRadius:5, border:"1px solid "+NC.red, background:NC.red, color:"white", cursor:"pointer", marginLeft:"auto", fontWeight:500 }}>
              {currentZone.plan_url?"Changer le plan":"Importer un plan PDF"}
            </button>}
            <input ref={fileInputRef} type="file" accept="application/pdf,image/*" style={{ display:"none" }} onChange={handlePlanUpload} />
          </div>
          <PlanViewer zone={currentZone} role={role}
            onZTClick={zt=>setEditZT({...zt,isNew:false})}
            onNewZT={rect=>canEdit&&setEditZT({isNew:true,rect,label:"",equipe:"",status:"todo",comment:""})} />
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginTop:8 }}>
            {Object.entries(STATUSES).map(([k,v])=>(
              <div key={k} style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:NC.gray }}>
                <div style={{ width:9, height:9, borderRadius:2, background:v.color }} />{v.label}
              </div>
            ))}
          </div>
          <div style={{ marginTop:10, padding:"8px 12px", background:"#fffbe6", border:"1px solid #ffe58f", borderRadius:6, fontSize:12, color:"#7d6200" }}>
            ⚠️ Les plans importés doivent être vérifiés régulièrement afin de s'assurer qu'ils sont à jour.
          </div>
        </div>
      )}
      {view==="plan" && !currentZone && (
        <div style={{ padding:24, textAlign:"center" }}>
          <Muted>Aucune zone sélectionnée.</Muted>
          <button onClick={goToNav} style={{ marginTop:12, fontSize:13, padding:"8px 16px", borderRadius:6, border:"1px solid "+NC.red, background:NC.red, color:"white", cursor:"pointer" }}>← Navigation</button>
        </div>
      )}

      {/* Modal ajout */}
      {addingWhat && (
        <Modal title={"Nouveau "+(addingWhat==="chantier"?"chantier":addingWhat==="batiment"?"bâtiment":addingWhat==="niveau"?"niveau":"zone")} onClose={()=>{setAddingWhat(null);setNewName("");}}>
          <input autoFocus value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addItem()} placeholder="Nom…" style={{ width:"100%", marginBottom:12, fontSize:13, boxSizing:"border-box" }} />
          <div style={{ display:"flex", gap:8 }}>
            <SBtn primary onClick={addItem} style={{ flex:1 }}>{saving?"…":"Créer"}</SBtn>
            <SBtn onClick={()=>{setAddingWhat(null);setNewName("");}} style={{ flex:1 }}>Annuler</SBtn>
          </div>
        </Modal>
      )}

      {/* Modal zone de travail */}
      {editZT && (
        <Modal title={editZT.isNew?"Nouvelle zone de travail":"Zone de travail"} onClose={()=>setEditZT(null)}>
          {canEdit && <>
            <Field label="Libellé"><input value={editZT.label||""} onChange={e=>setEditZT(z=>({...z,label:e.target.value}))} placeholder="Ex: Gaine principale RDC" style={{ width:"100%", fontSize:13, boxSizing:"border-box" }} /></Field>
            <Field label="Équipe"><input value={editZT.equipe||""} onChange={e=>setEditZT(z=>({...z,equipe:e.target.value}))} placeholder="Ex: Équipe A" style={{ width:"100%", fontSize:13, boxSizing:"border-box" }} /></Field>
          </>}
          {!editZT.isNew && <>
            {(role==="monteur"||role==="chef") && (
              <Field label="Date de pose"><input type="date" value={editZT.date_pose||""} onChange={e=>setEditZT(z=>({...z,date_pose:e.target.value}))} style={{ width:"100%", fontSize:13, boxSizing:"border-box" }} /></Field>
            )}
            {role==="ca" && (
              <Field label="Date de pose"><div style={{ fontSize:13, color:editZT.date_pose?NC.dark:NC.gray, padding:"6px 0" }}>{editZT.date_pose?fmtDate(editZT.date_pose):"Non renseignée"}</div></Field>
            )}
            <Field label="Statut">
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                {Object.entries(STATUSES).map(([k,v])=>(
                  <div key={k} onClick={()=>setEditZT(z=>({...z,status:k}))}
                    style={{ padding:8, borderRadius:6, border:"1.5px solid "+(editZT.status===k?v.color:"#e0e0e0"), background:editZT.status===k?v.bg:"#fafafa", cursor:"pointer", fontSize:12, color:editZT.status===k?v.color:NC.gray, textAlign:"center", fontWeight:editZT.status===k?700:400 }}>{v.label}</div>
                ))}
              </div>
            </Field>
            {editZT.status==="blocked" && (
              <Field label="Raison du blocage"><textarea value={editZT.comment||""} onChange={e=>setEditZT(z=>({...z,comment:e.target.value}))} placeholder="Décrivez le problème…" rows={2} style={{ width:"100%", fontSize:13, boxSizing:"border-box", resize:"vertical" }} /></Field>
            )}
          </>}
          {editZT.isNew && <div style={{ fontSize:12, color:NC.gray, padding:"7px 10px", background:"#f8f8f8", borderRadius:6, marginBottom:10, borderLeft:"3px solid "+NC.gray }}>Statut et date de pose renseignés par les monteurs.</div>}
          <div style={{ display:"flex", gap:8, marginTop:4 }}>
            <SBtn primary onClick={saveZT} style={{ flex:1 }}>{saving?"…":"Enregistrer"}</SBtn>
            {!editZT.isNew && canEdit && <SBtn danger onClick={()=>deleteZT(editZT.id)}>Supprimer</SBtn>}
            <SBtn onClick={()=>setEditZT(null)} style={{ flex:1 }}>Annuler</SBtn>
          </div>
        </Modal>
      )}
    </div>
  );
}
