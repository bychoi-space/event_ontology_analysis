/* =========================================================
   온톨로지 알고리즘 & 수리 연산 엔진
   ========================================================= */
function allKw(e){return AXES.flatMap(a=>e.kw[a.key]);}
function reviewOverall(rv){return REV_AXES.reduce((s,a)=>s+rv.scores[a.key]*a.w,0);}
function avgDisc(e){ return (e.discMin + e.discMax) / 2; }
function salesEff(e){ const d=avgDisc(e); return d>0 ? e.sales/d : e.sales; }
function rpv(e){ return e.visits>0 ? e.sales*10000/e.visits : 0; } // 유입 1건당 매출(원)

function rangeOverlap(a1,a2,b1,b2){const lo=Math.max(a1,b1),hi=Math.min(a2,b2);const ov=Math.max(0,hi-lo);const span=Math.max(a2,b2)-Math.min(a1,b1);return span?ov/span:0;}

function similarity(a,b){
  let num=0,den=0;
  for(const ax of AXES){const A=new Set(a.kw[ax.key]),B=new Set(b.kw[ax.key]);
    const inter=[...A].filter(x=>B.has(x)).length;const uni=new Set([...A,...B]).size;
    const j=uni?inter/uni:0;num+=AXIS_WEIGHT[ax.key]*j;den+=AXIS_WEIGHT[ax.key];}
  const kwSim = num/den;
  const dO=rangeOverlap(a.discMin,a.discMax,b.discMin,b.discMax);
  const sc=1-Math.abs(Math.log10(a.prodCnt+1)-Math.log10(b.prodCnt+1))/2;
  const routeBonus = (a.access_route===b.access_route)?1:0; // 접근루트 동일 가중
  return Math.max(0,Math.min(1, kwSim*0.70 + dO*0.10 + Math.max(0,sc)*0.08 + routeBonus*0.12));
}

function sharedKw(a,b){const s=new Set();AXES.forEach(ax=>a.kw[ax.key].forEach(v=>{if(b.kw[ax.key].includes(v))s.add(v);}));return s;}

function idfKw(k){ const d=_DF[String(k).toLowerCase()]||1; return Math.log((_NDOC+1)/(d+1)); }

function nlScore(e,query){
  const q=query.toLowerCase().replace(/[^가-힣a-z0-9% ]/g,' ');
  const toks=q.split(/s+/).filter(Boolean);
  const kwOrig=allKw(e); const evKw=kwOrig.map(k=>k.toLowerCase());
  const hits=new Set(); let score=0;
  toks.forEach(t=>{
    let g=[t]; for(const k in SYN){ if(SYN[k].some(s=>s.includes(t)||t.includes(s))) g=g.concat(SYN[k]); }
    g=[...new Set(g)];
    let best=-1, bk=null;
    evKw.forEach((k,i)=>{ if(/\d+%/.test(k)) return; /* 이벤트별 고유 '~NN%할인' 라벨은 검색 매칭 제외 */ if(g.some(x=>k.includes(x)||x.includes(k))){ const w=idfKw(kwOrig[i]); if(w>best){ best=w; bk=kwOrig[i]; } } });
    if(bk!==null){ score+=Math.max(0,best); hits.add(bk); }
  });
  return { keep: score>=1.0, score, hits };
}
