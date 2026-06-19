const PAGE2 = (() => {
  const f={year:'',quarter:'',month:'',city:'',category:'',insurer:'',tpa:'',hospital:'',status:''};
  const th={city:'',category:'',insurer:'',tpa:'',year:'',month:'',top:'10',mode:'volume'};
  let charts={},trendMode='monthly';

  // Tier accordion open state
  const accOpen={Gold:false,Silver:false,Bronze:false,Underutilized:false};

  function init(){renderFilters();renderAll();bindEvents();onDataRefresh(()=>{renderFilters();renderAll();});}

  function getFiltered(){
    let cases=DATA.aspCases;
    if(f.year)    cases=cases.filter(c=>c.doaParsed&&c.doaParsed.getFullYear()===parseInt(f.year));
    if(f.quarter) cases=cases.filter(c=>c.doaParsed&&Math.ceil((c.doaParsed.getMonth()+1)/3)===parseInt(f.quarter));
    if(f.month)   cases=cases.filter(c=>c.doaParsed&&String(c.doaParsed.getMonth()+1).padStart(2,'0')===f.month);
    if(f.city)    cases=cases.filter(c=>c.city===f.city);
    if(f.category)cases=cases.filter(c=>c.category.toLowerCase()===f.category.toLowerCase());
    if(f.insurer) cases=cases.filter(c=>c.insuranceName===f.insurer);
    if(f.tpa)     cases=cases.filter(c=>c.tpaName===f.tpa);
    if(f.hospital)cases=cases.filter(c=>c.hospitalName===f.hospital);
    if(f.status){
      // Build map of hospital name -> active status
      const statusMap={};
      DATA.hospitals.forEach(h=>{statusMap[h.hospitalName.toLowerCase().trim()]=h.activeStatus;});
      cases=cases.filter(c=>statusMap[c.hospitalName.toLowerCase().trim()]===f.status);
    }
    return cases;
  }

  function renderAll(){
    const cases=getFiltered();
    renderMetrics(cases);
    renderCityCategoryChart(cases);
    renderTrend(cases);
    renderTiers(cases);  // reactive to city filter
    renderTopHospitals();
    renderCityChart(cases);
    renderInsurerChart(cases);
    populateComparators();
  }

  function renderMetrics(cases){
    const valid=cases.filter(c=>c.approvalAmount!==null);
    const avgASP=valid.length?Math.round(valid.reduce((s,c)=>s+c.approvalAmount,0)/valid.length):null;
    setText('m-cases',cases.length.toLocaleString('en-IN'));
    setText('m-asp',avgASP?'₹'+fmtN(avgASP):'—');
    setText('m-cats',new Set(DATA.aspCases.map(c=>c.category).filter(Boolean)).size);
    setText('m-ins',new Set(DATA.aspCases.map(c=>c.insuranceName).filter(Boolean)).size);
    setText('m-cities',new Set(DATA.aspCases.map(c=>c.city).filter(Boolean)).size);
  }

  function renderCityCategoryChart(cases){
    destroyChart('cityCat');
    const ctx=document.getElementById('chart-city-cat');if(!ctx)return;
    const valid=cases.filter(c=>c.approvalAmount!==null);
    if(!valid.length){ctx.parentElement.innerHTML='<div style="color:var(--text3);font-size:13px;padding:20px;">No data for current filters.</div>';return;}
    const byCity=groupBy(valid,c=>c.city);
    const entries=Object.entries(byCity).map(([city,hc])=>({city:cityLabel(city),val:Math.round(avg(hc.map(c=>c.approvalAmount))),count:hc.length})).sort((a,b)=>b.val-a.val);
    const cityColors=['#0ea5e9','#10b981','#8b5cf6','#f97316','#ec4899','#eab308','#06b6d4','#ef4444','#84cc16'];
    charts.cityCat=new Chart(ctx,{type:'bar',data:{labels:entries.map(e=>e.city),datasets:[
      {type:'bar',label:'Avg ASP',data:entries.map(e=>e.val),backgroundColor:entries.map((_,i)=>cityColors[i%cityColors.length]),borderRadius:4,maxBarThickness:44,order:2},
      {type:'line',label:'Avg ASP Trend',data:entries.map(e=>e.val),borderColor:'#1e293b',borderWidth:2,pointRadius:4,pointBackgroundColor:'#1e293b',tension:.3,fill:false,order:1}
    ]},options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:24,right:10}},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>{if(c.datasetIndex===0)return'Avg ASP: ₹'+fmtN(c.raw)+' • '+entries[c.dataIndex].count+' cases';return'';}}}},scales:{x:{ticks:{font:{size:10},maxRotation:35},grid:{display:false}},y:{ticks:{font:{size:10},callback:v=>'₹'+fmtN(v)},grid:{color:'#f0f0f0'},beginAtZero:false}},animation:{onComplete:function(){const chart=this;const c2=chart.ctx;c2.save();c2.font='bold 10px DM Sans,sans-serif';c2.textAlign='center';c2.textBaseline='bottom';const meta=chart.getDatasetMeta(0);meta.data.forEach((bar,j)=>{const v=chart.data.datasets[0].data[j];if(!v)return;c2.fillStyle='#0f172a';c2.fillText('₹'+fmtN(v),bar.x,bar.y-4);});c2.restore();}}}});
  }

  // ASP Trend with 3 lines: Avg ASP, Total Approval, Cases
  function renderTrend(cases){
    const validCases=cases.filter(c=>c.approvalAmount!==null&&c.doaParsed);
    const grouped={};
    validCases.forEach(c=>{
      const d=c.doaParsed;let key;
      if(trendMode==='yearly')key=`${d.getFullYear()}`;
      else if(trendMode==='quarterly')key=`${d.getFullYear()} Q${Math.ceil((d.getMonth()+1)/3)}`;
      else key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if(!grouped[key])grouped[key]=[];grouped[key].push(c.approvalAmount);
    });
    const sorted=Object.entries(grouped).sort(([a],[b])=>a.localeCompare(b));
    const labels=sorted.map(([k])=>{if(trendMode==='yearly'||trendMode==='quarterly')return k;const[yr,mo]=k.split('-');return['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+mo-1]+'\''+yr.slice(2);});
    const avgData=sorted.map(([,v])=>Math.round(v.reduce((s,x)=>s+x,0)/v.length));
    const totalApproval=sorted.map(([,v])=>Math.round(v.reduce((s,x)=>s+x,0)));
    const counts=sorted.map(([,v])=>v.length);
    destroyChart('trend');
    const ctx=document.getElementById('chart-trend');if(!ctx)return;
    charts.trend=new Chart(ctx,{type:'line',data:{labels,datasets:[
      {label:'Avg ASP',data:avgData,borderColor:'#0ea5e9',backgroundColor:'rgba(14,165,233,.08)',borderWidth:2.5,pointRadius:4,pointBackgroundColor:'#0ea5e9',tension:.3,fill:true,yAxisID:'y'},
      {label:'Total Approval',data:totalApproval,borderColor:'#8b5cf6',borderWidth:2,pointRadius:3,pointBackgroundColor:'#8b5cf6',borderDash:[8,4],tension:.3,fill:false,yAxisID:'y2'},
      {label:'Cases',data:counts,borderColor:'#10b981',borderWidth:2,pointRadius:3,pointBackgroundColor:'#10b981',borderDash:[4,2],tension:.3,fill:false,yAxisID:'y1'}
    ]},options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:24}},interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>{if(c.datasetIndex===0)return'Avg ASP: ₹'+fmtN(c.raw);if(c.datasetIndex===1)return'Total Approval: ₹'+fmtN(c.raw);return'Cases: '+c.raw;}}}},scales:{x:{ticks:{font:{size:10},maxRotation:35},grid:{display:false}},y:{position:'left',ticks:{color:'#0ea5e9',font:{size:10},callback:v=>'₹'+fmtN(v)},grid:{color:'#f0f0f0'},title:{display:true,text:'Avg ASP',color:'#0ea5e9',font:{size:11}}},y1:{position:'right',ticks:{color:'#10b981',font:{size:10}},grid:{display:false},title:{display:true,text:'Cases',color:'#10b981',font:{size:11}}},y2:{position:'left',display:false}},animation:{onComplete:function(){const chart=this;const c2=chart.ctx;c2.save();c2.font='bold 9px DM Sans,sans-serif';c2.textAlign='center';const meta0=chart.getDatasetMeta(0);meta0.data.forEach((pt,j)=>{const v=chart.data.datasets[0].data[j];if(!v)return;c2.fillStyle='#0284c7';c2.fillText('₹'+fmtN(v),pt.x,pt.y-8);});const meta2=chart.getDatasetMeta(2);meta2.data.forEach((pt,j)=>{const v=chart.data.datasets[2].data[j];if(!v)return;c2.fillStyle='#059669';c2.fillText(v,pt.x,pt.y-8);});c2.restore();}}}});
    // Render custom legend
    const leg=document.getElementById('trend-legend');
    if(leg)leg.innerHTML=`
      <span style="display:flex;align-items:center;gap:4px;"><span style="width:14px;height:3px;background:#0ea5e9;border-radius:2px;display:inline-block;"></span>Avg ASP</span>
      <span style="display:flex;align-items:center;gap:4px;"><span style="width:14px;height:0;border-top:2px dashed #8b5cf6;display:inline-block;"></span>Total Approval</span>
      <span style="display:flex;align-items:center;gap:4px;"><span style="width:14px;height:0;border-top:2px dashed #10b981;display:inline-block;"></span>Cases</span>`;
  }

  function setTrendMode(mode){
    trendMode=mode;
    ['monthly','quarterly','yearly'].forEach(m=>{const el=document.getElementById('trend-'+m);if(el)el.classList.toggle('active',m===mode);});
    renderTrend(getFiltered());
  }

  // ACCORDION TIER CARDS - dark navy, reactive to city filter
  function renderTiers(cases){
    const el=document.getElementById('p2-tiers');if(!el)return;
    // Score hospitals using only filtered cases
    const cityAvg={};
    const byCity=groupBy(cases.filter(c=>c.approvalAmount!==null),c=>c.city);
    Object.entries(byCity).forEach(([city,hc])=>{cityAvg[city]=avg(hc.map(c=>c.approvalAmount));});
    const byHosp=groupBy(cases,c=>c.hospitalName);
    const maxVol=Math.max(...Object.values(byHosp).map(x=>x.length),1);
    const maxCov=DATA.insurerNames.length+DATA.tpaNames.length||1;

    const scored=Object.entries(byHosp).map(([name,hc])=>{
      const valid=hc.filter(c=>c.approvalAmount!==null);if(!valid.length)return null;
      const aspVal=avg(valid.map(c=>c.approvalAmount));
      const city=hc[0].city;
      const aspScore=Math.min(100,(aspVal/(cityAvg[city]||aspVal))*50+50);
      const hNet=DATA.hospitals.find(h=>h.hospitalName.toLowerCase().trim()===name.toLowerCase().trim());
      const empCount=hNet?(Object.values(hNet.insurer).filter(Boolean).length+Object.values(hNet.tpa).filter(Boolean).length):0;
      const covScore=(empCount/maxCov)*100;
      const volScore=(hc.length/maxVol)*100;
      const score=Math.round(aspScore*CONFIG.SCORE_WEIGHT_ASP+covScore*CONFIG.SCORE_WEIGHT_COVERAGE+volScore*CONFIG.SCORE_WEIGHT_VOLUME);
      let tier=null;
      if(hc.length>=CONFIG.TIER_MIN_CASES){if(score>=CONFIG.TIER_GOLD)tier='Gold';else if(score>=CONFIG.TIER_SILVER)tier='Silver';else if(score>=CONFIG.TIER_BRONZE)tier='Bronze';}
      else if(hc.length<=CONFIG.UNDERUTILIZED_MAX_CASES&&aspScore>=CONFIG.UNDERUTILIZED_MIN_ASP_SCORE && hNet && hNet.activeStatus==='Active')tier='Underutilized';
      return{name,aspVal,vol:hc.length,score,tier,city};
    }).filter(Boolean);

    const tierCfg=[
      {key:'Gold',icon:'🥇',iconBg:'#fef3c7',color:'#fbbf24',countBg:'rgba(251,191,36,.2)'},
      {key:'Silver',icon:'🥈',iconBg:'#f1f5f9',color:'#94a3b8',countBg:'rgba(148,163,184,.15)'},
      {key:'Bronze',icon:'🥉',iconBg:'#fef9ee',color:'#d97706',countBg:'rgba(217,119,6,.15)'},
      {key:'Underutilized',icon:'⚠️',iconBg:'#fef3c7',color:'#f59e0b',countBg:'rgba(245,158,11,.15)'},
    ];

    const grouped={};tierCfg.forEach(t=>{grouped[t.key]=scored.filter(h=>h.tier===t.key).sort((a,b)=>b.score-a.score);});

    if(!scored.length){el.innerHTML='<div style="color:var(--text3);font-size:13px;padding:8px;">No tier data for current filters.</div>';return;}

    el.innerHTML=tierCfg.map(({key,icon,iconBg,color,countBg})=>{
      const hosps=grouped[key];if(!hosps.length)return'';
      const isOpen=accOpen[key];
      return`<div class="tier-acc" id="acc-${key}">
        <div class="tier-acc-hdr ${isOpen?'open':''}" onclick="PAGE2.toggleAcc('${key}')">
          <div class="tier-acc-icon" style="background:${iconBg};">${icon}</div>
          <div class="tier-acc-title" style="color:${color};">${key}</div>
          <div class="tier-acc-count" style="background:${countBg};color:${color};">${hosps.length} hospital${hosps.length>1?'s':''}</div>
          <div class="tier-acc-chevron">▼</div>
        </div>
        <div class="tier-acc-body ${isOpen?'open':''}" id="acc-body-${key}">
          ${hosps.map(h=>`
            <div class="tier-dk-card" onclick="PAGE1.openPanel('${h.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')">
              <div class="tier-dk-badge" style="background:${iconBg};color:${color};">${icon} ${key.toUpperCase()}</div>
              ${h.score?`<div style="float:right;font-size:10px;color:#64748b;font-family:monospace;">${h.score}</div>`:''}
              <div class="tier-dk-name">${esc(h.name.split(',')[0])}</div>
              <div class="tier-dk-meta">
                <span style="color:#34d399;font-weight:700;">₹${fmtN(h.aspVal)} ASP</span>
                <span style="color:#7dd3fc;">${h.vol} cases</span>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
    }).join('');
  }

  function toggleAcc(key){
    accOpen[key]=!accOpen[key];
    const hdr=document.querySelector(`#acc-${key} .tier-acc-hdr`);
    const body=document.getElementById('acc-body-'+key);
    if(hdr)hdr.classList.toggle('open',accOpen[key]);
    if(body)body.classList.toggle('open',accOpen[key]);
  }

  // Top hospitals ranking
  function renderTopHospitals(){
    const el=document.getElementById('th-results');if(!el)return;
    let cases=DATA.aspCases;
    if(th.city)    cases=cases.filter(c=>c.city===th.city);
    if(th.category)cases=cases.filter(c=>c.category.toLowerCase()===th.category.toLowerCase());
    if(th.insurer) cases=cases.filter(c=>c.insuranceName===th.insurer);
    if(th.tpa)     cases=cases.filter(c=>c.tpaName===th.tpa);
    if(th.year)    cases=cases.filter(c=>c.doaParsed&&c.doaParsed.getFullYear()===parseInt(th.year));
    if(th.month)   cases=cases.filter(c=>c.doaParsed&&String(c.doaParsed.getMonth()+1).padStart(2,'0')===th.month);
    const topN=parseInt(th.top)||10;
    // Aggregate per HOSPITAL (not combinations)
    const byHosp={};
    cases.forEach(c=>{if(!c.approvalAmount)return;if(!byHosp[c.hospitalName])byHosp[c.hospitalName]={hosp:c.hospitalName,city:c.city,asp:[]};byHosp[c.hospitalName].asp.push(c.approvalAmount);});
    const rows=Object.values(byHosp).map(d=>({hosp:d.hosp,city:d.city,avgAsp:Math.round(d.asp.reduce((s,v)=>s+v,0)/d.asp.length),count:d.asp.length,total:Math.round(d.asp.reduce((s,v)=>s+v,0))}));
    rows.sort((a,b)=>th.mode==='asp'?b.avgAsp-a.avgAsp:b.count-a.count);
    const top=rows.slice(0,topN);
    const maxCases=top.length?top.reduce((m,r)=>Math.max(m,r.count),0):1;
    const maxAsp=top.length?top.reduce((m,r)=>Math.max(m,r.avgAsp),0):1;
    const hospCount=new Set(rows.map(r=>r.hosp)).size;
    const totalCases=rows.reduce((s,r)=>s+r.count,0);
    const avgASPAll=rows.length?Math.round(rows.reduce((s,r)=>s+r.avgAsp,0)/rows.length):0;
    const summary=document.getElementById('th-summary');
    if(summary)summary.textContent=`${hospCount} hospitals • ${totalCases.toLocaleString('en-IN')} total cases • Avg ASP: ₹${fmtN(avgASPAll)}`;
    if(!top.length){el.innerHTML='<div style="color:var(--text3);font-size:13px;padding:16px;">No data for current filters.</div>';return;}
    el.innerHTML=top.map((r,i)=>{
      const hNet=DATA.hospitals.find(h=>h.hospitalName.toLowerCase().trim()===r.hosp.toLowerCase().trim());
      const casesPct=Math.round((r.count/maxCases)*100);
      const aspPct=Math.round((r.avgAsp/maxAsp)*100);
      const totalL=r.total>=100000?(r.total/100000).toFixed(1)+'L':fmtN(r.total);
      return`<div class="th-row">
        <div class="th-rank">${i+1}</div>
        <div class="th-info">
          <div class="th-hosp-row">
            <span class="th-hosp-name" onclick="PAGE1.openPanel('${r.hosp.replace(/'/g,"\\'")}')" >${i<3?(i===0?'🥇 ':i===1?'🥈 ':'🥉 '):''}${esc(r.hosp.split(',')[0])}</span>
            ${hNet?`<span class="status-badge ${hNet.activeStatus==='Active'?'status-active':'status-inactive'}" style="font-size:10px;padding:2px 7px;">${hNet.activeStatus}</span>`:''}
            <span style="font-size:12px;color:var(--text3);">${cityLabel(r.city)}</span>
          </div>
          <div class="th-bars">
            <div class="th-bar-row">
              <span class="th-bar-label">Cases</span>
              <div class="th-bar-track"><div class="th-bar-fill th-bar-cases" style="width:${casesPct}%"></div></div>
              <span class="th-bar-val th-bar-val-green">${r.count}</span>
            </div>
            <div class="th-bar-row">
              <span class="th-bar-label">Avg ASP</span>
              <div class="th-bar-track"><div class="th-bar-fill th-bar-asp" style="width:${aspPct}%"></div></div>
              <span class="th-bar-val">₹${fmtN(r.avgAsp)}</span>
            </div>
          </div>
        </div>
        <div class="th-total">
          <div class="th-total-label">Total</div>
          <div class="th-total-val">₹${totalL}</div>
        </div>
      </div>`;
    }).join('');
  }

  function setThMode(mode){
    th.mode=mode;
    document.getElementById('th-by-vol')?.classList.toggle('btn-teal',mode==='volume');
    document.getElementById('th-by-vol')?.classList.toggle('btn-outline',mode!=='volume');
    document.getElementById('th-by-asp')?.classList.toggle('btn-teal',mode==='asp');
    document.getElementById('th-by-asp')?.classList.toggle('btn-outline',mode!=='asp');
    renderTopHospitals();
  }

  // Charts WITH data labels
  function renderCityChart(cases){
    const byCity=groupBy(cases.filter(c=>c.approvalAmount!==null),c=>c.city);
    const entries=Object.entries(byCity).map(([city,hc])=>({city:cityLabel(city),val:Math.round(avg(hc.map(c=>c.approvalAmount)))})).sort((a,b)=>b.val-a.val);
    destroyChart('city');
    const ctx=document.getElementById('chart-city');if(!ctx)return;
    charts.city=new Chart(ctx,{type:'bar',data:{labels:entries.map(e=>e.city),datasets:[{label:'Avg ASP',data:entries.map(e=>e.val),backgroundColor:'#0ea5e9',borderRadius:4}]},options:barOpts('₹',entries.map(e=>e.val))});
  }

  function renderInsurerChart(cases){
    const byIns=groupBy(cases.filter(c=>c.approvalAmount!==null),c=>c.insuranceName);
    const entries=Object.entries(byIns)
      .filter(([,v])=>v.length>=3)
      .map(([ins,hc])=>({ins,val:Math.round(avg(hc.map(c=>c.approvalAmount))),count:hc.length}))
      .sort((a,b)=>b.val-a.val)
      .slice(0,15);
    destroyChart('insurer');
    const ctx=document.getElementById('chart-insurer');if(!ctx)return;
    const labels=entries.map(e=>e.ins.length>22?e.ins.slice(0,20)+'…':e.ins);
    const fullNames=entries.map(e=>e.ins);
    const caseCounts=entries.map(e=>e.count);
    charts.insurer=new Chart(ctx,{
      type:'bar',
      data:{labels,datasets:[{label:'Avg ASP',data:entries.map(e=>e.val),backgroundColor:'#a78bfa',borderRadius:6,barThickness:14}]},
      options:{
        responsive:true,
        maintainAspectRatio:false,
        indexAxis:'y',
        layout:{padding:{right:130,left:5,top:8,bottom:5}},
        plugins:{
          legend:{display:false},
          tooltip:{callbacks:{
            title:items=>fullNames[items[0].dataIndex],
            label:c=>'Avg ASP: ₹'+fmtN(c.raw)+' • '+caseCounts[c.dataIndex]+' cases'
          }}
        },
        scales:{
          x:{display:false,beginAtZero:true},
          y:{ticks:{font:{size:11,family:'DM Sans'},color:'#475569',autoSkip:false},grid:{display:false},border:{display:false}}
        },
        animation:{onComplete:function(){
          const chart=this;const c2=chart.ctx;
          c2.save();
          c2.font='600 11px DM Sans,sans-serif';
          c2.textAlign='left';
          c2.textBaseline='middle';
          chart.data.datasets.forEach((ds,i)=>{
            chart.getDatasetMeta(i).data.forEach((bar,j)=>{
              const v=ds.data[j];if(!v)return;
              const aspLbl='₹'+fmtN(v);
              const cntLbl=' ('+caseCounts[j]+'c)';
              c2.fillStyle='#6d28d9';
              c2.fillText(aspLbl,bar.x+6,bar.y);
              const w=c2.measureText(aspLbl).width;
              c2.fillStyle='#94a3b8';
              c2.fillText(cntLbl,bar.x+6+w,bar.y);
            });
          });
          c2.restore();
        }}
      }
    });
  }

  function barOpts(px,vals){
    return{responsive:true,maintainAspectRatio:false,layout:{padding:{top:18,right:60}},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>px+fmtN(c.raw)}}},
    scales:{x:{ticks:{font:{size:10},maxRotation:35,callback:function(v,i){const lbl=this.getLabelForValue(v);return lbl.length>22?lbl.slice(0,20)+'…':lbl;}},grid:{display:false}},y:{ticks:{font:{size:10},callback:v=>px+fmtN(v)},grid:{color:'#f0f0f0'}}},
    animation:{onComplete:function(){
      const chart=this;const ctx2=chart.ctx;ctx2.save();ctx2.font='bold 11px DM Sans,sans-serif';ctx2.fillStyle='#0f172a';
      chart.data.datasets.forEach((dataset,i)=>{chart.getDatasetMeta(i).data.forEach((bar,j)=>{
        const v=dataset.data[j];if(!v)return;
        const lbl=px+fmtN(v);
        const isHoriz=chart.options.indexAxis==='y';
        if(isHoriz){ctx2.textAlign='left';ctx2.textBaseline='middle';ctx2.fillStyle='#0284c7';ctx2.fillText(lbl,bar.x+6,bar.y);}
        else{ctx2.textAlign='center';ctx2.textBaseline='bottom';ctx2.fillStyle='#0284c7';ctx2.fillText(lbl,bar.x,bar.y-4);}
      });});ctx2.restore();
    }}};
  }

  // Auto top-3 comparator
  function populateComparators(){
    const cities=[['','All Cities'],...getCities().map(c=>[c,cityLabel(c)])];
    const cats=[['','All Categories'],...CONFIG.ACTIVE_CATEGORIES.map(c=>[c,c])];
    const insurers=[['','All Insurers'],...getInsurers().map(i=>[i,i])];
    const tpas=[['','All TPAs'],...getTPAs().map(t=>[t,t])];
    fillSel('comp-city',cities,'');fillSel('comp-insurer',insurers,'');fillSel('comp-tpa',tpas,'');
    fillSel('comp-cat',cats,'');fillSel('comp-proc',[['','All Procedures'],...getProceduresForCategory('').map(p=>[p,p])],'');
    const thYrs=[['','All Years'],...[...new Set(DATA.aspCases.map(c=>c.doaParsed&&c.doaParsed.getFullYear()).filter(Boolean))].sort().map(y=>[y,String(y)])];
    const thMos=[['','All Months'],['01','Jan'],['02','Feb'],['03','Mar'],['04','Apr'],['05','May'],['06','Jun'],['07','Jul'],['08','Aug'],['09','Sep'],['10','Oct'],['11','Nov'],['12','Dec']];
    fillSel('th-year',thYrs,'');fillSel('th-month',thMos,'');
    fillSel('th-city',cities,'');fillSel('th-category',cats,'');fillSel('th-insurer',insurers,'');fillSel('th-tpa',tpas,'');
  }

  function runComparison(){
    const city=document.getElementById('comp-city')?.value,insurer=document.getElementById('comp-insurer')?.value,tpa=document.getElementById('comp-tpa')?.value,category=document.getElementById('comp-cat')?.value,procedure=document.getElementById('comp-proc')?.value;
    const el=document.getElementById('comp-result');if(!el)return;
    // STRICT filtering — Active + current empanelment status
    let recs=getRecommendations({city,insurer,tpa,category,procedure,topN:50});
    const hospLookup={};
    DATA.hospitals.forEach(h=>{hospLookup[h.hospitalName.toLowerCase().trim()]=h;});
    recs=recs.filter(r=>{
      const h=hospLookup[r.hospitalName.toLowerCase().trim()];
      if(!h||h.activeStatus!=='Active')return false;
      if(insurer && h.insurer[insurer]!==true && h.insurerRaw && h.insurerRaw[insurer]!=='No')return false;
      if(insurer && h.insurerRaw && h.insurerRaw[insurer]==='No')return false;
      if(tpa && h.tpa[tpa]!==true && h.tpaRaw && h.tpaRaw[tpa]!=='No')return false;
      if(tpa && h.tpaRaw && h.tpaRaw[tpa]==='No')return false;
      return true;
    }).slice(0,3);
    if(!recs.length){
      const desc=[city?cityLabel(city):'',insurer||'',tpa||'',category||'',procedure||''].filter(Boolean).join(' · ');
      el.innerHTML=`<div style="background:var(--amber-lt);border-left:4px solid var(--amber);border-radius:6px;padding:14px 16px;font-size:13px;color:#92400e;">
        <strong>⚠ No cases found</strong> for: ${esc(desc)||'these filters'}
        <div style="font-size:12px;margin-top:4px;color:#a16207;">Try removing one or more filters.</div>
      </div>`;
      return;
    }
    const stats=recs.map(r=>{const res=compareHospitals(r.hospitalName,recs[0].hospitalName,{category,procedure});return res.a.hospitalName===r.hospitalName?res.a:res.b;});
    const desc=[city?cityLabel(city):'',insurer||'',tpa||'',category||'',procedure||''].filter(Boolean).join(' · ');
    el.innerHTML=`<div style="font-size:12px;color:var(--text3);margin-bottom:12px;">Top 3 for: <strong style="color:var(--text);">${esc(desc)||'All combinations'}</strong></div>
    <div class="comp3-grid">${stats.map((s,i)=>{
      const isBest=i===0;const medal=i===0?'🥇':i===1?'🥈':'🥉';
      const hNet=DATA.hospitals.find(h=>h.hospitalName.toLowerCase().trim()===s.hospitalName.toLowerCase().trim());
      return`<div class="comp3-card ${isBest?'best':''}">
        <div class="comp3-rank" style="color:${isBest?'rgba(255,255,255,.7)':'var(--text3)'};">${medal}</div>
        <div class="comp3-name" style="color:${isBest?'#fff':'var(--text)'};">${esc(s.hospitalName.split(',')[0])}</div>
        <div class="comp3-asp" style="color:${isBest?'#fff':'var(--teal)'};">₹${fmtN(s.avgASP)}</div>
        <div class="comp3-stat"><span style="color:${isBest?'rgba(255,255,255,.7)':'var(--text2)'};">Total cases</span><span style="font-weight:700;color:${isBest?'#fff':'var(--text)'};">${s.totalCases}</span></div>
        <div class="comp3-stat"><span style="color:${isBest?'rgba(255,255,255,.7)':'var(--text2)'};">Avg ASP</span><span style="font-weight:700;color:${isBest?'#fff':'var(--teal)'};">${s.avgASP?'₹'+fmtN(s.avgASP):'—'}</span></div>
        <div class="comp3-stat"><span style="color:${isBest?'rgba(255,255,255,.7)':'var(--text2)'};">Business score</span><span style="font-weight:700;color:${isBest?'#fff':'var(--text)'};">${s.businessScore?'₹'+fmtN(s.businessScore):'—'}</span></div>
        <div class="comp3-stat"><span style="color:${isBest?'rgba(255,255,255,.7)':'var(--text2)'};">Last case</span><span style="font-weight:600;font-size:11px;color:${isBest?'#fff':'var(--text)'};">${s.lastCaseDate||'—'}</span></div>
        ${hNet?`<div style="margin-top:8px;"><span class="status-badge ${hNet.activeStatus==='Active'?'status-active':'status-inactive'}">${hNet.activeStatus}</span></div>`:''}
        <div style="margin-top:6px;">${s.topProcedures.slice(0,2).map(p=>`<div style="font-size:10px;color:${isBest?'rgba(255,255,255,.65)':'var(--text3)'};padding:2px 0;">${esc(p.procedure)} (${p.count})</div>`).join('')}</div>
      </div>`;}).join('')}</div>`;
  }

  function renderFilters(){
    const yrs=[['','All Years'],...[...new Set(DATA.aspCases.map(c=>c.doaParsed&&c.doaParsed.getFullYear()).filter(Boolean))].sort().reverse().map(y=>[y,String(y)])];
    const mos=[['','All Months'],['01','January'],['02','February'],['03','March'],['04','April'],['05','May'],['06','June'],['07','July'],['08','August'],['09','September'],['10','October'],['11','November'],['12','December']];
    fillSel('p2-year',yrs,f.year);fillSel('p2-month',mos,f.month);
    fillSel('p2-city',[['','All Cities'],...getCities().map(c=>[c,cityLabel(c)])],f.city);
    fillSel('p2-category',[['','All Categories'],...CONFIG.ACTIVE_CATEGORIES.map(c=>[c,c])],f.category);
    fillSel('p2-insurer',[['','All Insurers'],...getInsurers().map(i=>[i,i])],f.insurer);
    fillSel('p2-tpa',[['','All TPAs'],...getTPAs().map(t=>[t,t])],f.tpa);
    fillSel('p2-hospital',[['','All Hospitals'],...[...new Set(DATA.aspCases.map(c=>c.hospitalName))].sort().map(h=>[h,h])],f.hospital);
  }

  function bindEvents(){
    ['year','quarter','month','city','category','insurer','tpa','hospital','status'].forEach(k=>{
      document.getElementById('p2-'+k)?.addEventListener('change',e=>{f[k]=e.target.value;renderAll();});
    });
    on('p2-clear',()=>{Object.keys(f).forEach(k=>f[k]='');renderFilters();renderAll();});
    on('comp-go',runComparison);
    on('comp-cat','change',()=>{const cat=document.getElementById('comp-cat')?.value;fillSel('comp-proc',[['','All Procedures'],...getProceduresForCategory(cat).map(p=>[p,p])],'');});
    ['th-city','th-category','th-insurer','th-tpa','th-year','th-month','th-top'].forEach(id=>{
      const key=id.replace('th-','');document.getElementById(id)?.addEventListener('change',e=>{th[key]=e.target.value;renderTopHospitals();});
    });
    on('th-reset',()=>{Object.keys(th).forEach(k=>{if(k!=='mode'&&k!=='top')th[k]='';});populateComparators();renderTopHospitals();});
  }

  function on(id,evOrFn,fn){
    // Supports both on(id, fn) for click and on(id, event, fn) for any event
    if(typeof evOrFn==='function'){
      document.getElementById(id)?.addEventListener('click',evOrFn);
    }else{
      document.getElementById(id)?.addEventListener(evOrFn,fn);
    }
  }
  function fillSel(id,opts,cur){const el=document.getElementById(id);if(!el)return;el.innerHTML=opts.map(([v,l])=>`<option value="${esc(String(v))}"${String(v)===String(cur)?' selected':''}>${esc(l)}</option>`).join('');}
  function destroyChart(k){if(charts[k]){charts[k].destroy();delete charts[k];}}
  function groupBy(arr,fn){return arr.reduce((acc,item)=>{const key=fn(item);if(!acc[key])acc[key]=[];acc[key].push(item);return acc;},{});}
  function avg(arr){return arr.length?arr.reduce((s,v)=>s+v,0)/arr.length:0;}
  function fmtN(n){if(!n&&n!==0)return'—';if(n>=100000)return(n/100000).toFixed(1)+'L';if(n>=1000)return Math.round(n).toLocaleString('en-IN');return Math.round(n).toString();}
  function setText(id,v){const el=document.getElementById(id);if(el)el.textContent=v;}
  function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function shortIns(n){return n.replace('Health Insurance','Hlth Ins').replace('General Insurance','Gen Ins').replace('Co. Ltd.','').replace('Company Ltd.','').replace('Insurance','Ins').trim().slice(0,22);}

  return{init,setTrendMode,setThMode,toggleAcc};
})();
