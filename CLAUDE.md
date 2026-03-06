# CLAUDE.md

本文件为 Claude Code 提供项目上下文，帮助 AI 快速理解项目结构和开发约定。

## 项目概述

汉字多维筛选工具，从 zidian.txcx.com 预爬取 14,387 条汉字数据，提供多条件查询，结果按笔画分组展示。适用于起名场景。

提供两种前端：
- **Web 版**：单文件 `index.html`（原生 HTML/CSS/JS），部署在 Azure VM
- **微信小程序**：`miniprogram/` 目录，数据内嵌本地，纯离线筛选

## 技术栈

- **Web 前端**：单文件 `index.html`（原生 HTML/CSS/JS，无框架）
- **微信小程序**：原生小程序开发，数据内嵌为 JS 模块
- **爬虫**：Node.js + cheerio，脚本为 `crawl.js`
- **数据**：`data/characters.json`（原始 14,387 条），`miniprogram/data/chars.js`（紧凑数组格式，~690KB）
- **本地运行**：`npx http-server . -p 8080 -c-1`（Web 版）
- **部署**：`deploy.sh` 部署 Web 版到 Azure VM；小程序通过微信开发者工具上传

## 微信小程序

- **AppID**：`wx1b05b9761826a203`
- **项目名**：寻好字
- **基础库**：3.3.4
- **架构**：双 Tab 架构，原生 tabBar；数据内嵌本地，纯前端筛选，无网络依赖
- **数据格式**：紧凑数组 `[char, pinyin, _py, _tone, wuxing, strokes, radical, structure, common, lucky]`
- **分页渲染**：每批 500 字，防止 DOM 节点超限（~16K 限制）
- **project.config.json**：位于项目根目录，`miniprogramRoot` 指向 `miniprogram/`

### Tab 架构

- **Tab 1「寻字起名」**（`pages/index/index`）：汉字多维筛选 + 选字组名功能
- **Tab 2「八字分析」**（`pages/analysis/analysis`）：输入生辰→四柱八字→五行分布→喜用神→起名建议
- **跨 Tab 传参**：八字分析的喜用神通过 `app.globalData.suggestedWuxing`（数组）传递，寻字起名页 `onShow` 中读取并自动选中对应五行筛选条件

### 小程序文件结构

```
project.config.json          # 项目配置（根目录）
miniprogram/
  app.js                     # 全局入口，globalData 跨 tab 传参
  app.json                   # 页面路由、tabBar、窗口配置
  app.wxss                   # 全局样式
  data/chars.js              # 内嵌汉字数据（14,387 条紧凑数组）
  utils/tone.js              # 拼音声调处理工具
  utils/bazi.js              # 八字计算核心（四柱、十神、喜用神、纳音）
  images/                    # Tab 图标（tab-name/tab-bazi，各含普通/选中态）
  pages/index/
    index.js                 # 寻字起名逻辑（筛选 + 分页 + 选字组名）
    index.wxml               # 寻字起名模板
    index.wxss               # 寻字起名样式
    index.json               # 页面配置
  pages/analysis/
    analysis.js              # 八字分析逻辑
    analysis.wxml            # 八字分析模板
    analysis.wxss            # 八字分析样式
    analysis.json            # 页面配置
```

### 寻字起名页（index）

**筛选维度**：汉字、五行（chip 多选）、笔画（范围）、结构（chip 多选）、部首（下拉）、拼音（文本）、声调（chip 多选）、常用、吉凶

**选字组名**：底部栏切换选字模式，点击汉字选取（最多 8 字），输入姓氏后生成单字名和双字名排列组合

**布局**：`page-wrapper` flex 列布局（`height: windowHeight`），scroll-view（`flex:1`）+ select-bar（flex child），避免 `position: fixed` 与原生 tabBar 冲突

### 八字分析页（analysis）

**输入**：公历日期（date picker）+ 时辰（selector picker，12 时辰）

**计算**（`utils/bazi.js`）：
- 四柱：年柱（立春为界）、月柱（节气为月界 + 五虎遁月）、日柱（儒略日）、时柱（五鼠遁时）
- 节气：寿星公式多项式近似法，覆盖 1900-2100 年
- 十神：日主与其他天干的生克关系
- 日主强弱：得令/失令 + 扶助/耗泄加权评分
- 喜用神/忌神：基于日主强弱判定
- 纳音：六十甲子纳音五行
- 地支藏干：每个地支的本气/中气/余气

**展示**：四柱卡片（天干地支+五行色+十神标签+藏干）、五行分布条形图（缺/弱警告）、命理分析（日主/强弱/月令/喜用神/忌神/纳音）、起名建议（可跳转寻字起名并预选喜用神五行）

**免责声明**：页面底部注明算法依据和仅供参考

### WXSS 注意事项

- **禁止非 ASCII 字符**：WXSS 编译器不支持任何非 ASCII 字节（包括注释和选择器）
- 五行用拼音类名：`.wuxing-jin`、`.wx-jin`、`.tag-wuxing-jin` 等
- JS 中通过 `_wuxingKeyMap` 和 `wuxingKey` 字段映射
- 寻字起名页使用 flex 布局而非 fixed 定位来放置底部栏，避免与原生 tabBar 冲突

## 部署信息

- **VM**：Azure East Asia，`ssh lvxiaoxin96@20.2.216.149`
- **DNS**：`tool-of-lvxiaoxin.eastasia.cloudapp.azure.com`
- **路径**：`/name-tool` → 服务器 `/var/www/name-tool/`
- **Web 服务**：Nginx，location alias 配置
- **HTTPS**：Let's Encrypt RSA 证书（R13 签发，certbot 自动续期）
- **gzip**：已启用，JSON 压缩率 ~93%（2.2MB → ~175KB）
- **部署脚本**：`deploy.sh`，自动检查/安装 Nginx、配置路由、启用 gzip、rsync 同步文件
- **在线地址**：https://tool-of-lvxiaoxin.eastasia.cloudapp.azure.com/name-tool

## 常用命令

```bash
npm install          # 安装依赖（cheerio）
npm run crawl        # 重新爬取数据（约 3 分钟）
npm run serve        # 启动本地服务 http://localhost:8080
./deploy.sh          # 部署到 Azure VM
```

## 项目结构

```
index.html                   # Web 前端页面（全部 CSS/JS 内联）
crawl.js                     # 三阶段爬虫（五行→结构→部首）
enrich.js                    # 数据增补脚本（常用字/吉凶）
deploy.sh                    # Azure VM 自动化部署脚本
scripts/gen-tab-icons.js     # Tab 图标生成脚本（需 canvas 依赖）
data/characters.json         # 爬取的汉字数据 JSON（原始格式）
project.config.json          # 微信小程序项目配置
miniprogram/                 # 微信小程序代码
  data/chars.js              # 内嵌数据（紧凑数组，~690KB）
  utils/tone.js              # 拼音声调处理
  utils/bazi.js              # 八字计算核心模块
  images/                    # Tab 图标 PNG
  pages/index/               # 寻字起名（筛选 + 选字组名）
  pages/analysis/            # 八字分析
package.json                 # 项目配置
```

## 数据模型

每条汉字记录结构：

```json
{
  "char": "悦",
  "pinyin": "yuè",
  "wuxing": "金",
  "strokes": 10,
  "radical": "忄",
  "structure": "",
  "url": "https://zidian.txcx.com/hanzi-wuxing-hanzi-xlv2.html"
}
```

## 爬虫架构（crawl.js）

三阶段顺序执行：

1. **Phase 1 - 五行**：5 个五行页 → 各笔画子页（含分页） → 提取 char/pinyin/wuxing/strokes/url
2. **Phase 2 - 结构**：12 种结构页 → 各笔画子页（含分页） → 映射 char→structure
3. **Phase 3 - 部首**：284 个部首页（含分页） → 映射 char→radical

关键点：

- 所有子页面都有**分页**（`下一页`链接），必须跟踪所有页面
- 使用 `visited` Set 防止分页死循环
- 链接文本解析需处理两种格式：`"rén人"`（无空格）和 `"rén 人"`（有空格）
- 请求间隔 200ms，失败重试 3 次

## 数据源 URL 规律

- 五行总页：`hanzi-wuxing-{code}.html`
- 五行+笔画：`hanzi-wuxing-bihua-{wuxing}-{bihua}.html`（分页加 `-2`, `-3`...）
- 结构总页：`hanzi-jiegou-{code}.html`
- 结构+笔画：`hanzi-jiegou-{code}-{bihua}.html`
- 部首总页：`hanzi-bushou.html`
- 部首详情：`hanzi-bushou-{code}.html`
- 汉字详情：`hanzi-wuxing-hanzi-{id}.html` 或 `hanzi-xi{id}.html`

## 编码约定

- 所有中文注释和输出
- Web 前端全部内联在 `index.html`，不拆分文件
- 小程序 WXSS 中禁止任何非 ASCII 字符
- 数据变更需重新运行 `npm run crawl`，然后用生成脚本更新 `miniprogram/data/chars.js`
- 不要主动进行 git 操作，除非用户明确指出
- 前端或数据变更后运行 `./deploy.sh` 同步到线上
