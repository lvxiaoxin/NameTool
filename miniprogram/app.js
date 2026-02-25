// app.js
const DATA_URL = 'https://tool-of-lvxiaoxin.eastasia.cloudapp.azure.com/name-tool/data/characters.json';
const CACHE_KEY = 'characters_data';
const CACHE_VER_KEY = 'characters_ver';
const DATA_VERSION = '1'; // 更新数据时递增

App({
  globalData: {
    characters: [],
    loaded: false,
    error: null,
  },

  onLaunch() {
    this.loadData();
  },

  loadData() {
    // 先尝试读缓存
    try {
      const ver = wx.getStorageSync(CACHE_VER_KEY);
      if (ver === DATA_VERSION) {
        const cached = wx.getStorageSync(CACHE_KEY);
        if (cached && cached.length > 0) {
          this.globalData.characters = cached;
          this.globalData.loaded = true;
          this._notifyListeners();
          return;
        }
      }
    } catch (e) {
      console.warn('读取缓存失败', e);
    }

    // 缓存未命中，从服务器拉取
    wx.request({
      url: DATA_URL,
      method: 'GET',
      success: (res) => {
        if (res.statusCode === 200 && Array.isArray(res.data)) {
          this.globalData.characters = res.data;
          this.globalData.loaded = true;
          this._notifyListeners();
          // 异步写入缓存
          try {
            wx.setStorageSync(CACHE_VER_KEY, DATA_VERSION);
            wx.setStorageSync(CACHE_KEY, res.data);
          } catch (e) {
            console.warn('写入缓存失败（数据可能过大）', e);
          }
        } else {
          this.globalData.error = `HTTP ${res.statusCode}`;
          this._notifyListeners();
        }
      },
      fail: (err) => {
        this.globalData.error = err.errMsg || '网络请求失败';
        this._notifyListeners();
      },
    });
  },

  // 简易事件通知机制
  _listeners: [],

  onDataReady(fn) {
    if (this.globalData.loaded || this.globalData.error) {
      fn(this.globalData);
    } else {
      this._listeners.push(fn);
    }
  },

  _notifyListeners() {
    this._listeners.forEach(fn => fn(this.globalData));
    this._listeners = [];
  },
});
