/* =========================================================
   LFmall 기획전 온톨로지 분석 툴 - 좌측 검색 패널 & 비즈니스 로직
   ========================================================= */

const ENUM_LABELS = {
  multi_brand_yn:{true:"통합전(멀티)",false:"단일브랜드"},
  is_entr_yn:{true:"입점O",false:"입점X"},
  main_category:{FASHION:"패션",SPORTS:"스포츠",GOLF:"골프",KIDS:"키즈",LIVING:"리빙",BEAUTY:"뷰티",SHOES:"슈즈",ACC:"잡화"},
  coupon_type:{GENERAL:"일반",PLUS:"PLUS",DUP:"중복",CART:"장바구니",NONE:"없음"},
  card_benefit_yn:{true:"페이백O",false:"페이백X"},
  access_route:{HOME_BANNER:"홈배너",VAR_TAB:"가변탭",EVENT_ONLY:"기획전전용"},
  curation_type:{CONTENT:"콘텐츠큐레이션",SEASON_LEAD:"시즌리딩",SALES_FOCUS:"세일즈포커싱",CATEGORY:"카테고리전",BEST:"베스트큐레이션",NEW_LAUNCH:"신상런칭"},
  gift_yn:{true:"사은품O",false:"사은품X"},
  size_bucket:{소량:"소량(~30개)",중량:"중량(30~80개)",대량:"대량(80개+)"}
};

function enumValues(field){
  const fromData = [...new Set(EVENTS.map(e=>String(e[field])))];
  const fromLbl = Object.keys(ENUM_LABELS[field]||{});
  return [...new Set([...fromData, ...fromLbl])];
}

const FACETS = {
  // ① 주어속성
  multi_brand_yn: {grp:1, label:"통합전 여부(multi_brand_yn)", type:"enum", bool:true},
  is_entr_yn:     {grp:1, label:"입점 여부(is_entr_yn)", type:"enum", bool:true},
  main_category:  {grp:1, label:"메인카테고리(main_category)", type:"enum"},
  curation_type:  {grp:1, label:"큐레이션유형(curation_type)", type:"enum"},
  brand_count:    {grp:1, label:"브랜드 수(brand_count)", type:"range", min:1, max:20, step:1, unit:"개"},
  // ② 방식속성
  coupon_type:    {grp:2, label:"쿠폰유형(coupon_type)", type:"enum"},
  gift_yn:        {grp:2, label:"사은품 여부(gift_yn)", type:"enum", bool:true},
  visibility_score:{grp:2, label:"시인성(visibility_score)", type:"range", min:1, max:5, step:1, unit:"점"},
  complexity_score:{grp:2, label:"복잡도(complexity_score)", type:"range", min:1, max:5, step:1, unit:"점"},
  nav_depth:      {grp:2, label:"동선깊이(nav_depth)", type:"range", min:1, max:6, step:1, unit:"단계"},
  disc:           {grp:2, label:"할인율(disc, min~max)", type:"range", min:0, max:95, step:1, unit:"%", discRange:true},
  prodCnt:        {grp:2, label:"상품수(prodCnt)", type:"range", min:0, max:300, step:5, unit:"개"},
  size_bucket:    {grp:2, label:"상품수 구간(size_bucket)", type:"enum"},
  // ③ 결과/성과
  sales:          {grp:3, label:"가상매출(sales)", type:"range", min:0, max:4000, step:50, unit:"만원"},
  convRate:       {grp:3, label:"전환율(convRate)", type:"range", min:0, max:5, step:0.1, unit:"%"},
  rpv:            {grp:3, label:"RPV·방문당매출(rpv)", type:"range", min:0, max:3000, step:50, unit:"원", derived:e=>Math.round(rpv(e))}
};

const GROUPS = [
  {id:1, label:"① 주어 속성 (무엇에 관한 행사)", color:"#a78bfa"},
  {id:2, label:"② 방식 속성 (운영 방식)", color:"#38bdf8"},
  {id:3, label:"③ 결과 / 성과 지표", color:"#22c55e"}
];

/* =========================================================
   조건 엔진 — 견고성 (NaN 가드, between/gte/lte/eq/in, AND/OR)
   ========================================================= */
function evalCond(e, c){
  const f = FACETS[c.field];
  if(!f) return true;
  if(f.type==="enum"){
    if(!c.values || c.values.length===0) return true;
    let v = String(e[c.field]);
    return c.values.includes(v);
  }
  if(f.discRange){
    const lo=Number(c.lo), hi=Number(c.hi);
    if(isNaN(lo)||isNaN(hi)) return true;
    return e.discMax>=lo && e.discMin<=hi;
  }
  const val = f.derived ? Number(f.derived(e)) : Number(e[c.field]);
  if(isNaN(val)) return false;
  const lo=Number(c.lo), hi=Number(c.hi);
  switch(c.op){
    case "between": if(isNaN(lo)||isNaN(hi)) return true; return val>=Math.min(lo,hi) && val<=Math.max(lo,hi);
    case "gte":     if(isNaN(lo)) return true; return val>=lo;
    case "lte":     if(isNaN(hi)) return true; return val<=hi;
    case "eq":      if(isNaN(lo)) return true; { const f=FACETS[c.field]; const tol=(f&&f.step?f.step:1)/2; return Math.abs(val-lo)<tol; }
    default:        if(isNaN(lo)||isNaN(hi)) return true; return val>=Math.min(lo,hi) && val<=Math.max(lo,hi);
  }
}

function evalEvent(e, conds, logic){
  const active = conds.filter(c=>{
    const f=FACETS[c.field];
    if(!f) return false;
    if(f.type==="enum") return c.values && c.values.length>0;
    return true;
  });
  if(active.length===0) return true;
  if(logic==="OR") return active.some(c=>evalCond(e,c));
  return active.every(c=>evalCond(e,c));
}

/* =========================================================
   상태
   ========================================================= */
let condSeq = 1;

function discColor(d){
  const t=Math.min(1, d/75);
  const hue=Math.round(140 - t*140);
  const sat=70+Math.round(t*18);
  const lig=46-Math.round(t*6);
  return `hsl(${hue},${sat}%,${lig}%)`;
}

/* =========================================================
   facet 아코디언 빌드
   ========================================================= */
function buildAccordions(){
  const host=document.getElementById('accGroups');
  host.innerHTML = GROUPS.map((g,gi)=>{
    const fkeys=Object.keys(FACETS).filter(k=>FACETS[k].grp===g.id).filter(k=>{
      const f=FACETS[k];
      if(f.type!=="enum") return true;
      const vals=[...new Set(EVENTS.map(e=>String(e[k])))].filter(v=>v&&v!=="undefined"&&v!=="null");
      return vals.length>=2;
    });
    const items=fkeys.map(k=>{
      const f=FACETS[k];
      return `<button class="facetBtn" onclick="addCondition('${k}')">
        <span>${f.label}</span>
        <span class="ft ${f.type}">${f.type==='enum'?'enum':'range'}</span>
      </button>`;
    }).join('');
    return `<div class="acc ${gi===0?'open':''}" id="acc-${g.id}">
      <div class="head" onclick="toggleAcc(${g.id})">
        <span class="dot" style="background:${g.color}"></span>${g.label}
        <span class="arr">▶</span>
      </div>
      <div class="body"><div class="facetList">${items}</div></div>
    </div>`;
  }).join('');
}

function toggleAcc(id){ document.getElementById('acc-'+id).classList.toggle('open'); }

/* =========================================================
   조건 추가 / 렌더
   ========================================================= */
function addCondition(field){
  const f=FACETS[field];
  if(conditions.some(c=>c.field===field)){ toast("이미 추가된 조건입니다"); return; }
  const c={id:condSeq++, field};
  if(f.type==="enum"){ c.values=[]; }
  else { c.op = "between"; c.lo=f.min; c.hi=f.max; }
  conditions.push(c);
  mode="filter"; relBase=null; document.getElementById('q').value="";
  renderConditions(); render();
}

function delCondition(id){ conditions=conditions.filter(c=>c.id!==id); renderConditions(); render(); }
function clearConds(){ conditions=[]; mode="filter"; relBase=null; document.getElementById('q').value=""; renderConditions(); render(); }

function setLogic(l){
  logic=l;
  document.querySelectorAll('#logicToggle button').forEach(b=>b.classList.toggle('on', b.dataset.l===l));
  render();
}

function renderConditions(){
  const host=document.getElementById('condList');
  if(conditions.length===0){
    host.innerHTML=`<div class="emptyCond">좌측 facet을 눌러 조건을 추가하세요.<br>조건이 없으면 전체 ${EVENTS.length}건을 표시합니다.</div>`;
    return;
  }
  host.innerHTML = conditions.map((c,i)=>{
    const f=FACETS[c.field];
    const grpLbl = ["","① 주어속성","② 방식속성","③ 결과·성과"][f.grp];
    const g=GROUPS.find(x=>x.id===f.grp); const gc=g?g.color:"#8893a8";
    let inner="";
    if(f.type==="enum"){
      const opts = f.bool ? ["true","false"] : enumValues(c.field);
      inner = `<div class="enumVals">` + opts.map(v=>{
        const lbl = (ENUM_LABELS[c.field] && ENUM_LABELS[c.field][v]) ? ENUM_LABELS[c.field][v] : v;
        const on = c.values.includes(v);
        return `<span class="enumChip ${on?'on':''}" onclick="toggleEnum(${c.id},'${v}')">${lbl}</span>`;
      }).join('') + `</div>
      <div class="hint" style="margin-top:5px">연산자: 포함(in) · 다중선택 시 OR 매칭</div>`;
    } else {
      const ops = f.discRange
        ? [["between","범위겹침(between)"]]
        : [["between","범위(between)"],["gte","이상(≥)"],["lte","이하(≤)"],["eq","같음(=)"]];
      const opSel = `<select class="opSel" onchange="setOp(${c.id},this.value)">`+
        ops.map(o=>`<option value="${o[0]}" ${c.op===o[0]?'selected':''}>${o[1]}</option>`).join('')+`</select>`;
      const loPct = ((c.lo-f.min)/(f.max-f.min))*100;
      const hiPct = ((c.hi-f.min)/(f.max-f.min))*100;
      let rangeBody;
      if(c.op==="between"||f.discRange){
        rangeBody = `
        <div class="rangeWrap">
          <div class="rlabels"><span>최소 <b>${fmtNum(c.lo)}${f.unit}</b></span><span>최대 <b>${fmtNum(c.hi)}${f.unit}</b></span></div>
          <div class="dual">
            <div class="track"></div>
            <div class="fill" style="left:${loPct}%;width:${Math.max(0,hiPct-loPct)}%"></div>
            <input type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${c.lo}" oninput="setRange(${c.id},'lo',this.value)">
            <input type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${c.hi}" oninput="setRange(${c.id},'hi',this.value)">
          </div>
          <div class="numIn">
            <input type="number" min="${f.min}" max="${f.max}" step="${f.step}" value="${c.lo}" oninput="setRange(${c.id},'lo',this.value)"><span>~</span>
            <input type="number" min="${f.min}" max="${f.max}" step="${f.step}" value="${c.hi}" oninput="setRange(${c.id},'hi',this.value)"><span>${f.unit}</span>
          </div>
        </div>`;
      } else {
        const key = (c.op==="lte") ? "hi" : "lo";
        const val = (c.op==="lte") ? c.hi : c.lo;
        const pct = ((val-f.min)/(f.max-f.min))*100;
        rangeBody = `
        <div class="rangeWrap">
          <div class="rlabels"><span>${c.op==="gte"?"이상":c.op==="lte"?"이하":"값"} <b>${fmtNum(val)}${f.unit}</b></span></div>
          <div class="dual">
            <div class="track"></div>
            <div class="fill" style="left:0;width:${pct}%"></div>
            <input type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${val}" oninput="setRange(${c.id},'${key}',this.value)">
          </div>
          <div class="numIn">
            <input type="number" min="${f.min}" max="${f.max}" step="${f.step}" value="${val}" oninput="setRange(${c.id},'${key}',this.value)"><span>${f.unit}</span>
          </div>
        </div>`;
      }
      inner = `<div class="ctrlRow">${opSel}</div>${rangeBody}`;
    }
    const conn = i>0 ? `<div class="rowConn">${logic}</div>` : "";
    return conn + `<div class="condRow" style="border-left:4px solid ${gc};background:linear-gradient(90deg,${gc}22,#1a2130 46%)">
      <div class="rowtop">
        <span class="fgrp" style="background:${gc};color:#0b1020;border-color:${gc}">${grpLbl}</span>
        <span class="fname">${f.label}</span>
        <button class="del" title="삭제" onclick="delCondition(${c.id})">✕</button>
      </div>
      ${inner}
    </div>`;
  }).join('');
}

function fmtNum(n){ n=Number(n); return Number.isInteger(n)?n:n.toFixed(1); }

function toggleEnum(id,v){
  const c=conditions.find(x=>x.id===id); if(!c)return;
  const i=c.values.indexOf(v);
  if(i>=0) c.values.splice(i,1); else c.values.push(v);
  renderConditions(); render();
}

function setOp(id,op){ const c=conditions.find(x=>x.id===id); if(!c)return; c.op=op; renderConditions(); render(); }

function setRange(id,key,val){
  const c=conditions.find(x=>x.id===id); if(!c)return;
  let v=Number(val); if(isNaN(v))return;
  const f=FACETS[c.field];
  v=Math.max(f.min,Math.min(f.max,v));
  c[key]=v;
  if(c.lo>c.hi){ if(key==="lo") c.hi=c.lo; else c.lo=c.hi; }
  renderConditions(); render();
}

/* =========================================================
   프리셋 (localStorage)
   ========================================================= */
function escHtml(s){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }



/* =========================================================
   자연어 / 연관
   ========================================================= */
function setNL(t){document.getElementById('q').value=t;runNL();}
function runNL(){
  const q=document.getElementById('q').value.trim();
  if(!q){mode="filter";render();return;}
  mode="nl";relBase=null;render();
}

function showRelated(id){
  relBase=EVENTS.find(e=>e.id===id);mode="related";
  document.getElementById('q').value="";
  document.getElementById('list').scrollTo({top:0,behavior:'smooth'});
  render();
}

function backToFilter(){ mode="filter"; relBase=null; brandCtx=null; document.getElementById('q').value=""; render(); }

function summaryText(){
  const active = conditions.filter(c=>{
    const f=FACETS[c.field]; if(f.type==="enum") return c.values&&c.values.length>0; return true;
  });
  if(mode==="nl") return {pill:`자연어: "${document.getElementById('q').value.trim()}"`};
  if(mode==="related"&&relBase) return {pill:`유사: ${relBase.name}`};
  if(active.length===0) return {pill:"조건 없음 · 전체"};
  return {pill:`${active.length}개 조건 (${logic})`};
}

/* =========================================================
   AI 추천 코멘트 (조회 결과 총평) — 결정적 휴리스틱
   ========================================================= */
const CUR_LBL = {CONTENT:"콘텐츠큐레이션",SEASON_LEAD:"시즌리딩",SALES_FOCUS:"세일즈포커싱",CATEGORY:"카테고리전",BEST:"베스트큐레이션"};
function hasGift(e){ return e.kw.benefit.some(b=>/사은품|선착순|증정/.test(b)); }
function lbl(field,v){ return (ENUM_LABELS[field]&&ENUM_LABELS[field][v]) ? ENUM_LABELS[field][v] : v; }

function topConcepts(evs,n){
  const c={};
  evs.forEach(e=>(e.concepts||[]).forEach(w=>c[w]=(c[w]||0)+1));
  evs.forEach(e=>(e.kinds||[]).forEach(w=>c[w]=(c[w]||0)+0.5));
  return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,n).map(x=>x[0]);
}

function mode1(evs,f){
  const c={};
  evs.forEach(e=>{const v=String(e[f]);c[v]=(c[v]||0)+1;});
  return Object.entries(c).sort((a,b)=>b[1]-a[1])[0];
}

function renderReco(evs){
  const box=document.getElementById('recoBox');
  const _re=document.getElementById('recoEmpty');
  if(!evs||evs.length===0){box.className='recoBox';if(_re)_re.style.display='block';return;}
  if(_re)_re.style.display='none';
  box.className='recoBox show';
  let _brandHead='';
  if(mode==="brand"&&brandCtx){
    evs=evs.slice(0,Math.min(15,evs.length));
    _brandHead=`<div class="pickBox" style="background:rgba(56,189,248,.12);border-color:#2c4d76">🏷️ <b>${escHtml(brandCtx.name)} 기획전 생성 가이드</b> <span style="font-size:10px;color:var(--muted)">근접 ${evs.length}개 기반</span><br>${brandCtx.kbRec||'온톨로지 근접 기획전 군집을 기반으로 한 데이터 PLAN입니다.'}</div>`;
  }
  const byConv=[...evs].sort((a,b)=>b.convRate-a.convRate),byRPV=[...evs].sort((a,b)=>rpv(b)-rpv(a)),byEff=[...evs].sort((a,b)=>salesEff(b)-salesEff(a));
  const tConv=byConv[0],tRPV=byRPV[0],tEff=byEff[0];
  const curTop=mode1(evs,'curation_type'),catTop=mode1(evs,'main_category'),cpTop=mode1(evs,'coupon_type');
  const avgVis=(evs.reduce((s,e)=>s+e.visibility_score,0)/evs.length).toFixed(1);
  const avgCpx=(evs.reduce((s,e)=>s+e.complexity_score,0)/evs.length).toFixed(1);
  const dmin=Math.min(...evs.map(e=>e.discMin)),dmax=Math.max(...evs.map(e=>e.discMax));
  const concepts=topConcepts(evs,6).filter(Boolean);
  const giftRate=Math.round(evs.filter(e=>e.gift_yn).length/Math.max(1,evs.length)*100);
  const multiRate=Math.round(evs.filter(e=>e.multi_brand_yn).length/Math.max(1,evs.length)*100);
  const sum=`조회된 <b>${evs.length}개</b> 기획전의 주력 큐레이션은 <b>${lbl('curation_type',curTop[0])}</b>(${curTop[1]}건), 주력 카테고리는 <b>${lbl('main_category',catTop[0])}</b>입니다. 전환율 1위 <b>${escHtml(tConv.name)}</b>(${tConv.convRate}%), RPV 1위 <b>${escHtml(tRPV.name)}</b>(${Math.round(rpv(tRPV)).toLocaleString()}원), 매출효율 1위 <b>${escHtml(tEff.name)}</b>. 평균 시인성 ${avgVis}/5 · 복잡도 ${avgCpx}/5.`;
  const goalA=`<b>거래액 극대화</b>형 → <b>${lbl('curation_type',tConv.curation_type)}</b> 골격 + 고할인(${tConv.discMin}~${tConv.discMax}%)·중복쿠폰으로 구매빈도 견인 (벤치마크: ${escHtml(tConv.name)})`;
  const goalB=`<b>객단가·브랜드가치</b>형 → <b>${lbl('curation_type',tRPV.curation_type)}</b> 골격 + 정가/저할인·번들·코디제안으로 바스켓 확대 (벤치마크: ${escHtml(tRPV.name)})`;
  const P=(t,a)=>`<div class="planCard"><div class="pt">${t}</div><ul>${a.map(x=>`<li>${x}</li>`).join('')}</ul></div>`;
  const pProduct=[`핵심 컨셉: <b>${concepts.slice(0,4).join(' · ')||(lbl('main_category',catTop[0])+' 시즌 핵심')}</b> 중심 큐레이션`,`카테고리 믹스: ${lbl('main_category',catTop[0])} 주력 + 연계 ACC/소품으로 객단가 보강`,`편성: ${multiRate>=50?`통합전(멀티 ${multiRate}%) — 브랜드 횡단 BEST 코너`:'단일브랜드 — 라인/시즌 코너 세분화'}`,`구성 규모: 상품 ${tEff.prodCnt}개 수준, BEST·신상·가격대별 3코너 권장`];
  const pVis=[`목표 시인성 <b>${Math.max(4,Math.round(+avgVis))}점</b> — 첫 화면 헤드라인에 ${lbl('curation_type',curTop[0])} 핵심 혜택을 숫자로 명시`,`${dmax>=40?`"최대 ${dmax}% + 즉시할인" 가격 메시지를 메인 배너 상단 고정`:'정가 신상은 "신상·단독·코디제안" 가치 메시지로 차별화'}`,`코너명은 모호어 대신 "${lbl('main_category',catTop[0])} BEST/신상/가격대별"처럼 직관적으로`,`${giftRate>0?`사은품/선착순 혜택(${giftRate}%)을 상단 고정 배너로 가시화`:'쿠폰 다운로드 버튼을 첫 스크롤 내 배치'}`];
  const pBen=[`할인 ${dmin}~${dmax}% 구간, 핵심 미끼상품 ${dmax}%로 진입 유도`,`쿠폰: ${lbl('coupon_type',cpTop[0])} 중심 + 2pack/장바구니 추가할인으로 연결구매`,`복잡도 ${avgCpx} → 페이백·중복쿠폰 과다 지양, 혜택 2단계 이하`];
  const pFlow=[`진입: 홈 메인배너/가변탭 노출 시 1~2뎁스로 단축`,`동선: 첫화면=핵심혜택 → 카테고리 코너 → 연계상품, 이탈 최소화`,`🧬 유사 고매출 기획전 벤치마크 후 차별점 1개 추가`];
  box.innerHTML=`<div class="rh">💡 AI PLAN <span class="ai">${mode==="brand"&&brandCtx?escHtml(brandCtx.name)+" 브랜드 PLAN":"기획전 생성 PLAN 추천"}</span></div>${_brandHead}<div class="rsum">${sum}</div><div class="pickBox">🎯 <b>방향 선택</b><br>· ${goalA}<br>· ${goalB}</div><div class="planGrid">${P('📦 상품 구성 컨셉',pProduct)}${P('👁️ 시인성 강화 방안',pVis)}${P('🎟️ 혜택·가격 전략',pBen)}${P('🧭 구성·동선 설계',pFlow)}</div>`;
}

/* =========================================================
   브랜드 맞춤 추천 (헤지스 history 1,526건 분석 임베드)
   ========================================================= */


/* =========================================================
   루브릭 / 지표 설명
   ========================================================= */
function buildRubric(){
  const ax=REV_AXES.map(a=>`<div style="margin-bottom:4px"><b style="color:var(--ink)">${a.label}</b> <i style="color:var(--accent2);font-style:normal">(${Math.round(a.w*100)}%)</i> — ${a.desc}</div>`).join('');
  document.getElementById('rubricBody').innerHTML = ax +
    `<div style="margin-top:8px;background:var(--card);border:1px solid var(--line2);border-radius:8px;padding:9px 11px">
      <b style="color:var(--ink)">점수 척도</b> · 5 추가설명 불필요 / 4 대체로 명확 / 3 일부 모호 / 2 핵심누락·혼동 / 1 오인위험<br><br>
      <b style="color:var(--ink)">매출효율</b> = 가상매출 ÷ 평균할인율 (할인 1%p당 매출).<br>
      <b style="color:var(--ink)">RPV</b> = 가상매출 ÷ 유입수 (유입 1건당 매출).<br>
      <b style="color:var(--ink)">유사도</b> = 온톨로지 가중 자카드(70%) + 할인겹침(10%) + 상품수근접(8%) + 접근루트동일(12%).<br>
      <span style="color:var(--bad)">⚠ 매출/유입/전환율·시인성/복잡도 점수는 가상·AI추론 추정치 → 현업/DBA 검증 필요.</span>
    </div>`;
}

/* =========================================================
   toast
   ========================================================= */
let toastT=null;
function toast(msg){
  const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),1800);
}

/* =========================================================
   테마 전환
   ========================================================= */
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t==='light'?'light':'dark');
  const b=document.getElementById('themeBtn');
  if(b) b.textContent = (t==='light')?'🌙 다크':'☀️ 라이트';
  try{ localStorage.setItem('lf_theme', t==='light'?'light':'dark'); }catch(e){}
}

function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme')==='light'?'light':'dark';
  applyTheme(cur==='light'?'dark':'light');
}

(function(){
  let t='dark';
  try{ t=localStorage.getItem('lf_theme')||'dark'; }catch(e){}
  applyTheme(t);
})();
