/* =========================================================
   ExhibitionStore - 중앙 상태 관리 시스템
   ========================================================= */

window.ExhibitionStore = {
  // 상태 변수 정의
  _state: {
    EVENTS: [],
    REVIEWS: {},
    CONFIG: {},
    SYN: {},
    AXES: [],
    AXIS_WEIGHT: {},
    REV_AXES: [],
    _DF: {},
    _NDOC: 0,
    conditions: [],
    logic: "AND",
    mode: "filter",
    relBase: null,
    compareIds: [],
    brandCtx: null
  },

  // 스토어 초기화
  init(data) {
    this._state.CONFIG = data.CONFIG || {};
    this._state.SYN = data.CONFIG.SYN || {};
    this._state.AXES = data.CONFIG.AXES || [];
    this._state.AXIS_WEIGHT = data.CONFIG.AXIS_WEIGHT || {};
    this._state.REV_AXES = data.CONFIG.REV_AXES || [];
    this._state.EVENTS = data.EVENTS || [];
    this._state.REVIEWS = data.REVIEWS || {};

    // size_bucket 파생 필드 생성
    this._state.EVENTS.forEach(e => {
      e.size_bucket = e.prodCnt < 30 ? '소량' : (e.prodCnt < 80 ? '중량' : '대량');
    });

    // IDF 키워드 빈도 계산
    this._state._DF = {};
    this._state.EVENTS.forEach(e => {
      const keywords = [];
      this._state.AXES.forEach(a => {
        if (e.kw && e.kw[a.key]) {
          keywords.push(...e.kw[a.key]);
        }
      });
      const set = new Set(keywords.map(k => k.toLowerCase()));
      set.forEach(k => {
        this._state._DF[k] = (this._state._DF[k] || 0) + 1;
      });
    });
    this._state._NDOC = this._state.EVENTS.length;
  }
};

// 기존 글로벌 코드 호환성을 위해 window 전역 변수 바인딩
const stateKeys = Object.keys(window.ExhibitionStore._state);
stateKeys.forEach(key => {
  Object.defineProperty(window, key, {
    get() {
      return window.ExhibitionStore._state[key];
    },
    set(val) {
      window.ExhibitionStore._state[key] = val;
    },
    configurable: true
  });
});
