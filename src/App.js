import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  fetchChantiers, createChantier, updateChantier, deleteChantier,
  fetchBatiments, createBatiment, updateBatiment, deleteBatiment,
  fetchNiveaux,   createNiveau,   updateNiveau,   deleteNiveau,
  fetchZones,     createZone,     updateZone,     deleteZone, uploadPlan,
  fetchZonesTravail, createZoneTravail, updateZoneTravail, deleteZoneTravail,
  subscribeZonesTravail, fetchAllZonesTravailByDate, fetchHistory, addHistory,
  fetchEquipes, fetchAllEquipes, createEquipe, updateEquipe, deleteEquipe,
  fetchUtilisateurs, createUtilisateur, updateUtilisateur, deleteUtilisateur,
  fetchParametre, setParametre,
} from './supabase';

// ── Constantes ────────────────────────────────────────────────────────────────
const NC = {
  red:"#C0392B", redBg:"rgba(192,57,43,0.10)",
  dark:"#2C3E50", darkBg:"rgba(44,62,80,0.08)",
  gray:"#7F8C8D",
  green:"#27AE60", greenBg:"rgba(39,174,96,0.12)",
  amber:"#E67E22", amberBg:"rgba(230,126,34,0.14)",
  purple:"#8E44AD", purpleBg:"rgba(142,68,173,0.13)",
  blue:"#2980B9",  blueBg:"rgba(41,128,185,0.13)",
  orange:"#D35400",orangeBg:"rgba(211,84,0,0.13)",
};
const ROLE_LABELS = { ca:"Chargé d'affaire", chef:"Chef de chantier", monteur:"Monteur" };
const ROLE_COLORS = { ca:NC.red, chef:NC.dark, monteur:NC.amber };
const ALL_STATUSES = {
  todo:       { label:"Prévu",        color:NC.gray,   bg:"rgba(127,140,141,0.10)" },
  inprogress: { label:"En cours",     color:NC.blue,   bg:NC.blueBg },
  nappe_h:    { label:"Nappe haute",  color:NC.amber,  bg:NC.amberBg },
  nappe_b:    { label:"Nappe basse",  color:NC.orange, bg:NC.orangeBg },
  terminaux:  { label:"Terminaux",    color:NC.purple, bg:NC.purpleBg },
  done:       { label:"Terminé",      color:NC.green,  bg:NC.greenBg },
  blocked:    { label:"Bloqué",       color:NC.red,    bg:NC.redBg },
};
const EQUIPE_COLORS = ["#2980B9","#27AE60","#E67E22","#8E44AD","#C0392B","#16A085","#D35400","#2C3E50","#7F8C8D","#F39C12"];
const TODAY = new Date().toISOString().split('T')[0];
const fmtDate = d => { if(!d) return "—"; const p=d.split("-"); return p[2]+"."+p[1]+"."+p[0]; };
const fmtTs = ts => { if(!ts) return ""; const d=new Date(ts); return d.toLocaleDateString('fr-CH')+' '+d.toLocaleTimeString('fr-CH',{hour:'2-digit',minute:'2-digit'}); };

// ── Toast ─────────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, type="success") => {
    const id = Date.now();
    setToasts(p => [...p, {id, msg, type}]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
  }, []);
  return { toasts, push };
}
function Toast({ toasts }) {
  return (
    <div style={{ position:"fixed", bottom:20, right:20, zIndex:999, display:"flex", flexDirection:"column", gap:8, pointerEvents:"none" }}>
      {toasts.map(t => (
        <div key={t.id} style={{ padding:"10px 16px", borderRadius:8, background:t.type==="error"?NC.red:t.type==="warn"?NC.amber:NC.dark, color:"white", fontSize:13, fontWeight:500, boxShadow:"0 2px 12px rgba(0,0,0,0.18)", fontFamily:"Arial,sans-serif", maxWidth:300, display:"flex", alignItems:"center", gap:8 }}>
          <span>{t.type==="error"?"✕":t.type==="warn"?"⚠":"✓"}</span><span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function SBtn({ children, onClick, primary, danger, style, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding:"8px 12px", borderRadius:7, border:"1px solid "+(primary?NC.red:danger?NC.red:"#ddd"), background:primary?NC.red:"white", color:primary?"white":danger?NC.red:NC.dark, cursor:disabled?"not-allowed":"pointer", fontSize:13, fontWeight:primary?700:400, fontFamily:"Arial,sans-serif", opacity:disabled?0.6:1, ...style }}>
      {children}
    </button>
  );
}
function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:11, color:NC.gray, marginBottom:4, fontWeight:700, textTransform:"uppercase", letterSpacing:0.3 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize:11, color:NC.gray, marginTop:3 }}>{hint}</div>}
    </div>
  );
}
function SCard({ title, children, accent, action }) {
  const a = accent || NC.red;
  return (
    <div style={{ background:"white", border:"1px solid #e8e8e8", borderRadius:8, padding:16, marginBottom:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, borderLeft:"3px solid "+a, paddingLeft:8 }}>
        <div style={{ fontSize:14, fontWeight:700, color:a }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}
function Muted({ children }) { return <div style={{ fontSize:13, color:NC.gray }}>{children}</div>; }
function Divider() { return <div style={{ height:1, background:"#f0f0f0", margin:"12px 0" }}/>; }
function Modal({ title, children, onClose, wide }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}>
      <div style={{ background:"white", borderRadius:10, padding:20, width:wide?520:340, maxWidth:"95vw", border:"1px solid #ddd", maxHeight:"90vh", overflowY:"auto", fontFamily:"Arial,sans-serif" }}>
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
      {loading && <Muted>Chargement…</Muted>}
      {items.map(item => (
        <div key={item.id}
          style={{ padding:"9px 10px", borderRadius:6, border:"1px solid "+(selId===item.id?NC.red:"#e0e0e0"), borderLeft:selId===item.id?"3px solid "+NC.red:"1px solid #e0e0e0", background:selId===item.id?NC.redBg:"white", marginBottom:5, fontSize:13, color:selId===item.id?NC.red:NC.dark, display:"flex", justifyContent:"space-between", alignItems:"center", gap:4 }}>
          <span onClick={() => onSel(item.id)} style={{ fontWeight:selId===item.id?700:400, cursor:"pointer", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.name}</span>
          <div style={{ display:"flex", gap:3, flexShrink:0 }}>
            {badge && badge(item) != null && <span style={{ fontSize:11, background:NC.dark, color:"white", borderRadius:10, padding:"1px 7px", fontWeight:700 }}>{badge(item)}</span>}
            {canAdd && <>
              <button onClick={e=>{e.stopPropagation();onEdit(item);}} title="Renommer" style={{ width:22,height:22,borderRadius:4,border:"1px solid #e0e0e0",background:"white",color:NC.gray,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",padding:0 }}>✎</button>
              <button onClick={e=>{e.stopPropagation();onDelete(item);}} title="Supprimer" style={{ width:22,height:22,borderRadius:4,border:"1px solid #fcc",background:"#fff5f5",color:NC.red,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",padding:0 }}>×</button>
            </>}
          </div>
        </div>
      ))}
      {canAdd && <button onClick={onAdd} style={{ fontSize:12,padding:"5px 8px",borderRadius:6,border:"1px dashed "+NC.red,background:"transparent",color:NC.red,cursor:"pointer",width:"100%",fontFamily:"Arial,sans-serif" }}>+ {title.slice(0,-1)}</button>}
    </div>
  );
}

// ── PlanViewer ────────────────────────────────────────────────────────────────
function PlanViewer({ zone, role, onZTClick, onNewZT, activeStatuses }) {
  const containerRef=useRef(null), canvasRef=useRef(null);
  const [tf,setTf]=useState({x:0,y:0,s:1});
  const [pdfReady,setPdfReady]=useState(false);
  const [imgSz,setImgSz]=useState({w:800,h:600});
  const [mode,setMode]=useState("pan");
  const [pdfLib,setPdfLib]=useState(null);
  const [drawRect,setDrawRect]=useState(null);
  const [currentPage,setCurrentPage]=useState(1);
  const [totalPages,setTotalPages]=useState(1);
  const [filterStatus,setFilterStatus]=useState("all");
  const [loadingPdf,setLoadingPdf]=useState(false);
  const pdfDocRef=useRef(null), panRef=useRef({on:false}), drwRef=useRef({on:false}), pnchRef=useRef({on:false}), pdfCacheRef=useRef({});

  useEffect(()=>{
    if(window.pdfjsLib){window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";setPdfLib(window.pdfjsLib);return;}
    const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload=()=>{window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";setPdfLib(window.pdfjsLib);};
    document.head.appendChild(s);
  },[]);

  useEffect(()=>{setTf({x:0,y:0,s:1});setPdfReady(false);setDrawRect(null);setMode("pan");setCurrentPage(1);setTotalPages(1);pdfDocRef.current=null;},[zone&&zone.id]);

  useEffect(()=>{
    if(!zone||!zone.plan_url||zone.plan_type!=="pdf"||!pdfLib||!canvasRef.current)return;
    setPdfReady(false);setLoadingPdf(true);
    const url=zone.plan_url;
    const load=pdfCacheRef.current[url]?Promise.resolve(pdfCacheRef.current[url]):fetch(url).then(r=>r.arrayBuffer()).then(buf=>pdfLib.getDocument({data:buf}).promise).then(pdf=>{pdfCacheRef.current[url]=pdf;return pdf;});
    load.then(pdf=>{pdfDocRef.current=pdf;setTotalPages(pdf.numPages);renderPage(pdf,1);}).catch(()=>setLoadingPdf(false));
  },[zone&&zone.plan_url,pdfLib]);

  const renderPage=(pdf,pageNum)=>{
    if(!pdf||!canvasRef.current)return;
    setPdfReady(false);
    pdf.getPage(pageNum).then(page=>{
      const vp=page.getViewport({scale:1.5}),cv=canvasRef.current;if(!cv)return;
      cv.width=vp.width;cv.height=vp.height;setImgSz({w:vp.width,h:vp.height});
      page.render({canvasContext:cv.getContext("2d"),viewport:vp}).promise.then(()=>{setPdfReady(true);setLoadingPdf(false);});
    });
  };
  const goPage=n=>{const p=Math.max(1,Math.min(totalPages,n));setCurrentPage(p);setTf({x:0,y:0,s:1});if(pdfDocRef.current)renderPage(pdfDocRef.current,p);};

  const onWheel=useCallback(e=>{
    e.preventDefault();const el=containerRef.current;if(!el)return;
    const r=el.getBoundingClientRect(),mx=e.clientX-r.left-r.width/2,my=e.clientY-r.top-r.height/2,f=e.deltaY<0?1.12:0.89;
    setTf(t=>{const ns=Math.max(0.15,Math.min(12,t.s*f));return{x:mx-(mx-t.x)*(ns/t.s),y:my-(my-t.y)*(ns/t.s),s:ns};});
  },[]);
  useEffect(()=>{const el=containerRef.current;if(!el)return;el.addEventListener("wheel",onWheel,{passive:false});return()=>el.removeEventListener("wheel",onWheel);},[onWheel]);

  const gcp=e=>e.touches?{x:e.touches[0].clientX,y:e.touches[0].clientY}:{x:e.clientX,y:e.clientY};
  const gdist=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
  const gmid=t=>({x:(t[0].clientX+t[1].clientX)/2,y:(t[0].clientY+t[1].clientY)/2});
  const s2p=(sx,sy)=>{const el=containerRef.current;if(!el)return{x:0,y:0};const r=el.getBoundingClientRect(),px=(sx-r.left-r.width/2-tf.x)/tf.s,py=(sy-r.top-r.height/2-tf.y)/tf.s,rw=Math.min(r.width,imgSz.w),rh=rw*imgSz.h/imgSz.w;return{x:(px/rw+0.5)*100,y:(py/rh+0.5)*100};};

  const onDown=e=>{
    if(e.touches&&e.touches.length===2){const mid=gmid(e.touches),el=containerRef.current,r=el.getBoundingClientRect();pnchRef.current={on:true,d:gdist(e.touches),s:tf.s,tx:tf.x,ty:tf.y,mx:mid.x-r.left-r.width/2,my:mid.y-r.top-r.height/2};return;}
    const p=gcp(e);
    if(mode==="pan"||!zone||!zone.plan_url){panRef.current={on:true,sx:p.x,sy:p.y,tx:tf.x,ty:tf.y};}
    else if(mode==="draw"&&role==="ca"){const pp=s2p(p.x,p.y);drwRef.current={on:true,sx:pp.x,sy:pp.y};setDrawRect({x:pp.x,y:pp.y,w:0,h:0});}
    e.preventDefault();
  };
  const onMove=e=>{
    if(e.touches&&e.touches.length===2&&pnchRef.current.on){
      const nd=gdist(e.touches),ns=Math.max(0.15,Math.min(12,pnchRef.current.s*nd/pnchRef.current.d));
      const mid=gmid(e.touches),el=containerRef.current,r=el.getBoundingClientRect(),mx=mid.x-r.left-r.width/2,my=mid.y-r.top-r.height/2;
      setTf({x:pnchRef.current.tx+mx-pnchRef.current.mx+(pnchRef.current.mx-pnchRef.current.tx)*(1-ns/pnchRef.current.s),y:pnchRef.current.ty+my-pnchRef.current.my+(pnchRef.current.my-pnchRef.current.ty)*(1-ns/pnchRef.current.s),s:ns});
      e.preventDefault();return;
    }
    const p=gcp(e);
    if(panRef.current.on)setTf(t=>({...t,x:panRef.current.tx+p.x-panRef.current.sx,y:panRef.current.ty+p.y-panRef.current.sy}));
    else if(drwRef.current.on){const pp=s2p(p.x,p.y);setDrawRect({x:Math.min(drwRef.current.sx,pp.x),y:Math.min(drwRef.current.sy,pp.y),w:Math.abs(pp.x-drwRef.current.sx),h:Math.abs(pp.y-drwRef.current.sy)});}
    e.preventDefault();
  };
  const onUp=()=>{
    pnchRef.current.on=false;panRef.current.on=false;
    if(drwRef.current.on){drwRef.current.on=false;if(drawRect&&drawRect.w>0.5&&drawRect.h>0.5)onNewZT(drawRect);setDrawRect(null);}
  };

  const cw=containerRef.current?containerRef.current.clientWidth:700;
  const STATUSES=Object.fromEntries(Object.entries(ALL_STATUSES).filter(([k])=>(activeStatuses||Object.keys(ALL_STATUSES)).includes(k)));
  const visibleZT=(zone&&zone.zones_travail||[]).filter(zt=>filterStatus==="all"||(zt.status===filterStatus));

  return (
    <div>
      <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:6,flexWrap:"wrap" }}>
        {role==="ca"&&zone&&zone.plan_url&&(
          <>
            <button onClick={()=>setMode("pan")} style={{ fontSize:11,padding:"4px 9px",borderRadius:5,border:"1px solid "+(mode==="pan"?NC.red:"#ccc"),background:mode==="pan"?NC.red:"white",color:mode==="pan"?"white":NC.gray,cursor:"pointer",fontWeight:mode==="pan"?700:400 }}>✥ Naviguer</button>
            <button onClick={()=>setMode("draw")} style={{ fontSize:11,padding:"4px 9px",borderRadius:5,border:"1px solid "+(mode==="draw"?NC.red:"#ccc"),background:mode==="draw"?NC.red:"white",color:mode==="draw"?"white":NC.gray,cursor:"pointer",fontWeight:mode==="draw"?700:400 }}>⬜ Dessiner</button>
            <div style={{ width:1,height:20,background:"#e0e0e0",margin:"0 2px" }}/>
          </>
        )}
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ fontSize:11,padding:"4px 8px",borderRadius:5,border:"1px solid #ddd",background:"white",color:NC.dark }}>
          <option value="all">Tous les statuts</option>
          {Object.entries(STATUSES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
        {totalPages>1&&(
          <div style={{ display:"flex",alignItems:"center",gap:4,marginLeft:"auto" }}>
            <button onClick={()=>goPage(currentPage-1)} disabled={currentPage<=1} style={{ width:28,height:28,borderRadius:5,border:"1px solid #ddd",background:"white",color:NC.dark,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center" }}>‹</button>
            <span style={{ fontSize:12,color:NC.gray,whiteSpace:"nowrap" }}>Page {currentPage}/{totalPages}</span>
            <button onClick={()=>goPage(currentPage+1)} disabled={currentPage>=totalPages} style={{ width:28,height:28,borderRadius:5,border:"1px solid #ddd",background:"white",color:NC.dark,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center" }}>›</button>
          </div>
        )}
        <div style={{ display:"flex",gap:3,marginLeft:totalPages>1?"4px":"auto" }}>
          {[["−",()=>setTf(t=>({...t,s:Math.max(0.15,t.s/1.3)}))],["+",()=>setTf(t=>({...t,s:Math.min(12,t.s*1.3)}))],["⊡",()=>setTf({x:0,y:0,s:1})]].map(([l,fn])=>(
            <button key={l} onClick={fn} style={{ width:28,height:28,borderRadius:5,border:"1px solid #ddd",background:"white",color:NC.dark,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center" }}>{l}</button>
          ))}
          <span style={{ fontSize:11,color:NC.gray,alignSelf:"center",marginLeft:2 }}>{Math.round(tf.s*100)}%</span>
        </div>
      </div>
      <div style={{ position:"relative",borderRadius:8,overflow:"hidden",border:"0.5px solid #ddd",background:"#1a1a1a",height:"58vh" }}>
        <div ref={containerRef} style={{ width:"100%",height:"100%",overflow:"hidden",cursor:mode==="draw"&&role==="ca"?"crosshair":"grab",touchAction:"none" }}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}>
          {!zone||!zone.plan_url?(
            <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100%",fontSize:13,color:"#888" }}>{role==="ca"?"Importez un plan PDF pour commencer.":"Aucun plan importé."}</div>
          ):loadingPdf&&!pdfReady?(
            <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:12 }}>
              <div style={{ width:36,height:36,border:"3px solid rgba(255,255,255,0.15)",borderTop:"3px solid "+NC.red,borderRadius:"50%",animation:"spin 0.8s linear infinite" }}/>
              <div style={{ fontSize:13,color:"#aaa" }}>Chargement du plan…</div>
              <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
            </div>
          ):(
            <div style={{ position:"absolute",left:"50%",top:"50%",transform:"translate(calc(-50% + "+tf.x+"px), calc(-50% + "+tf.y+"px)) scale("+tf.s+")",transformOrigin:"center center",pointerEvents:"none" }}>
              {zone.plan_type==="pdf"?<canvas ref={canvasRef} style={{ display:"block",maxWidth:cw+"px",opacity:pdfReady?1:0 }}/>:<img src={zone.plan_url} alt="plan" style={{ display:"block",maxWidth:cw+"px" }} onLoad={e=>setImgSz({w:e.target.naturalWidth,h:e.target.naturalHeight})}/>}
              {zone.plan_type==="pdf"&&!pdfReady&&<div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#aaa" }}>Rendu…</div>}
              {visibleZT.map((zt,idx)=>{
                const st=STATUSES[zt.status]||ALL_STATUSES[zt.status];
                return(
                  <div key={zt.id} onClick={e=>{e.stopPropagation();onZTClick(zt);}}
                    style={{ position:"absolute",left:zt.rect.x+"%",top:zt.rect.y+"%",width:zt.rect.w+"%",height:zt.rect.h+"%",border:"1.5px solid "+st.color,background:st.bg,borderRadius:2,cursor:"pointer",boxSizing:"border-box",pointerEvents:"all" }}>
                    <div style={{ fontSize:9,color:st.color,fontWeight:500,padding:"1px 3px",background:"rgba(255,255,255,0.92)",borderRadius:2,display:"inline-block",maxWidth:"100%",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis" }}>{idx+1}. {zt.label||"—"}</div>
                  </div>
                );
              })}
              {drawRect&&drawRect.w>0&&<div style={{ position:"absolute",left:drawRect.x+"%",top:drawRect.y+"%",width:drawRect.w+"%",height:drawRect.h+"%",border:"1px dashed "+NC.red,background:NC.redBg,borderRadius:2,pointerEvents:"none",boxSizing:"border-box" }}/>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Onglet Paramètres ─────────────────────────────────────────────────────────
function SettingsView({ pushToast, onSettingsChange }) {
  const [tab, setTab] = useState("equipes");
  const [equipes, setEquipes]   = useState([]);
  const [users, setUsers]       = useState([]);
  const [pins, setPins]         = useState({ca:"1234",chef:"5678",monteur:"9999"});
  const [entreprise, setEntreprise] = useState({nom:"Neoclima Sàrl",adresse:"",email:"",telephone:""});
  const [prefs, setPrefs]       = useState({vue_defaut:"today"});
  const [statutsActifs, setStatutsActifs] = useState(Object.keys(ALL_STATUSES));
  const [saving, setSaving]     = useState(false);
  const [newEq, setNewEq]       = useState({name:"",responsable:"",couleur:EQUIPE_COLORS[0]});
  const [editEq, setEditEq]     = useState(null);
  const [newUser, setNewUser]   = useState({nom:"",role:"monteur",equipe_id:"",pin:""});
  const [editUser, setEditUser] = useState(null);

  useEffect(()=>{
    fetchAllEquipes().then(setEquipes).catch(()=>{});
    fetchUtilisateurs().then(setUsers).catch(()=>{});
    fetchParametre('pins').then(v=>{if(v)setPins(v);}).catch(()=>{});
    fetchParametre('entreprise').then(v=>{if(v)setEntreprise(v);}).catch(()=>{});
    fetchParametre('preferences').then(v=>{if(v)setPrefs(v);}).catch(()=>{});
    fetchParametre('statuts_actifs').then(v=>{if(v)setStatutsActifs(v);}).catch(()=>{});
  },[]);

  const saveParam = async (key, value, label) => {
    setSaving(true);
    try { await setParametre(key, value); pushToast(label+" sauvegardés"); onSettingsChange && onSettingsChange(key, value); }
    catch(err){ pushToast("Erreur: "+err.message,"error"); }
    setSaving(false);
  };

  const tabs = [
    {k:"equipes",    l:"Équipes"},
    {k:"pins",       l:"Codes PIN"},
    {k:"statuts",    l:"Statuts"},
    {k:"entreprise", l:"Entreprise"},
    {k:"utilisateurs",l:"Utilisateurs"},
    {k:"preferences",l:"Préférences"},
  ];

  return (
    <div style={{ padding:16, fontFamily:"Arial,sans-serif", maxWidth:780, margin:"0 auto" }}>
      <div style={{ fontSize:16, fontWeight:700, color:NC.dark, marginBottom:16 }}>Paramètres</div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:18, borderBottom:"1px solid #e8e8e8", paddingBottom:8 }}>
        {tabs.map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)}
            style={{ fontSize:12, padding:"5px 12px", borderRadius:5, border:"1px solid "+(tab===t.k?NC.red:"#ddd"), background:tab===t.k?NC.red:"white", color:tab===t.k?"white":NC.dark, cursor:"pointer", fontWeight:tab===t.k?700:400, fontFamily:"Arial,sans-serif" }}>{t.l}</button>
        ))}
      </div>

      {/* ── Équipes ── */}
      {tab==="equipes"&&(
        <SCard title={"Équipes de montage ("+equipes.length+"/20)"} action={
          <span style={{ fontSize:11,color:NC.gray }}>{equipes.filter(e=>e.actif).length} actives</span>
        }>
          {equipes.map(eq=>(
            <div key={eq.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #f5f5f5",flexWrap:"wrap" }}>
              <div style={{ width:14,height:14,borderRadius:3,background:eq.couleur,flexShrink:0 }}/>
              <div style={{ flex:1,minWidth:100 }}>
                <div style={{ fontSize:13,color:NC.dark,fontWeight:500 }}>{eq.name}</div>
                {eq.responsable&&<div style={{ fontSize:11,color:NC.gray }}>Resp. : {eq.responsable}</div>}
              </div>
              <span style={{ fontSize:11,padding:"2px 7px",borderRadius:4,background:eq.actif?NC.greenBg:"#f5f5f5",color:eq.actif?NC.green:NC.gray }}>{eq.actif?"Active":"Inactive"}</span>
              <button onClick={()=>setEditEq({...eq})} style={{ fontSize:11,padding:"3px 8px",borderRadius:5,border:"1px solid #ddd",background:"white",color:NC.dark,cursor:"pointer" }}>Modifier</button>
              <button onClick={async()=>{if(!window.confirm("Supprimer l'équipe "+eq.name+" ?"))return;await deleteEquipe(eq.id);setEquipes(p=>p.filter(x=>x.id!==eq.id));pushToast("Équipe supprimée");}} style={{ fontSize:11,padding:"3px 8px",borderRadius:5,border:"1px solid #fcc",background:"#fff5f5",color:NC.red,cursor:"pointer" }}>✕</button>
            </div>
          ))}
          {equipes.length===0&&<Muted>Aucune équipe. Créez-en une ci-dessous.</Muted>}
          {equipes.length<20&&(
            <>
              <Divider/>
              <div style={{ fontSize:12,color:NC.dark,fontWeight:700,marginBottom:8 }}>Nouvelle équipe</div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8 }}>
                <Field label="Nom de l'équipe"><input value={newEq.name} onChange={e=>setNewEq(p=>({...p,name:e.target.value}))} placeholder="Ex: Équipe Alpha" style={{ width:"100%",fontSize:13,boxSizing:"border-box" }}/></Field>
                <Field label="Responsable"><input value={newEq.responsable} onChange={e=>setNewEq(p=>({...p,responsable:e.target.value}))} placeholder="Ex: Jean Martin" style={{ width:"100%",fontSize:13,boxSizing:"border-box" }}/></Field>
              </div>
              <Field label="Couleur">
                <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
                  {EQUIPE_COLORS.map(c=>(
                    <div key={c} onClick={()=>setNewEq(p=>({...p,couleur:c}))} style={{ width:24,height:24,borderRadius:4,background:c,cursor:"pointer",border:newEq.couleur===c?"3px solid "+NC.dark:"2px solid transparent" }}/>
                  ))}
                </div>
              </Field>
              <SBtn primary onClick={async()=>{
                if(!newEq.name.trim()){pushToast("Nom requis","warn");return;}
                const r=await createEquipe({...newEq,ordre:equipes.length});
                setEquipes(p=>[...p,r]);setNewEq({name:"",responsable:"",couleur:EQUIPE_COLORS[0]});pushToast("Équipe créée");
              }} style={{ marginTop:4 }} disabled={saving}>Créer l'équipe</SBtn>
            </>
          )}
        </SCard>
      )}

      {/* ── Codes PIN ── */}
      {tab==="pins"&&(
        <SCard title="Codes PIN d'accès" accent={NC.dark}>
          <div style={{ fontSize:12,color:NC.gray,marginBottom:14,padding:"8px 12px",background:"#f8f8f8",borderRadius:6,borderLeft:"3px solid "+NC.amber }}>
            ⚠️ Les codes PIN protègent l'accès aux différents rôles. Choisissez des codes difficiles à deviner et ne les partagez qu'avec les personnes concernées.
          </div>
          {Object.entries(ROLE_LABELS).map(([role,label])=>(
            <div key={role} style={{ display:"flex",alignItems:"center",gap:12,marginBottom:12 }}>
              <div style={{ width:10,height:10,borderRadius:"50%",background:ROLE_COLORS[role],flexShrink:0 }}/>
              <div style={{ flex:1,fontSize:13,color:NC.dark,fontWeight:500 }}>{label}</div>
              <input type="password" value={pins[role]||""} onChange={e=>setPins(p=>({...p,[role]:e.target.value}))} placeholder="••••" maxLength={8}
                style={{ width:100,fontSize:16,textAlign:"center",letterSpacing:4,padding:"4px 8px",border:"1px solid #ddd",borderRadius:6,boxSizing:"border-box" }}/>
            </div>
          ))}
          <SBtn primary onClick={()=>saveParam('pins',pins,"Codes PIN")} disabled={saving} style={{ marginTop:8 }}>Enregistrer les PIN</SBtn>
        </SCard>
      )}

      {/* ── Statuts ── */}
      {tab==="statuts"&&(
        <SCard title="Statuts actifs" accent={NC.purple}>
          <div style={{ fontSize:12,color:NC.gray,marginBottom:14 }}>Activez ou désactivez les statuts selon les besoins du chantier. Les statuts désactivés n'apparaîtront plus dans les plans ni les formulaires.</div>
          {Object.entries(ALL_STATUSES).map(([k,v])=>(
            <div key={k} style={{ display:"flex",alignItems:"center",gap:12,padding:"9px 0",borderBottom:"1px solid #f5f5f5" }}>
              <div style={{ width:12,height:12,borderRadius:2,background:v.color,flexShrink:0 }}/>
              <div style={{ flex:1,fontSize:13,color:NC.dark }}>{v.label}</div>
              <div onClick={()=>{
                const next=statutsActifs.includes(k)?statutsActifs.filter(s=>s!==k):[...statutsActifs,k];
                setStatutsActifs(next);
              }} style={{ width:42,height:24,borderRadius:12,background:statutsActifs.includes(k)?NC.green:"#ccc",cursor:"pointer",position:"relative",transition:"background 0.2s",flexShrink:0 }}>
                <div style={{ width:18,height:18,borderRadius:"50%",background:"white",position:"absolute",top:3,left:statutsActifs.includes(k)?21:3,transition:"left 0.2s" }}/>
              </div>
              <span style={{ fontSize:11,color:statutsActifs.includes(k)?NC.green:NC.gray,minWidth:48 }}>{statutsActifs.includes(k)?"Actif":"Inactif"}</span>
            </div>
          ))}
          <SBtn primary onClick={()=>saveParam('statuts_actifs',statutsActifs,"Statuts")} disabled={saving} style={{ marginTop:12 }}>Enregistrer</SBtn>
        </SCard>
      )}

      {/* ── Entreprise ── */}
      {tab==="entreprise"&&(
        <SCard title="Informations entreprise" accent={NC.dark}>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
            <Field label="Nom de la société"><input value={entreprise.nom||""} onChange={e=>setEntreprise(p=>({...p,nom:e.target.value}))} style={{ width:"100%",fontSize:13,boxSizing:"border-box" }}/></Field>
            <Field label="Adresse"><input value={entreprise.adresse||""} onChange={e=>setEntreprise(p=>({...p,adresse:e.target.value}))} style={{ width:"100%",fontSize:13,boxSizing:"border-box" }}/></Field>
            <Field label="E-mail"><input type="email" value={entreprise.email||""} onChange={e=>setEntreprise(p=>({...p,email:e.target.value}))} style={{ width:"100%",fontSize:13,boxSizing:"border-box" }}/></Field>
            <Field label="Téléphone"><input value={entreprise.telephone||""} onChange={e=>setEntreprise(p=>({...p,telephone:e.target.value}))} style={{ width:"100%",fontSize:13,boxSizing:"border-box" }}/></Field>
          </div>
          <Field label="Site web"><input value={entreprise.site||""} onChange={e=>setEntreprise(p=>({...p,site:e.target.value}))} placeholder="https://..." style={{ width:"100%",fontSize:13,boxSizing:"border-box" }}/></Field>
          <Field label="Numéro IDE (CH)" hint="Format : CHE-123.456.789"><input value={entreprise.ide||""} onChange={e=>setEntreprise(p=>({...p,ide:e.target.value}))} placeholder="CHE-000.000.000" style={{ width:"100%",fontSize:13,boxSizing:"border-box" }}/></Field>
          <SBtn primary onClick={()=>saveParam('entreprise',entreprise,"Informations")} disabled={saving} style={{ marginTop:4 }}>Enregistrer</SBtn>
        </SCard>
      )}

      {/* ── Utilisateurs ── */}
      {tab==="utilisateurs"&&(
        <SCard title={"Utilisateurs ("+users.length+")"} accent={NC.dark}>
          {users.map(u=>(
            <div key={u.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #f5f5f5",flexWrap:"wrap" }}>
              <div style={{ width:34,height:34,borderRadius:6,background:ROLE_COLORS[u.role]||NC.gray,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"white",flexShrink:0 }}>{u.nom.slice(0,2).toUpperCase()}</div>
              <div style={{ flex:1,minWidth:100 }}>
                <div style={{ fontSize:13,color:NC.dark,fontWeight:500 }}>{u.nom}</div>
                <div style={{ fontSize:11,color:NC.gray }}>{ROLE_LABELS[u.role]||u.role}{u.equipes?" · "+u.equipes.name:""}</div>
              </div>
              {u.pin&&<span style={{ fontSize:11,color:NC.gray,fontFamily:"monospace",background:"#f5f5f5",padding:"2px 6px",borderRadius:4 }}>PIN: {u.pin}</span>}
              <span style={{ fontSize:11,padding:"2px 7px",borderRadius:4,background:u.actif?NC.greenBg:"#f5f5f5",color:u.actif?NC.green:NC.gray }}>{u.actif?"Actif":"Inactif"}</span>
              <button onClick={()=>setEditUser({...u})} style={{ fontSize:11,padding:"3px 8px",borderRadius:5,border:"1px solid #ddd",background:"white",color:NC.dark,cursor:"pointer" }}>Modifier</button>
              <button onClick={async()=>{if(!window.confirm("Supprimer "+u.nom+" ?"))return;await deleteUtilisateur(u.id);setUsers(p=>p.filter(x=>x.id!==u.id));pushToast("Utilisateur supprimé");}} style={{ fontSize:11,padding:"3px 8px",borderRadius:5,border:"1px solid #fcc",background:"#fff5f5",color:NC.red,cursor:"pointer" }}>✕</button>
            </div>
          ))}
          {users.length===0&&<Muted>Aucun utilisateur. Créez-en un ci-dessous.</Muted>}
          <Divider/>
          <div style={{ fontSize:12,color:NC.dark,fontWeight:700,marginBottom:8 }}>Nouvel utilisateur</div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
            <Field label="Nom complet"><input value={newUser.nom} onChange={e=>setNewUser(p=>({...p,nom:e.target.value}))} placeholder="Ex: Jean-Pierre Müller" style={{ width:"100%",fontSize:13,boxSizing:"border-box" }}/></Field>
            <Field label="Rôle">
              <select value={newUser.role} onChange={e=>setNewUser(p=>({...p,role:e.target.value}))} style={{ width:"100%",fontSize:13,padding:"6px 8px",border:"1px solid #ddd",borderRadius:6 }}>
                {Object.entries(ROLE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Équipe">
              <select value={newUser.equipe_id} onChange={e=>setNewUser(p=>({...p,equipe_id:e.target.value}))} style={{ width:"100%",fontSize:13,padding:"6px 8px",border:"1px solid #ddd",borderRadius:6 }}>
                <option value="">— Aucune équipe —</option>
                {equipes.map(eq=><option key={eq.id} value={eq.id}>{eq.name}</option>)}
              </select>
            </Field>
            <Field label="PIN personnel" hint="Optionnel — prioritaire sur le PIN du rôle"><input type="password" value={newUser.pin} onChange={e=>setNewUser(p=>({...p,pin:e.target.value}))} placeholder="••••" maxLength={8} style={{ width:"100%",fontSize:13,boxSizing:"border-box" }}/></Field>
          </div>
          <SBtn primary onClick={async()=>{
            if(!newUser.nom.trim()){pushToast("Nom requis","warn");return;}
            const r=await createUtilisateur({nom:newUser.nom,role:newUser.role,equipe_id:newUser.equipe_id||null,pin:newUser.pin||null,actif:true});
            const withEq={...r,equipes:equipes.find(e=>e.id===r.equipe_id)||null};
            setUsers(p=>[...p,withEq]);setNewUser({nom:"",role:"monteur",equipe_id:"",pin:""});pushToast("Utilisateur créé");
          }} disabled={saving} style={{ marginTop:4 }}>Créer l'utilisateur</SBtn>
        </SCard>
      )}

      {/* ── Préférences ── */}
      {tab==="preferences"&&(
        <SCard title="Préférences d'affichage" accent={NC.dark}>
          <Field label="Vue par défaut à l'ouverture">
            <select value={prefs.vue_defaut||"today"} onChange={e=>setPrefs(p=>({...p,vue_defaut:e.target.value}))} style={{ width:"100%",fontSize:13,padding:"6px 8px",border:"1px solid #ddd",borderRadius:6 }}>
              <option value="today">Aujourd'hui</option>
              <option value="nav">Plans</option>
              <option value="dashboard">Dashboard</option>
            </select>
          </Field>
          <Field label="Format de date">
            <select value={prefs.format_date||"dd.mm.yyyy"} onChange={e=>setPrefs(p=>({...p,format_date:e.target.value}))} style={{ width:"100%",fontSize:13,padding:"6px 8px",border:"1px solid #ddd",borderRadius:6 }}>
              <option value="dd.mm.yyyy">JJ.MM.AAAA (Suisse)</option>
              <option value="dd/mm/yyyy">JJ/MM/AAAA</option>
              <option value="yyyy-mm-dd">AAAA-MM-JJ (ISO)</option>
            </select>
          </Field>
          <SBtn primary onClick={()=>saveParam('preferences',prefs,"Préférences")} disabled={saving} style={{ marginTop:4 }}>Enregistrer</SBtn>
        </SCard>
      )}

      {/* Modal modifier équipe */}
      {editEq&&(
        <Modal title="Modifier l'équipe" onClose={()=>setEditEq(null)}>
          <Field label="Nom"><input value={editEq.name} onChange={e=>setEditEq(p=>({...p,name:e.target.value}))} style={{ width:"100%",fontSize:13,boxSizing:"border-box" }}/></Field>
          <Field label="Responsable"><input value={editEq.responsable||""} onChange={e=>setEditEq(p=>({...p,responsable:e.target.value}))} style={{ width:"100%",fontSize:13,boxSizing:"border-box" }}/></Field>
          <Field label="Couleur">
            <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
              {EQUIPE_COLORS.map(c=>(
                <div key={c} onClick={()=>setEditEq(p=>({...p,couleur:c}))} style={{ width:24,height:24,borderRadius:4,background:c,cursor:"pointer",border:editEq.couleur===c?"3px solid "+NC.dark:"2px solid transparent" }}/>
              ))}
            </div>
          </Field>
          <Field label="Statut">
            <div style={{ display:"flex",gap:8 }}>
              {[true,false].map(v=>(
                <div key={String(v)} onClick={()=>setEditEq(p=>({...p,actif:v}))} style={{ flex:1,padding:8,borderRadius:6,border:"1.5px solid "+(editEq.actif===v?(v?NC.green:NC.red):"#e0e0e0"),background:editEq.actif===v?(v?NC.greenBg:NC.redBg):"#fafafa",cursor:"pointer",fontSize:12,color:editEq.actif===v?(v?NC.green:NC.red):NC.gray,textAlign:"center",fontWeight:editEq.actif===v?700:400 }}>{v?"Active":"Inactive"}</div>
              ))}
            </div>
          </Field>
          <div style={{ display:"flex",gap:8,marginTop:8 }}>
            <SBtn primary onClick={async()=>{const r=await updateEquipe(editEq.id,{name:editEq.name,responsable:editEq.responsable,couleur:editEq.couleur,actif:editEq.actif});setEquipes(p=>p.map(x=>x.id===r.id?r:x));setEditEq(null);pushToast("Équipe mise à jour");}} style={{ flex:1 }}>Enregistrer</SBtn>
            <SBtn onClick={()=>setEditEq(null)} style={{ flex:1 }}>Annuler</SBtn>
          </div>
        </Modal>
      )}

      {/* Modal modifier utilisateur */}
      {editUser&&(
        <Modal title="Modifier l'utilisateur" onClose={()=>setEditUser(null)}>
          <Field label="Nom"><input value={editUser.nom} onChange={e=>setEditUser(p=>({...p,nom:e.target.value}))} style={{ width:"100%",fontSize:13,boxSizing:"border-box" }}/></Field>
          <Field label="Rôle">
            <select value={editUser.role} onChange={e=>setEditUser(p=>({...p,role:e.target.value}))} style={{ width:"100%",fontSize:13,padding:"6px 8px",border:"1px solid #ddd",borderRadius:6 }}>
              {Object.entries(ROLE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Équipe">
            <select value={editUser.equipe_id||""} onChange={e=>setEditUser(p=>({...p,equipe_id:e.target.value}))} style={{ width:"100%",fontSize:13,padding:"6px 8px",border:"1px solid #ddd",borderRadius:6 }}>
              <option value="">— Aucune —</option>
              {equipes.map(eq=><option key={eq.id} value={eq.id}>{eq.name}</option>)}
            </select>
          </Field>
          <Field label="PIN personnel"><input type="password" value={editUser.pin||""} onChange={e=>setEditUser(p=>({...p,pin:e.target.value}))} placeholder="••••" maxLength={8} style={{ width:"100%",fontSize:13,boxSizing:"border-box" }}/></Field>
          <Field label="Statut">
            <div style={{ display:"flex",gap:8 }}>
              {[true,false].map(v=>(
                <div key={String(v)} onClick={()=>setEditUser(p=>({...p,actif:v}))} style={{ flex:1,padding:8,borderRadius:6,border:"1.5px solid "+(editUser.actif===v?(v?NC.green:NC.red):"#e0e0e0"),background:editUser.actif===v?(v?NC.greenBg:NC.redBg):"#fafafa",cursor:"pointer",fontSize:12,color:editUser.actif===v?(v?NC.green:NC.red):NC.gray,textAlign:"center",fontWeight:editUser.actif===v?700:400 }}>{v?"Actif":"Inactif"}</div>
              ))}
            </div>
          </Field>
          <div style={{ display:"flex",gap:8,marginTop:8 }}>
            <SBtn primary onClick={async()=>{const r=await updateUtilisateur(editUser.id,{nom:editUser.nom,role:editUser.role,equipe_id:editUser.equipe_id||null,pin:editUser.pin||null,actif:editUser.actif});const withEq={...r,equipes:equipes.find(e=>e.id===r.equipe_id)||null};setUsers(p=>p.map(x=>x.id===r.id?withEq:x));setEditUser(null);pushToast("Utilisateur mis à jour");}} style={{ flex:1 }}>Enregistrer</SBtn>
            <SBtn onClick={()=>setEditUser(null)} style={{ flex:1 }}>Annuler</SBtn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Vue Aujourd'hui ───────────────────────────────────────────────────────────
function TodayView({ role, onOpenZone, pushToast }) {
  const [date, setDate]     = useState(TODAY);
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(d => {
    setLoading(true);
    fetchAllZonesTravailByDate(d).then(data=>{ setItems(data||[]); setLoading(false); }).catch(()=>{ setLoading(false); pushToast("Erreur chargement","error"); });
  },[]);
  useEffect(()=>{ load(date); },[date]);

  const getPath = zt => {
    try { const z=zt.zones,n=z.niveaux,b=n.batiments,c=b.chantiers; return c.name+" › "+b.name+" › "+n.name+" › "+z.name; } catch { return "—"; }
  };

  const byStatus = Object.keys(ALL_STATUSES).map(k=>({k,v:ALL_STATUSES[k],count:items.filter(x=>x.status===k).length})).filter(x=>x.count>0);

  return (
    <div style={{ padding:14, fontFamily:"Arial,sans-serif" }}>
      <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap" }}>
        <div style={{ fontSize:15,fontWeight:700,color:NC.dark }}>Zones du jour</div>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{ fontSize:13,padding:"4px 8px",borderRadius:6,border:"1px solid #ddd" }}/>
        <button onClick={()=>setDate(TODAY)} style={{ fontSize:12,padding:"4px 10px",borderRadius:5,border:"1px solid "+NC.red,background:NC.redBg,color:NC.red,cursor:"pointer" }}>Aujourd'hui</button>
        {items.length>0&&<span style={{ fontSize:12,color:NC.gray,marginLeft:"auto" }}>{items.length} zone{items.length>1?"s":""}</span>}
      </div>
      {byStatus.length>0&&(
        <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginBottom:12 }}>
          {byStatus.map(({k,v,count})=>(
            <span key={k} style={{ fontSize:11,padding:"3px 9px",borderRadius:10,background:v.bg,color:v.color,fontWeight:500 }}>{v.label} : {count}</span>
          ))}
        </div>
      )}
      {loading&&<Muted>Chargement…</Muted>}
      {!loading&&items.length===0&&<Muted>Aucune zone prévue pour cette date.</Muted>}
      {items.map(zt=>(
        <div key={zt.id} onClick={()=>onOpenZone&&onOpenZone(zt)}
          style={{ background:"white",border:"1px solid "+(zt.status==="blocked"?"#fcc":"#e8e8e8"),borderLeft:"3px solid "+ALL_STATUSES[zt.status].color,borderRadius:8,padding:"10px 14px",marginBottom:8,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8 }}>
          <div style={{ flex:1,minWidth:120 }}>
            <div style={{ fontSize:13,fontWeight:600,color:NC.dark }}>{zt.label||"—"}</div>
            <div style={{ fontSize:11,color:NC.gray,marginTop:2 }}>{getPath(zt)}</div>
            {zt.equipe&&<div style={{ fontSize:11,color:NC.gray }}>Équipe : {zt.equipe}</div>}
            {zt.status==="blocked"&&zt.comment&&<div style={{ fontSize:11,color:NC.red,marginTop:2 }}>⚠ {zt.comment}</div>}
          </div>
          <span style={{ fontSize:12,color:ALL_STATUSES[zt.status].color,background:ALL_STATUSES[zt.status].bg,padding:"3px 10px",borderRadius:5,fontWeight:500,whiteSpace:"nowrap" }}>{ALL_STATUSES[zt.status].label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({ allZT, batiments, activeStatuses }) {
  const STATUSES = Object.fromEntries(Object.entries(ALL_STATUSES).filter(([k])=>(activeStatuses||Object.keys(ALL_STATUSES)).includes(k)));
  const cnt={}; Object.keys(STATUSES).forEach(k=>{ cnt[k]=allZT.filter(x=>x.status===k).length; });
  const blocked=allZT.filter(x=>x.status==="blocked");
  const pct=(a,b)=>b===0?0:Math.round(a/b*100);
  const byBat={};
  batiments.forEach(b=>{const bzt=allZT.filter(x=>x.batiment_id===b.id);byBat[b.name]={total:bzt.length,done:bzt.filter(x=>x.status==="done").length,blocked:bzt.filter(x=>x.status==="blocked").length};});
  const byDate={};
  allZT.forEach(zt=>{const d=zt.date_pose||"Sans date";if(!byDate[d])byDate[d]={};byDate[d][zt.status]=(byDate[d][zt.status]||0)+1;});
  const dates=Object.keys(byDate).sort();
  const byEq={};
  allZT.forEach(zt=>{const eq=zt.equipe||"Non assigné";if(!byEq[eq])byEq[eq]={total:0,done:0,blocked:0};byEq[eq].total++;if(zt.status==="done")byEq[eq].done++;if(zt.status==="blocked")byEq[eq].blocked++;});

  return (
    <div style={{ padding:14,fontFamily:"Arial,sans-serif" }}>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(90px,1fr))",gap:8,marginBottom:14 }}>
        <div style={{ background:"white",border:"1px solid #e8e8e8",borderRadius:8,padding:"10px 12px",borderTop:"3px solid "+NC.dark }}>
          <div style={{ fontSize:11,color:NC.gray,marginBottom:3 }}>Total</div>
          <div style={{ fontSize:22,fontWeight:700,color:NC.dark }}>{allZT.length}</div>
        </div>
        {Object.entries(STATUSES).map(([k,v])=>(
          <div key={k} style={{ background:"white",border:"1px solid #e8e8e8",borderRadius:8,padding:"10px 12px",borderTop:"3px solid "+v.color }}>
            <div style={{ fontSize:11,color:NC.gray,marginBottom:3 }}>{v.label}</div>
            <div style={{ fontSize:22,fontWeight:700,color:v.color }}>{cnt[k]||0}</div>
          </div>
        ))}
      </div>
      <SCard title="Avancement par bâtiment">
        {Object.keys(byBat).length===0?<Muted>Aucune donnée.</Muted>:Object.entries(byBat).map(([name,s])=>(
          <div key={name} style={{ marginBottom:12 }}>
            <div style={{ display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:5 }}>
              <span style={{ color:NC.dark,fontWeight:500 }}>{name}</span>
              <span style={{ color:NC.gray,fontSize:12 }}>{s.done}/{s.total} ({pct(s.done,s.total)}%)</span>
            </div>
            <div style={{ height:8,borderRadius:4,background:"#f0f0f0",overflow:"hidden" }}>
              <div style={{ height:"100%",width:pct(s.done,s.total)+"%",background:NC.green,borderRadius:4 }}/>
            </div>
            {s.blocked>0&&<div style={{ fontSize:11,color:NC.red,marginTop:3 }}>{s.blocked} bloquée{s.blocked>1?"s":""}</div>}
          </div>
        ))}
      </SCard>
      <SCard title="Planning par date de pose">
        {dates.length===0?<Muted>Aucune zone avec date.</Muted>:(
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%",borderCollapse:"collapse",fontSize:12 }}>
              <thead><tr style={{ background:"#f8f8f8" }}>
                <th style={{ textAlign:"left",padding:"5px 8px",color:NC.gray,fontWeight:400,borderBottom:"1px solid #eee" }}>Date</th>
                {Object.entries(STATUSES).map(([k,v])=><th key={k} style={{ padding:"5px 6px",color:v.color,fontWeight:500,borderBottom:"1px solid #eee",whiteSpace:"nowrap",fontSize:11 }}>{v.label}</th>)}
                <th style={{ padding:"5px 8px",color:NC.dark,fontWeight:500,borderBottom:"1px solid #eee" }}>Total</th>
              </tr></thead>
              <tbody>{dates.map((d,i)=>{const row=byDate[d],tot=Object.values(row).reduce((a,b)=>a+b,0);return(
                <tr key={d} style={{ background:i%2===0?"#fafafa":"white" }}>
                  <td style={{ padding:"5px 8px",color:NC.dark,whiteSpace:"nowrap",fontWeight:500 }}>{fmtDate(d==="Sans date"?null:d)}</td>
                  {Object.keys(STATUSES).map(k=><td key={k} style={{ padding:"5px 6px",textAlign:"center",color:row[k]?STATUSES[k].color:"#ddd" }}>{row[k]||"—"}</td>)}
                  <td style={{ padding:"5px 8px",textAlign:"center",fontWeight:700,color:NC.dark }}>{tot}</td>
                </tr>
              );})}
              </tbody>
            </table>
          </div>
        )}
      </SCard>
      <SCard title="Statistiques par équipe">
        {Object.keys(byEq).length===0?<Muted>Aucune équipe.</Muted>:Object.entries(byEq).map(([eq,s])=>(
          <div key={eq} style={{ display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid #f0f0f0",flexWrap:"wrap" }}>
            <div style={{ width:32,height:32,borderRadius:6,background:NC.redBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:NC.red,flexShrink:0 }}>{eq.slice(0,2).toUpperCase()}</div>
            <div style={{ flex:1,minWidth:80 }}><div style={{ fontSize:13,color:NC.dark,fontWeight:500 }}>{eq}</div><div style={{ fontSize:11,color:NC.gray }}>{s.total} zone{s.total>1?"s":""}</div></div>
            <div style={{ display:"flex",alignItems:"center",gap:6,flex:2,minWidth:120 }}>
              <div style={{ flex:1,height:7,borderRadius:4,background:"#f0f0f0",overflow:"hidden" }}><div style={{ height:"100%",width:pct(s.done,s.total)+"%",background:NC.green }}/></div>
              <span style={{ fontSize:12,color:NC.gray,minWidth:32 }}>{pct(s.done,s.total)}%</span>
            </div>
            {s.blocked>0&&<span style={{ fontSize:11,color:NC.red,background:NC.redBg,padding:"2px 7px",borderRadius:4 }}>{s.blocked} bloqué{s.blocked>1?"s":""}</span>}
          </div>
        ))}
      </SCard>
      <SCard title={"Zones bloquées"+(blocked.length>0?" ("+blocked.length+")":"  — aucune")} accent={blocked.length>0?NC.red:NC.gray}>
        {blocked.length===0?<Muted>Aucune zone bloquée.</Muted>:blocked.map(zt=>(
          <div key={zt.id} style={{ padding:"8px 0",borderBottom:"1px solid #f5f5f5" }}>
            <div style={{ fontSize:13,fontWeight:500,color:NC.red }}>{zt.label||"—"}</div>
            <div style={{ fontSize:12,color:NC.gray }}>{zt.equipe?" · "+zt.equipe:""}</div>
            {zt.comment&&<div style={{ fontSize:12,color:NC.gray,marginTop:2,fontStyle:"italic" }}>« {zt.comment} »</div>}
          </div>
        ))}
      </SCard>
    </div>
  );
}

// ── LoginScreen ───────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, equipes }) {
  const [selRole, setSelRole]   = useState(null);
  const [selEquipe, setSelEquipe] = useState("");
  const [pin, setPin]           = useState("");
  const [err, setErr]           = useState("");
  const [pins, setPins]         = useState({ca:"1234",chef:"5678",monteur:"9999"});

  useEffect(()=>{ fetchParametre('pins').then(v=>{ if(v) setPins(v); }).catch(()=>{}); },[]);

  const tryLogin = () => {
    if (pin === pins[selRole]) onLogin(selRole, selRole==="monteur"?selEquipe:null);
    else { setErr("Code PIN incorrect."); setPin(""); }
  };

  const needsEquipe = selRole==="monteur" && equipes.length>0;

  return (
    <div style={{ minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#f4f4f4",padding:16,fontFamily:"Arial,sans-serif" }}>
      <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:36 }}>
        <div style={{ width:40,height:40,borderRadius:8,background:NC.red,display:"flex",alignItems:"center",justifyContent:"center" }}>
          <svg width="22" height="22" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="1" fill="white" opacity="0.95"/><rect x="9" y="2" width="5" height="5" rx="1" fill="white" opacity="0.55"/><rect x="2" y="9" width="5" height="5" rx="1" fill="white" opacity="0.55"/><rect x="9" y="9" width="5" height="5" rx="1" fill="white" opacity="0.95"/></svg>
        </div>
        <div><div style={{ fontSize:18,fontWeight:700,color:NC.dark }}>NEOCLIMA</div><div style={{ fontSize:11,color:NC.gray,letterSpacing:1 }}>FIELD TRACKER</div></div>
      </div>
      {!selRole?(
        <div style={{ width:"100%",maxWidth:320 }}>
          <div style={{ fontSize:13,color:NC.gray,marginBottom:14,textAlign:"center" }}>Sélectionnez votre rôle</div>
          {Object.entries(ROLE_LABELS).map(([k,v])=>(
            <button key={k} onClick={()=>setSelRole(k)} style={{ width:"100%",padding:"13px 18px",borderRadius:8,border:"1px solid #ddd",background:"white",cursor:"pointer",fontSize:14,color:NC.dark,display:"flex",alignItems:"center",gap:12,marginBottom:8,fontFamily:"Arial,sans-serif" }}>
              <div style={{ width:10,height:10,borderRadius:"50%",background:ROLE_COLORS[k] }}/>{v}
            </button>
          ))}
        </div>
      ):(
        <div style={{ width:"100%",maxWidth:300,background:"white",borderRadius:10,border:"1px solid #ddd",padding:24 }}>
          <button onClick={()=>{setSelRole(null);setPin("");setErr("");setSelEquipe("");}} style={{ fontSize:12,color:NC.gray,background:"none",border:"none",cursor:"pointer",padding:0,marginBottom:18 }}>← Retour</button>
          <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:20 }}>
            <div style={{ width:10,height:10,borderRadius:"50%",background:ROLE_COLORS[selRole] }}/>
            <span style={{ fontSize:15,fontWeight:700,color:NC.dark }}>{ROLE_LABELS[selRole]}</span>
          </div>
          {needsEquipe&&(
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11,color:NC.gray,marginBottom:5,fontWeight:700,textTransform:"uppercase" }}>Votre équipe</div>
              <select value={selEquipe} onChange={e=>setSelEquipe(e.target.value)}
                style={{ width:"100%",fontSize:14,padding:"8px 10px",border:"1px solid #ddd",borderRadius:7,background:"white",color:NC.dark }}>
                <option value="">— Sélectionner mon équipe —</option>
                {equipes.map(eq=>(
                  <option key={eq.id} value={eq.name}>
                    {eq.name}{eq.responsable?" ("+eq.responsable+")":""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div style={{ fontSize:12,color:NC.gray,marginBottom:6 }}>Code PIN</div>
          <input type="password" inputMode="numeric" maxLength={8} value={pin} onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&tryLogin()} autoFocus placeholder="••••"
            style={{ width:"100%",fontSize:24,letterSpacing:10,textAlign:"center",marginBottom:10,boxSizing:"border-box",border:"1.5px solid "+(err?NC.red:"#ddd"),borderRadius:7,padding:"8px 0",outline:"none" }}/>
          {err&&<div style={{ fontSize:12,color:NC.red,marginBottom:8 }}>{err}</div>}
          <button onClick={tryLogin} style={{ width:"100%",padding:10,borderRadius:8,border:"none",background:NC.red,color:"white",cursor:"pointer",fontSize:14,fontWeight:700 }}>Connexion</button>
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [role, setRole]               = useState(null);
  const [currentEquipe, setCurrentEquipe] = useState(null);
  const [view, setView]               = useState("today");
  const [chantiers, setChantiers]     = useState([]);
  const [batiments, setBatiments]     = useState([]);
  const [niveaux,   setNiveaux]       = useState([]);
  const [zones,     setZones]         = useState([]);
  const [currentZone, setCurrentZone] = useState(null);
  const [allZT,     setAllZT]         = useState([]);
  const [equipes,   setEquipes]       = useState([]);
  const [activeStatuses, setActiveStatuses] = useState(Object.keys(ALL_STATUSES));
  const [sel,       setSel]           = useState({ chantier:null, batiment:null, niveau:null, zone:null });
  const [loading,   setLoading]       = useState({});
  const [editZT,    setEditZT]        = useState(null);
  const [historyZT, setHistoryZT]     = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [addingWhat, setAddingWhat]   = useState(null);
  const [newName,   setNewName]       = useState("");
  const [saving,    setSaving]        = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editingName, setEditingName] = useState("");
  const fileInputRef = useRef(null);
  const realtimeSub  = useRef(null);
  const { toasts, push: pushToast } = useToast();

  // Chargement équipes + statuts actifs au démarrage
  useEffect(()=>{
    fetchEquipes().then(setEquipes).catch(()=>{});
    fetchParametre('statuts_actifs').then(v=>{ if(v) setActiveStatuses(v); }).catch(()=>{});
  },[]);

  useEffect(()=>{ if(!role)return; setLoading(l=>({...l,chantiers:true})); fetchChantiers().then(d=>{setChantiers(d);setLoading(l=>({...l,chantiers:false}));}).catch(()=>pushToast("Erreur chargement","error")); },[role]);
  useEffect(()=>{ if(!sel.chantier){setBatiments([]);return;} setLoading(l=>({...l,batiments:true})); fetchBatiments(sel.chantier).then(d=>{setBatiments(d);setLoading(l=>({...l,batiments:false}));}); },[sel.chantier]);
  useEffect(()=>{ if(!sel.batiment){setNiveaux([]);return;} setLoading(l=>({...l,niveaux:true})); fetchNiveaux(sel.batiment).then(d=>{setNiveaux(d);setLoading(l=>({...l,niveaux:false}));}); },[sel.batiment]);
  useEffect(()=>{ if(!sel.niveau){setZones([]);return;} setLoading(l=>({...l,zones:true})); fetchZones(sel.niveau).then(d=>{setZones(d);setLoading(l=>({...l,zones:false}));}); },[sel.niveau]);
  useEffect(()=>{
    if(!sel.zone){setCurrentZone(null);setAllZT([]);return;}
    const z=zones.find(x=>x.id===sel.zone);
    setCurrentZone(z?{...z,zones_travail:[]}:null);
    fetchZonesTravail(sel.zone).then(zt=>{setAllZT(zt);setCurrentZone(prev=>prev?{...prev,zones_travail:zt}:null);});
    if(realtimeSub.current) realtimeSub.current.unsubscribe();
    realtimeSub.current=subscribeZonesTravail(sel.zone,()=>{fetchZonesTravail(sel.zone).then(zt=>{setAllZT(zt);setCurrentZone(prev=>prev?{...prev,zones_travail:zt}:null);});});
    return()=>{if(realtimeSub.current)realtimeSub.current.unsubscribe();};
  },[sel.zone]);

  const openZone  = zid => { setSel(s=>({...s,zone:zid})); setView("plan"); };
  const backToNav = ()  => { setSel(s=>({...s,zone:null})); setView("nav"); };
  const goToNav   = ()  => { setSel(s=>({...s,zone:null})); setView("nav"); };

  const handlePlanUpload = async e => {
    const file=e.target.files[0]; if(!file||!sel.zone) return;
    setSaving(true);
    try { const res=await uploadPlan(sel.zone,file); setCurrentZone(prev=>prev?{...prev,...res}:null); setZones(prev=>prev.map(z=>z.id===sel.zone?{...z,...res}:z)); pushToast("Plan importé"); }
    catch(err){ pushToast("Erreur upload: "+err.message,"error"); }
    setSaving(false); e.target.value="";
  };

  const saveZT = async () => {
    if(!editZT) return; setSaving(true);
    try {
      const STATUSES = Object.fromEntries(Object.entries(ALL_STATUSES).filter(([k])=>activeStatuses.includes(k)));
      if(editZT.isNew){
        const zt=await createZoneTravail(sel.zone,{label:editZT.label,equipe:editZT.equipe||currentEquipe||"",rect:editZT.rect,status:"todo",comment:"",date_pose:null});
        setAllZT(p=>[...p,zt]); setCurrentZone(prev=>prev?{...prev,zones_travail:[...prev.zones_travail,zt]}:null);
        await addHistory(zt.id,role,"Création",editZT.label||""); pushToast("Zone créée");
      } else {
        const updated=await updateZoneTravail(editZT.id,{label:editZT.label,equipe:editZT.equipe,status:editZT.status,comment:editZT.comment,date_pose:editZT.date_pose||null});
        setAllZT(p=>p.map(x=>x.id===updated.id?updated:x)); setCurrentZone(prev=>prev?{...prev,zones_travail:prev.zones_travail.map(x=>x.id===updated.id?updated:x)}:null);
        if(editZT._origStatus!==updated.status) await addHistory(updated.id,role,"Statut",editZT._origStatus+" → "+updated.status);
        else await addHistory(updated.id,role,"Modification","");
        pushToast("Zone mise à jour");
      }
    } catch(err){ pushToast("Erreur: "+err.message,"error"); }
    setSaving(false); setEditZT(null);
  };

  const deleteZT = async id => {
    setSaving(true);
    try { await deleteZoneTravail(id); setAllZT(p=>p.filter(x=>x.id!==id)); setCurrentZone(prev=>prev?{...prev,zones_travail:prev.zones_travail.filter(x=>x.id!==id)}:null); pushToast("Zone supprimée"); }
    catch(err){ pushToast("Erreur: "+err.message,"error"); }
    setSaving(false); setEditZT(null);
  };

  const openHistory = async zt => { setHistoryZT(zt); const h=await fetchHistory(zt.id); setHistoryData(h||[]); };

  const addItem = async () => {
    const name=newName.trim(); if(!name) return; setSaving(true);
    try {
      if(addingWhat==="chantier"){const r=await createChantier(name);setChantiers(p=>[...p,r]);}
      if(addingWhat==="batiment"){const r=await createBatiment(sel.chantier,name);setBatiments(p=>[...p,r]);}
      if(addingWhat==="niveau")  {const r=await createNiveau(sel.batiment,name);setNiveaux(p=>[...p,r]);}
      if(addingWhat==="zone")    {const r=await createZone(sel.niveau,name);setZones(p=>[...p,r]);}
      pushToast("Créé");
    } catch(err){ pushToast("Erreur: "+err.message,"error"); }
    setSaving(false); setAddingWhat(null); setNewName("");
  };

  const handleEdit   = (type,item)  => { setEditingItem({type,item}); setEditingName(item.name); };
  const handleRename = async () => {
    const name=editingName.trim(); if(!name||!editingItem) return; setSaving(true);
    try {
      const {type,item}=editingItem;
      if(type==="chantier"){await updateChantier(item.id,name);setChantiers(p=>p.map(x=>x.id===item.id?{...x,name}:x));}
      if(type==="batiment"){await updateBatiment(item.id,name);setBatiments(p=>p.map(x=>x.id===item.id?{...x,name}:x));}
      if(type==="niveau")  {await updateNiveau(item.id,name);  setNiveaux(p=>p.map(x=>x.id===item.id?{...x,name}:x));}
      if(type==="zone")    {await updateZone(item.id,name);    setZones(p=>p.map(x=>x.id===item.id?{...x,name}:x)); if(currentZone&&currentZone.id===item.id)setCurrentZone(z=>({...z,name}));}
      pushToast("Renommé");
    } catch(err){ pushToast("Erreur: "+err.message,"error"); }
    setSaving(false); setEditingItem(null); setEditingName("");
  };
  const handleDelete = async (type,item) => {
    if(!window.confirm("Supprimer « "+item.name+" » ?")) return; setSaving(true);
    try {
      if(type==="chantier"){await deleteChantier(item.id);setChantiers(p=>p.filter(x=>x.id!==item.id));setSel({chantier:null,batiment:null,niveau:null,zone:null});}
      if(type==="batiment"){await deleteBatiment(item.id);setBatiments(p=>p.filter(x=>x.id!==item.id));setSel(s=>({...s,batiment:null,niveau:null,zone:null}));}
      if(type==="niveau")  {await deleteNiveau(item.id);  setNiveaux(p=>p.filter(x=>x.id!==item.id));  setSel(s=>({...s,niveau:null,zone:null}));}
      if(type==="zone")    {await deleteZone(item.id);    setZones(p=>p.filter(x=>x.id!==item.id));    setSel(s=>({...s,zone:null})); setView("nav");}
      pushToast("Supprimé");
    } catch(err){ pushToast("Erreur: "+err.message,"error"); }
    setSaving(false);
  };

  const STATUSES = Object.fromEntries(Object.entries(ALL_STATUSES).filter(([k])=>activeStatuses.includes(k)));
  const canEdit = role==="ca";

  if(!role) return <LoginScreen onLogin={(r,eq)=>{ setRole(r); setCurrentEquipe(eq); }} equipes={equipes}/>;

  const VIEWS = role==="monteur"
    ? [["today","Aujourd'hui"],["nav","Plans"]]
    : role==="chef"
    ? [["today","Aujourd'hui"],["nav","Plans"],["dashboard","Dashboard"]]
    : [["today","Aujourd'hui"],["nav","Plans"],["dashboard","Dashboard"],["settings","Paramètres"]];

  const nbtn = active => ({ fontSize:12,padding:"5px 12px",borderRadius:5,border:"1px solid "+(active?NC.red:"#ddd"),background:active?NC.red:"white",color:active?"white":NC.dark,cursor:"pointer",fontFamily:"Arial,sans-serif",fontWeight:active?700:400 });

  return (
    <div style={{ minHeight:"100vh",background:"#f4f4f4",fontFamily:"Arial,sans-serif",display:"flex",flexDirection:"column" }}>
      {/* Header */}
      <div style={{ background:"white",borderBottom:"2px solid "+NC.red,padding:"9px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,position:"sticky",top:0,zIndex:50 }}>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <div style={{ width:28,height:28,borderRadius:6,background:NC.red,display:"flex",alignItems:"center",justifyContent:"center" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="1" fill="white" opacity="0.95"/><rect x="9" y="2" width="5" height="5" rx="1" fill="white" opacity="0.55"/><rect x="2" y="9" width="5" height="5" rx="1" fill="white" opacity="0.55"/><rect x="9" y="9" width="5" height="5" rx="1" fill="white" opacity="0.95"/></svg>
          </div>
          <div><div style={{ fontSize:13,fontWeight:700,color:NC.dark }}>NEOCLIMA</div><div style={{ fontSize:9,color:NC.gray,letterSpacing:1 }}>FIELD TRACKER</div></div>
          <div style={{ fontSize:11,padding:"2px 8px",borderRadius:4,background:NC.redBg,color:NC.red,border:"1px solid rgba(192,57,43,0.2)",marginLeft:4 }}>{ROLE_LABELS[role]}</div>
          {currentEquipe&&<div style={{ fontSize:11,padding:"2px 8px",borderRadius:4,background:"#f0f0f0",color:NC.dark }}>{currentEquipe}</div>}
          {saving&&<div style={{ fontSize:11,color:NC.gray }}>Sauvegarde…</div>}
        </div>
        <div style={{ display:"flex",gap:5,flexWrap:"wrap" }}>
          {VIEWS.map(([v,l])=><button key={v} onClick={()=>{ if(v!=="plan")setSel(s=>({...s,zone:null})); setView(v); }} style={nbtn(view===v)}>{l}</button>)}
          <button onClick={()=>setRole(null)} style={{ fontSize:12,padding:"5px 10px",borderRadius:5,border:"1px solid "+NC.dark,background:NC.dark,color:"white",cursor:"pointer" }}>Déco.</button>
        </div>
      </div>

      {view==="today"    && <TodayView role={role} pushToast={pushToast} onOpenZone={zt=>{ if(zt.zone_id){setSel(s=>({...s,zone:zt.zone_id}));setView("plan");} }}/>}
      {view==="dashboard"&& <Dashboard allZT={allZT} batiments={batiments} activeStatuses={activeStatuses}/>}
      {view==="settings" && <SettingsView pushToast={pushToast} onSettingsChange={(key,val)=>{ if(key==="statuts_actifs")setActiveStatuses(val); if(key==="equipes")fetchEquipes().then(setEquipes); }}/>}

      {view==="nav"&&(
        <div style={{ padding:14,flex:1 }}>
          <div style={{ display:"flex",gap:10,flexWrap:"wrap" }}>
            <NavCol title="Chantiers" items={chantiers} selId={sel.chantier} loading={loading.chantiers} onSel={id=>setSel({chantier:id,batiment:null,niveau:null,zone:null})} canAdd={canEdit} onAdd={()=>setAddingWhat("chantier")} onEdit={item=>handleEdit("chantier",item)} onDelete={item=>handleDelete("chantier",item)}/>
            {sel.chantier&&<NavCol title="Bâtiments" items={batiments} selId={sel.batiment} loading={loading.batiments} onSel={id=>setSel(s=>({...s,batiment:id,niveau:null,zone:null}))} canAdd={canEdit} onAdd={()=>setAddingWhat("batiment")} onEdit={item=>handleEdit("batiment",item)} onDelete={item=>handleDelete("batiment",item)}/>}
            {sel.batiment&&<NavCol title="Niveaux" items={niveaux} selId={sel.niveau} loading={loading.niveaux} onSel={id=>setSel(s=>({...s,niveau:id,zone:null}))} canAdd={canEdit} onAdd={()=>setAddingWhat("niveau")} onEdit={item=>handleEdit("niveau",item)} onDelete={item=>handleDelete("niveau",item)}/>}
            {sel.niveau&&<NavCol title="Zones" items={zones} selId={sel.zone} loading={loading.zones} onSel={id=>openZone(id)} canAdd={canEdit} onAdd={()=>setAddingWhat("zone")} onEdit={item=>handleEdit("zone",item)} onDelete={item=>handleDelete("zone",item)} badge={z=>z.zones_travail_count||null}/>}
          </div>
          {!sel.chantier&&<div style={{ fontSize:13,color:NC.gray,marginTop:16 }}>Sélectionnez un chantier pour commencer.</div>}
        </div>
      )}

      {view==="plan"&&currentZone&&(
        <div style={{ padding:12,flex:1 }}>
          <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap" }}>
            <button onClick={backToNav} style={{ fontSize:12,padding:"4px 10px",borderRadius:5,border:"1px solid #ddd",background:"white",color:NC.dark,cursor:"pointer" }}>← Retour</button>
            <span style={{ fontSize:13,fontWeight:700,color:NC.dark }}>{currentZone.name}</span>
            {currentZone.plan_pages>1&&<span style={{ fontSize:11,color:NC.gray,background:"#f0f0f0",padding:"2px 7px",borderRadius:4 }}>{currentZone.plan_pages} pages</span>}
            {canEdit&&<button onClick={()=>fileInputRef.current&&fileInputRef.current.click()} style={{ fontSize:12,padding:"4px 12px",borderRadius:5,border:"1px solid "+NC.red,background:NC.red,color:"white",cursor:"pointer",marginLeft:"auto",fontWeight:500 }}>{currentZone.plan_url?"Changer le plan":"Importer un plan PDF"}</button>}
            <input ref={fileInputRef} type="file" accept="application/pdf,image/*" style={{ display:"none" }} onChange={handlePlanUpload}/>
          </div>
          <PlanViewer zone={currentZone} role={role} activeStatuses={activeStatuses}
            onZTClick={zt=>setEditZT({...zt,isNew:false,_origStatus:zt.status})}
            onNewZT={rect=>canEdit&&setEditZT({isNew:true,rect,label:"",equipe:currentEquipe||"",status:"todo",comment:""})}/>
          <div style={{ display:"flex",gap:10,flexWrap:"wrap",marginTop:8 }}>
            {Object.entries(STATUSES).map(([k,v])=>(
              <div key={k} style={{ display:"flex",alignItems:"center",gap:4,fontSize:11,color:NC.gray }}>
                <div style={{ width:9,height:9,borderRadius:2,background:v.color }}/>{v.label}
              </div>
            ))}
          </div>
          <div style={{ marginTop:10,padding:"8px 12px",background:"#fffbe6",border:"1px solid #ffe58f",borderRadius:6,fontSize:12,color:"#7d6200" }}>
            ⚠️ Les plans importés doivent être vérifiés régulièrement afin de s'assurer qu'ils sont à jour.
          </div>
        </div>
      )}
      {view==="plan"&&!currentZone&&(
        <div style={{ padding:24,textAlign:"center" }}>
          <Muted>Aucune zone sélectionnée.</Muted>
          <button onClick={goToNav} style={{ marginTop:12,fontSize:13,padding:"8px 16px",borderRadius:6,border:"1px solid "+NC.red,background:NC.red,color:"white",cursor:"pointer" }}>← Navigation</button>
        </div>
      )}

      {/* Modals */}
      {addingWhat&&(
        <Modal title={"Nouveau "+(addingWhat==="chantier"?"chantier":addingWhat==="batiment"?"bâtiment":addingWhat==="niveau"?"niveau":"zone")} onClose={()=>{setAddingWhat(null);setNewName("");}}>
          <input autoFocus value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addItem()} placeholder="Nom…" style={{ width:"100%",marginBottom:12,fontSize:13,boxSizing:"border-box" }}/>
          <div style={{ display:"flex",gap:8 }}><SBtn primary onClick={addItem} style={{ flex:1 }} disabled={saving}>{saving?"…":"Créer"}</SBtn><SBtn onClick={()=>{setAddingWhat(null);setNewName("");}} style={{ flex:1 }}>Annuler</SBtn></div>
        </Modal>
      )}
      {editingItem&&(
        <Modal title={"Renommer — "+editingItem.item.name} onClose={()=>setEditingItem(null)}>
          <Field label="Nouveau nom"><input autoFocus value={editingName} onChange={e=>setEditingName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleRename()} style={{ width:"100%",fontSize:13,boxSizing:"border-box" }}/></Field>
          <div style={{ display:"flex",gap:8 }}><SBtn primary onClick={handleRename} style={{ flex:1 }} disabled={saving}>{saving?"…":"Renommer"}</SBtn><SBtn onClick={()=>setEditingItem(null)} style={{ flex:1 }}>Annuler</SBtn></div>
        </Modal>
      )}
      {editZT&&(
        <Modal title={editZT.isNew?"Nouvelle zone de travail":"Zone de travail"} onClose={()=>setEditZT(null)}>
          {canEdit&&(
            <>
              <Field label="Libellé"><input value={editZT.label||""} onChange={e=>setEditZT(z=>({...z,label:e.target.value}))} placeholder="Ex: Gaine principale RDC" style={{ width:"100%",fontSize:13,boxSizing:"border-box" }}/></Field>
              <Field label="Équipe assignée">
                <select value={editZT.equipe||""} onChange={e=>setEditZT(z=>({...z,equipe:e.target.value}))} style={{ width:"100%",fontSize:13,padding:"6px 8px",border:"1px solid #ddd",borderRadius:6 }}>
                  <option value="">— Aucune équipe —</option>
                  {equipes.map(eq=><option key={eq.id} value={eq.name}>{eq.name}{eq.responsable?" ("+eq.responsable+")":""}</option>)}
                </select>
              </Field>
            </>
          )}
          {!editZT.isNew&&(
            <>
              {(role==="monteur"||role==="chef")&&(
                <>
                  <Field label="Votre équipe">
                    <select value={editZT.equipe||currentEquipe||""} onChange={e=>setEditZT(z=>({...z,equipe:e.target.value}))} style={{ width:"100%",fontSize:13,padding:"6px 8px",border:"1px solid #ddd",borderRadius:6 }}>
                      <option value="">— Sélectionner —</option>
                      {equipes.map(eq=><option key={eq.id} value={eq.name}>{eq.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Date de pose"><input type="date" value={editZT.date_pose||""} onChange={e=>setEditZT(z=>({...z,date_pose:e.target.value}))} style={{ width:"100%",fontSize:13,boxSizing:"border-box" }}/></Field>
                </>
              )}
              {role==="ca"&&(
                <Field label="Date de pose"><div style={{ fontSize:13,color:editZT.date_pose?NC.dark:NC.gray,padding:"6px 0" }}>{editZT.date_pose?fmtDate(editZT.date_pose):"Non renseignée"}</div></Field>
              )}
              <Field label="Statut">
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:6 }}>
                  {Object.entries(STATUSES).map(([k,v])=>(
                    <div key={k} onClick={()=>setEditZT(z=>({...z,status:k}))}
                      style={{ padding:8,borderRadius:6,border:"1.5px solid "+(editZT.status===k?v.color:"#e0e0e0"),background:editZT.status===k?v.bg:"#fafafa",cursor:"pointer",fontSize:12,color:editZT.status===k?v.color:NC.gray,textAlign:"center",fontWeight:editZT.status===k?700:400 }}>{v.label}</div>
                  ))}
                </div>
              </Field>
              {editZT.status==="blocked"&&(
                <Field label="Raison du blocage"><textarea value={editZT.comment||""} onChange={e=>setEditZT(z=>({...z,comment:e.target.value}))} placeholder="Décrivez le problème…" rows={2} style={{ width:"100%",fontSize:13,boxSizing:"border-box",resize:"vertical" }}/></Field>
              )}
              <button onClick={()=>openHistory(editZT)} style={{ fontSize:11,color:NC.gray,background:"none",border:"1px solid #e0e0e0",borderRadius:5,cursor:"pointer",padding:"4px 10px",marginBottom:10,width:"100%" }}>🕐 Voir l'historique</button>
            </>
          )}
          {editZT.isNew&&<div style={{ fontSize:12,color:NC.gray,padding:"7px 10px",background:"#f8f8f8",borderRadius:6,marginBottom:10,borderLeft:"3px solid "+NC.gray }}>Statut et date de pose renseignés par les monteurs.</div>}
          <div style={{ display:"flex",gap:8,marginTop:4 }}>
            <SBtn primary onClick={saveZT} style={{ flex:1 }} disabled={saving}>{saving?"…":"Enregistrer"}</SBtn>
            {!editZT.isNew&&canEdit&&<SBtn danger onClick={()=>deleteZT(editZT.id)}>Supprimer</SBtn>}
            <SBtn onClick={()=>setEditZT(null)} style={{ flex:1 }}>Annuler</SBtn>
          </div>
        </Modal>
      )}
      {historyZT&&(
        <Modal title={"Historique — "+(historyZT.label||"Zone")} onClose={()=>setHistoryZT(null)} wide>
          {historyData.length===0?<Muted>Aucun historique disponible.</Muted>:historyData.map(h=>(
            <div key={h.id} style={{ display:"flex",gap:10,padding:"7px 0",borderBottom:"1px solid #f0f0f0",alignItems:"flex-start" }}>
              <div style={{ width:32,height:32,borderRadius:6,background:NC.redBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:NC.red,flexShrink:0 }}>{h.role==="ca"?"CA":h.role==="chef"?"CH":"MT"}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13,color:NC.dark,fontWeight:500 }}>{h.action}{h.detail?" — "+h.detail:""}</div>
                <div style={{ fontSize:11,color:NC.gray }}>{fmtTs(h.created_at)} · {ROLE_LABELS[h.role]||h.role}</div>
              </div>
            </div>
          ))}
          <div style={{ marginTop:12 }}><SBtn onClick={()=>setHistoryZT(null)} style={{ width:"100%" }}>Fermer</SBtn></div>
        </Modal>
      )}

      <Toast toasts={toasts}/>
      <div style={{ textAlign:"center",padding:"16px 0 10px",fontSize:11,color:"#bbb",borderTop:"1px solid #e8e8e8",marginTop:"auto",fontFamily:"Arial,sans-serif" }}>
        © {new Date().getFullYear()} Propriété de <strong style={{ color:NC.gray }}>Neoclima Sàrl</strong> — Tous droits réservés
      </div>
    </div>
  );
}
