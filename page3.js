const PAGE3 = (() => {
  const f={city:'',insurer:'',tpa:'',status:''};
  const gf={city:'',insurer:'',tpa:''};
  let map=null,markers=[],gapCircles=[],mapInited=false;

  function init(){
    renderCityPills();
    renderFilters();
    bindEvents();
    renderGaps();
    renderRegionalGaps();
    // Eager init: map div is now in DOM (offscreen via CSS), so it has dimensions
    setTimeout(initMap, 800);
    onDataRefresh(()=>{
      renderCityPills();renderFilters();renderGaps();renderRegionalGaps();
      if(mapInited){renderMarkers();updateCounts();}
    });
  }

  function initMap(){
    // If already initialized, just invalidate size to redraw on tab switch
    if(mapInited){
      if(map){
        setTimeout(()=>{
          map.invalidateSize();
          renderMarkers();
        },100);
      }
      return;
    }
    // Wait for Leaflet library
    if(typeof L==='undefined'){console.log('[map] Waiting for Leaflet...');setTimeout(initMap,200);return;}
    // Wait for map div to exist AND be visible (have dimensions)
    const el=document.getElementById('map');
    if(!el){console.log('[map] map div not found');setTimeout(initMap,200);return;}
    // Force the page to be visible if not already, then check dimensions
    const rect=el.getBoundingClientRect();
    if(rect.width===0||rect.height===0){
      console.log('[map] map div has zero size, waiting...');
      el.style.minHeight='500px';
      el.style.width='100%';
      setTimeout(initMap,300);
      return;
    }
    console.log('[map] Initializing map, div size:',rect.width,'x',rect.height);
    try{
      map=L.map('map',{zoomControl:true,preferCanvas:false}).setView([20.5937,78.9629],5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:18}).addTo(map);
      mapInited=true;
      // Force redraw after a beat
      setTimeout(()=>{
        if(map){
          map.invalidateSize();
          renderMarkers();
          renderGaps();
          updateCounts();
          console.log('[map] Initialized with',markers.length,'markers');
        }
      },200);
    }catch(e){console.error('[map] Init error:',e);}
  }

  function renderCityPills(){
    const el=document.getElementById('p3-city-pills');if(!el)return;
    const cities=getCities();
    el.innerHTML=cities.map(c=>`<button class="pill ${f.city===c?'active':''}" data-city="${c}">${cityLabel(c)}</button>`).join('');
    el.querySelectorAll('.pill').forEach(btn=>{btn.addEventListener('click',()=>{f.city=f.city===btn.dataset.city?'':btn.dataset.city;renderCityPills();if(mapInited){renderMarkers();updateCounts();}renderRegionalGaps();});});
  }

  function renderFilters(){
    fillSel('p3-status',[['','All Status'],['Active','Active'],['Inactive','Inactive'],['On Hold','On Hold']],f.status);
    fillSel('p3-insurer',[['','All Insurers'],...DATA.insurerNames.map(i=>[i,i])],f.insurer);
    fillSel('p3-tpa',   [['','All TPAs'],    ...DATA.tpaNames.map(t=>[t,t])],     f.tpa);
    // Supply gap filters
    fillSel('gap-city',   [['','All Cities'],   ...getCities().map(c=>[c,cityLabel(c)])], gf.city);
    fillSel('gap-insurer',[['','All Insurers'],  ...DATA.insurerNames.map(i=>[i,i])],     gf.insurer);
    fillSel('gap-tpa',    [['','All TPAs'],      ...DATA.tpaNames.map(t=>[t,t])],         gf.tpa);
  }

  function fillSel(id,opts,cur){const el=document.getElementById(id);if(!el)return;el.innerHTML=opts.map(([v,l])=>`<option value="${esc(v)}"${v===cur?' selected':''}>${esc(l)}</option>`).join('');}

  function renderMarkers(){
    if(!map)return;
    markers.forEach(m=>map.removeLayer(m));
    gapCircles.forEach(c=>map.removeLayer(c));
    markers=[];gapCircles=[];
    let hosps=DATA.hospitals;
    if(f.city)hosps=hosps.filter(h=>h.city===f.city);
    if(f.status)hosps=hosps.filter(h=>h.activeStatus===f.status);
    let plotted=0;
    hosps.forEach(h=>{
      const coords=(window.PINCODES||{})[h.pinCode];
      if(!coords)return;
      const color=getColor(h);
      const jLat=coords.lat+(Math.random()-.5)*.003,jLng=coords.lng+(Math.random()-.5)*.003;
      const m=L.circleMarker([jLat,jLng],{radius:7,fillColor:color,color:'#fff',weight:1.5,opacity:1,fillOpacity:.85});
      m.bindTooltip(h.hospitalName,{direction:'top',offset:[0,-5]});
      // Click dot → open full hospital detail modal (same as Hospital Network table)
      m.on('click',()=>{if(window.PAGE1&&PAGE1.openPanel)PAGE1.openPanel(h.hospitalName);});
      m.addTo(map);markers.push(m);plotted++;
      if(h.activeStatus==='Active'&&(f.insurer||f.tpa)){
        const iE=f.insurer?h.insurer[f.insurer]===true:true;
        const tE=f.tpa?h.tpa[f.tpa]===true:true;
        if(!iE||!tE){const c=L.circle([jLat,jLng],{radius:10000,color:'#94a3b8',weight:1.5,dashArray:'6 4',fillColor:'transparent',opacity:.5});c.addTo(map);gapCircles.push(c);}
      }
    });
    if(f.city&&markers.length){const g=L.featureGroup(markers);map.fitBounds(g.getBounds().pad(.25));}
    const el=document.getElementById('p3-marker-count');if(el)el.textContent=`${plotted} hospitals plotted`;
    updateCounts();
  }

  function getColor(h){
    const isA=h.activeStatus==='Active';
    const iE=f.insurer?(h.insurer[f.insurer]===true):Object.values(h.insurer).some(Boolean);
    const tE=f.tpa?(h.tpa[f.tpa]===true):Object.values(h.tpa).some(Boolean);
    const isE=(f.insurer||f.tpa)?((!f.insurer||iE)&&(!f.tpa||tE)):(iE||tE);
    if(isA&&isE)return'#10b981';if(isA&&!isE)return'#f97316';return'#ef4444';
  }

  function updateCounts(){
    let hosps=DATA.hospitals;
    if(f.city)hosps=hosps.filter(h=>h.city===f.city);
    if(f.status)hosps=hosps.filter(h=>h.activeStatus===f.status);
    const active=hosps.filter(h=>h.activeStatus==='Active').length;
    const el1=document.getElementById('p3-active-count'),el2=document.getElementById('p3-inactive-count'),el3=document.getElementById('p3-total-count');
    if(el1)el1.textContent=active;if(el2)el2.textContent=hosps.length-active;if(el3)el3.textContent=hosps.length;
  }

  function buildPopup(h){
    const iE=f.insurer?(h.insurer[f.insurer]===true):null;
    const tE=f.tpa?(h.tpa[f.tpa]===true):null;
    const covMax=DATA.insurerNames.length+DATA.tpaNames.length||1;
    const cov=Math.round((Object.values(h.insurer).filter(Boolean).length+Object.values(h.tpa).filter(Boolean).length)/covMax*100);
    const hc=h.aspData||[],valid=hc.filter(c=>c.approvalAmount!==null);
    const avg=valid.length?Math.round(valid.reduce((s,c)=>s+c.approvalAmount,0)/valid.length):null;
    return`<div style="font-family:'DM Sans',sans-serif;min-width:210px;">
      <div style="font-weight:700;font-size:13px;margin-bottom:3px;">${esc(h.hospitalName)}</div>
      <div style="font-size:11px;color:#6b7280;margin-bottom:6px;">${esc(h.area)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:5px;">
        <span style="color:${h.activeStatus==='Active'?'#059669':'#dc2626'};font-weight:600;font-size:12px;">${h.activeStatus}</span>
        <span style="color:#6b7280;font-size:12px;">Coverage: ${cov}%</span>
      </div>
      ${avg?`<div style="font-size:12px;color:#059669;margin-bottom:4px;">Avg ASP: <strong>₹${avg.toLocaleString('en-IN')}</strong> (${hc.length} cases)</div>`:''}
      ${f.insurer?`<div style="font-size:12px;margin-top:3px;">${esc(f.insurer)}: <strong style="color:${iE?'#059669':'#dc2626'}">${iE?'✓ Empanelled':'✗ Not empanelled'}</strong></div>`:''}
      ${f.tpa?`<div style="font-size:12px;margin-top:2px;">${esc(f.tpa)}: <strong style="color:${tE?'#059669':'#dc2626'}">${tE?'✓ Empanelled':'✗ Not empanelled'}</strong></div>`:''}
    </div>`;
  }

  // Supply gap with its own city+insurer+tpa filters
  function renderGaps(){
    const el=document.getElementById('p3-gaps');if(!el)return;
    let hosps=DATA.hospitals;
    if(gf.city)hosps=hosps.filter(h=>h.city===gf.city);
    const active=hosps.filter(h=>h.activeStatus==='Active');
    const total=active.length;
    if(!total){el.innerHTML='<div style="color:var(--text3);font-size:13px;padding:8px;">No active hospitals for selected city.</div>';return;}
    const ins=gf.insurer?[gf.insurer]:DATA.insurerNames;
    const gaps=ins.map(i=>{
      const empHosps=active.filter(h=>h.insurer[i]===true);
      const notEmpHosps=active.filter(h=>h.insurer[i]!==true);
      return{insurer:i,emp:empHosps.length,total,gap:total-empHosps.length,pct:Math.round((empHosps.length/total)*100),empList:empHosps,gapList:notEmpHosps};
    }).sort((a,b)=>a.pct-b.pct);
    const city=gf.city?cityLabel(gf.city):'All Cities';
    const avgCov=Math.round(gaps.reduce((s,g)=>s+g.pct,0)/gaps.length);
    el.innerHTML=`<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
      <div class="metric-card metric-green" style="padding:10px 14px;min-width:100px;"><div class="metric-label">Active</div><div class="metric-value" style="font-size:20px;">${total}</div><div class="metric-sub">${city}</div></div>
      <div class="metric-card metric-teal" style="padding:10px 14px;min-width:100px;"><div class="metric-label">Avg Coverage</div><div class="metric-value" style="font-size:20px;">${avgCov}%</div></div>
      <div class="metric-card" style="padding:10px 14px;min-width:100px;"><div class="metric-label">Insurers</div><div class="metric-value" style="font-size:20px;">${gaps.length}</div></div>
    </div>
    <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Coverage by Insurer — ${city} (click to expand · worst first)</div>
    ${gaps.map((g,i)=>`<div class="gap-block" data-gap-idx="${i}">
      <div class="gap-row gap-row-clickable" onclick="PAGE3.toggleGap(${i})">
        <div class="gap-label" title="${esc(g.insurer)}">${esc(g.insurer)}</div>
        <div class="gap-bar-wrap"><div class="gap-bar-fill ${g.pct<30?'gap-bad':''}" style="width:${g.pct}%"></div></div>
        <div class="gap-numbers">${g.emp}/${g.total} <span style="color:${g.gap>0?'var(--red)':'var(--green)'}">${g.gap>0?'(−'+g.gap+')':'✓'}</span></div>
        <span class="gap-chev" id="gap-chev-${i}">▼</span>
      </div>
      <div class="gap-detail" id="gap-detail-${i}" style="display:none;">
        ${g.empList.length?`<div style="margin-top:8px;padding:10px;background:var(--green-lt);border-radius:6px;">
          <div style="font-size:11px;font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">✓ Empanelled (${g.empList.length})</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px;">
            ${g.empList.map(h=>`<div style="font-size:11px;color:#065f46;padding:4px 8px;background:#fff;border-radius:4px;cursor:pointer;border:1px solid #d1fae5;" onclick="PAGE1.openPanel('${h.hospitalName.replace(/'/g,"\\'")}')">${esc(h.hospitalName.split(',')[0])}</div>`).join('')}
          </div>
        </div>`:''}
        ${g.gapList.length?`<div style="margin-top:8px;padding:10px;background:var(--red-lt);border-radius:6px;">
          <div style="font-size:11px;font-weight:700;color:var(--red);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">✗ Gap — Push for empanelment (${g.gapList.length})</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px;">
            ${g.gapList.map(h=>`<div style="font-size:11px;color:#991b1b;padding:4px 8px;background:#fff;border-radius:4px;cursor:pointer;border:1px solid #fee2e2;" onclick="PAGE1.openPanel('${h.hospitalName.replace(/'/g,"\\'")}')">${esc(h.hospitalName.split(',')[0])}</div>`).join('')}
          </div>
        </div>`:''}
      </div>
    </div>`).join('')}
    <div style="margin-top:10px;font-size:11px;color:var(--text3);">Red = &lt;30% coverage — gap your team needs to work on. Click any row to see hospital names.</div>`;
  }

  function toggleGap(idx){
    const det=document.getElementById('gap-detail-'+idx);
    const chev=document.getElementById('gap-chev-'+idx);
    if(!det)return;
    if(det.style.display==='none'){det.style.display='block';if(chev)chev.style.transform='rotate(180deg)';}
    else{det.style.display='none';if(chev)chev.style.transform='';}
  }

  
  function renderRegionalGaps(){
    const el=document.getElementById('p3-regional-gaps');if(!el)return;
    let hosps=DATA.hospitals.filter(h=>h.activeStatus==='Active');
    if(f.city)hosps=hosps.filter(h=>h.city===f.city);
    const regions=['East','Central','North','West','South'];
    const colors={East:'#ef4444',Central:'#f97316',North:'#eab308',West:'#84cc16',South:'#10b981'};
    const colorsDk={East:'#dc2626',Central:'#ea580c',North:'#a16207',West:'#4d7c0f',South:'#059669'};
    // Compute coverage % per region — based on insurer filter (or avg of all insurers if no filter)
    const rows=regions.map(reg=>{
      const inReg=hosps.filter(h=>h.zone===reg);
      if(!inReg.length)return{region:reg,pct:null,covered:0,gap:0,total:0};
      let covered=0,total=inReg.length;
      if(f.insurer){
        covered=inReg.filter(h=>h.insurer[f.insurer]===true).length;
      }else if(f.tpa){
        covered=inReg.filter(h=>h.tpa[f.tpa]===true).length;
      }else{
        // Average insurer coverage across all insurers (rough quality score)
        const allIns=DATA.insurerNames;
        let sumPct=0;
        allIns.forEach(ins=>{
          const c=inReg.filter(h=>h.insurer[ins]===true).length;
          sumPct+=(c/total)*100;
        });
        const avgPct=allIns.length?sumPct/allIns.length:0;
        return{region:reg,pct:Math.round(avgPct),covered:Math.round(avgPct*total/100),gap:total-Math.round(avgPct*total/100),total};
      }
      return{region:reg,pct:Math.round((covered/total)*100),covered,gap:total-covered,total};
    }).filter(r=>r.total>0);
    if(!rows.length){el.innerHTML='';return;}
    // Sort worst first (lowest pct)
    rows.sort((a,b)=>(a.pct||0)-(b.pct||0));
    const filterLabel=f.insurer?esc(f.insurer):f.tpa?esc(f.tpa):'All insurers (avg)';
    el.innerHTML=`<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Coverage Gaps by Region · ${filterLabel}</div>
      ${rows.map(r=>{
        const pct=r.pct||0;
        return`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px;border-bottom:1px solid var(--border);">
          <span style="min-width:60px;font-weight:600;color:var(--text2);">${r.region}</span>
          <div style="flex:1;height:14px;background:#f1f5f9;border-radius:3px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:${colors[r.region]||'#94a3b8'};border-radius:3px;"></div></div>
          <span style="min-width:90px;text-align:right;font-family:var(--mono);font-size:11px;color:${colorsDk[r.region]||'#475569'};font-weight:600;">${pct}% · ${r.gap>0?'−'+r.gap:'✓'}</span>
        </div>`;
      }).join('')}
      <div style="margin-top:8px;font-size:11px;color:var(--text3);">Active hospitals only · worst region first</div>`;
  }


  function bindEvents(){
    on('p3-insurer','change',e=>{f.insurer=e.target.value;if(mapInited){renderMarkers();}renderRegionalGaps();});
    on('p3-tpa','change',e=>{f.tpa=e.target.value;if(mapInited){renderMarkers();}renderRegionalGaps();});
    on('p3-status','change',e=>{f.status=e.target.value;if(mapInited){renderMarkers();updateCounts();}renderRegionalGaps();});
    on('p3-clear','click',()=>{f.city='';f.insurer='';f.tpa='';f.status='';renderCityPills();renderFilters();if(mapInited){renderMarkers();map.setView([20.5937,78.9629],5);}renderRegionalGaps();});
    on('gap-city','change',e=>{gf.city=e.target.value;renderGaps();});
    on('gap-insurer','change',e=>{gf.insurer=e.target.value;renderGaps();});
    on('gap-tpa','change',e=>{gf.tpa=e.target.value;renderGaps();});
    on('gap-reset','click',()=>{gf.city='';gf.insurer='';gf.tpa='';renderFilters();renderGaps();});
  }

  function on(id,ev,fn){document.getElementById(id)?.addEventListener(ev,fn);}
  function cityLabel(v){if(!v)return'All Cities';return CONFIG.CITY_DISPLAY[v]||v.split(' ').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');}
  function shortIns(n){return n.replace('Health Insurance','Hlth Ins').replace('General Insurance','Gen Ins').replace('Co. Ltd.','').replace('Company Ltd.','').replace('Insurance','Ins').trim().slice(0,28);}
  function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

  return{init,initMap,toggleGap,renderRegionalGaps};
})();
