#!/usr/bin/env node
/**
 * 增量爬取每个汉字的 detail 页面，提取"吉凶寓意"字段
 * 规则：页面中有 "X字吉凶寓意：吉利字" 或 metadata 含 "吉凶寓意：吉" → lucky: true，否则 false
 *
 * 支持断点续爬：已有 lucky 字段的跳过
 * 并发 5 个请求，每批间隔 200ms
 */

const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'characters.json');
const CONCURRENCY = 5;
const DELAY_MS = 200;
const SAVE_EVERY = 100;

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
 * 从 detail 页面提取"吉凶寓意"
 * 方法1: <p>X字吉凶寓意： 吉利字</p>  → 含"吉利字"即为吉
 * 方法2: metadata <p>五行属性：属X 吉凶寓意：吉</p> → 含"吉凶寓意：吉"
 */
function extractLucky(html) {
  const $ = cheerio.load(html);

  // 方法1: 找 "X字吉凶寓意" 的专属 <p>
  let found = false;
  $('p').each((_, el) => {
    const t = $(el).text();
    if (t.includes('字吉凶寓意') && t.length < 30) {
      if (t.includes('吉利字')) found = true;
      return false;
    }
  });
  if (found) return true;

  // 方法2: metadata 区域 "吉凶寓意：吉"
  $('p').each((_, el) => {
    const t = $(el).text();
    if (t.includes('五行属性') && t.includes('吉凶寓意：吉')) {
      found = true;
      return false;
    }
  });

  return found;
}

async function main() {
  console.log('📖 加载数据...');
  const chars = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log(`   共 ${chars.length} 个汉字`);

  const todo = [];
  chars.forEach((c, i) => {
    if (c.lucky === undefined && c.url) {
      todo.push({ index: i, char: c });
    }
  });

  console.log(`   待爬取: ${todo.length}，已有: ${chars.length - todo.length}`);
  if (todo.length === 0) {
    console.log('✅ 全部已完成');
    return;
  }

  let processed = 0;
  let luckyCount = 0;

  for (let b = 0; b < todo.length; b += CONCURRENCY) {
    const batch = todo.slice(b, b + CONCURRENCY);

    const results = await Promise.all(batch.map(async ({ index, char: c }) => {
      const html = await fetchPage(c.url);
      if (!html) return { index, lucky: false, failed: true };
      const lucky = extractLucky(html);
      return { index, lucky, failed: false };
    }));

    for (const r of results) {
      chars[r.index].lucky = r.lucky;
      processed++;
      if (r.lucky) luckyCount++;
      if (r.failed) {
        console.error(`  ⚠ 失败: ${chars[r.index].char} ${chars[r.index].url}`);
      }
    }

    if (processed % 50 === 0 || b + CONCURRENCY >= todo.length) {
      const pct = ((processed / todo.length) * 100).toFixed(1);
      console.log(`  [${pct}%] ${processed}/${todo.length}  吉利: ${luckyCount}`);
    }

    if (processed % SAVE_EVERY === 0) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(chars));
      console.log(`  💾 已保存 (${processed})`);
    }

    await delay(DELAY_MS);
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(chars));

  const totalLucky = chars.filter(c => c.lucky === true).length;
  const totalUnlucky = chars.filter(c => c.lucky === false).length;
  console.log(`\n✅ 完成! 吉利字: ${totalLucky}，非吉利字: ${totalUnlucky}`);
}

main().catch(console.error);
