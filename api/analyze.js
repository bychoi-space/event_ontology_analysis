export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { model, events, customApiKey } = req.body;

  // 클라이언트가 직접 API Key를 제공했으면 그것을 쓰고, 없으면 Vercel 환경 변수의 GEMINI_API_KEY 사용
  const apiKey = (customApiKey && customApiKey.trim()) || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(400).json({
      error: 'Gemini API Key가 제공되지 않았습니다. Vercel 환경 변수(GEMINI_API_KEY) 설정을 확인하거나 API Key를 직접 입력하세요.'
    });
  }

  if (!events || !events.length) {
    return res.status(400).json({ error: '분석할 기획전 데이터가 없습니다.' });
  }

  const selectedModel = model || 'gemini-2.0-flash';
  
  // 프롬프트 생성
  const prompt = `You are a retail promotion expert. Analyze these ${events.length} e-commerce promotions:
${JSON.stringify(events, null, 2)}

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
</div>`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;
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
      throw new Error(errData.error?.message || "Gemini API 요청 실패");
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
