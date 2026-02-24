# CLAUDE.md

本文件为 Claude Code 提供项目上下文，帮助 AI 快速理解项目结构和开发约定。

## 项目概述

汉字多维筛选工具，从 zidian.txcx.com 预爬取汉字数据，提供纯前端多条件查询，结果按笔画分组展示。适用于起名场景。

## 技术栈

- **前端**：单文件 `index.html`（原生 HTML/CSS/JS，无框架）
- **爬虫**：Node.js + cheerio，脚本为 `crawl.js`
- **数据**：`data/characters.json`，14,387 条汉字记录
- **运行**：`npx http-server . -p 8080 -c-1`
- **部署**：`deploy.sh` 自动化部署到 Azure VM（Nginx 静态托管）

## 部署信息

- **VM**：Azure East Asia，`ssh lvxiaoxin96@20.2.216.149`
- **DNS**：`tool-of-lvxiaoxin.eastasia.cloudapp.azure.com`
- **路径**：`/name-tool` → 服务器 `/var/www/name-tool/`
- **Web 服务**：Nginx，location alias 配置
- **HTTPS**：Let's Encrypt 证书（certbot 自动续期）
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
index.html           # 前端页面（全部 CSS/JS 内联）
crawl.js             # 三阶段爬虫（五行→结构→部首）
deploy.sh            # Azure VM 自动化部署脚本
data/characters.json # 爬取的汉字数据 JSON
package.json         # 项目配置
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

## 前端筛选维度

1. **五行**：chip 多选（金/木/水/火/土）
2. **笔画**：范围输入（min/max）
3. **部首**：下拉选择
4. **结构**：chip 多选（12 种）
5. **拼音**：文本输入，自动去声调匹配

## 编码约定

- 所有中文注释和输出
- 前端全部内联在 `index.html`，不拆分文件
- 数据变更需重新运行 `npm run crawl`
- 前端或数据变更后运行 `./deploy.sh` 同步到线上
