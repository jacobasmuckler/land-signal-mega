'use client';

import { useEffect, useRef, useState } from 'react';

// 19 target counties
const LAYERS = [
  { id:'roads', name:'Public roads', note:'OpenStreetMap', color:'#9FB4AF', type:'tile',
    url:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', opacity:.55 },
  { id:'water', name:'Water & hydrology', note:'USGS NHD', color:'#4FA8C5', type:'esri',
    url:'https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/export' },
  { id:'flood', name:'FEMA floodplains', note:'FEMA NFHL', color:'#7B6FD6', type:'esri',
    url:'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/export' },
  { id:'topo', name:'Topography / contours', note:'USGS 3DEP', color:'#C7A867', type:'tile',
    url:'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', opacity:.7 },
];

const MILES_TO_M = 1609.34, HARD_CAP = 3000;

declare global { interface Window { L: any; SOURCES: any[]; } }

export default function FinderPage() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const parcelLayerRef = useRef<any>(null);
  const overlayLayers = useRef<Record<string, any>>({});
  const centerMarker = useRef<any>(null);
  const circle = useRef<any>(null);

  const [ready, setReady] = useState(false);
  const [city, setCity] = useState('Gastonia, NC');
  const [radius, setRadius] = useState(10);
  const [minAcres, setMinAcres] = useState(20);
  const [maxAcres, setMaxAcres] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [statusMsg, setStatusMsg] = useState('Search a city or jump to a county to begin.');
  const [busy, setBusy] = useState(false);
  const [activeLayers, setActiveLayers] = useState<string[]>([]);

  // load Leaflet + sources, init map
  useEffect(() => {
    let cancelled = false;
    function addScript(src: string){ return new Promise<void>((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=()=>res();s.onerror=()=>rej();document.head.appendChild(s);}); }
    function addCss(href: string){ const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.appendChild(l); }
    (async () => {
      try {
        addCss('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css');
        if (!window.L) await addScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js');
        if (!window.SOURCES) await addScript('/sources.js');
        if (cancelled || !mapEl.current) return;
        const L = window.L;
        const map = L.map(mapEl.current, { zoomControl: true }).setView([35.35,-81.0], 8);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
          { attribution:'© OpenStreetMap © CARTO', subdomains:'abcd', maxZoom:19 }).addTo(map);
        const pl = L.geoJSON(null, {
          style:{ color:'#E8B04B', weight:1.4, fillColor:'#E8B04B', fillOpacity:.12 },
          onEachFeature:(f:any,l:any)=> l.bindPopup(popupHtml(f.properties)),
        }).addTo(map);
        mapRef.current = map; parcelLayerRef.current = pl;
        setReady(true);
      } catch { setStatusMsg('Map failed to load — check your connection.'); }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── GIS engine (ported from verified land-finder) ──
  function srcAcre(s:any,a:number){ if(s.acreageUnit==='sqft')return a*43560; if(s.acreageUnit==='sqm')return a/0.00024710538146717; return a; }
  function normAcre(s:any,v:any){ const r=Number(v); if(r==null||isNaN(r))return null; if(s.acreageUnit==='sqft')return r/43560; if(s.acreageUnit==='sqm')return r*0.00024710538146717; return r; }
  function bbox(lon:number,lat:number,mi:number){ const la=mi/69,co=Math.cos(lat*Math.PI/180)||1e-6,lo=mi/(69*co); return {xmin:lon-lo,ymin:lat-la,xmax:lon+lo,ymax:lat+la}; }
  function ringArea(r:any[]){ const R=6378137; let a=0; for(let i=0;i<r.length;i++){const[x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length]; a+=(x2-x1)*Math.PI/180*(2+Math.sin(y1*Math.PI/180)+Math.sin(y2*Math.PI/180));} return Math.abs(a*R*R/2); }
  function polyAcres(rings:any[]){ if(!rings||!rings.length)return null; return ringArea(rings[0])/4046.8564224; }
  function hav(la1:number,lo1:number,la2:number,lo2:number){ const R=3958.8,dLa=(la2-la1)*Math.PI/180,dLo=(lo2-lo1)*Math.PI/180,a=Math.sin(dLa/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2; return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)); }
  function centroid(rings:any[]){ const r=rings[0]; let x=0,y=0; for(const[lo,la]of r){x+=lo;y+=la;} return [y/r.length,x/r.length]; }
  function normPlace(v:any){ return String(v||'').toLowerCase().replace(/\b(county|parish|borough|census area|municipality|city and borough)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim(); }
  function srcForState(st:string){ if(!st)return[]; const n=st.trim().toLowerCase(); return (window.SOURCES||[]).filter((s:any)=>s.state.toLowerCase()===n); }
  function srcMatch(s:any,geo:any){ if(!s||!geo)return false; if(s.coverage==='statewide'||s.coverage==='near-statewide'){return !(s.excludedCounties||[]).map(normPlace).includes(normPlace(geo.county));} const cs=(s.counties||s.countyNames||[]).map(normPlace); if(cs.length)return cs.includes(normPlace(geo.county)); return s.coverage!=='county-only'; }
  function srcForLoc(geo:any){ return srcForState(geo.state).filter((s:any)=>srcMatch(s,geo)); }

  async function fetchJson(url:string){
    const r = await fetch(url, { headers:{ Accept:'application/json' } });
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  }
  async function geocode(q:string){
    const url='https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=us&limit=1&q='+encodeURIComponent(q);
    const d=await fetchJson(url);
    if(!Array.isArray(d)||!d.length)return null;
    const r=d[0];
    return { lat:+r.lat, lon:+r.lon, state:(r.address&&(r.address.state||r.address.territory))||null, county:r.address&&r.address.county||null, label:r.display_name };
  }
  function buildUrl(s:any,lon:number,lat:number,mi:number,minA:number,maxA:number|null,opt:any={}){
    const base=s.serviceUrl.replace(/\/$/,'')+'/'+s.layerId+'/query',p=new URLSearchParams(),w:string[]=[];
    if(s.acreageField&&!s.acreageIsCalculated){ if(minA>0)w.push(`${s.acreageField} >= ${srcAcre(s,minA)}`); if(maxA!=null)w.push(`${s.acreageField} <= ${srcAcre(s,maxA)}`); }
    p.set('where',w.length?w.join(' AND '):'1=1');
    if(s.spatialMode==='envelope'){ const b=bbox(lon,lat,mi); p.set('geometry',`${b.xmin},${b.ymin},${b.xmax},${b.ymax}`); p.set('geometryType','esriGeometryEnvelope'); p.set('inSR','4326'); }
    else { p.set('geometry',`${lon},${lat}`); p.set('geometryType','esriGeometryPoint'); p.set('inSR','4326'); p.set('distance',String(mi*MILES_TO_M)); p.set('units','esriSRUnit_Meter'); }
    p.set('spatialRel','esriSpatialRelIntersects'); p.set('outSR','4326'); p.set('f','json');
    if(opt.countOnly){ p.set('returnCountOnly','true'); p.set('returnGeometry','false'); }
    else { p.set('outFields','*'); p.set('returnGeometry','true'); p.set('resultRecordCount',String(opt.pageSize||s.maxRecordCount||1000)); if(opt.offset)p.set('resultOffset',String(opt.offset)); }
    return base+'?'+p.toString();
  }
  function normalize(f:any,s:any,c:any){
    const a=f.attributes||{}, g=f.geometry&&f.geometry.rings?{type:'Polygon',coordinates:f.geometry.rings}:null;
    if(!g)return null;
    let ac=s.acreageField?normAcre(s,a[s.acreageField]):null;
    if((ac==null||isNaN(ac)||ac===0)&&(s.acreageIsCalculated!==false||s.calculateAcreageIfMissing)){const cc=polyAcres(g.coordinates);if(cc!=null)ac=cc;}
    const [clat,clon]=centroid(g.coordinates);
    return { __id:`${s.stateAbbr}-${a[s.idField]||a.OBJECTID||Math.random()}`, acres:ac!=null&&!isNaN(ac)?ac:null,
      owner:s.ownerField?a[s.ownerField]:null, address:s.addressField?a[s.addressField]:null, parcel:s.parcelField?a[s.parcelField]:null,
      zoning:a.ZONING||a.zoning||a.ZONE||a.Zone_Code||null, sourceLabel:s.label||s.state,
      distance:hav(c.lat,c.lon,clat,clon), center:[clat,clon], geojson:g };
  }
  async function querySource(s:any,geo:any,mi:number,minA:number,maxA:number|null){
    let total=null;
    try{ const cr=await fetchJson(buildUrl(s,geo.lon,geo.lat,mi,minA,maxA,{countOnly:true})); total=typeof cr.count==='number'?cr.count:null; }catch{}
    const ps=Math.min(s.maxRecordCount||1000,1000),feats:any[]=[]; let off=0;
    while(true){ const d=await fetchJson(buildUrl(s,geo.lon,geo.lat,mi,minA,maxA,{pageSize:ps,offset:off})); if(d.error)throw new Error(d.error.message||'server error'); const b=d.features||[]; feats.push(...b); off+=b.length; const more=d.exceededTransferLimit||(total!=null&&off<total); if(!b.length||!more)break; if(feats.length>=HARD_CAP)break; }
    return feats;
  }

  function popupHtml(p:any){
    const skip=`https://www.google.com/search?q=`+encodeURIComponent((p.owner||'')+' '+(p.address||''));
    return `<div style="font-family:monospace;font-size:12px;line-height:1.7;min-width:180px">
      ${p.acres!=null?`<b style="color:#E8B04B">${p.acres.toFixed(2)} acres</b><br>`:''}
      ${p.address?p.address+'<br>':''}${p.owner?'Owner: '+p.owner+'<br>':''}
      ${p.zoning?'Zoning: '+p.zoning+'<br>':''}${p.parcel?'Parcel: '+p.parcel+'<br>':''}
      ${p.distance!=null?p.distance.toFixed(1)+' mi from center<br>':''}
      <small style="color:#6E8A86">${p.sourceLabel}</small><br>
      ${p.owner?`<a href="${skip}" target="_blank">Look up owner →</a>`:''}</div>`;
  }

  async function runSearch(){
    if(!ready)return;
    const L=window.L, map=mapRef.current, pl=parcelLayerRef.current;
    setBusy(true); setResults([]); pl.clearLayers();
    if(centerMarker.current){map.removeLayer(centerMarker.current);centerMarker.current=null;}
    if(circle.current){map.removeLayer(circle.current);circle.current=null;}
    try{
      const mi=radius, minA=minAcres||0, maxA=maxAcres?parseFloat(maxAcres):null;
      setStatusMsg('Locating place…');
      const geo=await geocode(city);
      if(!geo){ setStatusMsg('Couldn\u2019t find that U.S. place. Try adding a state, e.g. "Shelby, NC".'); setBusy(false); return; }
      centerMarker.current=L.marker([geo.lat,geo.lon]).addTo(map);
      circle.current=L.circle([geo.lat,geo.lon],{radius:mi*MILES_TO_M,color:'#6FD6E0',weight:1,fillColor:'#6FD6E0',fillOpacity:.05}).addTo(map);
      map.setView([geo.lat,geo.lon],11);
      const sources=srcForLoc(geo);
      if(!sources.length){ setStatusMsg(`Found ${geo.label.split(',')[0]}, but no free parcel source covers ${geo.county||geo.state||'that area'} yet. NC is statewide; in SC, York & Greenville are wired — Lancaster, Chester & Spartanburg need a source added.`); setBusy(false); return; }
      setStatusMsg(`Searching ${sources.length} source(s) near ${geo.label.split(',')[0]}…`);
      const all:any[]=[], warn:string[]=[];
      for(const s of sources){
        try{
          const feats=await querySource(s,geo,mi,minA,maxA);
          for(const f of feats){ const n=normalize(f,s,geo); if(!n)continue; if(n.distance>mi)continue; if(n.acres!=null){ if(n.acres<minA)continue; if(maxA!=null&&n.acres>maxA)continue; } all.push(n); }
        }catch(e:any){ warn.push(`${s.label||s.state}: ${e.message}`); }
      }
      for(const p of all) pl.addData({ type:'Feature', geometry:p.geojson, properties:p });
      setResults(all);
      if(all.length){ try{ map.fitBounds(L.featureGroup([pl,circle.current]).getBounds(),{padding:[40,40]}); }catch{} setStatusMsg(`Found ${all.length} parcel(s) ≥ ${minA} ac within ${mi} mi.${warn.length?' Some sources had issues.':''}`); }
      else setStatusMsg(`No parcels matched. Try a larger radius or lower minimum acreage.`);
    }catch(e:any){ setStatusMsg('Search failed: '+e.message); }
    finally{ setBusy(false); }
  }

  function toggleLayer(id:string){
    const L=window.L, map=mapRef.current; if(!map)return;
    const def=LAYERS.find(l=>l.id===id)!;
    if(overlayLayers.current[id]){ map.removeLayer(overlayLayers.current[id]); delete overlayLayers.current[id]; setActiveLayers(a=>a.filter(x=>x!==id)); return; }
    let lyr:any;
    if(def.type==='tile'){ lyr=L.tileLayer(def.url,{opacity:def.opacity||.6,subdomains:'abc',maxZoom:19,attribution:def.note}); }
    else { lyr=esriOverlay(def.url); }
    lyr.addTo(map); overlayLayers.current[id]=lyr; setActiveLayers(a=>[...a,id]);
  }
  function esriOverlay(exportUrl:string){
    const L=window.L, map=mapRef.current; const group=L.layerGroup(); let img:any=null;
    function refresh(){ const b=map.getBounds(),size=map.getSize();
      const u=exportUrl+'?'+new URLSearchParams({ bbox:[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()].join(','), bboxSR:'4326', imageSR:'3857', size:`${size.x},${size.y}`, format:'png32', transparent:'true', f:'image' });
      if(img)group.removeLayer(img); img=L.imageOverlay(u,b,{opacity:.6}); group.addLayer(img); }
    group.on('add',()=>{refresh();map.on('moveend',refresh);}); group.on('remove',()=>map.off('moveend',refresh));
    return group;
  }
  function focusParcel(p:any){ if(mapRef.current){ mapRef.current.setView(p.center,14); } }


  return (
    <div style={{ display:'grid', gridTemplateColumns:'320px 1fr', height:'calc(100vh - 53px)' }}>
      {/* sidebar */}
      <aside style={{ background:'var(--ink2)', borderRight:'1px solid var(--line)', overflowY:'auto', padding:'18px 18px 40px' }}>
        <div className="mono" style={{ fontSize:10, letterSpacing:'.18em', textTransform:'uppercase', color:'var(--amber)', marginBottom:9 }}>Search area</div>
        <label className="label">City or place (U.S.)</label>
        <input className="input" style={{ marginBottom:10 }} value={city} onChange={e=>setCity(e.target.value)} placeholder="Gastonia, NC" />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9 }}>
          <div><label className="label">Radius (mi)</label><input className="input" type="number" value={radius} onChange={e=>setRadius(+e.target.value)} /></div>
          <div><label className="label">Min acres</label><input className="input" type="number" value={minAcres} onChange={e=>setMinAcres(+e.target.value)} /></div>
        </div>
        <label className="label" style={{ marginTop:10, display:'block' }}>Max acres (optional)</label>
        <input className="input" type="number" value={maxAcres} onChange={e=>setMaxAcres(e.target.value)} placeholder="no max" />
        <button className="btn btn-primary" style={{ width:'100%', marginTop:12 }} onClick={runSearch} disabled={!ready||busy}>
          {busy ? 'Searching…' : 'Find parcels'}
        </button>

        <div className="mono" style={{ fontSize:10, letterSpacing:'.18em', textTransform:'uppercase', color:'var(--amber)', margin:'20px 0 9px' }}>Feasibility layers</div>
        {LAYERS.map(l=>{
          const on=activeLayers.includes(l.id);
          return (
            <div key={l.id} onClick={()=>toggleLayer(l.id)}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', border:`1px solid ${on?'var(--cyan)':'var(--line)'}`,
                background:on?'rgba(111,214,224,.06)':'transparent', borderRadius:8, marginBottom:7, cursor:'pointer' }}>
              <span style={{ width:30, height:17, borderRadius:10, background:on?'var(--cyan)':'var(--line2)', position:'relative', flex:'none' }}>
                <span style={{ position:'absolute', top:2, left:on?15:2, width:13, height:13, borderRadius:'50%', background:'var(--ink)', transition:'.15s' }} />
              </span>
              <span style={{ fontSize:13 }}>{l.name}<br/><span className="mono" style={{ fontSize:11, color:'var(--muted)' }}>{l.note}</span></span>
              <span style={{ width:8, height:8, borderRadius:2, background:l.color, marginLeft:'auto' }} />
            </div>
          );
        })}
        <div className="mono" style={{ fontSize:10.5, color:'var(--muted)', lineHeight:1.6, marginTop:6 }}>
          Layers draw from national + county GIS. Where a county doesn\u2019t publish a layer, it simply won\u2019t appear there.
        </div>
      </aside>

      {/* map + results */}
      <div style={{ position:'relative' }}>
        <div ref={mapEl} style={{ position:'absolute', inset:0, background:'#0B1416' }} />
        <div style={{ position:'absolute', bottom:14, left:14, zIndex:900, maxWidth:'55%',
          background:'rgba(15,27,30,.94)', border:'1px solid var(--line2)', borderRadius:9, padding:'10px 14px', fontSize:12.5, backdropFilter:'blur(4px)' }}>
          {statusMsg}
        </div>
        {results.length>0 && (
          <div style={{ position:'absolute', top:14, right:14, width:330, maxHeight:'calc(100% - 28px)', overflowY:'auto', zIndex:900,
            background:'var(--ink2)', border:'1px solid var(--line)', borderRadius:12, padding:12 }}>
            <div className="mono" style={{ fontSize:11, color:'var(--muted)', marginBottom:10 }}>{results.length} parcels</div>
            {[...results].sort((a,b)=>(b.acres||0)-(a.acres||0)).slice(0,200).map(p=>(
              <div key={p.__id} onClick={()=>focusParcel(p)} className="card" style={{ padding:'11px 12px', marginBottom:8, cursor:'pointer' }}>
                <div className="display" style={{ fontWeight:600, fontSize:13.5 }}>{p.acres!=null?p.acres.toFixed(1)+' acres':'Acreage n/a'}</div>
                <div className="mono" style={{ fontSize:11.5, color:'var(--muted)', marginTop:4 }}>
                  {p.address || '—'}{p.zoning?` · ${p.zoning}`:''}{p.distance!=null?` · ${p.distance.toFixed(1)} mi`:''}
                </div>
                {p.owner && <div className="mono" style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>Owner: {p.owner}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
