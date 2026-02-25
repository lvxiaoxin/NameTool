// pages/index/index.js
const { stripTones, preprocessChars } = require('../../utils/tone');
const app = getApp();

Page({
  data: {
    loading: true,
    error: null,

    // ── 筛选状态 ──
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

    // ── 结果 ──
    resultCount: 0,
    groups: [],
    hasMore: false,
    displayedCount: 0,
    scrollTop: 0,
    showBackTop: false,
  },

  // 全量数据（不放进 data 避免 setData 传输）
  _allChars: [],
  _filtered: [],    // 当前筛选结果（全量）
  _debounce: null,
  _PAGE_SIZE: 500,  // 每次渲染的最大字数

  // 五行 → CSS key 映射
  _wuxingKeyMap: { '金': 'jin', '木': 'mu', '水': 'shui', '火': 'huo', '土': 'tu' },

  onLoad() {
    app.onDataReady((gd) => {
      if (gd.error) {
        this.setData({ loading: false, error: gd.error });
        return;
      }
      this._allChars = preprocessChars(gd.characters);
      this._initFilters();
      this._applyFilters();
      this.setData({ loading: false });
    });
  },

  // ═══════════ 初始化筛选选项 ═══════════
  _initFilters() {
    // 结构
    const structSet = new Set();
    this._allChars.forEach(c => { if (c.structure) structSet.add(c.structure); });
    const structOptions = [...structSet].sort().map(s => ({
      label: s.replace('结构', ''),
      value: s,
      active: false,
    }));

    // 部首
    const radicalSet = new Set();
    this._allChars.forEach(c => { if (c.radical) radicalSet.add(c.radical); });
    const radicalOptions = ['不限', ...[...radicalSet].sort()];

    this.setData({ structOptions, radicalOptions });
  },

  // ═══════════ 事件处理 ═══════════

  // chip 点击切换
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

  // 加载更多
  onLoadMore() {
    if (!this.data.hasMore) return;
    this._renderPage(this.data.displayedCount);
  },

  // 汉字卡片点击 → 复制汉字
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

  // 回到顶部
  onBackTop() {
    this.setData({ scrollTop: 0 });
  },

  // 滚动监听，控制回到顶部按钮显示
  onScroll(e) {
    const show = e.detail.scrollTop > 800;
    if (show !== this.data.showBackTop) {
      this.setData({ showBackTop: show });
    }
  },

  // 折叠/展开分组
  onToggleGroup(e) {
    const idx = e.currentTarget.dataset.index;
    const key = `groups[${idx}].collapsed`;
    const current = this.data.groups[idx].collapsed;
    this.setData({ [key]: !current });
  },

  // ═══════════ 筛选逻辑 ═══════════
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
    // 从头开始渲染第一页
    this._renderPage(0);
  },

  // 渲染一页数据（追加或首次）
  _renderPage(startIdx) {
    const PAGE = this._PAGE_SIZE;
    const slice = this._filtered.slice(startIdx, startIdx + PAGE);
    const isFirst = startIdx === 0;

    // 按笔画分组
    const groupMap = {};
    slice.forEach(c => {
      if (!groupMap[c.strokes]) groupMap[c.strokes] = [];
      groupMap[c.strokes].push({
        char: c.char,
        pinyin: c.pinyin,
        wuxing: c.wuxing,
        wuxingKey: this._wuxingKeyMap[c.wuxing] || '',
        radical: c.radical || '',
        structLabel: c.structure ? c.structure.replace('\u7ed3\u6784', '') : '',
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
      // 追加到已有分组
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
