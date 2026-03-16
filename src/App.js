import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

import {
  fetchChantiers, createChantier, updateChantier, deleteChantier,
  fetchBatiments, createBatiment, updateBatiment, deleteBatiment,
  fetchNiveaux,   createNiveau,   updateNiveau,   deleteNiveau,
  fetchZones,     createZone,     updateZone,     deleteZone, uploadPlan,
  fetchZonesTravail, createZoneTravail, updateZoneTravail, deleteZoneTravail,
  subscribeZonesTravail, fetchAllZTByDate, fetchHistory, addHistory,
  fetchEquipes, fetchAllEquipes, createEquipe, updateEquipe, deleteEquipe,
  fetchUtilisateurs, createUtilisateur, updateUtilisateur, deleteUtilisateur,
  fetchParametre, setParametre,
  fetchEffectifs, upsertEffectif,
  fetchMateriaux, createMateriau, updateMateriau, deleteMateriau,
  fetchAnnotations, createAnnotation, deleteAnnotation,
  fetchPhotos, uploadPhoto, deletePhoto,
  fetchNCs, fetchAllNCs, createNC, updateNC, deleteNC,
  fetchEssais, createEssai, deleteEssai,
} from './supabase';

const NC_COL = {
  red:"#C0392B", redBg:"rgba(192,57,43,0.10)",
  dark:"#2C3E50",
  gray:"#7F8C8D",
  green:"#27AE60", greenBg:"rgba(39,174,96,0.12)",
  amber:"#E67E22", amberBg:"rgba(230,126,34,0.14)",
  purple:"#8E44AD", purpleBg:"rgba(142,68,173,0.13)",
  blue:"#2980B9",  blueBg:"rgba(41,128,185,0.13)",
  orange:"#D35400", orangeBg:"rgba(211,84,0,0.13)",
};
const ROLE_LABELS  = { ca:"Chargé d'affaire", chef:"Chef de chantier", monteur:"Monteur" };
const ROLE_COLORS  = { ca:NC_COL.red, chef:NC_COL.dark, monteur:NC_COL.amber };
const ALL_STATUSES = {
  todo:       { label:"Prévu",       color:NC_COL.gray,   bg:"rgba(127,140,141,0.10)" },
  inprogress: { label:"En cours",    color:NC_COL.blue,   bg:NC_COL.blueBg },
  nappe_h:    { label:"Nappe haute", color:NC_COL.amber,  bg:NC_COL.amberBg },
  nappe_b:    { label:"Nappe basse", color:NC_COL.orange, bg:NC_COL.orangeBg },
  terminaux:  { label:"Terminaux",   color:NC_COL.purple, bg:NC_COL.purpleBg },
  done:       { label:"Terminé",     color:NC_COL.green,  bg:NC_COL.greenBg },
  blocked:    { label:"Bloqué",      color:NC_COL.red,    bg:NC_COL.redBg },
};
const GRAVITE_NC   = { mineure:"#E67E22", majeure:"#D35400", bloquante:"#C0392B" };
const STATUT_NC    = { ouverte:"#E24B4A", en_cours:"#E67E22", levee:"#2980B9", validee:"#27AE60" };
const TYPE_ESSAI   = { debit:"Débit", pression:"Pression", etancheite:"Étanchéité", bruit:"Bruit", temperature:"Température" };
const TYPE_BLOCAGE = { materiau:"Matériau manquant", absence:"Absence personnel", acces:"Accès impossible", autre:"Autre" };
const EQUIPE_COLORS = ["#2980B9","#27AE60","#E67E22","#8E44AD","#C0392B","#16A085","#D35400","#2C3E50","#7F8C8D","#F39C12"];
const TODAY = new Date().toISOString().split('T')[0];
const fmtDate = d => { if(!d) return "—"; const p=d.split("-"); return p[2]+"."+p[1]+"."+p[0]; };
const fmtTs   = ts => { if(!ts) return ""; const d=new Date(ts); return d.toLocaleDateString('fr-CH')+' '+d.toLocaleTimeString('fr-CH',{hour:'2-digit',minute:'2-digit'}); };
const weekDates = (base=TODAY) => { const d=new Date(base); const day=d.getDay()||7; d.setDate(d.getDate()-day+1); return Array.from({length:7},(_,i)=>{ const x=new Date(d); x.setDate(d.getDate()+i); return x.toISOString().split('T')[0]; }); };
const inp = {width:"100%",fontSize:13,boxSizing:"border-box",fontFamily:"Arial,sans-serif"};
const sel_style = {width:"100%",fontSize:13,padding:"6px 8px",border:"1px solid #ddd",borderRadius:6,fontFamily:"Arial,sans-serif"};

// ── Toast ─────────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts,setToasts] = useState([]);
  const push = useCallback((msg,type="success") => {
    const id = Date.now();
    setToasts(p=>[...p,{id,msg,type}]);
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),3500);
  },[]);
  return {toasts,push};
}
function Toast({toasts}) {
  return (
    <div style={{position:"fixed",bottom:20,right:20,zIndex:999,display:"flex",flexDirection:"column",gap:8,pointerEvents:"none"}}>
      {toasts.map(t=>(
        <div key={t.id} style={{padding:"10px 16px",borderRadius:8,background:t.type==="error"?NC_COL.red:t.type==="warn"?NC_COL.amber:NC_COL.dark,color:"white",fontSize:13,fontWeight:500,boxShadow:"0 2px 12px rgba(0,0,0,0.18)",fontFamily:"Arial,sans-serif",maxWidth:300,display:"flex",alignItems:"center",gap:8}}>
          <span>{t.type==="error"?"✕":t.type==="warn"?"⚠":"✓"}</span><span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

// ── UI Helpers ────────────────────────────────────────────────────────────────
function SBtn({children,onClick,primary,danger,small,style,disabled}) {
  const bg=primary?NC_COL.red:"white", col=primary?"white":danger?NC_COL.red:NC_COL.dark, bdr=primary?NC_COL.red:danger?NC_COL.red:"#ddd";
  return <button onClick={onClick} disabled={disabled} style={{padding:small?"4px 9px":"8px 12px",borderRadius:7,border:"1px solid "+bdr,background:bg,color:col,cursor:disabled?"not-allowed":"pointer",fontSize:small?12:13,fontWeight:primary?700:400,fontFamily:"Arial,sans-serif",opacity:disabled?0.6:1,...style}}>{children}</button>;
}
function Field({label,children,hint}) {
  return <div style={{marginBottom:12}}><div style={{fontSize:11,color:NC_COL.gray,marginBottom:4,fontWeight:700,textTransform:"uppercase",letterSpacing:0.3}}>{label}</div>{children}{hint&&<div style={{fontSize:11,color:NC_COL.gray,marginTop:3}}>{hint}</div>}</div>;
}
function SCard({title,children,accent,action}) {
  const a=accent||NC_COL.red;
  return (
    <div style={{background:"white",border:"1px solid #e8e8e8",borderRadius:8,padding:16,marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,borderLeft:"3px solid "+a,paddingLeft:8}}>
        <div style={{fontSize:14,fontWeight:700,color:a}}>{title}</div>{action}
      </div>
      {children}
    </div>
  );
}
function Muted({children}) { return <div style={{fontSize:13,color:NC_COL.gray}}>{children}</div>; }
function Divider() { return <div style={{height:1,background:"#f0f0f0",margin:"12px 0"}}/>; }
function Badge({label,color,bg}) { return <span style={{fontSize:11,padding:"2px 8px",borderRadius:10,background:bg||"rgba(44,62,80,0.08)",color:color||NC_COL.dark,fontWeight:500,whiteSpace:"nowrap"}}>{label}</span>; }
function Modal({title,children,onClose,wide}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.42)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
      <div style={{background:"white",borderRadius:10,padding:20,width:wide?560:340,maxWidth:"96vw",border:"1px solid #ddd",maxHeight:"92vh",overflowY:"auto",fontFamily:"Arial,sans-serif"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,borderBottom:"2px solid "+NC_COL.red,paddingBottom:10}}>
          <span style={{fontSize:14,fontWeight:700,color:NC_COL.dark}}>{title}</span>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:NC_COL.gray}}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function NavCol({title,items,selId,onSel,canAdd,onAdd,onEdit,onDelete,badge,loading}) {
  return (
    <div style={{flex:"1 1 140px",minWidth:120}}>
      <div style={{fontSize:11,color:NC_COL.gray,marginBottom:6,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase"}}>{title}</div>
      {loading&&<Muted>Chargement…</Muted>}
      {items.map(item=>(
        <div key={item.id} style={{padding:"9px 10px",borderRadius:6,border:"1px solid "+(selId===item.id?NC_COL.red:"#e0e0e0"),borderLeft:selId===item.id?"3px solid "+NC_COL.red:"1px solid #e0e0e0",background:selId===item.id?NC_COL.redBg:"white",marginBottom:5,fontSize:13,color:selId===item.id?NC_COL.red:NC_COL.dark,display:"flex",justifyContent:"space-between",alignItems:"center",gap:4}}>
          <span onClick={()=>onSel(item.id)} style={{fontWeight:selId===item.id?700:400,cursor:"pointer",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}</span>
          <div style={{display:"flex",gap:3,flexShrink:0}}>
            {badge&&badge(item)!=null&&<span style={{fontSize:11,background:NC_COL.dark,color:"white",borderRadius:10,padding:"1px 7px",fontWeight:700}}>{badge(item)}</span>}
            {canAdd&&<>
              <button onClick={e=>{e.stopPropagation();onEdit(item);}} style={{width:22,height:22,borderRadius:4,border:"1px solid #e0e0e0",background:"white",color:NC_COL.gray,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>✎</button>
              <button onClick={e=>{e.stopPropagation();onDelete(item);}} style={{width:22,height:22,borderRadius:4,border:"1px solid #fcc",background:"#fff5f5",color:NC_COL.red,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>×</button>
            </>}
          </div>
        </div>
      ))}
      {canAdd&&<button onClick={onAdd} style={{fontSize:12,padding:"5px 8px",borderRadius:6,border:"1px dashed "+NC_COL.red,background:"transparent",color:NC_COL.red,cursor:"pointer",width:"100%",fontFamily:"Arial,sans-serif"}}>+ {title.slice(0,-1)}</button>}
    </div>
  );
}

// ── PlanViewer ────────────────────────────────────────────────────────────────
function PlanViewer({zone,role,onZTClick,onNewZT,activeStatuses,equipes,pushToast}) {
  const containerRef  = useRef(null);
  const canvasRef     = useRef(null);
  const pdfDocRef     = useRef(null);
  const pdfCacheRef   = useRef({});
  const panRef        = useRef({on:false});
  const drwRef        = useRef({on:false});
  const pnchRef       = useRef({on:false});
  const photoInputRef = useRef(null);

  const [tf,setTf]                   = useState({x:0,y:0,s:1});
  const [pdfReady,setPdfReady]       = useState(false);
  const [loadingPdf,setLoadingPdf]   = useState(false);
  const [imgSz,setImgSz]             = useState({w:800,h:600});
  const [mode,setMode]               = useState("pan");
  const [drawRect,setDrawRect]       = useState(null);
  const [currentPage,setCurrentPage] = useState(1);
  const [totalPages,setTotalPages]   = useState(1);
  const [filterStatus,setFilterStatus] = useState("all");
  const [annotations,setAnnotations] = useState([]);
  const [photos,setPhotos]           = useState([]);
  const [ncs,setNcs]                 = useState([]);
  const [showLayers,setShowLayers]   = useState({zones:true,annotations:true,photos:true,nc:true});
  const [annotNote,setAnnotNote]     = useState("");
  const [pendingPos,setPendingPos]   = useState(null);
  const [pendingPhotoPos,setPendingPhotoPos] = useState(null);

  // renderPage — défini avant les useEffect qui l'utilisent
  const renderPage = useCallback((pdf, pageNum) => {
    const cv = canvasRef.current;
    if(!pdf || !cv) return;
    setPdfReady(false);
    pdf.getPage(pageNum).then(page => {
      const vp = page.getViewport({scale:1.5});
      cv.width = vp.width;
      cv.height = vp.height;
      setImgSz({w:vp.width, h:vp.height});
      page.render({canvasContext:cv.getContext("2d"), viewport:vp}).promise
        .then(()=>{ setPdfReady(true); setLoadingPdf(false); })
        .catch(()=>setLoadingPdf(false));
    }).catch(()=>setLoadingPdf(false));
  }, []);

  // Reset sur changement de zone
  useEffect(()=>{
    setTf({x:0,y:0,s:1}); setPdfReady(false); setLoadingPdf(false);
    setDrawRect(null); setMode("pan"); setCurrentPage(1); setTotalPages(1);
    pdfDocRef.current = null;
    if(zone?.id) {
      fetchAnnotations(zone.id).then(setAnnotations).catch(()=>{});
      fetchPhotos(zone.id).then(setPhotos).catch(()=>{});
      fetchNCs(zone.id).then(setNcs).catch(()=>{});
    }
  },[zone && zone.id]);

  // Chargement PDF
  useEffect(()=>{
    if(!zone?.plan_url || zone.plan_type !== "pdf") return;
    setPdfReady(false);
    setLoadingPdf(true);
    const url = zone.plan_url;

    const load = async () => {
      if(pdfCacheRef.current[url]) return pdfCacheRef.current[url];
      const resp = await fetch(url, {mode:'cors'});
      if(!resp.ok) throw new Error("HTTP "+resp.status);
      const buf = await resp.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({data:buf}).promise;
      pdfCacheRef.current[url] = pdf;
      return pdf;
    };

    load().then(pdf => {
      pdfDocRef.current = pdf;
      setTotalPages(pdf.numPages);
      // requestAnimationFrame : attend que React ait rendu le canvas dans le DOM
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          renderPage(pdf, 1);
        });
      });
    }).catch(err => {
      setLoadingPdf(false);
      pushToast && pushToast("Erreur PDF: "+err.message, "error");
    });
  },[zone && zone.plan_url]);

  const goPage = n => {
    const p = Math.max(1, Math.min(totalPages, n));
    setCurrentPage(p);
    setTf({x:0,y:0,s:1});
    if(pdfDocRef.current) renderPage(pdfDocRef.current, p);
  };

  const onWheel = useCallback(e=>{
    e.preventDefault();
    const el=containerRef.current; if(!el) return;
    const r=el.getBoundingClientRect(), mx=e.clientX-r.left-r.width/2, my=e.clientY-r.top-r.height/2, f=e.deltaY<0?1.12:0.89;
    setTf(t=>{ const ns=Math.max(0.15,Math.min(12,t.s*f)); return{x:mx-(mx-t.x)*(ns/t.s),y:my-(my-t.y)*(ns/t.s),s:ns}; });
  },[]);
  useEffect(()=>{
    const el=containerRef.current; if(!el) return;
    el.addEventListener("wheel",onWheel,{passive:false});
    return()=>el.removeEventListener("wheel",onWheel);
  },[onWheel]);

  const gcp  = e=>e.touches?{x:e.touches[0].clientX,y:e.touches[0].clientY}:{x:e.clientX,y:e.clientY};
  const gdist= t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
  const gmid = t=>({x:(t[0].clientX+t[1].clientX)/2,y:(t[0].clientY+t[1].clientY)/2});
  const s2p  = (sx,sy) => {
    const el=containerRef.current; if(!el) return{x:0,y:0};
    const r=el.getBoundingClientRect(), px=(sx-r.left-r.width/2-tf.x)/tf.s, py=(sy-r.top-r.height/2-tf.y)/tf.s;
    const rw=Math.min(r.width,imgSz.w), rh=rw*imgSz.h/imgSz.w;
    return{x:(px/rw+0.5)*100, y:(py/rh+0.5)*100};
  };

  const onDown = e => {
    if(e.touches&&e.touches.length===2) {
      const mid=gmid(e.touches), el=containerRef.current, r=el.getBoundingClientRect();
      pnchRef.current={on:true,d:gdist(e.touches),s:tf.s,tx:tf.x,ty:tf.y,mx:mid.x-r.left-r.width/2,my:mid.y-r.top-r.height/2};
      return;
    }
    const p=gcp(e);
    if(mode==="pan"||!zone?.plan_url) { panRef.current={on:true,sx:p.x,sy:p.y,tx:tf.x,ty:tf.y}; }
    else if(mode==="draw"&&role==="ca") { const pp=s2p(p.x,p.y); drwRef.current={on:true,sx:pp.x,sy:pp.y}; setDrawRect({x:pp.x,y:pp.y,w:0,h:0}); }
    else if(mode==="note"||mode==="photo") { setPendingPos(s2p(p.x,p.y)); e.preventDefault(); return; }
    e.preventDefault();
  };
  const onMove = e => {
    if(e.touches&&e.touches.length===2&&pnchRef.current.on) {
      const nd=gdist(e.touches), ns=Math.max(0.15,Math.min(12,pnchRef.current.s*nd/pnchRef.current.d));
      const mid=gmid(e.touches), el=containerRef.current, r=el.getBoundingClientRect();
      const mx=mid.x-r.left-r.width/2, my=mid.y-r.top-r.height/2;
      setTf({x:pnchRef.current.tx+mx-pnchRef.current.mx+(pnchRef.current.mx-pnchRef.current.tx)*(1-ns/pnchRef.current.s),y:pnchRef.current.ty+my-pnchRef.current.my+(pnchRef.current.my-pnchRef.current.ty)*(1-ns/pnchRef.current.s),s:ns});
      e.preventDefault(); return;
    }
    const p=gcp(e);
    if(panRef.current.on) setTf(t=>({...t,x:panRef.current.tx+p.x-panRef.current.sx,y:panRef.current.ty+p.y-panRef.current.sy}));
    else if(drwRef.current.on) { const pp=s2p(p.x,p.y); setDrawRect({x:Math.min(drwRef.current.sx,pp.x),y:Math.min(drwRef.current.sy,pp.y),w:Math.abs(pp.x-drwRef.current.sx),h:Math.abs(pp.y-drwRef.current.sy)}); }
    e.preventDefault();
  };
  const onUp = () => {
    pnchRef.current.on=false; panRef.current.on=false;
    if(drwRef.current.on) { drwRef.current.on=false; if(drawRect&&drawRect.w>0.5&&drawRect.h>0.5) onNewZT(drawRect); setDrawRect(null); }
  };

  const saveNote = async () => {
    if(!annotNote.trim()||!pendingPos||!zone?.id) return;
    const a=await createAnnotation({zone_id:zone.id,type:"note",x:pendingPos.x,y:pendingPos.y,texte:annotNote,couleur:NC_COL.red,auteur_role:role});
    setAnnotations(p=>[...p,a]); setAnnotNote(""); setPendingPos(null); setMode("pan");
  };

  const handlePhotoUpload = async e => {
    const file=e.target.files[0]; if(!file||!pendingPhotoPos||!zone?.id) return;
    const legende=window.prompt("Légende (optionnel):")||"";
    try { const row=await uploadPhoto(zone.id,file,{x:pendingPhotoPos.x,y:pendingPhotoPos.y,legende,type:"general",auteur_role:role}); setPhotos(p=>[...p,row]); }
    catch(err) { alert("Erreur photo: "+err.message); }
    setPendingPhotoPos(null); setMode("pan"); e.target.value="";
  };

  const STATUSES = Object.fromEntries(Object.entries(ALL_STATUSES).filter(([k])=>(activeStatuses||Object.keys(ALL_STATUSES)).includes(k)));
  const visibleZT = (zone?.zones_travail||[]).filter(zt=>filterStatus==="all"||zt.status===filterStatus);
  const cw = containerRef.current ? containerRef.current.clientWidth : 700;
  const modeBtn = (m,label) => <button onClick={()=>setMode(m)} style={{fontSize:11,padding:"4px 9px",borderRadius:5,border:"1px solid "+(mode===m?NC_COL.red:"#ccc"),background:mode===m?NC_COL.red:"white",color:mode===m?"white":NC_COL.gray,cursor:"pointer",fontWeight:mode===m?700:400}}>{label}</button>;

  return (
    <div>
      {/* Toolbar */}
      <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:6,flexWrap:"wrap"}}>
        {zone?.plan_url&&<>
          {modeBtn("pan","✥ Nav")}
          {role==="ca"&&modeBtn("draw","⬜ Zone")}
          {modeBtn("note","📝 Note")}
          {modeBtn("photo","📷 Photo")}
          <div style={{width:1,height:18,background:"#ddd",margin:"0 2px"}}/>
        </>}
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{fontSize:11,padding:"3px 7px",borderRadius:5,border:"1px solid #ddd",background:"white"}}>
          <option value="all">Tous statuts</option>
          {Object.entries(STATUSES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
        <div style={{display:"flex",gap:4,marginLeft:4}}>
          {[["zones","Z"],["annotations","A"],["photos","P"],["nc","NC"]].map(([k,l])=>(
            <button key={k} onClick={()=>setShowLayers(p=>({...p,[k]:!p[k]}))} style={{fontSize:10,padding:"3px 7px",borderRadius:4,border:"1px solid #ddd",background:showLayers[k]?NC_COL.dark:"white",color:showLayers[k]?"white":NC_COL.gray,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
        {totalPages>1&&<div style={{display:"flex",alignItems:"center",gap:3,marginLeft:"auto"}}>
          <button onClick={()=>goPage(currentPage-1)} disabled={currentPage<=1} style={{width:26,height:26,borderRadius:5,border:"1px solid #ddd",background:"white",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
          <span style={{fontSize:11,color:NC_COL.gray,whiteSpace:"nowrap"}}>{currentPage}/{totalPages}</span>
          <button onClick={()=>goPage(currentPage+1)} disabled={currentPage>=totalPages} style={{width:26,height:26,borderRadius:5,border:"1px solid #ddd",background:"white",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
        </div>}
        <div style={{display:"flex",gap:3,marginLeft:"auto"}}>
          {[["−",()=>setTf(t=>({...t,s:Math.max(0.15,t.s/1.3)}))],["+",()=>setTf(t=>({...t,s:Math.min(12,t.s*1.3)}))],["⊡",()=>setTf({x:0,y:0,s:1})]].map(([l,fn])=>(
            <button key={l} onClick={fn} style={{width:26,height:26,borderRadius:4,border:"1px solid #ddd",background:"white",color:NC_COL.dark,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>{l}</button>
          ))}
          <span style={{fontSize:10,color:NC_COL.gray,alignSelf:"center",marginLeft:2}}>{Math.round(tf.s*100)}%</span>
        </div>
      </div>

      {/* Canvas zone */}
      <div style={{position:"relative",borderRadius:8,overflow:"hidden",border:"0.5px solid #ddd",background:"#1a1a1a",height:"56vh"}}>
        <div ref={containerRef} style={{width:"100%",height:"100%",overflow:"hidden",cursor:mode==="draw"&&role==="ca"?"crosshair":mode==="note"||mode==="photo"?"cell":"grab",touchAction:"none"}}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}>

          {!zone?.plan_url ? (
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",fontSize:13,color:"#888"}}>
              {role==="ca"?"Importez un plan PDF.":"Aucun plan importé."}
            </div>
          ) : (
            <div style={{position:"absolute",left:"50%",top:"50%",transform:"translate(calc(-50% + "+tf.x+"px), calc(-50% + "+tf.y+"px)) scale("+tf.s+")",transformOrigin:"center center",pointerEvents:"none"}}>

              {/* Canvas PDF — toujours dans le DOM */}
              {zone.plan_type==="pdf" && (
                <>
                  <canvas ref={canvasRef} style={{display:"block",maxWidth:cw+"px",opacity:pdfReady?1:0}}/>
                  {loadingPdf&&!pdfReady&&(
                    <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12}}>
                      <div style={{width:36,height:36,border:"3px solid rgba(255,255,255,0.15)",borderTop:"3px solid "+NC_COL.red,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
                      <div style={{fontSize:13,color:"#aaa"}}>Chargement…</div>
                      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
                    </div>
                  )}
                </>
              )}

              {/* Image */}
              {zone.plan_type!=="pdf"&&(
                <img src={zone.plan_url} alt="plan" style={{display:"block",maxWidth:cw+"px"}} onLoad={e=>setImgSz({w:e.target.naturalWidth,h:e.target.naturalHeight})}/>
              )}

              {/* Zones de travail */}
              {showLayers.zones&&visibleZT.map((zt,idx)=>{
                const st=STATUSES[zt.status]||ALL_STATUSES[zt.status];
                return (
                  <div key={zt.id} onClick={e=>{e.stopPropagation();onZTClick(zt);}}
                    style={{position:"absolute",left:zt.rect.x+"%",top:zt.rect.y+"%",width:zt.rect.w+"%",height:zt.rect.h+"%",border:"1.5px solid "+st.color,background:st.bg,borderRadius:2,cursor:"pointer",boxSizing:"border-box",pointerEvents:"all"}}>
                    <div style={{fontSize:9,color:st.color,fontWeight:500,padding:"1px 3px",background:"rgba(255,255,255,0.92)",borderRadius:2,display:"inline-block",maxWidth:"100%",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{idx+1}. {zt.label||"—"}</div>
                    {zt.type_blocage&&<div style={{position:"absolute",top:-8,right:-4,width:14,height:14,borderRadius:"50%",background:NC_COL.red,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"white",fontWeight:700}}>!</div>}
                  </div>
                );
              })}

              {/* Annotations */}
              {showLayers.annotations&&annotations.map(a=>(
                <div key={a.id} onClick={async e=>{e.stopPropagation();if(role==="ca"&&window.confirm("Supprimer cette note ?")){await deleteAnnotation(a.id);setAnnotations(p=>p.filter(x=>x.id!==a.id));}}}
                  style={{position:"absolute",left:a.x+"%",top:a.y+"%",transform:"translate(-50%,-50%)",pointerEvents:"all",cursor:"pointer",zIndex:10}}>
                  <div style={{background:a.couleur||NC_COL.red,color:"white",fontSize:10,padding:"3px 7px",borderRadius:5,whiteSpace:"nowrap",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",boxShadow:"0 1px 4px rgba(0,0,0,0.3)"}}>{a.texte}</div>
                </div>
              ))}

              {/* Photos */}
              {showLayers.photos&&photos.map(p=>(
                <div key={p.id} style={{position:"absolute",left:p.x+"%",top:p.y+"%",transform:"translate(-50%,-50%)",pointerEvents:"all",zIndex:10}}>
                  <div onClick={()=>window.open(p.url,"_blank")} style={{width:24,height:24,borderRadius:"50%",background:"white",border:"2px solid "+NC_COL.blue,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:12,boxShadow:"0 1px 4px rgba(0,0,0,0.3)"}}>📷</div>
                  {p.legende&&<div style={{fontSize:9,color:"white",background:"rgba(0,0,0,0.6)",padding:"2px 5px",borderRadius:3,whiteSpace:"nowrap",marginTop:2}}>{p.legende}</div>}
                </div>
              ))}

              {/* NC */}
              {showLayers.nc&&ncs.map((nc,i)=>(
                <div key={nc.id} style={{position:"absolute",left:20+i*4+"%",top:"3%",pointerEvents:"all",zIndex:10}}>
                  <div style={{background:GRAVITE_NC[nc.gravite]||NC_COL.red,color:"white",fontSize:9,padding:"2px 6px",borderRadius:4,cursor:"pointer",fontWeight:700}}>NC{nc.numero||i+1}</div>
                </div>
              ))}

              {drawRect&&drawRect.w>0&&<div style={{position:"absolute",left:drawRect.x+"%",top:drawRect.y+"%",width:drawRect.w+"%",height:drawRect.h+"%",border:"1px dashed "+NC_COL.red,background:NC_COL.redBg,borderRadius:2,pointerEvents:"none",boxSizing:"border-box"}}/>}
            </div>
          )}
        </div>
      </div>

      {/* Modal note */}
      {pendingPos&&mode==="note"&&(
        <Modal title="Ajouter une note" onClose={()=>setPendingPos(null)}>
          <Field label="Note"><textarea value={annotNote} onChange={e=>setAnnotNote(e.target.value)} rows={3} style={{...inp,resize:"vertical"}} autoFocus placeholder="Saisir la note…"/></Field>
          <div style={{display:"flex",gap:8}}><SBtn primary onClick={saveNote} style={{flex:1}}>Ajouter</SBtn><SBtn onClick={()=>setPendingPos(null)} style={{flex:1}}>Annuler</SBtn></div>
        </Modal>
      )}

      {pendingPos&&mode==="photo"&&(()=>{ setPendingPhotoPos(pendingPos); setPendingPos(null); setTimeout(()=>photoInputRef.current?.click(),100); return null; })()}
      <input ref={photoInputRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handlePhotoUpload}/>
    </div>
  );
}

// ── ZT Modal ──────────────────────────────────────────────────────────────────
function ZTModal({zt,role,equipes,activeStatuses,chantierIdForEssais,onSave,onDelete,onClose,pushToast}) {
  const [form,setForm]     = useState({...zt});
  const [tab,setTab]       = useState("statut");
  const [materiaux,setMateriaux] = useState([]);
  const [essais,setEssais] = useState([]);
  const [history,setHistory] = useState([]);
  const [newMat,setNewMat] = useState({designation:"",quantite:1,unite:"pce",reference:"",date_besoin:""});
  const [newEssai,setNewEssai] = useState({type:"debit",designation:"",valeur_prevue:"",valeur_mesuree:"",unite:"m³/h",date_mesure:TODAY,mesure_par:""});
  const [saving,setSaving] = useState(false);
  const STATUSES = Object.fromEntries(Object.entries(ALL_STATUSES).filter(([k])=>(activeStatuses||Object.keys(ALL_STATUSES)).includes(k)));

  useEffect(()=>{
    if(!zt.isNew) {
      fetchMateriaux(zt.id).then(setMateriaux).catch(()=>{});
      fetchHistory(zt.id).then(setHistory).catch(()=>{});
      if(chantierIdForEssais) fetchEssais(chantierIdForEssais).then(e=>setEssais(e.filter(x=>x.zone_travail_id===zt.id))).catch(()=>{});
    }
  },[zt.id]);

  const save = async () => { setSaving(true); try{ await onSave(form); }catch(e){ pushToast("Erreur: "+e.message,"error"); } setSaving(false); };

  const addMat = async () => {
    if(!newMat.designation.trim()) return;
    const r=await createMateriau({zone_travail_id:zt.id,...newMat});
    setMateriaux(p=>[...p,r]); setNewMat({designation:"",quantite:1,unite:"pce",reference:"",date_besoin:""}); pushToast("Ajouté");
  };

  const addEssai = async () => {
    if(!newEssai.valeur_mesuree) return;
    const ecart=newEssai.valeur_prevue?(parseFloat(newEssai.valeur_mesuree)-parseFloat(newEssai.valeur_prevue)):null;
    const conforme=ecart!==null?Math.abs(ecart/parseFloat(newEssai.valeur_prevue))<0.1:null;
    const r=await createEssai({...newEssai,zone_travail_id:zt.id,chantier_id:chantierIdForEssais,ecart,conforme,valeur_prevue:parseFloat(newEssai.valeur_prevue)||null,valeur_mesuree:parseFloat(newEssai.valeur_mesuree)});
    setEssais(p=>[...p,r]); setNewEssai({type:"debit",designation:"",valeur_prevue:"",valeur_mesuree:"",unite:"m³/h",date_mesure:TODAY,mesure_par:""}); pushToast("Mesure ajoutée");
  };

  const tabs=[{k:"statut",l:"Statut"},{k:"heures",l:"Heures"},{k:"materiaux",l:"Matériaux"+(materiaux.filter(m=>m.statut==="manquant").length>0?" ⚠":"")},{k:"essais",l:"Essais"},{k:"historique",l:"Historique"}];

  return (
    <Modal title={zt.isNew?"Nouvelle zone":"Zone de travail"} onClose={onClose} wide>
      {!zt.isNew&&(
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:14,borderBottom:"1px solid #eee",paddingBottom:8}}>
          {tabs.map(t=><button key={t.k} onClick={()=>setTab(t.k)} style={{fontSize:12,padding:"4px 10px",borderRadius:5,border:"1px solid "+(tab===t.k?NC_COL.red:"#ddd"),background:tab===t.k?NC_COL.red:"white",color:tab===t.k?"white":NC_COL.dark,cursor:"pointer"}}>{t.l}</button>)}
        </div>
      )}

      {(zt.isNew||tab==="statut")&&<>
        {role==="ca"&&<>
          <Field label="Libellé"><input value={form.label||""} onChange={e=>setForm(p=>({...p,label:e.target.value}))} placeholder="Ex: Gaine principale RDC" style={inp}/></Field>
          <Field label="Équipe assignée">
            <select value={form.equipe||""} onChange={e=>setForm(p=>({...p,equipe:e.target.value}))} style={sel_style}>
              <option value="">— Aucune —</option>
              {equipes.map(eq=><option key={eq.id} value={eq.name}>{eq.name}{eq.responsable?" ("+eq.responsable+")":""}</option>)}
            </select>
          </Field>
        </>}
        {!zt.isNew&&<>
          {(role==="monteur"||role==="chef")&&<>
            <Field label="Votre équipe">
              <select value={form.equipe||""} onChange={e=>setForm(p=>({...p,equipe:e.target.value}))} style={sel_style}>
                <option value="">— Sélectionner —</option>
                {equipes.map(eq=><option key={eq.id} value={eq.name}>{eq.name}</option>)}
              </select>
            </Field>
            <Field label="Date de pose"><input type="date" value={form.date_pose||""} onChange={e=>setForm(p=>({...p,date_pose:e.target.value}))} style={inp}/></Field>
          </>}
          {role==="ca"&&<Field label="Date de pose"><div style={{fontSize:13,color:form.date_pose?NC_COL.dark:NC_COL.gray,padding:"6px 0"}}>{form.date_pose?fmtDate(form.date_pose):"Non renseignée"}</div></Field>}
          <Field label="Statut global">
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
              {Object.entries(STATUSES).map(([k,v])=>(
                <div key={k} onClick={()=>setForm(p=>({...p,status:k}))} style={{padding:8,borderRadius:6,border:"1.5px solid "+(form.status===k?v.color:"#e0e0e0"),background:form.status===k?v.bg:"#fafafa",cursor:"pointer",fontSize:12,color:form.status===k?v.color:NC_COL.gray,textAlign:"center",fontWeight:form.status===k?700:400}}>{v.label}</div>
              ))}
            </div>
          </Field>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
            {[["statut_nappe_h","Nappe haute"],["statut_nappe_b","Nappe basse"],["statut_terminaux","Terminaux"]].map(([field,label])=>(
              <div key={field}>
                <div style={{fontSize:10,color:NC_COL.gray,marginBottom:4,fontWeight:700,textTransform:"uppercase"}}>{label}</div>
                <select value={form[field]||"todo"} onChange={e=>setForm(p=>({...p,[field]:e.target.value}))} style={{...sel_style,fontSize:11}}>
                  {Object.entries(STATUSES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            ))}
          </div>
          {form.status==="blocked"&&<>
            <Field label="Type de blocage">
              <select value={form.type_blocage||""} onChange={e=>setForm(p=>({...p,type_blocage:e.target.value}))} style={sel_style}>
                <option value="">— Sélectionner —</option>
                {Object.entries(TYPE_BLOCAGE).map(([k,v])=><option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Commentaire"><textarea value={form.comment||""} onChange={e=>setForm(p=>({...p,comment:e.target.value}))} rows={2} style={{...inp,resize:"vertical"}}/></Field>
          </>}
        </>}
        {zt.isNew&&<div style={{fontSize:12,color:NC_COL.gray,padding:"7px 10px",background:"#f8f8f8",borderRadius:6,marginBottom:10,borderLeft:"3px solid "+NC_COL.gray}}>Statut et date de pose renseignés par les monteurs.</div>}
      </>}

      {tab==="heures"&&<>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Field label="Heures prévues"><input type="number" min="0" step="0.5" value={form.heures_prevues||""} onChange={e=>setForm(p=>({...p,heures_prevues:e.target.value}))} style={inp}/></Field>
          <Field label="Heures réalisées"><input type="number" min="0" step="0.5" value={form.heures_realisees||""} onChange={e=>setForm(p=>({...p,heures_realisees:e.target.value}))} style={inp}/></Field>
          <Field label="Coût unitaire (CHF/h)"><input type="number" min="0" step="0.5" value={form.cout_unitaire||""} onChange={e=>setForm(p=>({...p,cout_unitaire:e.target.value}))} style={inp}/></Field>
        </div>
        {form.heures_prevues>0&&<div style={{padding:"10px 14px",background:"#f8f8f8",borderRadius:7,marginTop:4}}>
          <div style={{fontSize:13,color:NC_COL.dark,fontWeight:500,marginBottom:4}}>Synthèse</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {[["Budget",((form.heures_prevues||0)*(form.cout_unitaire||0)).toFixed(2)+" CHF",NC_COL.dark],["Réalisé",((form.heures_realisees||0)*(form.cout_unitaire||0)).toFixed(2)+" CHF",NC_COL.dark],["Écart",(((form.heures_realisees||0)-(form.heures_prevues||0))*(form.cout_unitaire||0)).toFixed(2)+" CHF",(form.heures_realisees||0)>(form.heures_prevues||0)?NC_COL.red:NC_COL.green]].map(([l,v,c])=>(
              <div key={l} style={{textAlign:"center"}}><div style={{fontSize:10,color:NC_COL.gray}}>{l}</div><div style={{fontSize:15,fontWeight:700,color:c}}>{v}</div></div>
            ))}
          </div>
        </div>}
      </>}

      {tab==="materiaux"&&<>
        {materiaux.map(m=>(
          <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid #f5f5f5",flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:100}}><div style={{fontSize:13,color:NC_COL.dark,fontWeight:500}}>{m.designation}</div><div style={{fontSize:11,color:NC_COL.gray}}>{m.quantite} {m.unite}{m.reference?" · "+m.reference:""}</div></div>
            <select value={m.statut} onChange={e=>updateMateriau(m.id,{statut:e.target.value}).then(r=>setMateriaux(p=>p.map(x=>x.id===r.id?r:x)))} style={{fontSize:11,padding:"3px 6px",border:"1px solid #ddd",borderRadius:5,color:m.statut==="manquant"?NC_COL.red:m.statut==="commande"?NC_COL.amber:NC_COL.green}}>
              <option value="manquant">Manquant</option><option value="commande">Commandé</option><option value="livre">Livré</option>
            </select>
            <button onClick={async()=>{await deleteMateriau(m.id);setMateriaux(p=>p.filter(x=>x.id!==m.id));}} style={{width:22,height:22,borderRadius:4,border:"1px solid #fcc",background:"#fff5f5",color:NC_COL.red,cursor:"pointer",fontSize:12,padding:0}}>×</button>
          </div>
        ))}
        {materiaux.length===0&&<Muted>Aucun matériau.</Muted>}
        <Divider/>
        <Field label="Désignation"><input value={newMat.designation} onChange={e=>setNewMat(p=>({...p,designation:e.target.value}))} placeholder="Ex: Gaine rect. 400x200" style={inp}/></Field>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <Field label="Qté"><input type="number" min="0" value={newMat.quantite} onChange={e=>setNewMat(p=>({...p,quantite:e.target.value}))} style={inp}/></Field>
          <Field label="Unité"><select value={newMat.unite} onChange={e=>setNewMat(p=>({...p,unite:e.target.value}))} style={sel_style}>{["pce","ml","m²","kg","lot"].map(u=><option key={u}>{u}</option>)}</select></Field>
          <Field label="Réf."><input value={newMat.reference} onChange={e=>setNewMat(p=>({...p,reference:e.target.value}))} style={inp}/></Field>
        </div>
        <SBtn primary onClick={addMat}>Ajouter</SBtn>
      </>}

      {tab==="essais"&&<>
        {essais.map(e=>(
          <div key={e.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid #f5f5f5",flexWrap:"wrap"}}>
            <div style={{flex:1}}><div style={{fontSize:13,color:NC_COL.dark,fontWeight:500}}>{TYPE_ESSAI[e.type]}{e.designation?" — "+e.designation:""}</div><div style={{fontSize:11,color:NC_COL.gray}}>Prévu: {e.valeur_prevue||"—"} · Mesuré: {e.valeur_mesuree} {e.unite}</div></div>
            <Badge label={e.conforme===true?"✓ Conforme":e.conforme===false?"✗ Non conforme":"—"} color={e.conforme===true?NC_COL.green:e.conforme===false?NC_COL.red:NC_COL.gray}/>
            <button onClick={async()=>{await deleteEssai(e.id);setEssais(p=>p.filter(x=>x.id!==e.id));}} style={{width:22,height:22,borderRadius:4,border:"1px solid #fcc",background:"#fff5f5",color:NC_COL.red,cursor:"pointer",fontSize:12,padding:0}}>×</button>
          </div>
        ))}
        {essais.length===0&&<Muted>Aucune mesure.</Muted>}
        <Divider/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <Field label="Type"><select value={newEssai.type} onChange={e=>setNewEssai(p=>({...p,type:e.target.value}))} style={sel_style}>{Object.entries(TYPE_ESSAI).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Désignation"><input value={newEssai.designation} onChange={e=>setNewEssai(p=>({...p,designation:e.target.value}))} style={inp}/></Field>
          <Field label="Valeur prévue"><input type="number" value={newEssai.valeur_prevue} onChange={e=>setNewEssai(p=>({...p,valeur_prevue:e.target.value}))} style={inp}/></Field>
          <Field label="Valeur mesurée"><input type="number" value={newEssai.valeur_mesuree} onChange={e=>setNewEssai(p=>({...p,valeur_mesuree:e.target.value}))} style={inp}/></Field>
          <Field label="Unité"><input value={newEssai.unite} onChange={e=>setNewEssai(p=>({...p,unite:e.target.value}))} style={inp}/></Field>
          <Field label="Date"><input type="date" value={newEssai.date_mesure} onChange={e=>setNewEssai(p=>({...p,date_mesure:e.target.value}))} style={inp}/></Field>
        </div>
        <SBtn primary onClick={addEssai}>Enregistrer</SBtn>
      </>}

      {tab==="historique"&&<>
        {history.length===0&&<Muted>Aucun historique.</Muted>}
        {history.map(h=>(
          <div key={h.id} style={{display:"flex",gap:10,padding:"6px 0",borderBottom:"1px solid #f0f0f0"}}>
            <div style={{width:30,height:30,borderRadius:5,background:NC_COL.redBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:NC_COL.red,flexShrink:0}}>{h.role==="ca"?"CA":h.role==="chef"?"CH":"MT"}</div>
            <div><div style={{fontSize:13,color:NC_COL.dark,fontWeight:500}}>{h.action}{h.detail?" — "+h.detail:""}</div><div style={{fontSize:11,color:NC_COL.gray}}>{fmtTs(h.created_at)}</div></div>
          </div>
        ))}
      </>}

      <Divider/>
      <div style={{display:"flex",gap:8}}>
        <SBtn primary onClick={save} style={{flex:1}} disabled={saving}>{saving?"…":"Enregistrer"}</SBtn>
        {!zt.isNew&&role==="ca"&&<SBtn danger onClick={()=>onDelete(zt.id)}>Supprimer</SBtn>}
        <SBtn onClick={onClose} style={{flex:1}}>Annuler</SBtn>
      </div>
    </Modal>
  );
}

// ── Gantt ─────────────────────────────────────────────────────────────────────
function GanttView({chantiers}) {
  const [selChantier,setSelChantier] = useState(chantiers[0]?.id||null);
  const [weekBase,setWeekBase]       = useState(TODAY);
  const [zones,setZones]             = useState([]);
  const [loading,setLoading]         = useState(false);
  const days      = weekDates(weekBase);
  const dayLabels = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];

  useEffect(()=>{
    if(!selChantier) return;
    setLoading(true);
    import('./supabase').then(({supabase})=>{
      supabase.from('zones_travail')
        .select('*, zones(name,niveau_id,niveaux:niveau_id(name,batiment_id,batiments:batiment_id(name,chantier_id)))')
        .order('date_pose')
        .then(({data})=>{ setZones((data||[]).filter(zt=>zt.zones?.niveaux?.batiments?.chantier_id===selChantier)); setLoading(false); });
    });
  },[selChantier,weekBase]);

  const withDates = zones.filter(z=>z.date_pose);

  return (
    <div style={{padding:14,fontFamily:"Arial,sans-serif"}}>
      <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:14}}>
        <div style={{fontSize:15,fontWeight:700,color:NC_COL.dark}}>Planning Gantt</div>
        <select value={selChantier||""} onChange={e=>setSelChantier(e.target.value)} style={{...sel_style,width:200}}>{chantiers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <button onClick={()=>{const d=new Date(days[0]);d.setDate(d.getDate()-7);setWeekBase(d.toISOString().split('T')[0]);}} style={{fontSize:12,padding:"5px 10px",borderRadius:5,border:"1px solid #ddd",background:"white",cursor:"pointer"}}>‹ Préc.</button>
        <button onClick={()=>setWeekBase(TODAY)} style={{fontSize:12,padding:"5px 10px",borderRadius:5,border:"1px solid "+NC_COL.red,color:NC_COL.red,background:"white",cursor:"pointer"}}>Aujourd'hui</button>
        <button onClick={()=>{const d=new Date(days[0]);d.setDate(d.getDate()+7);setWeekBase(d.toISOString().split('T')[0]);}} style={{fontSize:12,padding:"5px 10px",borderRadius:5,border:"1px solid #ddd",background:"white",cursor:"pointer"}}>Suiv. ›</button>
      </div>
      <div style={{background:"white",border:"1px solid #e8e8e8",borderRadius:8,overflow:"auto"}}>
        <div style={{display:"grid",gridTemplateColumns:"200px repeat(7,1fr)",borderBottom:"1px solid #eee",background:"#f8f8f8"}}>
          <div style={{padding:"8px 12px",fontSize:12,fontWeight:700,color:NC_COL.gray}}>Zone</div>
          {days.map((d,i)=>{
            const isT=d===TODAY;
            return <div key={d} style={{padding:"8px 4px",fontSize:11,textAlign:"center",fontWeight:isT?700:400,color:isT?NC_COL.red:NC_COL.gray,background:isT?NC_COL.redBg:"transparent",borderLeft:"1px solid #eee"}}>
              <div>{dayLabels[i]}</div><div style={{fontSize:13,fontWeight:700}}>{fmtDate(d).slice(0,5)}</div>
            </div>;
          })}
        </div>
        {loading&&<div style={{padding:20,textAlign:"center",color:NC_COL.gray}}>Chargement…</div>}
        {!loading&&withDates.length===0&&<div style={{padding:20,textAlign:"center",color:NC_COL.gray}}>Aucune zone avec date planifiée.</div>}
        {!loading&&withDates.map(zt=>{
          const st=ALL_STATUSES[zt.status]||ALL_STATUSES.todo;
          const path=(zt.zones?.niveaux?.name||"")+" › "+(zt.zones?.name||"");
          const late=zt.date_pose<TODAY&&zt.status!=="done";
          return <div key={zt.id} style={{display:"grid",gridTemplateColumns:"200px repeat(7,1fr)",borderBottom:"1px solid #f5f5f5",alignItems:"center"}}>
            <div style={{padding:"6px 12px",borderRight:"1px solid #eee"}}>
              <div style={{fontSize:12,fontWeight:500,color:late?NC_COL.red:NC_COL.dark,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{zt.label||"—"}</div>
              <div style={{fontSize:10,color:NC_COL.gray}}>{path}</div>
              {zt.equipe&&<div style={{fontSize:10,color:NC_COL.blue}}>{zt.equipe}</div>}
            </div>
            {days.map(d=>(
              <div key={d} style={{borderLeft:"1px solid #f0f0f0",padding:"6px 4px",textAlign:"center",background:d===TODAY?"rgba(192,57,43,0.04)":"transparent"}}>
                {zt.date_pose===d&&<div style={{background:st.color,color:"white",borderRadius:4,fontSize:10,fontWeight:700,padding:"3px 2px",margin:"0 2px"}}>{st.label}</div>}
              </div>
            ))}
          </div>;
        })}
      </div>
    </div>
  );
}

// ── Aujourd'hui ───────────────────────────────────────────────────────────────
function TodayView({role,chantiers,equipes,currentEquipe,onOpenZone,pushToast}) {
  const [date,setDate]           = useState(TODAY);
  const [items,setItems]         = useState([]);
  const [loading,setLoading]     = useState(false);
  const [selChantier,setSelChantier] = useState(chantiers[0]?.id||null);
  const [effectifs,setEffectifs] = useState([]);
  const [editEff,setEditEff]     = useState(null);

  useEffect(()=>{ if(!selChantier) return; fetchEffectifs(selChantier,date).then(setEffectifs).catch(()=>{}); },[selChantier,date]);
  useEffect(()=>{
    setLoading(true);
    fetchAllZTByDate(date).then(data=>{ setItems(data||[]); setLoading(false); }).catch(()=>{ setLoading(false); });
  },[date]);

  const getPath = zt => { try{ const z=zt.zones,n=z.niveaux,b=n.batiments,c=b.chantiers; return c.name+" › "+b.name+" › "+n.name+" › "+z.name; }catch{ return "—"; } };
  const byEquipe = {};
  items.forEach(zt=>{ const eq=zt.equipe||"Non assigné"; if(!byEquipe[eq]) byEquipe[eq]=[]; byEquipe[eq].push(zt); });
  const totalPrevus   = effectifs.reduce((s,e)=>s+e.monteurs_prevus,0);
  const totalPresents = effectifs.reduce((s,e)=>s+e.monteurs_presents,0);

  const saveEff = async(eqId,prevus,presents) => {
    try{ await upsertEffectif({chantier_id:selChantier,date,equipe_id:eqId,monteurs_prevus:parseInt(prevus)||0,monteurs_presents:parseInt(presents)||0}); fetchEffectifs(selChantier,date).then(setEffectifs); pushToast("Effectif mis à jour"); }
    catch(e){ pushToast("Erreur: "+e.message,"error"); }
    setEditEff(null);
  };

  return (
    <div style={{padding:14,fontFamily:"Arial,sans-serif"}}>
      <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:14}}>
        <div style={{fontSize:15,fontWeight:700,color:NC_COL.dark}}>Aujourd'hui</div>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{fontSize:13,padding:"4px 8px",borderRadius:6,border:"1px solid #ddd"}}/>
        <button onClick={()=>setDate(TODAY)} style={{fontSize:12,padding:"4px 10px",borderRadius:5,border:"1px solid "+NC_COL.red,background:NC_COL.redBg,color:NC_COL.red,cursor:"pointer"}}>Aujourd'hui</button>
        {chantiers.length>1&&<select value={selChantier||""} onChange={e=>setSelChantier(e.target.value)} style={{...sel_style,width:180}}>{chantiers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>}
      </div>

      <SCard title="Effectifs du jour" accent={NC_COL.dark} action={
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <Badge label={totalPresents+"/"+totalPrevus+" monteurs"} color={totalPresents<totalPrevus?NC_COL.red:NC_COL.green} bg={totalPresents<totalPrevus?NC_COL.redBg:NC_COL.greenBg}/>
          {(role==="ca"||role==="chef")&&<SBtn small primary onClick={()=>setEditEff({equipe_id:"",monteurs_prevus:0,monteurs_presents:0})}>+ Équipe</SBtn>}
        </div>
      }>
        {effectifs.length===0&&<Muted>Aucun effectif renseigné.</Muted>}
        {effectifs.map(e=>{
          const eq=equipes.find(x=>x.id===e.equipe_id);
          return <div key={e.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid #f5f5f5",flexWrap:"wrap"}}>
            {eq&&<div style={{width:10,height:10,borderRadius:2,background:eq.couleur,flexShrink:0}}/>}
            <span style={{flex:1,fontSize:13,color:NC_COL.dark,fontWeight:500}}>{eq?.name||"Équipe inconnue"}</span>
            <span style={{fontSize:12,color:e.monteurs_presents>=e.monteurs_prevus?NC_COL.green:NC_COL.red,fontWeight:500}}>{e.monteurs_presents}/{e.monteurs_prevus} présents</span>
            {(role==="ca"||role==="chef")&&<button onClick={()=>setEditEff({...e})} style={{fontSize:11,padding:"3px 8px",borderRadius:5,border:"1px solid #ddd",background:"white",cursor:"pointer"}}>✎</button>}
          </div>;
        })}
      </SCard>

      {loading&&<Muted>Chargement…</Muted>}
      {!loading&&items.length===0&&<Muted>Aucune zone prévue pour cette date.</Muted>}
      {!loading&&Object.entries(byEquipe).map(([eq,zts])=>{
        const eqObj=equipes.find(e=>e.name===eq);
        return (
          <SCard key={eq} title={eq+" ("+zts.length+" zone"+(zts.length>1?"s":"")+")"} accent={eqObj?.couleur||NC_COL.dark}>
            {zts.map(zt=>(
              <div key={zt.id} onClick={()=>onOpenZone&&onOpenZone(zt)}
                style={{background:"#fafafa",border:"1px solid "+(zt.status==="blocked"?"#fcc":"#eee"),borderLeft:"3px solid "+ALL_STATUSES[zt.status].color,borderRadius:7,padding:"9px 12px",marginBottom:6,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:NC_COL.dark}}>{zt.label||"—"}</div>
                  <div style={{fontSize:11,color:NC_COL.gray}}>{getPath(zt)}</div>
                  {zt.status==="blocked"&&zt.type_blocage&&<div style={{fontSize:11,color:NC_COL.red,marginTop:2}}>⚠ {TYPE_BLOCAGE[zt.type_blocage]}</div>}
                  {zt.heures_prevues>0&&<div style={{fontSize:11,color:NC_COL.gray}}>⏱ {zt.heures_realisees||0}h / {zt.heures_prevues}h</div>}
                </div>
                <Badge label={ALL_STATUSES[zt.status].label} color={ALL_STATUSES[zt.status].color} bg={ALL_STATUSES[zt.status].bg}/>
              </div>
            ))}
          </SCard>
        );
      })}

      {editEff&&(
        <Modal title="Effectif équipe" onClose={()=>setEditEff(null)}>
          <Field label="Équipe">
            <select value={editEff.equipe_id||""} onChange={e=>setEditEff(p=>({...p,equipe_id:e.target.value}))} style={sel_style}>
              <option value="">— Sélectionner —</option>
              {equipes.map(eq=><option key={eq.id} value={eq.id}>{eq.name}</option>)}
            </select>
          </Field>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <Field label="Prévus"><input type="number" min="0" value={editEff.monteurs_prevus} onChange={e=>setEditEff(p=>({...p,monteurs_prevus:e.target.value}))} style={inp}/></Field>
            <Field label="Présents"><input type="number" min="0" value={editEff.monteurs_presents} onChange={e=>setEditEff(p=>({...p,monteurs_presents:e.target.value}))} style={inp}/></Field>
          </div>
          <div style={{display:"flex",gap:8}}>
            <SBtn primary onClick={()=>saveEff(editEff.equipe_id,editEff.monteurs_prevus,editEff.monteurs_presents)} style={{flex:1}}>Enregistrer</SBtn>
            <SBtn onClick={()=>setEditEff(null)} style={{flex:1}}>Annuler</SBtn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── NC View ───────────────────────────────────────────────────────────────────
function NCView({chantiers,equipes,pushToast}) {
  const [selChantier,setSelChantier] = useState(chantiers[0]?.id||null);
  const [ncs,setNcs]     = useState([]);
  const [loading,setLoading] = useState(false);
  const [editNC,setEditNC]   = useState(null);

  useEffect(()=>{
    if(!selChantier) return;
    setLoading(true);
    fetchAllNCs(selChantier).then(d=>{ setNcs(d); setLoading(false); }).catch(()=>setLoading(false));
  },[selChantier]);

  const stats = {ouverte:ncs.filter(n=>n.statut==="ouverte").length,en_cours:ncs.filter(n=>n.statut==="en_cours").length,levee:ncs.filter(n=>n.statut==="levee").length,validee:ncs.filter(n=>n.statut==="validee").length};

  return (
    <div style={{padding:14,fontFamily:"Arial,sans-serif"}}>
      <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:14}}>
        <div style={{fontSize:15,fontWeight:700,color:NC_COL.dark}}>Non-conformités</div>
        {chantiers.length>1&&<select value={selChantier||""} onChange={e=>setSelChantier(e.target.value)} style={{...sel_style,width:200}}>{chantiers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}>
        {[["Ouvertes",stats.ouverte,NC_COL.red],["En cours",stats.en_cours,NC_COL.amber],["Levées",stats.levee,NC_COL.blue],["Validées",stats.validee,NC_COL.green]].map(([l,v,c])=>(
          <div key={l} style={{background:"white",border:"1px solid #e8e8e8",borderRadius:8,padding:"10px 12px",borderTop:"3px solid "+c}}>
            <div style={{fontSize:11,color:NC_COL.gray}}>{l}</div><div style={{fontSize:20,fontWeight:700,color:c}}>{v}</div>
          </div>
        ))}
      </div>
      {loading&&<Muted>Chargement…</Muted>}
      {!loading&&ncs.length===0&&<Muted>Aucune non-conformité.</Muted>}
      {ncs.map(nc=>(
        <div key={nc.id} style={{background:"white",border:"1px solid "+GRAVITE_NC[nc.gravite],borderLeft:"4px solid "+GRAVITE_NC[nc.gravite],borderRadius:8,padding:"10px 14px",marginBottom:8,cursor:"pointer"}} onClick={()=>setEditNC({...nc})}>
          <div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:NC_COL.dark}}>NC{nc.numero} — {nc.titre}</div>
              {nc.description&&<div style={{fontSize:12,color:NC_COL.gray,marginTop:2}}>{nc.description}</div>}
              <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap"}}>
                <Badge label={nc.gravite} color={GRAVITE_NC[nc.gravite]} bg={"rgba(0,0,0,0.05)"}/>
                {nc.equipes&&<Badge label={nc.equipes.name}/>}
                {nc.date_echeance&&<Badge label={"Échéance: "+fmtDate(nc.date_echeance)} color={NC_COL.gray} bg={"#f5f5f5"}/>}
              </div>
            </div>
            <Badge label={nc.statut.replace("_"," ")} color={STATUT_NC[nc.statut]} bg={"rgba(0,0,0,0.05)"}/>
          </div>
        </div>
      ))}
      {editNC&&(
        <Modal title={"NC"+editNC.numero+" — "+editNC.titre} onClose={()=>setEditNC(null)} wide>
          <Field label="Titre"><input value={editNC.titre} onChange={e=>setEditNC(p=>({...p,titre:e.target.value}))} style={inp}/></Field>
          <Field label="Description"><textarea value={editNC.description||""} onChange={e=>setEditNC(p=>({...p,description:e.target.value}))} rows={2} style={{...inp,resize:"vertical"}}/></Field>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <Field label="Gravité"><select value={editNC.gravite} onChange={e=>setEditNC(p=>({...p,gravite:e.target.value}))} style={sel_style}>{["mineure","majeure","bloquante"].map(g=><option key={g}>{g}</option>)}</select></Field>
            <Field label="Statut"><select value={editNC.statut} onChange={e=>setEditNC(p=>({...p,statut:e.target.value}))} style={sel_style}>{Object.keys(STATUT_NC).map(s=><option key={s} value={s}>{s.replace("_"," ")}</option>)}</select></Field>
            <Field label="Équipe"><select value={editNC.assignee_equipe_id||""} onChange={e=>setEditNC(p=>({...p,assignee_equipe_id:e.target.value}))} style={sel_style}><option value="">— Aucune —</option>{equipes.map(eq=><option key={eq.id} value={eq.id}>{eq.name}</option>)}</select></Field>
            <Field label="Échéance"><input type="date" value={editNC.date_echeance||""} onChange={e=>setEditNC(p=>({...p,date_echeance:e.target.value}))} style={inp}/></Field>
          </div>
          {(editNC.statut==="levee"||editNC.statut==="validee")&&<Field label="Date de levée"><input type="date" value={editNC.date_levee||""} onChange={e=>setEditNC(p=>({...p,date_levee:e.target.value}))} style={inp}/></Field>}
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <SBtn primary onClick={async()=>{ const r=await updateNC(editNC.id,editNC); setNcs(p=>p.map(x=>x.id===r.id?{...r,equipes:equipes.find(e=>e.id===r.assignee_equipe_id)||null}:x)); setEditNC(null); pushToast("NC mise à jour"); }} style={{flex:1}}>Enregistrer</SBtn>
            <SBtn danger onClick={async()=>{ if(!window.confirm("Supprimer ?"))return; await deleteNC(editNC.id); setNcs(p=>p.filter(x=>x.id!==editNC.id)); setEditNC(null); pushToast("Supprimée"); }}>Supprimer</SBtn>
            <SBtn onClick={()=>setEditNC(null)} style={{flex:1}}>Annuler</SBtn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({allZT,batiments,activeStatuses,equipes}) {
  const STATUSES = Object.fromEntries(Object.entries(ALL_STATUSES).filter(([k])=>(activeStatuses||Object.keys(ALL_STATUSES)).includes(k)));
  const cnt = {}; Object.keys(STATUSES).forEach(k=>{ cnt[k]=allZT.filter(x=>x.status===k).length; });
  const blocked = allZT.filter(x=>x.status==="blocked");
  const pct = (a,b) => b===0?0:Math.round(a/b*100);
  const totalHP = allZT.reduce((s,z)=>s+(parseFloat(z.heures_prevues)||0),0);
  const totalHR = allZT.reduce((s,z)=>s+(parseFloat(z.heures_realisees)||0),0);
  const totalCP = allZT.reduce((s,z)=>s+((parseFloat(z.heures_prevues)||0)*(parseFloat(z.cout_unitaire)||0)),0);
  const totalCR = allZT.reduce((s,z)=>s+((parseFloat(z.heures_realisees)||0)*(parseFloat(z.cout_unitaire)||0)),0);
  const byBat = {};
  batiments.forEach(b=>{ const bzt=allZT.filter(x=>x.batiment_id===b.id); byBat[b.name]={total:bzt.length,done:bzt.filter(x=>x.status==="done").length,blocked:bzt.filter(x=>x.status==="blocked").length,hP:bzt.reduce((s,z)=>s+(parseFloat(z.heures_prevues)||0),0),hR:bzt.reduce((s,z)=>s+(parseFloat(z.heures_realisees)||0),0)}; });
  const byDate = {}; allZT.forEach(zt=>{ const d=zt.date_pose||"Sans date"; if(!byDate[d])byDate[d]={}; byDate[d][zt.status]=(byDate[d][zt.status]||0)+1; });
  const dates = Object.keys(byDate).sort();
  const byEq = {}; allZT.forEach(zt=>{ const eq=zt.equipe||"Non assigné"; if(!byEq[eq])byEq[eq]={total:0,done:0,blocked:0,hP:0,hR:0}; byEq[eq].total++; if(zt.status==="done")byEq[eq].done++; if(zt.status==="blocked")byEq[eq].blocked++; byEq[eq].hP+=(parseFloat(zt.heures_prevues)||0); byEq[eq].hR+=(parseFloat(zt.heures_realisees)||0); });

  return (
    <div style={{padding:14,fontFamily:"Arial,sans-serif"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(85px,1fr))",gap:7,marginBottom:14}}>
        <div style={{background:"white",border:"1px solid #e8e8e8",borderRadius:8,padding:"10px 12px",borderTop:"3px solid "+NC_COL.dark}}><div style={{fontSize:10,color:NC_COL.gray}}>Total</div><div style={{fontSize:20,fontWeight:700,color:NC_COL.dark}}>{allZT.length}</div></div>
        {Object.entries(STATUSES).map(([k,v])=>(
          <div key={k} style={{background:"white",border:"1px solid #e8e8e8",borderRadius:8,padding:"10px 12px",borderTop:"3px solid "+v.color}}><div style={{fontSize:10,color:NC_COL.gray}}>{v.label}</div><div style={{fontSize:20,fontWeight:700,color:v.color}}>{cnt[k]||0}</div></div>
        ))}
      </div>
      <SCard title="Tableau financier" accent={NC_COL.dark}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10}}>
          {[["Heures prévues",totalHP.toFixed(1)+"h",NC_COL.dark],["Heures réalisées",totalHR.toFixed(1)+"h",totalHR>totalHP?NC_COL.red:NC_COL.green],["Budget prévu",totalCP.toFixed(0)+" CHF",NC_COL.dark],["Coût réalisé",totalCR.toFixed(0)+" CHF",totalCR>totalCP?NC_COL.red:NC_COL.green],["Écart",(totalCR-totalCP).toFixed(0)+" CHF",totalCR>totalCP?NC_COL.red:NC_COL.green]].map(([l,v,c])=>(
            <div key={l} style={{background:"#f8f8f8",borderRadius:7,padding:10,textAlign:"center"}}><div style={{fontSize:11,color:NC_COL.gray,marginBottom:3}}>{l}</div><div style={{fontSize:15,fontWeight:700,color:c}}>{v}</div></div>
          ))}
        </div>
      </SCard>
      <SCard title="Avancement par bâtiment">
        {Object.keys(byBat).length===0?<Muted>Aucune donnée.</Muted>:Object.entries(byBat).map(([name,s])=>(
          <div key={name} style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
              <span style={{color:NC_COL.dark,fontWeight:500}}>{name}</span>
              <span style={{color:NC_COL.gray,fontSize:12}}>{s.done}/{s.total} ({pct(s.done,s.total)}%)</span>
            </div>
            <div style={{height:8,borderRadius:4,background:"#f0f0f0",overflow:"hidden"}}><div style={{height:"100%",width:pct(s.done,s.total)+"%",background:NC_COL.green,borderRadius:4}}/></div>
            {s.blocked>0&&<div style={{fontSize:11,color:NC_COL.red,marginTop:2}}>{s.blocked} bloquée{s.blocked>1?"s":""}</div>}
          </div>
        ))}
      </SCard>
      <SCard title="Planning par date de pose">
        {dates.length===0?<Muted>Aucune date.</Muted>:(
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:"#f8f8f8"}}>
                <th style={{textAlign:"left",padding:"5px 8px",color:NC_COL.gray,fontWeight:400,borderBottom:"1px solid #eee"}}>Date</th>
                {Object.entries(STATUSES).map(([k,v])=><th key={k} style={{padding:"5px 5px",color:v.color,fontWeight:500,borderBottom:"1px solid #eee",whiteSpace:"nowrap",fontSize:11}}>{v.label}</th>)}
                <th style={{padding:"5px 8px",color:NC_COL.dark,fontWeight:500,borderBottom:"1px solid #eee"}}>Total</th>
              </tr></thead>
              <tbody>{dates.map((d,i)=>{ const row=byDate[d],tot=Object.values(row).reduce((a,b)=>a+b,0); return(
                <tr key={d} style={{background:i%2===0?"#fafafa":"white"}}>
                  <td style={{padding:"5px 8px",color:NC_COL.dark,whiteSpace:"nowrap",fontWeight:500}}>{fmtDate(d==="Sans date"?null:d)}</td>
                  {Object.keys(STATUSES).map(k=><td key={k} style={{padding:"5px 5px",textAlign:"center",color:row[k]?STATUSES[k].color:"#ddd"}}>{row[k]||"—"}</td>)}
                  <td style={{padding:"5px 8px",textAlign:"center",fontWeight:700,color:NC_COL.dark}}>{tot}</td>
                </tr>
              );})}
              </tbody>
            </table>
          </div>
        )}
      </SCard>
      <SCard title="Performance par équipe">
        {Object.keys(byEq).length===0?<Muted>Aucune équipe.</Muted>:Object.entries(byEq).map(([eq,s])=>{
          const eqObj=equipes.find(e=>e.name===eq);
          return <div key={eq} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #f0f0f0",flexWrap:"wrap"}}>
            <div style={{width:32,height:32,borderRadius:6,background:eqObj?.couleur||NC_COL.redBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"white",flexShrink:0}}>{eq.slice(0,2).toUpperCase()}</div>
            <div style={{flex:1,minWidth:80}}><div style={{fontSize:13,color:NC_COL.dark,fontWeight:500}}>{eq}</div><div style={{fontSize:11,color:NC_COL.gray}}>{s.total} zones · {s.hR.toFixed(1)}h/{s.hP.toFixed(1)}h</div></div>
            <div style={{display:"flex",alignItems:"center",gap:6,flex:2,minWidth:120}}>
              <div style={{flex:1,height:7,borderRadius:4,background:"#f0f0f0",overflow:"hidden"}}><div style={{height:"100%",width:pct(s.done,s.total)+"%",background:NC_COL.green}}/></div>
              <span style={{fontSize:12,color:NC_COL.gray,minWidth:32}}>{pct(s.done,s.total)}%</span>
            </div>
            {s.blocked>0&&<Badge label={s.blocked+" bloqué"+(s.blocked>1?"s":"")} color={NC_COL.red} bg={NC_COL.redBg}/>}
          </div>;
        })}
      </SCard>
      <SCard title={"Zones bloquées"+(blocked.length>0?" ("+blocked.length+")":"  — aucune")} accent={blocked.length>0?NC_COL.red:NC_COL.gray}>
        {blocked.length===0?<Muted>Aucune.</Muted>:blocked.map(zt=>(
          <div key={zt.id} style={{padding:"8px 0",borderBottom:"1px solid #f5f5f5"}}>
            <div style={{fontSize:13,fontWeight:500,color:NC_COL.red}}>{zt.label||"—"}{zt.type_blocage?" · "+TYPE_BLOCAGE[zt.type_blocage]:""}</div>
            {zt.comment&&<div style={{fontSize:12,color:NC_COL.gray,fontStyle:"italic"}}>« {zt.comment} »</div>}
          </div>
        ))}
      </SCard>
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────
function SettingsView({pushToast,onSettingsChange}) {
  const [tab,setTab]               = useState("equipes");
  const [equipes,setEquipes]       = useState([]);
  const [users,setUsers]           = useState([]);
  const [pins,setPins]             = useState({ca:"1234",chef:"5678",monteur:"9999"});
  const [entreprise,setEntreprise] = useState({nom:"Neoclima Sàrl",adresse:"",email:"",telephone:"",site:"",ide:""});
  const [prefs,setPrefs]           = useState({vue_defaut:"today"});
  const [statutsActifs,setStatutsActifs] = useState(Object.keys(ALL_STATUSES));
  const [saving,setSaving]         = useState(false);
  const [newEq,setNewEq]           = useState({name:"",responsable:"",couleur:EQUIPE_COLORS[0]});
  const [editEq,setEditEq]         = useState(null);
  const [newUser,setNewUser]       = useState({nom:"",role:"monteur",equipe_id:"",pin:""});
  const [editUser,setEditUser]     = useState(null);

  useEffect(()=>{
    fetchAllEquipes().then(setEquipes).catch(()=>{});
    fetchUtilisateurs().then(setUsers).catch(()=>{});
    fetchParametre('pins').then(v=>{if(v)setPins(v);}).catch(()=>{});
    fetchParametre('entreprise').then(v=>{if(v)setEntreprise(v);}).catch(()=>{});
    fetchParametre('preferences').then(v=>{if(v)setPrefs(v);}).catch(()=>{});
    fetchParametre('statuts_actifs').then(v=>{if(v)setStatutsActifs(v);}).catch(()=>{});
  },[]);

  const saveParam = async(key,value,label) => {
    setSaving(true);
    try{ await setParametre(key,value); pushToast(label+" sauvegardés"); onSettingsChange&&onSettingsChange(key,value); }
    catch(err){ pushToast("Erreur: "+err.message,"error"); }
    setSaving(false);
  };

  const tabs=[{k:"equipes",l:"Équipes"},{k:"pins",l:"Codes PIN"},{k:"statuts",l:"Statuts"},{k:"entreprise",l:"Entreprise"},{k:"utilisateurs",l:"Utilisateurs"},{k:"preferences",l:"Préférences"}];

  return (
    <div style={{padding:16,fontFamily:"Arial,sans-serif",maxWidth:780,margin:"0 auto"}}>
      <div style={{fontSize:16,fontWeight:700,color:NC_COL.dark,marginBottom:16}}>Paramètres</div>
      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:18,borderBottom:"1px solid #e8e8e8",paddingBottom:8}}>
        {tabs.map(t=><button key={t.k} onClick={()=>setTab(t.k)} style={{fontSize:12,padding:"5px 12px",borderRadius:5,border:"1px solid "+(tab===t.k?NC_COL.red:"#ddd"),background:tab===t.k?NC_COL.red:"white",color:tab===t.k?"white":NC_COL.dark,cursor:"pointer",fontWeight:tab===t.k?700:400}}>{t.l}</button>)}
      </div>

      {tab==="equipes"&&<SCard title={"Équipes ("+equipes.length+"/20)"}>
        {equipes.map(eq=>(
          <div key={eq.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #f5f5f5",flexWrap:"wrap"}}>
            <div style={{width:14,height:14,borderRadius:3,background:eq.couleur,flexShrink:0}}/>
            <div style={{flex:1,minWidth:100}}><div style={{fontSize:13,color:NC_COL.dark,fontWeight:500}}>{eq.name}</div>{eq.responsable&&<div style={{fontSize:11,color:NC_COL.gray}}>Resp. : {eq.responsable}</div>}</div>
            <Badge label={eq.actif?"Active":"Inactive"} color={eq.actif?NC_COL.green:NC_COL.gray} bg={eq.actif?NC_COL.greenBg:"#f5f5f5"}/>
            <SBtn small onClick={()=>setEditEq({...eq})}>Modifier</SBtn>
            <button onClick={async()=>{if(!window.confirm("Supprimer "+eq.name+" ?"))return;await deleteEquipe(eq.id);setEquipes(p=>p.filter(x=>x.id!==eq.id));pushToast("Supprimée");}} style={{width:22,height:22,borderRadius:4,border:"1px solid #fcc",background:"#fff5f5",color:NC_COL.red,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>×</button>
          </div>
        ))}
        {equipes.length===0&&<Muted>Aucune équipe.</Muted>}
        {equipes.length<20&&<>
          <Divider/>
          <div style={{fontSize:12,fontWeight:700,color:NC_COL.dark,marginBottom:8}}>Nouvelle équipe</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <Field label="Nom"><input value={newEq.name} onChange={e=>setNewEq(p=>({...p,name:e.target.value}))} style={inp}/></Field>
            <Field label="Responsable"><input value={newEq.responsable} onChange={e=>setNewEq(p=>({...p,responsable:e.target.value}))} style={inp}/></Field>
          </div>
          <Field label="Couleur"><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{EQUIPE_COLORS.map(c=><div key={c} onClick={()=>setNewEq(p=>({...p,couleur:c}))} style={{width:24,height:24,borderRadius:4,background:c,cursor:"pointer",border:newEq.couleur===c?"3px solid "+NC_COL.dark:"2px solid transparent"}}/>)}</div></Field>
          <SBtn primary onClick={async()=>{if(!newEq.name.trim())return;const r=await createEquipe({...newEq,ordre:equipes.length});setEquipes(p=>[...p,r]);setNewEq({name:"",responsable:"",couleur:EQUIPE_COLORS[0]});pushToast("Créée");}} disabled={saving}>Créer</SBtn>
        </>}
      </SCard>}

      {tab==="pins"&&<SCard title="Codes PIN" accent={NC_COL.dark}>
        <div style={{fontSize:12,color:NC_COL.gray,marginBottom:14,padding:"8px 12px",background:"#f8f8f8",borderRadius:6,borderLeft:"3px solid "+NC_COL.amber}}>⚠️ Ne partagez les codes PIN qu'avec les personnes concernées.</div>
        {Object.entries(ROLE_LABELS).map(([r,l])=>(
          <div key={r} style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
            <div style={{width:10,height:10,borderRadius:"50%",background:ROLE_COLORS[r],flexShrink:0}}/>
            <div style={{flex:1,fontSize:13,color:NC_COL.dark,fontWeight:500}}>{l}</div>
            <input type="password" value={pins[r]||""} onChange={e=>setPins(p=>({...p,[r]:e.target.value}))} placeholder="••••" maxLength={8} style={{width:100,fontSize:16,textAlign:"center",letterSpacing:4,padding:"4px 8px",border:"1px solid #ddd",borderRadius:6,boxSizing:"border-box"}}/>
          </div>
        ))}
        <SBtn primary onClick={()=>saveParam('pins',pins,"PIN")} disabled={saving} style={{marginTop:8}}>Enregistrer</SBtn>
      </SCard>}

      {tab==="statuts"&&<SCard title="Statuts actifs" accent={NC_COL.purple}>
        {Object.entries(ALL_STATUSES).map(([k,v])=>(
          <div key={k} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 0",borderBottom:"1px solid #f5f5f5"}}>
            <div style={{width:12,height:12,borderRadius:2,background:v.color,flexShrink:0}}/>
            <div style={{flex:1,fontSize:13,color:NC_COL.dark}}>{v.label}</div>
            <div onClick={()=>{const next=statutsActifs.includes(k)?statutsActifs.filter(s=>s!==k):[...statutsActifs,k];setStatutsActifs(next);}} style={{width:42,height:24,borderRadius:12,background:statutsActifs.includes(k)?NC_COL.green:"#ccc",cursor:"pointer",position:"relative"}}>
              <div style={{width:18,height:18,borderRadius:"50%",background:"white",position:"absolute",top:3,left:statutsActifs.includes(k)?21:3,transition:"left 0.2s"}}/>
            </div>
          </div>
        ))}
        <SBtn primary onClick={()=>saveParam('statuts_actifs',statutsActifs,"Statuts")} disabled={saving} style={{marginTop:12}}>Enregistrer</SBtn>
      </SCard>}

      {tab==="entreprise"&&<SCard title="Informations entreprise" accent={NC_COL.dark}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Field label="Raison sociale"><input value={entreprise.nom||""} onChange={e=>setEntreprise(p=>({...p,nom:e.target.value}))} style={inp}/></Field>
          <Field label="Adresse"><input value={entreprise.adresse||""} onChange={e=>setEntreprise(p=>({...p,adresse:e.target.value}))} style={inp}/></Field>
          <Field label="E-mail"><input type="email" value={entreprise.email||""} onChange={e=>setEntreprise(p=>({...p,email:e.target.value}))} style={inp}/></Field>
          <Field label="Téléphone"><input value={entreprise.telephone||""} onChange={e=>setEntreprise(p=>({...p,telephone:e.target.value}))} style={inp}/></Field>
          <Field label="Site web"><input value={entreprise.site||""} onChange={e=>setEntreprise(p=>({...p,site:e.target.value}))} placeholder="https://…" style={inp}/></Field>
          <Field label="Numéro IDE" hint="CHE-123.456.789"><input value={entreprise.ide||""} onChange={e=>setEntreprise(p=>({...p,ide:e.target.value}))} placeholder="CHE-000.000.000" style={inp}/></Field>
        </div>
        <SBtn primary onClick={()=>saveParam('entreprise',entreprise,"Informations")} disabled={saving} style={{marginTop:4}}>Enregistrer</SBtn>
      </SCard>}

      {tab==="utilisateurs"&&<SCard title={"Utilisateurs ("+users.length+")"} accent={NC_COL.dark}>
        {users.map(u=>(
          <div key={u.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #f5f5f5",flexWrap:"wrap"}}>
            <div style={{width:34,height:34,borderRadius:6,background:ROLE_COLORS[u.role]||NC_COL.gray,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"white",flexShrink:0}}>{u.nom.slice(0,2).toUpperCase()}</div>
            <div style={{flex:1,minWidth:100}}><div style={{fontSize:13,color:NC_COL.dark,fontWeight:500}}>{u.nom}</div><div style={{fontSize:11,color:NC_COL.gray}}>{ROLE_LABELS[u.role]||u.role}{u.equipes?" · "+u.equipes.name:""}</div></div>
            <Badge label={u.actif?"Actif":"Inactif"} color={u.actif?NC_COL.green:NC_COL.gray} bg={u.actif?NC_COL.greenBg:"#f5f5f5"}/>
            <SBtn small onClick={()=>setEditUser({...u})}>Modifier</SBtn>
            <button onClick={async()=>{if(!window.confirm("Supprimer "+u.nom+" ?"))return;await deleteUtilisateur(u.id);setUsers(p=>p.filter(x=>x.id!==u.id));pushToast("Supprimé");}} style={{width:22,height:22,borderRadius:4,border:"1px solid #fcc",background:"#fff5f5",color:NC_COL.red,cursor:"pointer",fontSize:12,padding:0}}>×</button>
          </div>
        ))}
        {users.length===0&&<Muted>Aucun utilisateur.</Muted>}
        <Divider/>
        <div style={{fontSize:12,fontWeight:700,color:NC_COL.dark,marginBottom:8}}>Nouvel utilisateur</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <Field label="Nom"><input value={newUser.nom} onChange={e=>setNewUser(p=>({...p,nom:e.target.value}))} placeholder="Jean-Pierre Müller" style={inp}/></Field>
          <Field label="Rôle"><select value={newUser.role} onChange={e=>setNewUser(p=>({...p,role:e.target.value}))} style={sel_style}>{Object.entries(ROLE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Équipe"><select value={newUser.equipe_id} onChange={e=>setNewUser(p=>({...p,equipe_id:e.target.value}))} style={sel_style}><option value="">— Aucune —</option>{equipes.map(eq=><option key={eq.id} value={eq.id}>{eq.name}</option>)}</select></Field>
          <Field label="PIN personnel"><input type="password" value={newUser.pin} onChange={e=>setNewUser(p=>({...p,pin:e.target.value}))} placeholder="••••" maxLength={8} style={inp}/></Field>
        </div>
        <SBtn primary onClick={async()=>{ if(!newUser.nom.trim())return; const r=await createUtilisateur({nom:newUser.nom,role:newUser.role,equipe_id:newUser.equipe_id||null,pin:newUser.pin||null,actif:true}); const withEq={...r,equipes:equipes.find(e=>e.id===r.equipe_id)||null}; setUsers(p=>[...p,withEq]); setNewUser({nom:"",role:"monteur",equipe_id:"",pin:""}); pushToast("Créé"); }} disabled={saving}>Créer</SBtn>
      </SCard>}

      {tab==="preferences"&&<SCard title="Préférences" accent={NC_COL.dark}>
        <Field label="Vue par défaut">
          <select value={prefs.vue_defaut||"today"} onChange={e=>setPrefs(p=>({...p,vue_defaut:e.target.value}))} style={sel_style}>
            <option value="today">Aujourd'hui</option><option value="nav">Plans</option><option value="dashboard">Dashboard</option>
          </select>
        </Field>
        <SBtn primary onClick={()=>saveParam('preferences',prefs,"Préférences")} disabled={saving}>Enregistrer</SBtn>
      </SCard>}

      {editEq&&<Modal title="Modifier l'équipe" onClose={()=>setEditEq(null)}>
        <Field label="Nom"><input value={editEq.name} onChange={e=>setEditEq(p=>({...p,name:e.target.value}))} style={inp}/></Field>
        <Field label="Responsable"><input value={editEq.responsable||""} onChange={e=>setEditEq(p=>({...p,responsable:e.target.value}))} style={inp}/></Field>
        <Field label="Couleur"><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{EQUIPE_COLORS.map(c=><div key={c} onClick={()=>setEditEq(p=>({...p,couleur:c}))} style={{width:24,height:24,borderRadius:4,background:c,cursor:"pointer",border:editEq.couleur===c?"3px solid "+NC_COL.dark:"2px solid transparent"}}/>)}</div></Field>
        <Field label="Statut"><div style={{display:"flex",gap:8}}>{[true,false].map(v=><div key={String(v)} onClick={()=>setEditEq(p=>({...p,actif:v}))} style={{flex:1,padding:8,borderRadius:6,border:"1.5px solid "+(editEq.actif===v?(v?NC_COL.green:NC_COL.red):"#e0e0e0"),background:editEq.actif===v?(v?NC_COL.greenBg:NC_COL.redBg):"#fafafa",cursor:"pointer",fontSize:12,color:editEq.actif===v?(v?NC_COL.green:NC_COL.red):NC_COL.gray,textAlign:"center",fontWeight:editEq.actif===v?700:400}}>{v?"Active":"Inactive"}</div>)}</div></Field>
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <SBtn primary onClick={async()=>{ const r=await updateEquipe(editEq.id,{name:editEq.name,responsable:editEq.responsable,couleur:editEq.couleur,actif:editEq.actif}); setEquipes(p=>p.map(x=>x.id===r.id?r:x)); setEditEq(null); pushToast("Mise à jour"); }} style={{flex:1}}>Enregistrer</SBtn>
          <SBtn onClick={()=>setEditEq(null)} style={{flex:1}}>Annuler</SBtn>
        </div>
      </Modal>}

      {editUser&&<Modal title="Modifier l'utilisateur" onClose={()=>setEditUser(null)}>
        <Field label="Nom"><input value={editUser.nom} onChange={e=>setEditUser(p=>({...p,nom:e.target.value}))} style={inp}/></Field>
        <Field label="Rôle"><select value={editUser.role} onChange={e=>setEditUser(p=>({...p,role:e.target.value}))} style={sel_style}>{Object.entries(ROLE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Équipe"><select value={editUser.equipe_id||""} onChange={e=>setEditUser(p=>({...p,equipe_id:e.target.value}))} style={sel_style}><option value="">— Aucune —</option>{equipes.map(eq=><option key={eq.id} value={eq.id}>{eq.name}</option>)}</select></Field>
        <Field label="PIN personnel"><input type="password" value={editUser.pin||""} onChange={e=>setEditUser(p=>({...p,pin:e.target.value}))} placeholder="••••" maxLength={8} style={inp}/></Field>
        <Field label="Statut"><div style={{display:"flex",gap:8}}>{[true,false].map(v=><div key={String(v)} onClick={()=>setEditUser(p=>({...p,actif:v}))} style={{flex:1,padding:8,borderRadius:6,border:"1.5px solid "+(editUser.actif===v?(v?NC_COL.green:NC_COL.red):"#e0e0e0"),background:editUser.actif===v?(v?NC_COL.greenBg:NC_COL.redBg):"#fafafa",cursor:"pointer",fontSize:12,color:editUser.actif===v?(v?NC_COL.green:NC_COL.red):NC_COL.gray,textAlign:"center",fontWeight:editUser.actif===v?700:400}}>{v?"Actif":"Inactif"}</div>)}</div></Field>
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <SBtn primary onClick={async()=>{ const r=await updateUtilisateur(editUser.id,{nom:editUser.nom,role:editUser.role,equipe_id:editUser.equipe_id||null,pin:editUser.pin||null,actif:editUser.actif}); const withEq={...r,equipes:equipes.find(e=>e.id===r.equipe_id)||null}; setUsers(p=>p.map(x=>x.id===r.id?withEq:x)); setEditUser(null); pushToast("Mis à jour"); }} style={{flex:1}}>Enregistrer</SBtn>
          <SBtn onClick={()=>setEditUser(null)} style={{flex:1}}>Annuler</SBtn>
        </div>
      </Modal>}
    </div>
  );
}

// ── Login ─────────────────────────────────────────────────────────────────────
function LoginScreen({onLogin,equipes}) {
  const [selRole,setSelRole]   = useState(null);
  const [selEquipe,setSelEquipe] = useState("");
  const [pin,setPin]           = useState("");
  const [err,setErr]           = useState("");
  const [pins,setPins]         = useState({ca:"1234",chef:"5678",monteur:"9999"});
  useEffect(()=>{ fetchParametre('pins').then(v=>{if(v)setPins(v);}).catch(()=>{}); },[]);
  const tryLogin = () => { if(pin===pins[selRole]) onLogin(selRole,selRole==="monteur"?selEquipe:null); else{ setErr("Code PIN incorrect."); setPin(""); } };

  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#f4f4f4",padding:16,fontFamily:"Arial,sans-serif"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:36}}>
        <div style={{width:40,height:40,borderRadius:8,background:NC_COL.red,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <svg width="22" height="22" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="1" fill="white" opacity="0.95"/><rect x="9" y="2" width="5" height="5" rx="1" fill="white" opacity="0.55"/><rect x="2" y="9" width="5" height="5" rx="1" fill="white" opacity="0.55"/><rect x="9" y="9" width="5" height="5" rx="1" fill="white" opacity="0.95"/></svg>
        </div>
        <div><div style={{fontSize:18,fontWeight:700,color:NC_COL.dark}}>NEOCLIMA</div><div style={{fontSize:11,color:NC_COL.gray,letterSpacing:1}}>FIELD TRACKER</div></div>
      </div>
      {!selRole ? (
        <div style={{width:"100%",maxWidth:320}}>
          <div style={{fontSize:13,color:NC_COL.gray,marginBottom:14,textAlign:"center"}}>Sélectionnez votre rôle</div>
          {Object.entries(ROLE_LABELS).map(([k,v])=>(
            <button key={k} onClick={()=>setSelRole(k)} style={{width:"100%",padding:"13px 18px",borderRadius:8,border:"1px solid #ddd",background:"white",cursor:"pointer",fontSize:14,color:NC_COL.dark,display:"flex",alignItems:"center",gap:12,marginBottom:8,fontFamily:"Arial,sans-serif"}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:ROLE_COLORS[k]}}/>{v}
            </button>
          ))}
        </div>
      ) : (
        <div style={{width:"100%",maxWidth:300,background:"white",borderRadius:10,border:"1px solid #ddd",padding:24}}>
          <button onClick={()=>{setSelRole(null);setPin("");setErr("");setSelEquipe("");}} style={{fontSize:12,color:NC_COL.gray,background:"none",border:"none",cursor:"pointer",padding:0,marginBottom:18}}>← Retour</button>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20}}>
            <div style={{width:10,height:10,borderRadius:"50%",background:ROLE_COLORS[selRole]}}/>
            <span style={{fontSize:15,fontWeight:700,color:NC_COL.dark}}>{ROLE_LABELS[selRole]}</span>
          </div>
          {selRole==="monteur"&&equipes.length>0&&(
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,color:NC_COL.gray,marginBottom:5,fontWeight:700,textTransform:"uppercase"}}>Votre équipe</div>
              <select value={selEquipe} onChange={e=>setSelEquipe(e.target.value)} style={{...sel_style,fontSize:14,padding:"8px 10px"}}>
                <option value="">— Sélectionner mon équipe —</option>
                {equipes.map(eq=><option key={eq.id} value={eq.name}>{eq.name}{eq.responsable?" ("+eq.responsable+")":""}</option>)}
              </select>
            </div>
          )}
          <div style={{fontSize:12,color:NC_COL.gray,marginBottom:6}}>Code PIN</div>
          <input type="password" inputMode="numeric" maxLength={8} value={pin} onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&tryLogin()} autoFocus placeholder="••••"
            style={{width:"100%",fontSize:24,letterSpacing:10,textAlign:"center",marginBottom:10,boxSizing:"border-box",border:"1.5px solid "+(err?NC_COL.red:"#ddd"),borderRadius:7,padding:"8px 0",outline:"none"}}/>
          {err&&<div style={{fontSize:12,color:NC_COL.red,marginBottom:8}}>{err}</div>}
          <button onClick={tryLogin} style={{width:"100%",padding:10,borderRadius:8,border:"none",background:NC_COL.red,color:"white",cursor:"pointer",fontSize:14,fontWeight:700}}>Connexion</button>
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [role,setRole]               = useState(null);
  const [currentEquipe,setCurrentEquipe] = useState(null);
  const [view,setView]               = useState("today");
  const [chantiers,setChantiers]     = useState([]);
  const [batiments,setBatiments]     = useState([]);
  const [niveaux,setNiveaux]         = useState([]);
  const [zones,setZones]             = useState([]);
  const [currentZone,setCurrentZone] = useState(null);
  const [allZT,setAllZT]             = useState([]);
  const [equipes,setEquipes]         = useState([]);
  const [activeStatuses,setActiveStatuses] = useState(Object.keys(ALL_STATUSES));
  const [sel,setSel]                 = useState({chantier:null,batiment:null,niveau:null,zone:null});
  const [loading,setLoading]         = useState({});
  const [editZT,setEditZT]           = useState(null);
  const [addingWhat,setAddingWhat]   = useState(null);
  const [newName,setNewName]         = useState("");
  const [saving,setSaving]           = useState(false);
  const [editingItem,setEditingItem] = useState(null);
  const [editingName,setEditingName] = useState("");
  const fileInputRef = useRef(null);
  const realtimeSub  = useRef(null);
  const {toasts,push:pushToast} = useToast();

  useEffect(()=>{ fetchEquipes().then(setEquipes).catch(()=>{}); fetchParametre('statuts_actifs').then(v=>{if(v)setActiveStatuses(v);}).catch(()=>{}); },[]);
  useEffect(()=>{ if(!role)return; setLoading(l=>({...l,chantiers:true})); fetchChantiers().then(d=>{setChantiers(d);setLoading(l=>({...l,chantiers:false}));}).catch(()=>pushToast("Erreur","error")); },[role]);
  useEffect(()=>{ if(!sel.chantier){setBatiments([]);return;} setLoading(l=>({...l,batiments:true})); fetchBatiments(sel.chantier).then(d=>{setBatiments(d);setLoading(l=>({...l,batiments:false}));}); },[sel.chantier]);
  useEffect(()=>{ if(!sel.batiment){setNiveaux([]);return;} setLoading(l=>({...l,niveaux:true})); fetchNiveaux(sel.batiment).then(d=>{setNiveaux(d);setLoading(l=>({...l,niveaux:false}));}); },[sel.batiment]);
  useEffect(()=>{ if(!sel.niveau){setZones([]);return;} setLoading(l=>({...l,zones:true})); fetchZones(sel.niveau).then(d=>{setZones(d);setLoading(l=>({...l,zones:false}));}); },[sel.niveau]);
  useEffect(()=>{
    if(!sel.zone){setCurrentZone(null);setAllZT([]);return;}
    const z=zones.find(x=>x.id===sel.zone);
    setCurrentZone(z?{...z,zones_travail:[]}:null);
    fetchZonesTravail(sel.zone).then(zt=>{setAllZT(zt);setCurrentZone(prev=>prev?{...prev,zones_travail:zt}:null);});
    if(realtimeSub.current)realtimeSub.current.unsubscribe();
    realtimeSub.current=subscribeZonesTravail(sel.zone,()=>{fetchZonesTravail(sel.zone).then(zt=>{setAllZT(zt);setCurrentZone(prev=>prev?{...prev,zones_travail:zt}:null);});});
    return()=>{if(realtimeSub.current)realtimeSub.current.unsubscribe();};
  },[sel.zone]);

  const openZone  = zid => { setSel(s=>({...s,zone:zid})); setView("plan"); };
  const backToNav = ()  => { setSel(s=>({...s,zone:null})); setView("nav"); };
  const goToNav   = ()  => { setSel(s=>({...s,zone:null})); setView("nav"); };

  const handlePlanUpload = async e => {
    const file=e.target.files[0]; if(!file||!sel.zone)return;
    setSaving(true);
    try{ const res=await uploadPlan(sel.zone,file); setCurrentZone(prev=>prev?{...prev,...res}:null); setZones(prev=>prev.map(z=>z.id===sel.zone?{...z,...res}:z)); pushToast("Plan importé"); }
    catch(err){ pushToast("Erreur: "+err.message,"error"); }
    setSaving(false); e.target.value="";
  };

  const saveZT = async form => {
    if(form.isNew){
      const zt=await createZoneTravail(sel.zone,{label:form.label,equipe:form.equipe||currentEquipe||"",rect:form.rect,status:"todo",comment:"",date_pose:null,heures_prevues:0,heures_realisees:0,cout_unitaire:0});
      setAllZT(p=>[...p,zt]); setCurrentZone(prev=>prev?{...prev,zones_travail:[...prev.zones_travail,zt]}:null);
      await addHistory(zt.id,role,"Création",form.label||""); pushToast("Zone créée");
    } else {
      const payload={label:form.label,equipe:form.equipe,status:form.status,comment:form.comment,date_pose:form.date_pose||null,heures_prevues:parseFloat(form.heures_prevues)||0,heures_realisees:parseFloat(form.heures_realisees)||0,cout_unitaire:parseFloat(form.cout_unitaire)||0,type_blocage:form.type_blocage||null,statut_nappe_h:form.statut_nappe_h||"todo",statut_nappe_b:form.statut_nappe_b||"todo",statut_terminaux:form.statut_terminaux||"todo"};
      const updated=await updateZoneTravail(form.id,payload);
      setAllZT(p=>p.map(x=>x.id===updated.id?updated:x)); setCurrentZone(prev=>prev?{...prev,zones_travail:prev.zones_travail.map(x=>x.id===updated.id?updated:x)}:null);
      if(form._origStatus!==updated.status) await addHistory(updated.id,role,"Statut",form._origStatus+" → "+updated.status);
      else await addHistory(updated.id,role,"Modification","");
      pushToast("Zone mise à jour");
    }
    setEditZT(null);
  };

  const deleteZT = async id => {
    await deleteZoneTravail(id);
    setAllZT(p=>p.filter(x=>x.id!==id)); setCurrentZone(prev=>prev?{...prev,zones_travail:prev.zones_travail.filter(x=>x.id!==id)}:null);
    pushToast("Supprimée"); setEditZT(null);
  };

  const addItem = async () => {
    const name=newName.trim(); if(!name)return; setSaving(true);
    try{
      if(addingWhat==="chantier"){ const r=await createChantier(name); setChantiers(p=>[...p,r]); }
      if(addingWhat==="batiment"){ const r=await createBatiment(sel.chantier,name); setBatiments(p=>[...p,r]); }
      if(addingWhat==="niveau"){   const r=await createNiveau(sel.batiment,name);   setNiveaux(p=>[...p,r]); }
      if(addingWhat==="zone"){     const r=await createZone(sel.niveau,name);       setZones(p=>[...p,r]); }
      pushToast("Créé");
    }catch(err){ pushToast("Erreur: "+err.message,"error"); }
    setSaving(false); setAddingWhat(null); setNewName("");
  };

  const handleEdit   = (type,item) => { setEditingItem({type,item}); setEditingName(item.name); };
  const handleRename = async () => {
    const name=editingName.trim(); if(!name||!editingItem)return; setSaving(true);
    try{
      const{type,item}=editingItem;
      if(type==="chantier"){ await updateChantier(item.id,name); setChantiers(p=>p.map(x=>x.id===item.id?{...x,name}:x)); }
      if(type==="batiment"){ await updateBatiment(item.id,name); setBatiments(p=>p.map(x=>x.id===item.id?{...x,name}:x)); }
      if(type==="niveau"){   await updateNiveau(item.id,name);   setNiveaux(p=>p.map(x=>x.id===item.id?{...x,name}:x)); }
      if(type==="zone"){     await updateZone(item.id,name);     setZones(p=>p.map(x=>x.id===item.id?{...x,name}:x)); if(currentZone?.id===item.id)setCurrentZone(z=>({...z,name})); }
      pushToast("Renommé");
    }catch(err){ pushToast("Erreur: "+err.message,"error"); }
    setSaving(false); setEditingItem(null); setEditingName("");
  };
  const handleDelete = async (type,item) => {
    if(!window.confirm("Supprimer « "+item.name+" » ?"))return; setSaving(true);
    try{
      if(type==="chantier"){ await deleteChantier(item.id); setChantiers(p=>p.filter(x=>x.id!==item.id)); setSel({chantier:null,batiment:null,niveau:null,zone:null}); }
      if(type==="batiment"){ await deleteBatiment(item.id); setBatiments(p=>p.filter(x=>x.id!==item.id)); setSel(s=>({...s,batiment:null,niveau:null,zone:null})); }
      if(type==="niveau"){   await deleteNiveau(item.id);   setNiveaux(p=>p.filter(x=>x.id!==item.id));   setSel(s=>({...s,niveau:null,zone:null})); }
      if(type==="zone"){     await deleteZone(item.id);     setZones(p=>p.filter(x=>x.id!==item.id));     setSel(s=>({...s,zone:null})); setView("nav"); }
      pushToast("Supprimé");
    }catch(err){ pushToast("Erreur: "+err.message,"error"); }
    setSaving(false);
  };

  const canEdit = role==="ca";
  if(!role) return <LoginScreen onLogin={(r,eq)=>{ setRole(r); setCurrentEquipe(eq); }} equipes={equipes}/>;

  const VIEWS = role==="monteur"
    ? [["today","Aujourd'hui"],["nav","Plans"]]
    : role==="chef"
    ? [["today","Aujourd'hui"],["nav","Plans"],["gantt","Gantt"],["nc","NC"],["dashboard","Dashboard"]]
    : [["today","Aujourd'hui"],["nav","Plans"],["gantt","Gantt"],["nc","NC"],["dashboard","Dashboard"],["settings","⚙"]];

  const nbtn = active => ({fontSize:12,padding:"5px 11px",borderRadius:5,border:"1px solid "+(active?NC_COL.red:"#ddd"),background:active?NC_COL.red:"white",color:active?"white":NC_COL.dark,cursor:"pointer",fontFamily:"Arial,sans-serif",fontWeight:active?700:400});

  return (
    <div style={{minHeight:"100vh",background:"#f4f4f4",fontFamily:"Arial,sans-serif",display:"flex",flexDirection:"column"}}>
      {/* Header */}
      <div style={{background:"white",borderBottom:"2px solid "+NC_COL.red,padding:"9px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:28,height:28,borderRadius:6,background:NC_COL.red,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="1" fill="white" opacity="0.95"/><rect x="9" y="2" width="5" height="5" rx="1" fill="white" opacity="0.55"/><rect x="2" y="9" width="5" height="5" rx="1" fill="white" opacity="0.55"/><rect x="9" y="9" width="5" height="5" rx="1" fill="white" opacity="0.95"/></svg>
          </div>
          <div><div style={{fontSize:13,fontWeight:700,color:NC_COL.dark}}>NEOCLIMA</div><div style={{fontSize:9,color:NC_COL.gray,letterSpacing:1}}>FIELD TRACKER</div></div>
          <div style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:NC_COL.redBg,color:NC_COL.red,border:"1px solid rgba(192,57,43,0.2)",marginLeft:4}}>{ROLE_LABELS[role]}</div>
          {currentEquipe&&<div style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:"#f0f0f0",color:NC_COL.dark}}>{currentEquipe}</div>}
          {saving&&<div style={{fontSize:11,color:NC_COL.gray}}>Sauvegarde…</div>}
        </div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {VIEWS.map(([v,l])=><button key={v} onClick={()=>{ if(v!=="plan")setSel(s=>({...s,zone:null})); setView(v); }} style={nbtn(view===v)}>{l}</button>)}
          <button onClick={()=>setRole(null)} style={{fontSize:12,padding:"5px 10px",borderRadius:5,border:"1px solid "+NC_COL.dark,background:NC_COL.dark,color:"white",cursor:"pointer"}}>Déco.</button>
        </div>
      </div>

      {view==="today"     && <TodayView role={role} chantiers={chantiers} equipes={equipes} currentEquipe={currentEquipe} pushToast={pushToast} onOpenZone={zt=>{ if(zt.zone_id){ setSel(s=>({...s,zone:zt.zone_id})); setView("plan"); }}}/>}
      {view==="gantt"     && <GanttView chantiers={chantiers}/>}
      {view==="nc"        && <NCView chantiers={chantiers} equipes={equipes} pushToast={pushToast}/>}
      {view==="dashboard" && <Dashboard allZT={allZT} batiments={batiments} activeStatuses={activeStatuses} equipes={equipes}/>}
      {view==="settings"  && <SettingsView pushToast={pushToast} onSettingsChange={(key,val)=>{ if(key==="statuts_actifs")setActiveStatuses(val); if(key==="equipes")fetchEquipes().then(setEquipes); }}/>}

      {view==="nav" && (
        <div style={{padding:14,flex:1}}>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <NavCol title="Chantiers" items={chantiers} selId={sel.chantier} loading={loading.chantiers} onSel={id=>setSel({chantier:id,batiment:null,niveau:null,zone:null})} canAdd={canEdit} onAdd={()=>setAddingWhat("chantier")} onEdit={item=>handleEdit("chantier",item)} onDelete={item=>handleDelete("chantier",item)}/>
            {sel.chantier&&<NavCol title="Bâtiments" items={batiments} selId={sel.batiment} loading={loading.batiments} onSel={id=>setSel(s=>({...s,batiment:id,niveau:null,zone:null}))} canAdd={canEdit} onAdd={()=>setAddingWhat("batiment")} onEdit={item=>handleEdit("batiment",item)} onDelete={item=>handleDelete("batiment",item)}/>}
            {sel.batiment&&<NavCol title="Niveaux" items={niveaux} selId={sel.niveau} loading={loading.niveaux} onSel={id=>setSel(s=>({...s,niveau:id,zone:null}))} canAdd={canEdit} onAdd={()=>setAddingWhat("niveau")} onEdit={item=>handleEdit("niveau",item)} onDelete={item=>handleDelete("niveau",item)}/>}
            {sel.niveau&&<NavCol title="Zones" items={zones} selId={sel.zone} loading={loading.zones} onSel={id=>openZone(id)} canAdd={canEdit} onAdd={()=>setAddingWhat("zone")} onEdit={item=>handleEdit("zone",item)} onDelete={item=>handleDelete("zone",item)} badge={z=>z.zones_travail_count||null}/>}
          </div>
          {!sel.chantier&&<div style={{fontSize:13,color:NC_COL.gray,marginTop:16}}>Sélectionnez un chantier pour commencer.</div>}
        </div>
      )}

      {view==="plan" && currentZone && (
        <div style={{padding:12,flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
            <button onClick={backToNav} style={{fontSize:12,padding:"4px 10px",borderRadius:5,border:"1px solid #ddd",background:"white",color:NC_COL.dark,cursor:"pointer"}}>← Retour</button>
            <span style={{fontSize:13,fontWeight:700,color:NC_COL.dark}}>{currentZone.name}</span>
            {currentZone.plan_pages>1&&<span style={{fontSize:11,color:NC_COL.gray,background:"#f0f0f0",padding:"2px 7px",borderRadius:4}}>{currentZone.plan_pages} pages</span>}
            {canEdit&&<button onClick={()=>fileInputRef.current?.click()} style={{fontSize:12,padding:"4px 12px",borderRadius:5,border:"1px solid "+NC_COL.red,background:NC_COL.red,color:"white",cursor:"pointer",marginLeft:"auto",fontWeight:500}}>{currentZone.plan_url?"Changer le plan":"Importer un plan PDF"}</button>}
            <input ref={fileInputRef} type="file" accept="application/pdf,image/*" style={{display:"none"}} onChange={handlePlanUpload}/>
          </div>
          <PlanViewer zone={currentZone} role={role} activeStatuses={activeStatuses} equipes={equipes} pushToast={pushToast}
            onZTClick={zt=>setEditZT({...zt,isNew:false,_origStatus:zt.status})}
            onNewZT={rect=>canEdit&&setEditZT({isNew:true,rect,label:"",equipe:currentEquipe||"",status:"todo",comment:""})}/>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
            {Object.entries(ALL_STATUSES).filter(([k])=>activeStatuses.includes(k)).map(([k,v])=>(
              <div key={k} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:NC_COL.gray}}>
                <div style={{width:9,height:9,borderRadius:2,background:v.color}}/>{v.label}
              </div>
            ))}
          </div>
          <div style={{marginTop:10,padding:"8px 12px",background:"#fffbe6",border:"1px solid #ffe58f",borderRadius:6,fontSize:12,color:"#7d6200"}}>
            ⚠️ Les plans importés doivent être vérifiés régulièrement afin de s'assurer qu'ils sont à jour.
          </div>
        </div>
      )}
      {view==="plan" && !currentZone && (
        <div style={{padding:24,textAlign:"center"}}>
          <Muted>Aucune zone sélectionnée.</Muted>
          <button onClick={goToNav} style={{marginTop:12,fontSize:13,padding:"8px 16px",borderRadius:6,border:"1px solid "+NC_COL.red,background:NC_COL.red,color:"white",cursor:"pointer"}}>← Navigation</button>
        </div>
      )}

      {addingWhat&&<Modal title={"Nouveau "+(addingWhat==="chantier"?"chantier":addingWhat==="batiment"?"bâtiment":addingWhat==="niveau"?"niveau":"zone")} onClose={()=>{setAddingWhat(null);setNewName("");}}>
        <input autoFocus value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addItem()} placeholder="Nom…" style={{...inp,marginBottom:12}}/>
        <div style={{display:"flex",gap:8}}><SBtn primary onClick={addItem} style={{flex:1}} disabled={saving}>{saving?"…":"Créer"}</SBtn><SBtn onClick={()=>{setAddingWhat(null);setNewName("");}} style={{flex:1}}>Annuler</SBtn></div>
      </Modal>}

      {editingItem&&<Modal title={"Renommer — "+editingItem.item.name} onClose={()=>setEditingItem(null)}>
        <Field label="Nouveau nom"><input autoFocus value={editingName} onChange={e=>setEditingName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleRename()} style={inp}/></Field>
        <div style={{display:"flex",gap:8}}><SBtn primary onClick={handleRename} style={{flex:1}} disabled={saving}>{saving?"…":"Renommer"}</SBtn><SBtn onClick={()=>setEditingItem(null)} style={{flex:1}}>Annuler</SBtn></div>
      </Modal>}

      {editZT&&<ZTModal zt={editZT} role={role} equipes={equipes} activeStatuses={activeStatuses} chantierIdForEssais={sel.chantier} onSave={saveZT} onDelete={deleteZT} onClose={()=>setEditZT(null)} pushToast={pushToast}/>}

      <Toast toasts={toasts}/>
      <div style={{textAlign:"center",padding:"16px 0 10px",fontSize:11,color:"#bbb",borderTop:"1px solid #e8e8e8",marginTop:"auto",fontFamily:"Arial,sans-serif"}}>
        © {new Date().getFullYear()} Propriété de <strong style={{color:NC_COL.gray}}>Neoclima Sàrl</strong> — Tous droits réservés
      </div>
    </div>
  );
}
