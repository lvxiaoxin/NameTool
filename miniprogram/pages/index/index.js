// pages/index/index.js
const { stripTones } = require('../../utils/tone');
const RAW = require('../../data/chars');
// RAW: [[char, pinyin, _py, _tone, wuxing, strokes, radical, structure, common, lucky], ...]

Page({
  data: {
    loading: true,
    error: null,

    charSearch: '',
    strokeMin: '',
    strokeMax: '',
    pinyinSearch: '',
    radicalIndex: 0,
    radicalOptions: ['不限'],

    wuxingOptions: [
      { label: '金', value: '金', key: 'jin', active: false },
      { label: '木', value: '木', key: 'mu', active: false },
      { label: '水', value: '水', key: 'shui', active: false },
      { label: '火', value: '火', key: 'huo', active: false },
      { label: '土', value: '土', key: 'tu', active: false },
    ],
    structOptions: [],
    toneOptions: [
      { label: '一声(阴平)', value: 1, active: false },
      { label: '二声(阳平)', value: 2, active: false },
      { label: '三声(上声)', value: 3, active: false },
      { label: '四声(去声)', value: 4, active: false },
    ],
    commonOptions: [
      { label: '常用字', value: 1, active: false },
      { label: '非常用字', value: 0, active: false },
    ],
    luckyOptions: [
      { label: '吉利字', value: 1, active: false },
      { label: '非吉利字', value: 0, active: false },
    ],

    resultCount: 0,
    groups: [],
    hasMore: false,
    displayedCount: 0,
    scrollTop: 0,
    showBackTop: false,
  },

  _allChars: [],   // parsed objects (kept off data to avoid setData overhead)
  _filtered: [],   // current filter result
  _debounce: null,
  _PAGE_SIZE: 500,
  _wuxingKeyMap: { '金': 'jin', '木': 'mu', '水': 'shui', '火': 'huo', '土': 'tu' },

  onLoad() {
    // Parse compact array format into objects
    this._allChars = RAW.map(r => ({
      char: r[0], pinyin: r[1], _py: r[2], _tone: r[3],
      wuxing: r[4], strokes: r[5], radical: r[6],
      structure: r[7], common: r[8], lucky: r[9],
    }));

    this._initFilters();
    this._applyFilters();
    this.setData({ loading: false });
  },

  _initFilters() {
    const structSet = new Set();
    const radicalSet = new Set();
    this._allChars.forEach(c => {
      if (c.structure) structSet.add(c.structure);
      if (c.radical) radicalSet.add(c.radical);
    });

    const structOptions = [...structSet].sort().map(s => ({
      label: s.replace('结构', ''),
      value: s,
      active: false,
    }));
    const radicalOptions = ['不限', ...[...radicalSet].sort()];

    this.setData({ structOptions, radicalOptions });
  },

  // ---- Event handlers ----

  onChipTap(e) {
    const { group, index } = e.currentTarget.dataset;
    const key = `${group}Options[${index}].active`;
    const current = this.data[`${group}Options`][index].active;
    this.setData({ [key]: !current });
    this._scheduleFilter();
  },

  onCharInput(e) {
    this.setData({ charSearch: e.detail.value.trim() });
    this._scheduleFilter();
  },

  onStrokeMin(e) {
    this.setData({ strokeMin: e.detail.value });
    this._scheduleFilter();
  },

  onStrokeMax(e) {
    this.setData({ strokeMax: e.detail.value });
    this._scheduleFilter();
  },

  onPinyinInput(e) {
    this.setData({ pinyinSearch: e.detail.value.trim() });
    this._scheduleFilter();
  },

  onRadicalChange(e) {
    this.setData({ radicalIndex: parseInt(e.detail.value) });
    this._scheduleFilter();
  },

  onReset() {
    const reset = (opts) => opts.map(o => ({ ...o, active: false }));
    this.setData({
      charSearch: '',
      strokeMin: '',
      strokeMax: '',
      pinyinSearch: '',
      radicalIndex: 0,
      wuxingOptions: reset(this.data.wuxingOptions),
      structOptions: reset(this.data.structOptions),
      toneOptions: reset(this.data.toneOptions),
      commonOptions: reset(this.data.commonOptions),
      luckyOptions: reset(this.data.luckyOptions),
    });
    this._applyFilters();
  },

  onLoadMore() {
    if (!this.data.hasMore) return;
    this._renderPage(this.data.displayedCount);
  },

  onCharTap(e) {
    const char = e.currentTarget.dataset.char;
    if (char) {
      wx.setClipboardData({
        data: char,
        success: () => {
          wx.showToast({ title: `已复制「${char}」`, icon: 'success' });
        },
      });
    }
  },

  onBackTop() {
    this.setData({ scrollTop: 0 });
  },

  onScroll(e) {
    const show = e.detail.scrollTop > 800;
    if (show !== this.data.showBackTop) {
      this.setData({ showBackTop: show });
    }
  },

  onToggleGroup(e) {
    const idx = e.currentTarget.dataset.index;
    const key = `groups[${idx}].collapsed`;
    const current = this.data.groups[idx].collapsed;
    this.setData({ [key]: !current });
  },

  // ---- Local filtering ----

  _scheduleFilter() {
    clearTimeout(this._debounce);
    this._debounce = setTimeout(() => this._applyFilters(), 150);
  },

  _getActiveValues(optionsKey) {
    return this.data[optionsKey]
      .filter(o => o.active)
      .map(o => o.value);
  },

  _applyFilters() {
    const charSearch = this.data.charSearch;
    const wuxing = this._getActiveValues('wuxingOptions');
    const structs = this._getActiveValues('structOptions');
    const tones = this._getActiveValues('toneOptions');
    const commonVals = this._getActiveValues('commonOptions');
    const luckyVals = this._getActiveValues('luckyOptions');
    const strokeMin = parseInt(this.data.strokeMin) || 0;
    const strokeMax = parseInt(this.data.strokeMax) || 999;
    const radical = this.data.radicalIndex > 0
      ? this.data.radicalOptions[this.data.radicalIndex]
      : '';
    const pinyin = stripTones(this.data.pinyinSearch);

    const filtered = this._allChars.filter(c => {
      if (charSearch && !charSearch.includes(c.char)) return false;
      if (wuxing.length > 0 && !wuxing.includes(c.wuxing)) return false;
      if (c.strokes < strokeMin || c.strokes > strokeMax) return false;
      if (structs.length > 0 && !structs.includes(c.structure)) return false;
      if (radical && c.radical !== radical) return false;
      if (pinyin && !c._py.startsWith(pinyin)) return false;
      if (tones.length > 0 && !tones.includes(c._tone)) return false;
      if (commonVals.length > 0) {
        const isCommon = c.common ? 1 : 0;
        if (!commonVals.includes(isCommon)) return false;
      }
      if (luckyVals.length > 0) {
        const isLucky = c.lucky ? 1 : 0;
        if (!luckyVals.includes(isLucky)) return false;
      }
      return true;
    });

    this._filtered = filtered;
    this.setData({ resultCount: filtered.length, scrollTop: 0 });
    this._renderPage(0);
  },

  _renderPage(startIdx) {
    const PAGE = this._PAGE_SIZE;
    const slice = this._filtered.slice(startIdx, startIdx + PAGE);
    const isFirst = startIdx === 0;

    const groupMap = {};
    slice.forEach(c => {
      if (!groupMap[c.strokes]) groupMap[c.strokes] = [];
      groupMap[c.strokes].push({
        char: c.char,
        pinyin: c.pinyin,
        wuxing: c.wuxing,
        wuxingKey: this._wuxingKeyMap[c.wuxing] || '',
        radical: c.radical || '',
        structLabel: c.structure ? c.structure.replace('结构', '') : '',
      });
    });

    const newGroups = Object.keys(groupMap)
      .map(Number)
      .sort((a, b) => a - b)
      .map(s => ({
        strokes: s,
        chars: groupMap[s],
        collapsed: false,
      }));

    let groups;
    if (isFirst) {
      groups = newGroups;
    } else {
      groups = [...this.data.groups];
      newGroups.forEach(ng => {
        const existing = groups.find(g => g.strokes === ng.strokes);
        if (existing) {
          existing.chars = existing.chars.concat(ng.chars);
        } else {
          groups.push(ng);
        }
      });
      groups.sort((a, b) => a.strokes - b.strokes);
    }

    const displayed = startIdx + slice.length;
    this.setData({
      groups,
      displayedCount: displayed,
      hasMore: displayed < this._filtered.length,
    });
  },
});
