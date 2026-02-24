#!/usr/bin/env node
/**
 * 汉字数据爬虫 - 从 zidian.txcx.com 抓取汉字属性数据
 * 
 * Phase 1: 爬取五行+笔画子页面 → {字, 拼音, 五行, 笔画数}
 * Phase 2: 爬取结构页面 → 字→结构 映射
 * Phase 3: 爬取部首页面 → 字→部首 映射
 * Phase 4: 爬取详情页 → 是否常用 + 吉凶寓意 (enrich.js)
 */

const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { enrich } = require('./enrich');

const BASE_URL = 'https://zidian.txcx.com';
const DATA_DIR = path.join(__dirname, 'data');
const DELAY_MS = 200;

// ─────────────── Utilities ───────────────

const delay = ms => new Promise(r => setTimeout(r, ms));

async function fetchPage(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      console.error(`  ⚠ Retry ${i + 1}/${retries} ${url}: ${e.message}`);
      await delay(1000 * (i + 1));
    }
  }
  console.error(`  ✗ FAILED: ${url}`);
  return null;
}

/**
 * 从链接文本解析汉字条目
 * 格式可能是 "rén人" (无空格) 或 "rén 人" (有空格)
 */
function parseCharFromLink(text) {
  const t = text.trim();
  if (!t) return null;

  // 有空格的情况: "rén 人"
  if (t.includes(' ')) {
    const idx = t.lastIndexOf(' ');
    const pinyin = t.substring(0, idx).trim();
    const char = t.substring(idx + 1).trim();
    if (pinyin && char && char.length <= 2) return { pinyin, char };
  }

  // 无空格的情况: "rén人" — 在拉丁字母/CJK 边界分割
  const match = t.match(/^(.+?)\s*([\u3400-\u4dbf\u4e00-\u9fff])$/);
  if (match) return { pinyin: match[1], char: match[2] };

  // 扩展B区字符 (surrogate pairs)
  const sm = t.match(/^(.+?)\s*([\ud800-\udbff][\udc00-\udfff])$/);
  if (sm) return { pinyin: sm[1], char: sm[2] };

  return null;
}

function toFullUrl(href) {
  if (!href) return null;
  return href.startsWith('http') ? href : `${BASE_URL}/${href.replace(/^\//, '')}`;
}

/**
 * 获取页面中的"下一页"链接
 */
function getNextPageUrl($) {
  let nextUrl = null;
  $('a').each((_, a) => {
    if ($(a).text().trim() === '下一页') {
      const href = $(a).attr('href');
      if (href) nextUrl = toFullUrl(href);
    }
  });
  return nextUrl;
}

// ─────────────── Phase 1: 五行数据 ───────────────

async function crawlWuxing() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   Phase 1: 爬取五行数据               ║');
  console.log('╚══════════════════════════════════════╝');

  const WUXING = [
    { name: '金', page: 'hanzi-wuxing-0004.html' },
    { name: '木', page: 'hanzi-wuxing-000e.html' },
    { name: '水', page: 'hanzi-wuxing-000f.html' },
    { name: '火', page: 'hanzi-wuxing-000g.html' },
    { name: '土', page: 'hanzi-wuxing-0003.html' },
  ];

  const charMap = new Map();

  for (const { name: wuxing, page } of WUXING) {
    console.log(`\n── ${wuxing} ──`);
    const html = await fetchPage(`${BASE_URL}/${page}`);
    if (!html) continue;
    await delay(DELAY_MS);

    const $ = cheerio.load(html);

    // 收集所有"更多"子页面链接 (五行+笔画交叉页)
    const subUrls = [];
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (href.includes('hanzi-wuxing-bihua-')) {
        const full = toFullUrl(href);
        if (full && !subUrls.includes(full)) subUrls.push(full);
      }
    });

    // 也从概览页提取字符（可能有小组没有子页面）
    extractWuxingChars($, wuxing, charMap);

    console.log(`  发现 ${subUrls.length} 个笔画子页面`);

    for (let i = 0; i < subUrls.length; i++) {
      let pageUrl = subUrls[i];
      let totalCount = 0;
      const visited = new Set();

      // 跟踪分页
      while (pageUrl && !visited.has(pageUrl)) {
        visited.add(pageUrl);
        const subHtml = await fetchPage(pageUrl);
        if (!subHtml) break;
        await delay(DELAY_MS);

        const $s = cheerio.load(subHtml);

        // 从子页面提取笔画数
        let strokes = 0;
        $s('h2').each((_, h2) => {
          const m = $s(h2).text().match(/(\d+)画/);
          if (m && !strokes) strokes = parseInt(m[1]);
        });

        // 提取字符
        let count = 0;
        $s('a').each((_, a) => {
          const href = $s(a).attr('href') || '';
          if (!href.includes('hanzi-wuxing-hanzi-')) return;
          const parsed = parseCharFromLink($s(a).text());
          if (parsed && strokes > 0) {
            charMap.set(parsed.char, {
              char: parsed.char,
              pinyin: parsed.pinyin,
              wuxing,
              strokes,
              url: toFullUrl(href),
            });
            count++;
          }
        });
        totalCount += count;

        // 检查是否有下一页
        pageUrl = getNextPageUrl($s);
      }

      process.stdout.write(`  [${i + 1}/${subUrls.length}] +${totalCount} 字  \r`);
    }
    console.log(`\n  ${wuxing}完成，当前总计: ${charMap.size} 字`);
  }

  return charMap;
}

function extractWuxingChars($, wuxing, charMap) {
  // 从概览页提取 (有些小组可能直接在概览页上完整展示)
  let currentStrokes = 0;

  // 依序遍历 h2 和链接
  $('h2').each((_, h2) => {
    const text = $(h2).text();
    const m = text.match(/(\d+)画/);
    if (m) {
      currentStrokes = parseInt(m[1]);

      // 获取该 h2 后面紧跟的兄弟元素中的字符链接
      const nextEl = $(h2).next();
      if (nextEl.length) {
        nextEl.find('a[href*="hanzi-wuxing-hanzi-"]').each((_, a) => {
          const parsed = parseCharFromLink($(a).text());
          if (parsed && currentStrokes > 0) {
            charMap.set(parsed.char, {
              char: parsed.char,
              pinyin: parsed.pinyin,
              wuxing,
              strokes: currentStrokes,
            });
          }
        });
      }
    }
  });
}

// ─────────────── Phase 2: 结构数据 ───────────────

async function crawlJiegou() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   Phase 2: 爬取结构数据               ║');
  console.log('╚══════════════════════════════════════╝');

  const JIEGOU = [
    { name: '单一结构', page: 'hanzi-jiegou-0004.html' },
    { name: '左右结构', page: 'hanzi-jiegou-000e.html' },
    { name: '上下结构', page: 'hanzi-jiegou-000f.html' },
    { name: '左中右结构', page: 'hanzi-jiegou-000g.html' },
    { name: '上中下结构', page: 'hanzi-jiegou-0003.html' },
    { name: '右上包围结构', page: 'hanzi-jiegou-000c.html' },
    { name: '左上包围结构', page: 'hanzi-jiegou-000a.html' },
    { name: '左下包围结构', page: 'hanzi-jiegou-000h.html' },
    { name: '上三包围结构', page: 'hanzi-jiegou-000q.html' },
    { name: '下三包围结构', page: 'hanzi-jiegou-000d.html' },
    { name: '全包围结构', page: 'hanzi-jiegou-0005.html' },
    { name: '品字形结构', page: 'hanzi-jiegou-0001.html' },
  ];

  const structMap = new Map();

  for (const { name, page } of JIEGOU) {
    console.log(`\n── ${name} ──`);
    const html = await fetchPage(`${BASE_URL}/${page}`);
    if (!html) continue;
    await delay(DELAY_MS);

    const $ = cheerio.load(html);

    // 从概览页提取字符
    extractCharLinks($, structMap, name);

    // 收集子页面链接 (结构+笔画交叉页)
    const jiegouCode = page.replace('hanzi-jiegou-', '').replace('.html', '');
    const subUrls = [];
    $('a').each((_, a) => {
      const href = $(a).attr('href') || '';
      // 匹配 hanzi-jiegou-{code}-{bihua}.html (但排除 zuichangyong)
      const re = new RegExp(`hanzi-jiegou-${jiegouCode}-[0-9a-z]{4}\\.html`);
      if (re.test(href)) {
        const full = toFullUrl(href);
        if (full && !subUrls.includes(full)) subUrls.push(full);
      }
    });

    if (subUrls.length > 0) {
      console.log(`  发现 ${subUrls.length} 个子页面，继续爬取...`);
      for (let i = 0; i < subUrls.length; i++) {
        let pageUrl = subUrls[i];
        const visited = new Set();
        while (pageUrl && !visited.has(pageUrl)) {
          visited.add(pageUrl);
          const subHtml = await fetchPage(pageUrl);
          if (!subHtml) break;
          await delay(DELAY_MS);
          const $s = cheerio.load(subHtml);
          extractCharLinks($s, structMap, name);
          pageUrl = getNextPageUrl($s);
        }
      }
    }

    console.log(`  ${name}: 总计 ${structMap.size} 字`);
  }

  return structMap;
}

function extractCharLinks($, map, value) {
  $('a').each((_, a) => {
    const href = $(a).attr('href') || '';
    if (!href.match(/hanzi-xi[x0-9][a-z0-9]{2,}\.html/)) return;
    const parsed = parseCharFromLink($(a).text());
    if (parsed) {
      map.set(parsed.char, value);
    }
  });
}

// ─────────────── Phase 3: 部首数据 ───────────────

async function crawlBushou() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   Phase 3: 爬取部首数据               ║');
  console.log('╚══════════════════════════════════════╝');

  // 先获取部首索引页
  const indexHtml = await fetchPage(`${BASE_URL}/hanzi-bushou.html`);
  if (!indexHtml) {
    console.log('  ✗ 无法获取部首索引页，尝试备用方案...');
    return await crawlBushouFallback();
  }
  await delay(DELAY_MS);

  const $ = cheerio.load(indexHtml);

  // 收集所有部首页面链接
  const radicals = [];
  $('a').each((_, a) => {
    const href = $(a).attr('href') || '';
    const text = $(a).text().trim();
    // 匹配 "X部" 格式的部首链接
    if (href.match(/hanzi-bushou-[0-9a-f]{4}\.html$/) && text.endsWith('部')) {
      const radicalName = text.replace('部', '');
      const fullUrl = toFullUrl(href);
      if (fullUrl && radicalName && !radicals.find(r => r.name === radicalName)) {
        radicals.push({ name: radicalName, url: fullUrl });
      }
    }
  });

  console.log(`  发现 ${radicals.length} 个部首\n`);

  const radicalMap = new Map();

  for (let i = 0; i < radicals.length; i++) {
    const { name: radical, url } = radicals[i];
    const html = await fetchPage(url);
    if (!html) continue;
    await delay(DELAY_MS);

    const $r = cheerio.load(html);
    let count = 0;

    let pageUrl2 = url;
    const visited = new Set();
    while (pageUrl2 && !visited.has(pageUrl2)) {
      visited.add(pageUrl2);
      const htmlR = pageUrl2 === url ? html : await fetchPage(pageUrl2);
      if (!htmlR) break;
      if (pageUrl2 !== url) await delay(DELAY_MS);
      const $r2 = cheerio.load(htmlR);

      $r2('a').each((_, a) => {
        const href = $r2(a).attr('href') || '';
        if (!href.match(/hanzi-xi[x0-9][a-z0-9]{2,}\.html/)) return;
        const parsed = parseCharFromLink($r2(a).text());
        if (parsed) {
          radicalMap.set(parsed.char, radical);
          count++;
        }
      });

      pageUrl2 = getNextPageUrl($r2);
    }

    process.stdout.write(`  [${i + 1}/${radicals.length}] ${radical}部: +${count} 字 (总计: ${radicalMap.size})  \r`);
  }

  console.log(`\n\n  部首映射总计: ${radicalMap.size} 字`);
  return radicalMap;
}

async function crawlBushouFallback() {
  // 备用方案：从首页的部首列表中提取
  console.log('  使用首页部首列表...');
  const html = await fetchPage(BASE_URL);
  if (!html) return new Map();

  const $ = cheerio.load(html);
  const radicals = [];

  $('a').each((_, a) => {
    const href = $(a).attr('href') || '';
    const text = $(a).text().trim();
    if (href.match(/hanzi-bushou-[0-9a-f]{4}\.html$/) && text.endsWith('部')) {
      const radicalName = text.replace('部', '');
      const fullUrl = toFullUrl(href);
      if (fullUrl && radicalName && !radicals.find(r => r.name === radicalName)) {
        radicals.push({ name: radicalName, url: fullUrl });
      }
    }
  });

  console.log(`  发现 ${radicals.length} 个部首`);

  const radicalMap = new Map();
  for (let i = 0; i < radicals.length; i++) {
    const { name: radical, url } = radicals[i];
    const rHtml = await fetchPage(url);
    if (!rHtml) continue;
    await delay(DELAY_MS);

    const $r = cheerio.load(rHtml);
    $r('a').each((_, a) => {
      const href = $r(a).attr('href') || '';
      if (!href.match(/hanzi-xi[x0-9][a-z0-9]{2,}\.html/)) return;
      const parsed = parseCharFromLink($r(a).text());
      if (parsed) {
        radicalMap.set(parsed.char, radical);
      }
    });

    process.stdout.write(`  [${i + 1}/${radicals.length}] ${radical}部  \r`);
  }

  console.log(`\n  部首映射总计: ${radicalMap.size} 字`);
  return radicalMap;
}

// ─────────────── Main ───────────────

async function main() {
  const startTime = Date.now();
  console.log('🔍 汉字数据爬虫启动\n');

  // Phase 1: 五行
  const charMap = await crawlWuxing();
  console.log(`\n✓ Phase 1 完成: ${charMap.size} 个汉字（含五行+笔画+拼音）`);

  // Phase 2: 结构
  const jiegouMap = await crawlJiegou();
  console.log(`\n✓ Phase 2 完成: ${jiegouMap.size} 个结构映射`);

  // Phase 3: 部首
  const bushouMap = await crawlBushou();
  console.log(`\n✓ Phase 3 完成: ${bushouMap.size} 个部首映射`);

  // ── 合并数据 ──
  console.log('\n── 合并数据 ──');
  const result = [];
  for (const [char, data] of charMap) {
    result.push({
      char: data.char,
      pinyin: data.pinyin,
      wuxing: data.wuxing,
      strokes: data.strokes,
      radical: bushouMap.get(char) || '',
      structure: jiegouMap.get(char) || '',
      url: data.url || '',
    });
  }

  // 按笔画排序，同笔画按拼音排序
  result.sort((a, b) => a.strokes - b.strokes || a.pinyin.localeCompare(b.pinyin));

  // 保存
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const outputPath = path.join(DATA_DIR, 'characters.json');
  fs.writeFileSync(outputPath, JSON.stringify(result), 'utf-8');

  // ── 统计 ──
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const withRadical = result.filter(c => c.radical).length;
  const withStructure = result.filter(c => c.structure).length;
  const wuxingDist = {};
  result.forEach(c => { wuxingDist[c.wuxing] = (wuxingDist[c.wuxing] || 0) + 1; });

  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║   爬取完成！                          ║`);
  console.log(`╚══════════════════════════════════════╝`);
  console.log(`  总字数:   ${result.length}`);
  console.log(`  有部首:   ${withRadical}/${result.length} (${(withRadical / result.length * 100).toFixed(1)}%)`);
  console.log(`  有结构:   ${withStructure}/${result.length} (${(withStructure / result.length * 100).toFixed(1)}%)`);
  console.log(`  五行分布: ${JSON.stringify(wuxingDist)}`);
  console.log(`  耗时:     ${elapsed}s`);
  console.log(`  输出文件: ${outputPath}`);

  // Phase 4: 从详情页爬取 common 和 lucky
  await enrich();

  const finalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n  总耗时: ${finalElapsed}s`);
}

main().catch(e => {
  console.error('\n✗ 爬取失败:', e);
  process.exit(1);
});
