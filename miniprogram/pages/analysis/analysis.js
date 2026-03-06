// pages/analysis/analysis.js
const { calculateBazi, SHICHEN_OPTIONS } = require('../../utils/bazi');

Page({
  data: {
    // 输入
    dateValue: '',
    hourIndex: 0,
    hourOptions: SHICHEN_OPTIONS,

    // 结果
    showResult: false,
    pillars: null,
    analysis: null,
  },

  onDateChange(e) {
    this.setData({ dateValue: e.detail.value });
  },

  onHourChange(e) {
    this.setData({ hourIndex: parseInt(e.detail.value) });
  },

  onAnalyze() {
    const { dateValue, hourIndex } = this.data;
    if (!dateValue) {
      wx.showToast({ title: '请选择出生日期', icon: 'none' });
      return;
    }

    const parts = dateValue.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const day = parseInt(parts[2]);

    // 时辰索引 → 代表小时
    const hourMap = [23, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21];
    const hour = hourMap[hourIndex];

    const result = calculateBazi(year, month, day, hour);

    this.setData({
      showResult: true,
      pillars: result.pillars,
      analysis: result.analysis,
    });
  },

  onGoToNaming() {
    const app = getApp();
    app.globalData.suggestedWuxing = this.data.analysis.xiyongNames || [];
    wx.switchTab({ url: '/pages/index/index' });
  },

  onReset() {
    this.setData({
      dateValue: '',
      hourIndex: 0,
      showResult: false,
      pillars: null,
      analysis: null,
    });
  },
});
