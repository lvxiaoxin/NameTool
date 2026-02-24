#!/usr/bin/env node
/**
 * 增量爬取每个汉字的 detail 页面，提取"是否常用"字段
 * 规则：页面文本包含 "常用字" → common: true，否则 false
 * 
 * 支持断点续爬：已有 common 字段的跳过
 * 并发 5 个请求，每批间隔 200ms
 */

const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'characters.json');
const CONCURRENCY = 5;
const DELAY_MS = 200;
const SAVE_EVERY = 100; // 每处理 100 个保存一次

const delay = ms => new Promise(r => setTimeout(r, ms));

async function fetchPage(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i < retries - 1) await delay(1000 * (i + 1));
    }
  }
  return null;
}

/**
 * 从 detail 页面提取"是否常用"
 * HTML结构: <p><font>X字是否常用：</font><span class="ml5">常用字</span>...</p>
 * 或: <p><font>X字是否常用：</font><span class="ml5"> -</span></p>
 */
function extractCommon(html) {
  const $ = cheerio.load(html);

  // 找包含 "是否常用：" 的 <p> 元素（不是 <h2> 标题）
  let text = '';
  $('p').each((_, el) => {
    const t = $(el).text();
    if (t.includes('是否常用')) {
      text = t;
      return false; // break
    }
  });

  // 兜底：全文搜索
  if (!text) {
    const full = $.text();
    const idx = full.indexOf('是否常用：');
    if (idx >= 0) {
      text = full.substring(idx, idx + 80);
    }
  }

  // "最常用字" / "常用字" / "次常用字" 都包含 "常用字" 子串
  return text.includes('常用字');
}

async function main() {
  console.log('📖 加载数据...');
  const chars = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log(`   共 ${chars.length} 个汉字`);

  // 筛选需要处理的（跳过已有 common 字段的）
  const todo = [];
  chars.forEach((c, i) => {
    if (c.common === undefined && c.url) {
      todo.push({ index: i, char: c });
    }
  });

  console.log(`   待爬取: ${todo.length}，已有: ${chars.length - todo.length}`);
  if (todo.length === 0) {
    console.log('✅ 全部已完成');
    return;
  }

  let processed = 0;
  let commonCount = 0;

  // 分批并发处理
  for (let b = 0; b < todo.length; b += CONCURRENCY) {
    const batch = todo.slice(b, b + CONCURRENCY);

    const results = await Promise.all(batch.map(async ({ index, char: c }) => {
      const html = await fetchPage(c.url);
      if (!html) return { index, common: false, failed: true };
      const common = extractCommon(html);
      return { index, common, failed: false };
    }));

    for (const r of results) {
      chars[r.index].common = r.common;
      processed++;
      if (r.common) commonCount++;
      if (r.failed) {
        console.error(`  ⚠ 失败: ${chars[r.index].char} ${chars[r.index].url}`);
      }
    }

    // 进度
    if (processed % 50 === 0 || b + CONCURRENCY >= todo.length) {
      const pct = ((processed / todo.length) * 100).toFixed(1);
      console.log(`  [${pct}%] ${processed}/${todo.length}  常用: ${commonCount}`);
    }

    // 定期保存
    if (processed % SAVE_EVERY === 0) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(chars));
      console.log(`  💾 已保存 (${processed})`);
    }

    await delay(DELAY_MS);
  }

  // 最终保存
  fs.writeFileSync(DATA_FILE, JSON.stringify(chars));

  const totalCommon = chars.filter(c => c.common === true).length;
  const totalUncommon = chars.filter(c => c.common === false).length;
  console.log(`\n✅ 完成! 常用字: ${totalCommon}，非常用字: ${totalUncommon}`);
}

main().catch(console.error);
