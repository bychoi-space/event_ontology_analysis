/* =========================================================
   UI 렌더링 엔진 (카드, 뷰, 비교 도크 렌더링)
   ========================================================= */
function render(){
  const list=document.getElementById('list'),note=document.getElementById('modeNote'),sort=document.getElementById('sort').value;
  let rows=[];
  if(mode==="related"&&relBase){
    note.className="modeNote show";
    note.innerHTML=`🧬 <b>${escHtml(relBase.name)}</b> 와 온톨로지 유사도 높은 기획전 (접근루트 동일 가중 반영) — <span class="x" onclick="backToFilter()">필터로 돌아가기</span>`;
    rows=EVENTS.filter(e=>e.id!==relBase.id).map(e=>({e,score:similarity(relBase,e),hits:sharedKw(relBase,e)}));
    rows.sort((a,b)=>b.score-a.score);
  }else if(mode==="nl"){
    const q=document.getElementById('q').value.trim();
    note.className="modeNote show";
    note.innerHTML=`🗣️ 자연어 검색: "<b>${escHtml(q)}</b>" — 동의어 의미 매칭 — <span class="x" onclick="backToFilter()">초기화</span>`;
    rows=EVENTS.map(e=>{const s=nlScore(e,q);return{e,score:s.score,hits:s.hits,keep:s.keep};}).filter(r=>r.keep);
    rows.sort((a,b)=>b.score-a.score);
  }else if(mode==="brand"&&brandCtx){
    note.className="modeNote show";
    note.innerHTML=`🏷️ <b>${escHtml(brandCtx.name)}</b> 온톨로지 근접 기획전 (브랜드 무관 · 유사도순) — <span class="x" onclick="backToFilter()">필터로 돌아가기</span>`;
    rows=EVENTS.map(e=>({e,score:similarity(brandCtx.profile,e),hits:sharedKw(brandCtx.profile,e)}));
    rows.sort((a,b)=>b.score-a.score);
  }else{
    note.className="modeNote";
    rows=EVENTS.filter(e=>evalEvent(e,conditions,logic)).map(e=>({e,score:0,hits:new Set()}));
  }

  // 정렬
  if(sort==="eff")   rows.sort((a,b)=>salesEff(b.e)-salesEff(a.e));
  else if(sort==="sales")rows.sort((a,b)=>b.e.sales-a.e.sales);
  else if(sort==="disc") rows.sort((a,b)=>b.e.discMax-a.e.discMax);
  else if(sort==="conv") rows.sort((a,b)=>b.e.convRate-a.e.convRate);
  else if(sort==="sim")  rows.sort((a,b)=>b.score-a.score);
  if((mode==="brand"||mode==="nl"||mode==="related") && sort==="eff") rows.sort((a,b)=>b.score-a.score); // 관련도/유사도 모드는 기본 정렬을 관련도순으로

  document.getElementById('cnt').textContent=rows.length;
  document.getElementById('cntTop').textContent=rows.length;
  const s=summaryText();
  document.getElementById('logicPill').textContent=s.pill;

  // 좌측 필터 조건이나 검색어가 변경되어 렌더링될 때 우측 AI PLAN 영역을 초기화 (옵션 A)
  const recoBox = document.getElementById('recoBox');
  const recoEmpty = document.getElementById('recoEmpty');
  if (recoBox && recoEmpty) {
    recoBox.innerHTML = '';
    recoBox.className = 'recoBox';
    recoEmpty.style.display = 'block';
  }

  if(!rows.length){
    list.innerHTML=`<div class="empty">조건에 맞는 기획전이 없습니다.<br>조건을 완화해 보세요 (값 범위 확대 · 결합방식 OR 전환 · 일부 조건 삭제).
      <div class="relax"><button class="btn sec sm" onclick="setLogic('OR')">결합방식 OR로 전환</button>
      <button class="btn sec sm" onclick="clearConds()">조건 초기화</button></div></div>`;
    return;
  }
  list.innerHTML=rows.map(r=>card(r.e,r.score,r.hits||new Set())).join('');
  renderReco(rows.map(r=>r.e));
}

function card(e,score,hits){
  const pct=Math.round(score*100);
  const showScore = (mode==="related"||mode==="nl"||mode==="brand");
  const simBg = pct>=70?'#16a34a':pct>=45?'#d97706':'#475569';
  const simLabel=(mode==="related"||mode==="brand")?`유사도 ${pct}%`:(mode==="nl"?`관련도 ${pct}%`:`매출효율 ${salesEff(e).toFixed(0)}`);
  const simBg2 = showScore ? simBg : '#1e3a5f';
  const c=discColor(e.discMax);
  const sc=v=>Math.min(100,v/80*100);
  const segL=sc(e.discMin), segW=Math.max(4,sc(e.discMax)-sc(e.discMin));
  const kwHtml=AXES.map(a=>e.kw[a.key].map(v=>`<span class="kw ${a.key}${hits.has(v)?' match':''}">${v}</span>`).join('')).join('');
  const rv=REVIEWS[e.id];

  // 신규 배지
  const multiBdg = e.multi_brand_yn
    ? `<span class="bdg multi">🏷️ 통합전 <b>${e.brand_count}브랜드</b></span>`
    : `<span class="bdg single">🏷️ 단일브랜드</span>`;
  const curBdg = `<span class="bdg cur">🎨 ${ENUM_LABELS.curation_type[e.curation_type]||e.curation_type}</span>`;
  const routeBdg = `<span class="bdg route">🧭 ${ENUM_LABELS.access_route[e.access_route]||e.access_route}</span>`;
  const cxBdg = `<span class="bdg cx">⚙️ 복잡도 ${e.complexity_score}/5</span>`;
  const effBdg = `<span class="bdg eff">📈 매출효율 <b>${salesEff(e).toFixed(0)}</b></span>`;
  const visBdg = `<span class="bdg">👁️ 시인성 ${e.visibility_score}/5</span>`;

  let reviewHtml='';
  if(rv){
    const ov=reviewOverall(rv);
    const subs=REV_AXES.map(a=>{
      const v=rv.scores[a.key];
      return `<div class="srow" title="${a.desc}">
        <span class="slab">${a.label}<i>${Math.round(a.w*100)}%</i></span>
        <span class="sbar"><i style="width:${v/5*100}%"></i></span>
        <span class="sval">${v.toFixed(1)}</span></div>`;
    }).join('');
    reviewHtml=`
    <div class="review">
      <div class="rhead">
        <span class="rtitle">👁️ 시인성 평가</span>
        <span class="stars">${stars(ov)}</span>
        <span class="rscore">${ov.toFixed(1)}</span>
        <span class="rweight">가중평균 · 5점 만점</span>
      </div>
      <div class="subgrid">${subs}</div>
      <div class="rtext">${rv.text}</div>
      <div class="rpc"><span class="pro">👍 ${rv.pros}</span><span class="con">👎 ${rv.cons}</span></div>
    </div>`;
  }
  const inComp = compareIds.includes(e.id);
  return `
  <div class="card">
    <a class="thumb" href="${e.url}" target="_blank" rel="noopener" title="새 탭에서 기획전 열기">
      <span class="idtag">#${e.id}</span>
      <img src="${e.img}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
      <div class="fallback" style="background:linear-gradient(135deg,${e.curation_type==='SALES_FOCUS'?'#475569,#1e293b':e.main_category==='SPORTS'?'#0ea5e9,#1d4ed8':e.multi_brand_yn?'#f59e0b,#b91c1c':'#7c3aed,#4c1d95'})">${e.name}</div>
      <span class="goto">기획전 열기 ↗</span>
    </a>
    <div class="body">
      <div class="crow">
        <div>
          <div class="nm"><a href="${e.url}" target="_blank">${e.name}</a></div>
          <div class="meta">${e.period} · 상품 ${e.prodCnt}개 · 브랜드 ${e.brand_count}개 · ${ENUM_LABELS.main_category[e.main_category]||e.main_category} · ${ENUM_LABELS.curation_type[e.curation_type]||e.curation_type}</div>
        </div>
        <span class="sim" style="background:${simBg2}">${simLabel}</span>
      </div>
      <div class="badges">${multiBdg}${curBdg}${routeBdg}${visBdg}${cxBdg}${effBdg}</div>
      <div class="summary">${e.summary}</div>
      <div class="discWrap">
        <div class="discBadge" style="background:${c}">
          <span class="lab">할인율</span><span class="rng">${e.discMin}~${e.discMax}%</span>
        </div>
        <div class="discTrack">
          <div class="tl"><span>0%</span><span>40%</span><span>80%+</span></div>
          <div class="gbar">
            <div class="seg" style="left:${segL}%;width:${segW}%"></div>
            <div class="cap" style="left:${sc(e.discMax)}%"></div>
          </div>
        </div>
      </div>
      <div class="kpis">
        <div class="kpi">가상매출<b>${e.sales.toLocaleString()}만원</b></div>
        <div class="kpi">유입수<b>${e.visits.toLocaleString()}</b></div>
        <div class="kpi">전환율<b>${e.convRate}%</b></div>
        <div class="kpi">RPV(원)<b>${Math.round(rpv(e)).toLocaleString()}</b></div>
        <div class="kpi">매출효율<b>${salesEff(e).toFixed(0)}</b></div>
      </div>
      <div class="kwline">${kwHtml}</div>
      ${reviewHtml}
      <div class="cardActions">
        <button class="btn sm" onclick="showRelated(${e.id})">🧬 유사 기획전</button>
        <button class="btn sm ${inComp?'danger':'sec'}" onclick="toggleCompare(${e.id})">${inComp?'✓ 비교 담김':'⚖️ 비교 담기'}</button>
      </div>
    </div>
  </div>`;
}
function stars(r){
  let h='';
  for(let i=1;i<=5;i++){
    if(r>=i)h+='<span class="f">★</span>';
    else if(r>=i-0.5)h+='<span class="h">★</span>';
    else h+='<span class="s">★</span>';
  }
  return h;
}

/* =========================================================
   비교 도크
   ========================================================= */
function toggleCompare(id){
  const i=compareIds.indexOf(id);
  if(i>=0){ compareIds.splice(i,1); }
  else {
    if(compareIds.length>=3){ toast("비교는 최대 3개까지 가능합니다"); return; }
    compareIds.push(id);
  }
  render(); renderCompare();
}
function clearCompare(){ compareIds=[]; render(); renderCompare(); }
function renderCompare(){
  const dock=document.getElementById('compDock'), body=document.getElementById('compBody');
  if(compareIds.length===0){ dock.classList.remove('show'); return; }
  dock.classList.add('show');
  const evs=compareIds.map(id=>EVENTS.find(e=>e.id===id)).filter(Boolean);
  // 비교 행 정의 (facet 순서)
  const rows=[
    ["큐레이션유형", e=>ENUM_LABELS.curation_type[e.curation_type]||e.curation_type, false],
    ["통합전 여부", e=>e.multi_brand_yn?`통합전(${e.brand_count})`:"단일브랜드", true],
    ["메인카테고리", e=>ENUM_LABELS.main_category[e.main_category], true],
    ["쿠폰유형", e=>ENUM_LABELS.coupon_type[e.coupon_type], true],
    ["접근루트", e=>ENUM_LABELS.access_route[e.access_route], true],
    ["큐레이션", e=>ENUM_LABELS.curation_type[e.curation_type], true],
    ["시인성", e=>e.visibility_score, true],
    ["복잡도", e=>e.complexity_score, true],
    ["동선깊이", e=>e.nav_depth, true],
    ["할인율(%)", e=>`${e.discMin}~${e.discMax}`, false],
    ["상품수", e=>e.prodCnt, true],
    ["가상매출(만원)", e=>e.sales, true, "max"],
    ["유입수", e=>e.visits, true, "max"],
    ["전환율(%)", e=>e.convRate, true, "max"],
    ["RPV(원)", e=>Math.round(rpv(e)), true, "max"],
    ["매출효율", e=>Math.round(salesEff(e)), true, "max"]
  ];
  let html=`<table class="comp"><thead><tr><th class="rl">facet</th>`+
    evs.map(e=>`<th>#${e.id}<br>${e.name.length>14?e.name.slice(0,13)+'…':e.name}<span class="rm" title="제거" onclick="toggleCompare(${e.id})">✕</span></th>`).join('')+
    `</tr></thead><tbody>`;
  rows.forEach(r=>{
    const [label, fn, hlDiff, bestMode] = r;
    const vals=evs.map(fn);
    const distinct = new Set(vals.map(v=>String(v))).size;
    let bestVal=null;
    if(bestMode==="max"){ bestVal=Math.max(...vals.map(v=>Number(v))); }
    html+=`<tr><td class="rl">${label}</td>`+
      vals.map((v,i)=>{
        let cls="";
        if(hlDiff && distinct>1) cls="diff";
        if(bestMode==="max" && Number(v)===bestVal && distinct>1) cls="best";
        return `<td class="${cls}">${typeof v==='number'?v.toLocaleString():v}</td>`;
      }).join('')+`</tr>`;
  });
  html+=`</tbody></table>
    <div class="hint" style="padding:6px 4px 0">파란색=값이 서로 다른 facet · 초록색=성과지표 최댓값. 동일 접근루트 비교 권장(편향 제거).</div>`;
  body.innerHTML=html;
}

/* =========================================================
   Gemini API 연동 비동기 분석 실행 함수
   ========================================================= */
function getCurrentVisibleEvents() {
  let list = [];
  if (mode === "related" && relBase) {
    list = EVENTS.filter(e => e.id !== relBase.id).map(e => ({e, score: similarity(relBase, e)}));
    list.sort((a, b) => b.score - a.score);
    list = list.map(x => x.e);
  } else if (mode === "nl") {
    const q = document.getElementById('q').value.trim();
    list = EVENTS.map(e => { const s = nlScore(e, q); return {e, score: s.score, keep: s.keep}; }).filter(r => r.keep);
    list.sort((a, b) => b.score - a.score);
    list = list.map(x => x.e);
  } else if (mode === "brand" && brandCtx) {
    list = EVENTS.map(e => ({e, score: similarity(brandCtx.profile, e)}));
    list.sort((a, b) => b.score - a.score);
    list = list.map(x => x.e);
  } else {
    list = EVENTS.filter(e => evalEvent(e, conditions, logic));
  }
  
  // 정렬 순서 적용
  const sort = document.getElementById('sort').value;
  if (sort === "eff") list.sort((a, b) => salesEff(b) - salesEff(a));
  else if (sort === "sales") list.sort((a, b) => b.sales - a.sales);
  else if (sort === "disc") list.sort((a, b) => b.discMax - a.discMax);
  else if (sort === "conv") list.sort((a, b) => b.convRate - a.convRate);
  
  return list;
}

async function runGeminiAnalysis() {
  // CONFIG.gemini_api_key 로컬 설정 파일에서 읽어옴 (방법 1)
  const apiKey = CONFIG.gemini_api_key || '';
  if (!apiKey) {
    toast("CONFIG.gemini_api_key 설정이 누락되었습니다. data.json 설정을 확인하세요.");
    return;
  }
  
  const model = document.getElementById('geminiModelSelect').value;
  const events = getCurrentVisibleEvents();
  if (events.length === 0) {
    toast("분석할 기획전 데이터가 없습니다.");
    return;
  }
  
  const recoBox = document.getElementById('recoBox');
  const recoEmpty = document.getElementById('recoEmpty');
  const runBtn = document.getElementById('runAiBtn');
  
  // UI 로딩 상태 표시
  recoEmpty.style.display = 'none';
  recoBox.className = 'recoBox show';
  recoBox.innerHTML = `
    <div class="rh">💡 AI PLAN <span class="ai">Gemini 분석 중...</span></div>
    <div style="text-align: center; padding: 26px 0;">
      <div class="spinner" style="display: inline-block; width: 26px; height: 26px; border: 3px solid rgba(255,255,255,.1); border-radius: 50%; border-top-color: var(--accent); animation: spin 0.8s linear infinite;"></div>
      <div style="font-size: 11.5px; color: var(--sub); margin-top: 10px;">기획전 ${events.length}개 데이터를 요약 분석하고 있습니다...</div>
    </div>
  `;
  runBtn.disabled = true;
  runBtn.style.opacity = '0.6';
  
  // 키프레임 동적 삽입
  if (!document.getElementById('spinner-style')) {
    const style = document.createElement('style');
    style.id = 'spinner-style';
    style.innerHTML = `@keyframes spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }
  
  try {
    // 요약된 데이터 정보 가공 (토큰 절약 및 속도 향상)
    const contextEvents = events.slice(0, 15).map(e => ({
      id: e.id,
      name: e.name,
      curation_type: e.curation_type,
      main_category: e.main_category,
      discMin: e.discMin,
      discMax: e.discMax,
      prodCnt: e.prodCnt,
      brand_count: e.brand_count,
      sales: e.sales,
      convRate: e.convRate,
      visits: e.visits,
      keywords: allKw(e).slice(0, 6)
    }));
    
    const prompt = `You are a retail promotion expert. Analyze these ${contextEvents.length} e-commerce promotions:
${JSON.stringify(contextEvents, null, 2)}

Recommend a new promotion strategy (AI PLAN) in Korean.
You must return only a clean HTML block matching this format (do NOT wrap it in markdown code blocks like \`\`\`html, just output raw HTML directly):
<div class="rh">💡 AI PLAN <span class="ai">Gemini 실시간 추천</span></div>
<div class="rsum">조회된 <b>\${events.length}개</b> 기획전 분석 요약 내용...</div>
<div class="pickBox">🎯 <b>방향 선택</b><br>· 분석 요약 A<br>· 분석 요약 B</div>
<div class="planGrid">
  <div class="planCard"><div class="pt">📦 상품 구성 컨셉</div><ul><li>내용 1</li><li>내용 2</li></ul></div>
  <div class="planCard"><div class="pt">👁️ 시인성 강화 방안</div><ul><li>내용 1</li><li>내용 2</li></ul></div>
  <div class="planCard"><div class="pt">🎟️ 혜택·가격 전략</div><ul><li>내용 1</li><li>내용 2</li></ul></div>
  <div class="planCard"><div class="pt">🧭 구성·동선 설계</div><ul><li>내용 1</li><li>내용 2</li></ul></div>
</div>

At the very end of your response, add a hidden JSON metadata block for the prototype builder like this:
<!-- PROTOTYPE_METADATA:
{
  "title": "추천 기획전 메인 타이틀 (예: 썸머 키즈 바캉스 페어)",
  "brand": "추천 브랜드명 (예: HAZZYS KIDS)",
  "sub": "추천 기획전 서브 문구 (예: 시원한 여름을 위한 아동복 단독 특가)",
  "coupon": "혜택 비율 (예: 20%)",
  "couponDesc": "쿠폰 조건 (예: 10만원 이상 구매 시)",
  "attention": ["본 이벤트는 선착순 한도 마감 시 조기 종료됩니다.", "쿠폰은 ID당 1일 1회에 한해 지급 가능합니다."]
}
-->`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });
    
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || "API 요청 실패");
    }
    
    const result = await response.json();
    let reply = result.candidates[0].content.parts[0].text;
    
    // 마크업 코드 블럭 형식 백틱 제거 가드
    reply = reply.replace(/^```html\s*/i, '').replace(/```\s*$/, '').trim();
    
    lastAiReply = reply;
    recoBox.innerHTML = reply + `
      <button class="btn" style="margin-top: 14px; width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;" onclick="openPrototypeModal()">
        <span>✨ LFmall NEW 템플릿 프로토타입 프리뷰</span>
      </button>
    `;
  } catch (err) {
    console.error(err);
    recoBox.innerHTML = `
      <div class="rh">💡 AI PLAN <span class="ai" style="background:var(--bad)">분석 에러</span></div>
      <div style="font-size:12px; color:var(--bad); line-height:1.6; padding:12px; border:1px solid var(--bad); border-radius:8px; background:rgba(239,68,68,.08); margin-top:8px;">
        오류가 발생했습니다:<br><b>${err.message}</b><br><br>
        1. API 키가 유효한지 확인하세요.<br>
        2. 네트워크 상태 혹은 CORS 제한을 체크하세요.
      </div>
    `;
  } finally {
    runBtn.disabled = false;
    runBtn.style.opacity = '1';
  }
}

/* =========================================================
   프로토타입 미리보기 모달 제어 및 와이어프레임 렌더링
   ========================================================= */
let lastAiReply = '';

function switchPreviewTab(tab) {
  const moTab = document.getElementById('tabMoBtn');
  const pcTab = document.getElementById('tabPcBtn');
  const moPrev = document.getElementById('moPreview');
  const pcPrev = document.getElementById('pcPreview');
  
  if (tab === 'mo') {
    moTab.classList.add('active');
    pcTab.classList.remove('active');
    moPrev.classList.add('show');
    pcPrev.classList.remove('show');
  } else {
    pcTab.classList.add('active');
    moTab.classList.remove('active');
    pcPrev.classList.add('show');
    moPrev.classList.remove('show');
  }
}

function closePreviewModal() {
  document.getElementById('previewModal').classList.remove('show');
}

function openPrototypeModal() {
  if (!lastAiReply) {
    toast("분석된 AI PLAN 데이터가 없습니다.");
    return;
  }
  
  // 1. 디폴트 메타데이터 정의
  let metadata = {
    title: "SUMMER SPECIAL WEEK",
    brand: "LFmall",
    sub: "시원한 여름 시즌을 겨냥한 MD 단독 추천 특가전",
    coupon: "15%",
    couponDesc: "15만원 이상 결제 시 사용 가능",
    attention: [
      "본 이벤트는 선착순 한도 마감 시 조기 종료됩니다.",
      "쿠폰은 ID당 1일 1회에 한해 지급 가능합니다.",
      "일부 특가 상품 및 아울렛 브랜드는 적용 대상에서 제외됩니다."
    ]
  };
  
  // 2. AI PLAN 하단 주석의 JSON 메타데이터 파싱 시도
  try {
    const match = lastAiReply.match(/<!-- PROTOTYPE_METADATA:\s*([\s\S]*?)\s*-->/);
    if (match && match[1]) {
      const parsed = JSON.parse(match[1].trim());
      metadata = { ...metadata, ...parsed };
    }
  } catch (e) {
    console.error("Failed to parse prototype metadata:", e);
  }
  
  const wf = window.ExhibitionWireframes || {};
  
  // 3. TOP_BANNER 렌더링 및 동적 텍스트 치환
  let topBannerHtml = "";
  if (wf["TOP_BANNER"]) {
    let rawHtml = wf["TOP_BANNER"].wireframeHtml;
    rawHtml = rawHtml.replace(/FLUKE/g, metadata.brand);
    rawHtml = rawHtml.replace(/SPRING &<br>SUMMER/g, metadata.title);
    rawHtml = rawHtml.replace(/SPRING&<br>SUMMER/g, metadata.title);
    rawHtml = rawHtml.replace(/SPRING & SUMMER/g, metadata.title);
    rawHtml = rawHtml.replace(/플루크는 스케이드보드 캠핑, 여행 등 우리 삶 속 즐겁고 행복한 순간을 함께하고자 합니다\./g, metadata.sub);
    rawHtml = rawHtml.replace(/BUTTON/g, "기획전 바로가기 ↗");
    topBannerHtml = rawHtml;
  }
  
  // 4. B_BENEFIT (구매혜택) 렌더링 및 동적 텍스트 치환
  let benefitHtml = "";
  if (wf["B_BENEFIT"]) {
    let rawHtml = wf["B_BENEFIT"].wireframeHtml;
    rawHtml = rawHtml.replace(/Benefit\(HEADLINE\)<br>두줄까지 가능합니다/g, "AI 추천 구매 혜택");
    rawHtml = rawHtml.replace(/짧게 한줄 혹은, 하단에 기재되는 메인<br>우대와 장바구니 쿠폰 혜택 \(Below\)/g, "단독 혜택과 특별 할인 혜택을 드립니다.");
    rawHtml = rawHtml.replace(/20%/g, metadata.coupon);
    rawHtml = rawHtml.replace(/20만원 이상 구매 시/g, metadata.couponDesc);
    benefitHtml = rawHtml;
  }
  
  // 5. ATTENTION (유의사항) 렌더링 및 동적 텍스트 치환
  let attentionHtml = "";
  if (wf["ATTENTION"]) {
    let rawHtml = wf["ATTENTION"].wireframeHtml;
    const liList = metadata.attention.map(item => `<li>${item}</li>`).join("");
    rawHtml = rawHtml.replace(/<ul style='font-size:12px; color: var\(--slate\); padding-left:16px; line-height: 1\.6;'>[\s\S]*?<\/ul>/, 
      `<ul style='font-size:12px; color: var(--slate); padding-left:16px; line-height: 1.6;'>${liList}</ul>`);
    attentionHtml = rawHtml;
  }
  
  // 6. 컴포넌트들을 합쳐서 뷰포트에 렌더링
  const finalHtml = `
    ${topBannerHtml}
    <div style="height:24px; background:#fff;"></div>
    ${benefitHtml}
    <div style="height:24px; background:#fff;"></div>
    ${attentionHtml}
  `;
  
  document.getElementById('moPreviewScreen').innerHTML = finalHtml;
  document.getElementById('pcPreviewScreen').innerHTML = finalHtml;
  
  // 7. 모달 활성화
  document.getElementById('previewModal').classList.add('show');
}