/* =========================================================
   AIEngine - Gemini API 연동 및 프로토타입 렌더링 시스템
   ========================================================= */

window.AIEngine = {
  lastAiReply: '',

  getCurrentVisibleEvents() {
    let list = [];
    if (mode === "related" && relBase) {
      list = EVENTS.filter(e => e.id !== relBase.id).map(e => ({ e, score: similarity(relBase, e) }));
      list.sort((a, b) => b.score - a.score);
      list = list.map(x => x.e);
    } else if (mode === "nl") {
      const q = document.getElementById('q').value.trim();
      list = EVENTS.map(e => { const s = nlScore(e, q); return { e, score: s.score, keep: s.keep }; }).filter(r => r.keep);
      list.sort((a, b) => b.score - a.score);
      list = list.map(x => x.e);
    } else if (mode === "brand" && brandCtx) {
      list = EVENTS.map(e => ({ e, score: similarity(brandCtx.profile, e) }));
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
  },

  async runGeminiAnalysis() {
    const apiKey = CONFIG.gemini_api_key || '';
    if (!apiKey) {
      toast("CONFIG.gemini_api_key 설정이 누락되었습니다. data.json 설정을 확인하세요.");
      return;
    }

    const model = document.getElementById('geminiModelSelect').value;
    const events = this.getCurrentVisibleEvents();
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

      this.lastAiReply = reply;
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
  },

  switchPreviewTab(tab) {
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
  },

  closePreviewModal() {
    document.getElementById('previewModal').classList.remove('show');
  },

  openPrototypeModal() {
    if (!this.lastAiReply) {
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
      const match = this.lastAiReply.match(/<!-- PROTOTYPE_METADATA:\s*([\s\S]*?)\s*-->/);
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
};

// 기존 글로벌 코드 호환성을 위해 window 전역 스코프 연동
window.getCurrentVisibleEvents = () => AIEngine.getCurrentVisibleEvents();
window.runGeminiAnalysis = () => AIEngine.runGeminiAnalysis();
window.switchPreviewTab = (tab) => AIEngine.switchPreviewTab(tab);
window.closePreviewModal = () => AIEngine.closePreviewModal();
window.openPrototypeModal = () => AIEngine.openPrototypeModal();

Object.defineProperty(window, 'lastAiReply', {
  get() { return AIEngine.lastAiReply; },
  set(val) { AIEngine.lastAiReply = val; },
  configurable: true
});
