/* =========================================================
   PresetManager - LocalStorage 프리셋 매니저
   ========================================================= */

window.PresetManager = {
  LS_KEY: "lfmall_v3_presets",

  loadPresets() {
    try {
      const o = JSON.parse(localStorage.getItem(this.LS_KEY));
      if (!o || typeof o !== "object" || Array.isArray(o)) { return {}; }
      return o;
    } catch (e) {
      try { localStorage.removeItem(this.LS_KEY); } catch (_) { }
      return {};
    }
  },

  savePresetsObj(o) {
    try {
      localStorage.setItem(this.LS_KEY, JSON.stringify(o));
      return true;
    } catch (e) {
      console.warn('preset save failed', e);
      return false;
    }
  },

  ensureDefaultPresets() {
    const p = this.loadPresets();
    if (Object.keys(p).length > 0) return;
    p["통합전 패션 검증"] = {
      logic: "AND",
      conditions: [
        { field: "main_category", type: "enum", values: ["FASHION"] },
        { field: "multi_brand_yn", type: "enum", values: ["true"] }
      ]
    };
    p["세일즈포커싱 고할인"] = {
      logic: "AND",
      conditions: [
        { field: "curation_type", type: "enum", values: ["SALES_FOCUS"] },
        { field: "disc", type: "range", op: "between", lo: 35, hi: 80 }
      ]
    };
    this.savePresetsObj(p);
  },

  renderPresets() {
    const host = document.getElementById('presetRow');
    const p = this.loadPresets();
    const names = Object.keys(p);
    if (names.length === 0) {
      host.innerHTML = `<span class="hint">저장된 프리셋이 없습니다.</span>`;
      return;
    }
    host.innerHTML = names.map(n => `<span class="presetChip" data-name="${escHtml(n)}">
      <span class="papply" role="button" tabindex="0">📌 ${escHtml(n)}</span>
      <span class="pdel" role="button" tabindex="0" title="삭제">✕</span>
    </span>`).join('');

    host.querySelectorAll('.presetChip').forEach(el => {
      const nm = el.dataset.name;
      const ap = () => this.applyPreset(nm);
      const dp = () => this.deletePreset(nm);
      const a = el.querySelector('.papply');
      const d = el.querySelector('.pdel');
      a.onclick = ap;
      d.onclick = dp;
      a.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ap(); } };
      d.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); dp(); } };
    });
  },

  savePreset() {
    const name = document.getElementById('presetName').value.trim();
    if (!name) { toast("프리셋 이름을 입력하세요"); return; }
    if (conditions.length === 0) { toast("저장할 조건이 없습니다"); return; }
    const p = this.loadPresets();
    p[name] = {
      logic,
      conditions: conditions.map(c => {
        const f = FACETS[c.field];
        if (f.type === "enum") return { field: c.field, type: "enum", values: [...c.values] };
        return { field: c.field, type: "range", op: c.op, lo: c.lo, hi: c.hi };
      })
    };
    if (!this.savePresetsObj(p)) { toast("저장 실패: 브라우저 저장공간을 사용할 수 없습니다"); return; }
    document.getElementById('presetName').value = "";
    this.renderPresets();
    toast(`'${name}' 저장됨`);
  },

  applyPreset(name) {
    const p = this.loadPresets()[name];
    if (!p) return;
    if (!Array.isArray(p.conditions)) { toast("프리셋 형식이 올바르지 않습니다"); return; }
    conditions = [];
    condSeq = 1;
    logic = p.logic || "AND";
    setLogic(logic);
    p.conditions.forEach(pc => {
      const f = FACETS[pc.field];
      if (!f) return;
      const c = { id: condSeq++, field: pc.field };
      if (f.type === "enum") {
        c.values = [...(pc.values || [])];
      } else {
        c.op = pc.op || "between";
        c.lo = (pc.lo != null ? pc.lo : f.min);
        c.hi = (pc.hi != null ? pc.hi : f.max);
      }
      conditions.push(c);
    });
    mode = "filter";
    relBase = null;
    document.getElementById('q').value = "";
    renderConditions();
    render();
    toast(`'${name}' 적용`);
  },

  deletePreset(name) {
    const p = this.loadPresets();
    delete p[name];
    this.savePresetsObj(p);
    this.renderPresets();
    toast(`'${name}' 삭제됨`);
  }
};

// 기존 글로벌 코드 호환성을 위해 window 전역 스코프에 연동
window.loadPresets = () => PresetManager.loadPresets();
window.savePresetsObj = (o) => PresetManager.savePresetsObj(o);
window.ensureDefaultPresets = () => PresetManager.ensureDefaultPresets();
window.renderPresets = () => PresetManager.renderPresets();
window.savePreset = () => PresetManager.savePreset();
window.applyPreset = (name) => PresetManager.applyPreset(name);
window.deletePreset = (name) => PresetManager.deletePreset(name);
