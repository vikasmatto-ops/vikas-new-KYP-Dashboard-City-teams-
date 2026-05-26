const PAGE1 = (() => {
  const F={city:'',region:'',status:'',mop:'',tier:'',insurer:'',tpa:'',search:''};
  let pg=1,PS=20,curView='table';

  function init(){renderRegionCards();renderFilters();renderTable();bindEvents();onDataRefresh(()=>{renderRegionCards();renderFilters();renderTable();});}

  function switchView(v){
    curView=v;
    document.getElementById('vtab-table').classList.toggle('active',v==='table');
    document.getElementById('vtab-smart').classList.toggle('active',v==='smart');
    document.getElementById('view-table').style.display=v==='table'?'block':'none';
    document.getElementById('view-smart').style.display=v==='smart'?'block':'none';
  }

  function renderRegionCards(){
    const zones=['North','South','East','West','Central'];
    const active={},total={};
    zones.forEach(z=>{active[z]=0;total[z]=0;});
    let totHold=0;
    DATA.hospitals.forEach(h=>{
      const z=h.zone||'Central';total[z]=(total[z]||0)+1;
      if(h.activeStatus==='Active')active[z]=(active[z]||0)+1;
      const s=(h.activeStatus||'').toLowerCase();
      if(s.includes('hold')||s==='on hold')totHold++;
    });
    zones.forEach(z=>{
      const en=document.getElementById('rn-'+z),es=document.getElementById('rs-'+z);
      if(en)en.textContent=active[z]||0;
      if(es)es.textContent=(total[z]||0)+' total hospitals';
    });
    // Populate totals cards
    const totalAll=DATA.hospitals.length;
    const totActive=DATA.hospitals.filter(h=>h.activeStatus==='Active').length;
    const totInactive=DATA.hospitals.filter(h=>h.activeStatus==='Inactive').length;
    setT('tot-total',totalAll);
    setT('tot-active',totActive);
    setT('tot-inactive',totInactive);
    setT('tot-hold',totHold);
    function setT(id,v){const el=document.getElementById(id);if(el)el.textContent=v;}
  }

  function renderFilters(){
    fillSel('p1-city',[['','All Cities'],...getCities().map(c=>[c,cityLabel(c)])],F.city);
    fillSel('p1-insurer',[['','All Insurers'],...DATA.insurerNames.map(i=>[i,i])],F.insurer);
    fillSel('p1-tpa',[['','All TPAs'],...DATA.tpaNames.map(t=>[t,t])],F.tpa);
    // Preserve Smart Finder dropdown values across refresh
    const sfVals={
      city:document.getElementById('sf-city')?.value||'',
      insurer:document.getElementById('sf-insurer')?.value||'',
      tpa:document.getElementById('sf-tpa')?.value||'',
      category:document.getElementById('sf-category')?.value||'',
      procedure:document.getElementById('sf-procedure')?.value||'',
      insDist:document.getElementById('sf-ins-dist')?.value||'',
      tpaDist:document.getElementById('sf-tpa-dist')?.value||'',
    };
    fillSel('sf-city',[['','All Cities'],...getCities().map(c=>[c,cityLabel(c)])],sfVals.city);
    fillSel('sf-insurer',[['','Any Insurer'],...getInsurers().map(i=>[i,i])],sfVals.insurer);
    fillSel('sf-tpa',[['','Any TPA'],...getTPAs().map(t=>[t,t])],sfVals.tpa);
    fillSel('sf-category',[['','Any Category'],...CONFIG.ACTIVE_CATEGORIES.map(c=>[c,c])],sfVals.category);
    fillSel('sf-procedure',[['','Any Procedure'],...getProceduresForCategory(sfVals.category).map(p=>[p,p])],sfVals.procedure);
    fillSel('sf-ins-dist',[['','Any Insurer'],...getInsurers().map(i=>[i,i])],sfVals.insDist);
    fillSel('sf-tpa-dist',[['','Any TPA'],...getTPAs().map(t=>[t,t])],sfVals.tpaDist);
  }

  function getFiltered(){
    let list=DATA.hospitals;
    if(F.region)list=list.filter(h=>h.zone===F.region);
    if(F.city)list=list.filter(h=>h.city===F.city);
    if(F.status)list=list.filter(h=>h.activeStatus===F.status);
    if(F.mop)list=list.filter(h=>{
      const m=(h.mopStatus||'').toLowerCase();
      if(F.mop==='Cashless')return m.includes('cashless');
      if(F.mop==='Reimbursement')return m.includes('reimb');
      if(F.mop==='Cash')return m.includes('cash') && !m.includes('cashless');
      return true;
    });
    if(F.tier)list=list.filter(h=>h.tier===F.tier);
    if(F.insurer)list=list.filter(h=>h.insurer[F.insurer]===true);
    if(F.tpa)list=list.filter(h=>h.tpa[F.tpa]===true);
    if(F.search){const q=F.search.toLowerCase();list=list.filter(h=>h.hospitalName.toLowerCase().includes(q)||h.area.toLowerCase().includes(q));}
    return list;
  }

  function renderTable(){
    const tbody=document.getElementById('p1-tbody');if(!tbody)return;
    const list=getFiltered();
    document.getElementById('p1-count').textContent=`(${list.length} hospitals)`;
    const slice=list.slice((pg-1)*PS,pg*PS);
    if(!slice.length){tbody.innerHTML=`<tr><td colspan="8" class="empty-row">No hospitals match filters.</td></tr>`;renderPag(0);return;}
    tbody.innerHTML=slice.map(h=>{
      const cov=calcCov(h);
      const flags=Object.keys(h.empanelmentFlags||{}).length;
      const flagH=flags?`<span class="flag-badge">⚑${flags}</span>`:'';
      const tierH=h.tier?`<span class="tier-badge tier-${h.tier.toLowerCase()}">${h.tier}</span>`:'';
      const zc=CONFIG.ZONE_COLORS?.[h.zone]||'#9ca3af';
      return`<tr class="hospital-row" data-hospital="${esc(h.hospitalName)}">
        <td><div class="hosp-name">${esc(h.hospitalName)}${tierH}${flagH}</div><div class="hosp-area">${esc(h.area)}</div></td>
        <td style="font-size:12px;">${cityLabel(h.city)}</td>
        <td><span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:500;"><span style="width:8px;height:8px;border-radius:50%;background:${zc};display:inline-block;"></span>${h.zone||'—'}</span></td>
        <td><span class="status-badge ${h.activeStatus==='Active'?'status-active':'status-inactive'}">${h.activeStatus}</span></td>
        <td style="font-size:12px;">${esc(h.mopStatus)}</td>
        <td><div class="cov-wrap"><div class="cov-bar"><div class="cov-fill" style="width:${cov}%"></div></div><span class="cov-pct">${cov}%</span></div></td>
        <td style="font-size:11px;color:var(--text3);max-width:150px;">${esc(h.insComments||'—')}</td>
        <td style="font-size:11px;color:var(--text3);max-width:150px;">${esc(h.cityComments||'—')}</td>
      </tr>`;
    }).join('');
    renderPag(list.length);
  }

  function calcCov(h){const tot=DATA.insurerNames.length+DATA.tpaNames.length;if(!tot)return 0;const yes=Object.values(h.insurer).filter(Boolean).length+Object.values(h.tpa).filter(Boolean).length;return Math.round((yes/tot)*100);}

  function renderPag(total){
    const el=document.getElementById('p1-pagination');if(!el)return;
    const pages=Math.ceil(total/PS);if(pages<=1){el.innerHTML='';return;}
    let h='';if(pg>1)h+=`<button class="pg-btn" data-page="${pg-1}">‹</button>`;
    for(let i=Math.max(1,pg-2);i<=Math.min(pages,pg+2);i++)h+=`<button class="pg-btn ${i===pg?'pg-active':''}" data-page="${i}">${i}</button>`;
    if(pg<pages)h+=`<button class="pg-btn" data-page="${pg+1}">›</button>`;
    el.innerHTML=h;
  }

  function openPanel(name){
    const h=DATA.hospitals.find(x=>x.hospitalName===name);if(!h)return;
    document.querySelectorAll('.hospital-row.selected').forEach(r=>r.classList.remove('selected'));
    document.querySelector(`.hospital-row[data-hospital="${CSS.escape(name)}"]`)?.classList.add('selected');
    const hc=h.aspData||[];
    const valid=hc.filter(c=>c.approvalAmount!==null);
    const avgASP=valid.length?Math.round(valid.reduce((s,c)=>s+c.approvalAmount,0)/valid.length):null;
    const avgBill=hc.filter(c=>c.billAmount).length?Math.round(hc.filter(c=>c.billAmount).reduce((s,c)=>s+c.billAmount,0)/hc.filter(c=>c.billAmount).length):null;
    const avgSet=hc.filter(c=>c.settlementAmount).length?Math.round(hc.filter(c=>c.settlementAmount).reduce((s,c)=>s+c.settlementAmount,0)/hc.filter(c=>c.settlementAmount).length):null;
    const dates=hc.map(c=>c.dodParsed).filter(Boolean);
    const lastCase=dates.length?new Date(Math.max(...dates.map(d=>d.getTime()))):null;
    const cov=calcCov(h);
    const byYear={};
    hc.forEach(c=>{if(!c.doaParsed)return;const y=c.doaParsed.getFullYear();if(!byYear[y])byYear[y]={cases:[],cats:{}};byYear[y].cases.push(c);if(c.category&&c.approvalAmount!==null){if(!byYear[y].cats[c.category])byYear[y].cats[c.category]=[];byYear[y].cats[c.category].push(c.approvalAmount);}});
    const byIns={};
    hc.forEach(c=>{if(!c.insuranceName)return;if(!byIns[c.insuranceName])byIns[c.insuranceName]={count:0,asp:[]};byIns[c.insuranceName].count++;if(c.approvalAmount!==null)byIns[c.insuranceName].asp.push(c.approvalAmount);});
    const insRows=Object.entries(byIns).sort(([,a],[,b])=>b.count-a.count).slice(0,8);
    const empIns=Object.entries(h.insurer);const empTpa=Object.entries(h.tpa);
    const zc=CONFIG.ZONE_COLORS?.[h.zone]||'#9ca3af';

    document.getElementById('detail-left').innerHTML=`
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px;">
          <div style="font-size:15px;font-weight:800;color:var(--text);line-height:1.3;">${esc(h.hospitalName)}</div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;">
            <span class="status-badge ${h.activeStatus==='Active'?'status-active':'status-inactive'}">${h.activeStatus}</span>
            ${h.history&&h.history.statusChangedOn?`<span style="font-size:10px;color:var(--text3);font-family:var(--mono);">Since ${fmtHistDate(h.history.statusChangedOn)}</span>`:''}
            ${h.history&&h.history.previousStatus?`<span style="font-size:9px;color:var(--text3);">was ${esc(h.history.previousStatus)}</span>`:''}
          </div>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:8px;"><span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:7px;height:7px;border-radius:50%;background:${zc};display:inline-block;"></span>${h.zone}</span> • ${cityLabel(h.city)} • PIN ${h.pinCode} • ${h.mopStatus}</div>
        ${h.tier?`<span class="tier-badge tier-${h.tier.toLowerCase()}">${h.tier}</span>`:''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px;">
        <div style="background:var(--surface2);border-radius:var(--r-sm);padding:8px;text-align:center;"><div style="font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:2px;">Status</div><div style="font-size:12px;font-weight:700;color:var(--text);">${h.activeStatus}</div></div>
        <div style="background:var(--surface2);border-radius:var(--r-sm);padding:8px;text-align:center;"><div style="font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:2px;">MOP Type</div><div style="font-size:12px;font-weight:700;color:var(--text);">${h.mopStatus||'—'}</div></div>
        <div style="background:var(--teal-lt);border-radius:var(--r-sm);padding:8px;text-align:center;"><div style="font-size:9px;font-weight:700;color:var(--teal-dk);text-transform:uppercase;margin-bottom:2px;">Coverage</div><div style="font-size:12px;font-weight:700;color:var(--teal);">${cov}%</div></div>
      </div>
      <div style="margin-bottom:10px;">
        <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Comments &amp; Remarks</div>
        ${h.insComments?`<div style="background:var(--amber-lt);border-left:3px solid var(--amber);border-radius:0 6px 6px 0;padding:7px 10px;margin-bottom:5px;font-size:12px;color:#92400e;"><strong>Insurance:</strong> ${esc(h.insComments)}${h.history&&h.history.insCommentsOn?`<div style="font-size:10px;color:#92400e;opacity:.7;margin-top:3px;font-family:var(--mono);">📅 ${fmtHistDate(h.history.insCommentsOn)}</div>`:''}</div>`:'<div style="font-size:11px;color:var(--text3);padding:2px 0;">🟢 Insurance Comments — not yet added</div>'}
        ${h.cityComments?`<div style="background:var(--teal-lt);border-left:3px solid var(--teal);border-radius:0 6px 6px 0;padding:7px 10px;margin-bottom:5px;font-size:12px;color:var(--teal-dk);"><strong>City team:</strong> ${esc(h.cityComments)}${h.history&&h.history.cityCommentsOn?`<div style="font-size:10px;color:var(--teal-dk);opacity:.7;margin-top:3px;font-family:var(--mono);">📅 ${fmtHistDate(h.history.cityCommentsOn)}</div>`:''}</div>`:'<div style="font-size:11px;color:var(--text3);padding:2px 0;">🔵 City Comments — not yet added</div>'}
        ${h.doctorComments?`<div style="background:var(--green-lt);border-left:3px solid var(--green);border-radius:0 6px 6px 0;padding:7px 10px;font-size:12px;color:#065f46;"><strong>Doctors:</strong> ${esc(h.doctorComments)}${h.history&&h.history.doctorCommentsOn?`<div style="font-size:10px;color:#065f46;opacity:.7;margin-top:3px;font-family:var(--mono);">📅 ${fmtHistDate(h.history.doctorCommentsOn)}</div>`:''}</div>`:'<div style="font-size:11px;color:var(--text3);padding:2px 0;">🔵 Doctors Team Comments — not yet added</div>'}
      </div>
      ${hc.length?`
      <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">📊 ASP History</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px;">
        <div style="text-align:center;padding:8px;background:var(--surface2);border-radius:var(--r-sm);"><div style="font-size:9px;color:var(--text3);text-transform:uppercase;font-weight:600;margin-bottom:2px;">Total Cases</div><div style="font-size:22px;font-weight:800;color:var(--text);">${hc.length}</div></div>
        <div style="text-align:center;padding:8px;background:var(--teal-lt);border-radius:var(--r-sm);"><div style="font-size:9px;color:var(--teal-dk);text-transform:uppercase;font-weight:600;margin-bottom:2px;">Avg ASP</div><div style="font-size:22px;font-weight:800;color:var(--teal);">${avgASP?'₹'+fmtN(avgASP):'—'}</div></div>
        <div style="text-align:center;padding:8px;background:var(--amber-lt);border-radius:var(--r-sm);"><div style="font-size:9px;color:var(--amber);text-transform:uppercase;font-weight:600;margin-bottom:2px;">Avg Bill</div><div style="font-size:22px;font-weight:800;color:var(--amber);">${avgBill?'₹'+fmtN(avgBill):'—'}</div></div>
      </div>
      ${lastCase?`<div style="font-size:12px;color:var(--text2);margin-bottom:8px;">📅 Last case: <strong>${lastCase.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</strong></div>`:''}
      ${Object.entries(byYear).sort(([a],[b])=>b-a).map(([yr,d])=>{
        const yv=d.cases.filter(c=>c.approvalAmount!==null);
        const yAvg=yv.length?Math.round(yv.reduce((s,c)=>s+c.approvalAmount,0)/yv.length):null;
        const catE=Object.entries(d.cats).sort(([,a],[,b])=>b.length-a.length).slice(0,5);
        return`<div style="margin-bottom:8px;"><div style="font-weight:700;font-size:12px;margin-bottom:4px;">${yr} <span style="font-weight:400;font-size:11px;color:var(--text3);">${d.cases.length} cases • ${yAvg?'₹'+fmtN(yAvg):'—'}</span></div>
        ${catE.map(([cat,vals])=>`<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border);font-size:11px;"><span style="color:var(--text2);text-transform:uppercase;font-weight:500;">${esc(cat)}</span><span style="display:flex;gap:8px;"><span style="color:var(--text3);">${vals.length}</span><span style="color:var(--teal);font-weight:700;font-family:var(--mono);">₹${fmtN(Math.round(vals.reduce((s,v)=>s+v,0)/vals.length))}</span></span></div>`).join('')}</div>`;}).join('')}
      <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin:10px 0 6px;">Top Insurers by Cases</div>
      ${insRows.map(([ins,d])=>`<div class="dp-row"><span style="color:var(--text2);font-size:11px;">${esc(ins)}</span><span style="display:flex;gap:8px;align-items:center;"><span style="color:var(--text3);font-size:11px;">${d.count}</span>${d.asp.length?`<span style="color:var(--teal);font-weight:700;font-family:var(--mono);font-size:11px;">₹${fmtN(Math.round(d.asp.reduce((s,v)=>s+v,0)/d.asp.length))}</span>`:''}</span></div>`).join('')}
      `:'<div style="font-size:12px;color:var(--text3);padding:8px 0;">No ASP cases found.</div>'}`;

    document.getElementById('detail-right').innerHTML=`
      <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">TPA Empanelment</div>
      ${empTpa.map(([name,val])=>`<div class="dp-row"><span style="color:var(--text2);font-size:11px;">${esc(name)}</span>${val?`<span class="dp-yes">Yes</span>`:`<span class="dp-no">—</span>`}</div>`).join('')}
      <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin:12px 0 8px;">Insurer Empanelment</div>
      ${empIns.map(([name,val])=>`<div class="dp-row"><span style="color:var(--text2);font-size:11px;">${esc(name)}</span>${val?`<span class="dp-yes">Yes</span>`:`<span class="dp-no">—</span>`}</div>`).join('')}`;

    document.getElementById('detail-overlay').classList.add('open');
  }

  function runRecommendations(){
    const city=document.getElementById('sf-city')?.value,insurer=document.getElementById('sf-insurer')?.value,tpa=document.getElementById('sf-tpa')?.value,category=document.getElementById('sf-category')?.value,procedure=document.getElementById('sf-procedure')?.value;
    const el=document.getElementById('sf-rec-results');if(!el)return;
    if(!city&&!insurer&&!tpa&&!category&&!procedure){el.innerHTML='<div style="color:var(--text3);font-size:13px;">Select at least one filter.</div>';return;}
    // STRICT filtering — no relaxation + Active hospitals + current empanelment check
    let recs=getRecommendations({city,insurer,tpa,category,procedure,topN:100});
    // Build hospital lookup for status + empanelment
    const hospLookup={};
    DATA.hospitals.forEach(h=>{hospLookup[h.hospitalName.toLowerCase().trim()]=h;});
    recs=recs.filter(r=>{
      const h=hospLookup[r.hospitalName.toLowerCase().trim()];
      if(!h||h.activeStatus!=='Active')return false;
      // OPTION A: must be currently empanelled with selected insurer/TPA
      if(insurer && h.insurer[insurer]!==true && h.insurerRaw && h.insurerRaw[insurer]!=='No')return false;
      if(insurer && h.insurerRaw && h.insurerRaw[insurer]==='No')return false;
      if(tpa && h.tpa[tpa]!==true && h.tpaRaw && h.tpaRaw[tpa]!=='No')return false;
      if(tpa && h.tpaRaw && h.tpaRaw[tpa]==='No')return false;
      return true;
    }).slice(0,8);
    if(!recs.length){
      const filterDesc=[city?cityLabel(city):'',insurer||'',tpa||'',category||'',procedure||''].filter(Boolean).join(' · ');
      el.innerHTML=`<div style="background:var(--amber-lt);border-left:4px solid var(--amber);border-radius:6px;padding:14px 16px;font-size:13px;color:#92400e;">
        <strong>⚠ No cases found</strong> for: ${esc(filterDesc)}
        <div style="font-size:12px;margin-top:4px;color:#a16207;">Try removing one or more filters or check the ASP data for this exact combination.</div>
      </div>`;
      return;
    }
    const desc=[city?cityLabel(city):'',insurer||'',tpa||'',category||'',procedure||''].filter(Boolean).join(' · ');
    el.innerHTML=`<div style="font-size:13px;font-weight:700;margin-bottom:10px;">⭐ Top ${recs.length} Hospitals — <span style="color:var(--text3);font-weight:400;">${esc(desc)}</span></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:10px;">
      ${recs.map((r,i)=>{
        const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`;
        const hNet=DATA.hospitals.find(h=>h.hospitalName.toLowerCase().trim()===r.hospitalName.toLowerCase().trim());
        const isBest=i===0;
        // Find the last case matching the filter combo for IPD/Lead
        const lastCaseDetails=findLastCaseDetails(r.hospitalName,{city,insurer,tpa,category,procedure});
        return`<div style="background:${isBest?'linear-gradient(135deg,#0284c7,#0ea5e9)':'var(--surface2)'};border:1px solid ${isBest?'transparent':'var(--border)'};border-radius:10px;padding:14px;cursor:pointer;transition:transform .15s;" onclick="PAGE1.openPanel('${r.hospitalName.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')">
          <div style="font-size:13px;font-weight:700;color:${isBest?'#fff':'var(--text)'};margin-bottom:6px;">${medal} ${esc(r.hospitalName.split(',')[0])}</div>
          <div style="font-size:22px;font-weight:800;color:${isBest?'#fff':'var(--teal)'};letter-spacing:-.5px;margin-bottom:6px;">₹${fmtN(r.avgASP)}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
            <span style="font-size:11px;background:${isBest?'rgba(255,255,255,.2)':'var(--teal-lt)'};color:${isBest?'#fff':'var(--teal-dk)'};padding:2px 8px;border-radius:10px;font-weight:600;">${r.caseCount} cases</span>
            ${r.lastCaseDate?`<span style="font-size:11px;color:${isBest?'rgba(255,255,255,.75)':'var(--text3)'};">Last: ${r.lastCaseDate.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</span>`:''}
            ${hNet?`<span style="font-size:11px;color:${isBest?'rgba(255,255,255,.75)':(hNet.activeStatus==='Active'?'var(--green)':'var(--red)')};font-weight:600;">${hNet.activeStatus}</span>`:''}
          </div>
          ${lastCaseDetails?`<div style="font-size:10px;font-family:var(--mono);padding:6px 8px;border-radius:6px;background:${isBest?'rgba(0,0,0,.2)':'rgba(0,0,0,.03)'};color:${isBest?'rgba(255,255,255,.85)':'var(--text2)'};border:1px dashed ${isBest?'rgba(255,255,255,.2)':'var(--border)'};">📋 Last case: IPD <strong>${esc(lastCaseDetails.ipdId)}</strong> · Lead <strong>${esc(lastCaseDetails.leadId)}</strong></div>`:''}
        </div>`;
      }).join('')}
    </div>`;
  }

  function runFinder(){
    const pin=document.getElementById('sf-pincode')?.value.trim(),ins=document.getElementById('sf-ins-dist')?.value,tpa=document.getElementById('sf-tpa-dist')?.value;
    const el=document.getElementById('sf-dist-results');if(!el)return;
    if(!pin||pin.length!==6){el.innerHTML=`<div style="color:var(--red);font-size:13px;">Enter a valid 6-digit pincode.</div>`;return;}
    const origin=(window.PINCODES||{})[pin];
    if(!origin){el.innerHTML=`<div style="color:var(--amber);font-size:13px;">Pincode ${pin} not found. Try a nearby pincode.</div>`;return;}
    let hospitals=DATA.hospitals.filter(h=>h.activeStatus==='Active');
    if(ins)hospitals=hospitals.filter(h=>h.insurer[ins]===true);
    if(tpa)hospitals=hospitals.filter(h=>h.tpa[tpa]===true);
    const withDist=hospitals.map(h=>{const dest=(window.PINCODES||{})[h.pinCode];const dist=dest?haversine(origin.lat,origin.lng,dest.lat,dest.lng):9999;return{...h,_dist:dist};}).sort((a,b)=>a._dist-b._dist).slice(0,20);
    const covMax=DATA.insurerNames.length+DATA.tpaNames.length||1;
    el.innerHTML=`<div style="font-size:12px;color:var(--text3);margin-bottom:10px;">Patient pincode: <strong style="color:var(--text);">${pin}</strong></div>`+
    withDist.map((h,i)=>{
      const cov=Math.round((Object.values(h.insurer).filter(Boolean).length+Object.values(h.tpa).filter(Boolean).length)/covMax*100);
      const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
      return`<div class="finder-result" data-hospital="${esc(h.hospitalName)}">
        <div class="finder-dist">${h._dist<9999?h._dist.toFixed(1)+'km':'—'}</div>
        <div style="flex:1;"><div class="finder-hosp">${medal} ${esc(h.hospitalName)}</div><div class="finder-meta">${cityLabel(h.city)} • ${esc(h.area)}</div><div style="font-size:11px;color:var(--text2);margin-top:2px;">Coverage: ${cov}%</div></div>
        <span class="status-badge status-active">Active</span>
      </div>`;
    }).join('');
  }

  function exportCSV(){
    const list=getFiltered();const covMax=DATA.insurerNames.length+DATA.tpaNames.length||1;
    const rows=list.map(h=>{const cov=Math.round((Object.values(h.insurer).filter(Boolean).length+Object.values(h.tpa).filter(Boolean).length)/covMax*100);return[h.hospitalName,cityLabel(h.city),h.zone,h.activeStatus,h.mopStatus,cov+'%',h.insComments,h.cityComments,h.doctorComments].map(v=>`"${String(v||'').replace(/"/g,'""')}"`).join(',');});
    const csv=['Hospital Name,City,Region,Status,MOP,Coverage %,Ins Comments,City Comments,Doctor Comments',...rows].join('\n');
    const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);a.download='hospital_network.csv';a.click();
  }

  function bindEvents(){
    on('p1-region','change',e=>{F.region=e.target.value;pg=1;renderTable();});
    on('p1-city','change',e=>{F.city=e.target.value;pg=1;renderTable();});
    on('p1-status','change',e=>{F.status=e.target.value;pg=1;renderTable();});
    on('p1-mop','change',e=>{F.mop=e.target.value;pg=1;renderTable();});
    on('p1-tier','change',e=>{F.tier=e.target.value;pg=1;renderTable();});
    on('p1-insurer','change',e=>{F.insurer=e.target.value;pg=1;renderTable();});
    on('p1-tpa','change',e=>{F.tpa=e.target.value;pg=1;renderTable();});
    on('p1-search','input',e=>{F.search=e.target.value.trim();pg=1;renderTable();});
    on('p1-clear','click',()=>{Object.keys(F).forEach(k=>F[k]='');pg=1;document.getElementById('p1-search').value='';renderFilters();renderTable();renderRegionCards();});
    
    document.getElementById('p1-pagination')?.addEventListener('click',e=>{const b=e.target.closest('.pg-btn');if(!b)return;pg=parseInt(b.dataset.page);renderTable();document.getElementById('p1-table-wrap')?.scrollIntoView({behavior:'smooth'});});
    document.getElementById('p1-tbody')?.addEventListener('click',e=>{const r=e.target.closest('.hospital-row');if(!r)return;openPanel(r.dataset.hospital);});
    on('detail-close','click',window.closeModal);
    on('sf-recommend','click',runRecommendations);
    on('sf-rec-clear','click',()=>{['sf-city','sf-insurer','sf-tpa','sf-category','sf-procedure'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});document.getElementById('sf-rec-results').innerHTML='';});
    on('sf-category','change',()=>{const cat=document.getElementById('sf-category')?.value;fillSel('sf-procedure',[['','Any Procedure'],...getProceduresForCategory(cat).map(p=>[p,p])],'');});
    on('sf-find','click',runFinder);
    on('sf-pincode','keydown',e=>{if(e.key==='Enter')runFinder();});
    document.getElementById('sf-dist-results')?.addEventListener('click',e=>{const r=e.target.closest('.finder-result');if(!r)return;openPanel(r.dataset.hospital);});
  }

  function on(id,ev,fn){document.getElementById(id)?.addEventListener(ev,fn);}
  function fillSel(id,opts,cur){const el=document.getElementById(id);if(!el)return;el.innerHTML=opts.map(([v,l])=>`<option value="${esc(String(v))}"${String(v)===String(cur)?' selected':''}>${esc(l)}</option>`).join('');}
  function fmtN(n){if(!n&&n!==0)return'—';if(n>=100000)return(n/100000).toFixed(1)+'L';if(n>=1000)return Math.round(n).toLocaleString('en-IN');return Math.round(n).toString();}
  function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}



  // Format history date YYYY-MM-DD → "23 May 2026"
  function fmtHistDate(d){
    if(!d)return'';
    try{
      const dt=new Date(d);
      if(isNaN(dt.getTime()))return d;
      return dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
    }catch(e){return d;}
  }

  // Find last case (matching filter combo) for showing IPD/Lead in recommendation
  function findLastCaseDetails(hospName, filters){
    let cases=DATA.aspCases.filter(c=>c.hospitalName.toLowerCase().trim()===hospName.toLowerCase().trim());
    if(filters.city)cases=cases.filter(c=>c.city===filters.city);
    if(filters.insurer)cases=cases.filter(c=>c.insuranceName===filters.insurer);
    if(filters.tpa)cases=cases.filter(c=>c.tpaName===filters.tpa);
    if(filters.category)cases=cases.filter(c=>c.category.toLowerCase()===filters.category.toLowerCase());
    if(filters.procedure)cases=cases.filter(c=>c.procedureGroup===filters.procedure);
    if(!cases.length)return null;
    // Sort by DOD descending, take latest
    const sorted=cases.filter(c=>c.dodParsed).sort((a,b)=>b.dodParsed.getTime()-a.dodParsed.getTime());
    const latest=sorted[0]||cases[0];
    return{ipdId:latest.ipdId||'—',leadId:latest.leadId||'—'};
  }

  return{init,switchView,openPanel};
})();
