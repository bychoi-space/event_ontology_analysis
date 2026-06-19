/* =========================================================
   Brand Knowledge Base & Recommendation Advisor
   ========================================================= */

window.BRAND_KB = {
  "헤지스": {
    aliases: ["헤지스", "hazzys", "해지스"], total: 1526, singlePct: 79, multiPct: 21,
    types: [["신상런칭", 12, "#a78bfa"], ["세일즈포커싱", 11, "#f87171"], ["시즌리딩", 10, "#38bdf8"], ["아울렛/이월", 9, "#fbbf24"], ["콘텐츠큐레이션", 8, "#34d399"], ["브랜드일반", 50, "#64748b"]],
    sublines: [["ACC", 30], ["골프", 22], ["키즈", 8], ["PHIZ/기타", 40]],
    rec: `헤지스는 단일브랜드 운영 비중이 <b>79%</b>로 높고, <b>ACC(30%)·골프(22%)</b> 서브라인 기획전이 매우 활발합니다. 신상런칭(12%)과 코디제안형 콘텐츠큐레이션(8%)이 꾸준하므로, <b>단일브랜드 신상런칭 + 콘텐츠 코디제안형</b>을 기본으로 ACC·골프 서브라인 코너를 함께 구성하는 형태를 추천합니다. 할인 행사는 <b>아울렛/이월(9%)</b> 또는 시즌리딩 선물대전으로 분리해 브랜드 가치 훼손을 줄이는 편이 좋습니다.`
  }
};

window.brandRecommend = function() {
  const raw = (document.getElementById('brandInput').value || '').trim();
  const box = document.getElementById('brandReco');
  if (!raw) { box.className = 'brandReco'; return; }
  const key = raw.toLowerCase();
  let kb = null;
  for (const k in BRAND_KB) {
    const b = BRAND_KB[k];
    if (k === raw || b.aliases.some(a => a.toLowerCase() === key)) {
      kb = b;
      kb._name = k;
      break;
    }
  }
  box.className = 'brandReco show';
  if (kb) {
    const bar = kb.types.map(t => `<span style="width:${t[1]}%;background:${t[2]}" title="${t[0]} ${t[1]}%"></span>`).join('');
    const lg = kb.types.map(t => `<em><i style="background:${t[2]}"></i>${t[0]} ${t[1]}%</em>`).join('');
    const sub = kb.sublines.map(s => `<em>· ${s[0]} ${s[1]}%</em>`).join(' ');
    box.innerHTML = `<div class="bc">
      <div class="bt">🏷️ ${escHtml(kb._name)} <span style="font-size:10px;color:var(--sub);font-weight:600">누적 ${kb.total.toLocaleString()}건 분석</span></div>
      <div style="font-size:11px;color:var(--sub)">기획전 유형 분포</div>
      <div class="bbar">${bar}</div>
      <div class="blg">${lg}</div>
      <div class="blg" style="margin-top:-2px">서브라인 ${sub} · 단일 ${kb.singlePct}% / 통합 ${kb.multiPct}%</div>
      <div class="brec">🎯 ${kb.rec}</div>
    </div>`;
  } else {
    const hit = EVENTS.find(e => e.kw.brand.some(b => b.toLowerCase().includes(key)));
    let extra = "";
    if (hit) extra = ` 현재 데이터셋의 <b>${escHtml(hit.name)}</b>(${lbl('curation_type', hit.curation_type)})가 유사 사례입니다.`;
    box.innerHTML = `<div class="bc">
      <div class="bt">🏷️ ${escHtml(raw)}</div>
      <div class="brec">해당 브랜드의 누적 기획전 데이터가 아직 없습니다. 일반적으로 단일브랜드는 <b>신상런칭·콘텐츠 코디제안형</b>이 객단가에, <b>세일즈포커싱</b>이 거래액에 유리합니다.${extra}<br>해당 브랜드의 기획전 이력 파일을 업로드하면 헤지스처럼 유형 분포 기반 맞춤 추천을 생성합니다.</div>
    </div>`;
  }
  const _aliases = kb ? kb.aliases.map(a => a.toLowerCase()) : [key];
  const _profile = buildBrandProfile(_aliases, kb);
  if (_profile._n > 0 || kb) {
    brandCtx = { name: kb ? kb._name : raw, profile: _profile, kbRec: kb ? kb.rec : null, matched: _profile._n };
    mode = "brand";
    relBase = null;
    const _l = document.getElementById('list');
    if (_l) _l.scrollTo({ top: 0, behavior: 'smooth' });
    render();
  }
};

window.buildBrandProfile = function(aliases, kb) {
  const has = (e) => {
    const bs = (e.kw.brand || []).map(x => x.toLowerCase());
    const nm = (e.name || '').toLowerCase();
    return aliases.some(a => a && (nm.includes(a) || bs.some(b => b.includes(a))));
  };
  const matched = EVENTS.filter(has);
  const profile = { kw: { theme: [], benefit: [], product: [], visual: [], brand: [] }, discMin: 0, discMax: 40, prodCnt: 40, access_route: 'EVENT_ONLY', curation_type: 'CATEGORY', main_category: 'FASHION', _n: matched.length };
  if (matched.length) {
    for (const ax of ['theme', 'benefit', 'product', 'visual', 'brand']) {
      const c = {};
      matched.forEach(e => (e.kw[ax] || []).forEach(w => c[w] = (c[w] || 0) + 1));
      profile.kw[ax] = Object.entries(c).sort((x, y) => y[1] - x[1]).slice(0, 6).map(z => z[0]);
    }
    profile.discMin = Math.round(matched.reduce((s, e) => s + e.discMin, 0) / matched.length);
    profile.discMax = Math.round(matched.reduce((s, e) => s + e.discMax, 0) / matched.length);
    profile.prodCnt = Math.round(matched.reduce((s, e) => s + e.prodCnt, 0) / matched.length);
    profile.curation_type = mode1(matched, 'curation_type')[0];
    profile.main_category = mode1(matched, 'main_category')[0];
  } else if (kb) {
    const curMap = { '신상런칭': 'NEW_LAUNCH', '세일즈포커싱': 'SALES_FOCUS', '시즌리딩': 'SEASON_LEAD', '콘텐츠큐레이션': 'CONTENT', '아울렛/이월': 'SALES_FOCUS', '브랜드일반': 'CATEGORY' };
    const tt = kb.types.filter(t => t[0] !== '브랜드일반').sort((x, y) => y[1] - x[1])[0];
    profile.curation_type = curMap[tt ? tt[0] : ''] || 'CATEGORY';
    const sub0 = kb.sublines && kb.sublines[0] ? kb.sublines[0][0] : '';
    profile.main_category = sub0 === 'ACC' ? 'ACC' : (sub0 === '골프' ? 'GOLF' : 'FASHION');
    profile.kw.theme = [kb._name || '브랜드', '신상', '시즌'];
    profile.kw.product = ['단일브랜드'].concat((kb.sublines || []).slice(0, 2).map(s => s[0]));
    profile.kw.brand = [kb._name || ''];
    profile.kw.benefit = ['쿠폰없음'];
    profile.kw.visual = ['콘텐츠큐레이션'];
  }
  return profile;
};
