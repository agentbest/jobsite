// 求人DB（求人票）の「タグ」列を、タグマスタ「求人票（タグ）」の判定ルールで付け直す。
// 端末0 の 05_タグ自動付与_20260906（03 判定 → 04 件数書き戻し）をこの端末用に作り直したもの（2026-10-11）。
//
// 使い方（jobsite フォルダで）:
//   node tools/tags/assign-tags.js            … 判定だけ（書き込まない）。既存タグとの一致率と、付く件数を表示
//   node tools/tags/assign-tags.js --write    … タグが空の求人にだけ書き込む（合併で入った新しい求人向け）
//   node tools/tags/assign-tags.js --write --all … 全件を上書き（⚠ 手で付けたタグは消える）
//   node tools/tags/assign-tags.js --counts   … タグマスタの「付与件数」を書き戻す（--write と併用可）
//   node tools/tags/assign-tags.js --write --cat=業界（中分類）,業界（大分類） … そのカテゴリのタグだけ全件で付け直す（他のタグは残す）
//
// 判定ルールはスクリプトに埋めていない。タグマスタの「判定キーワード」「判定対象フィールド」の2列を読む。
//   - 判定キーワードは / 区切りの OR。先頭 ! は除外語（どれかが当たれば付けない）。2文字未満の語は無視。
//   - 「数値判定：」「列判定：」「区分判定：」「※」で始まる行と「。」を含む行は読み飛ばす。「補助キーワード」行は後ろを読む。
//   - 英数字だけの語は、前後が英数字でないときだけ一致（LAWS の中の AWS を拾わない）。
//   - 年収・年間休日・残業・従業員数・上場/市場区分・設立年・区分・業界は下の SPECIAL で数値／列から判定する。
//
// ★ このリポジトリは Public。トークンは airtable.local.json（.gitignore 済み）か環境変数 AIRTABLE_TOKEN から読む。

const fs = require('fs'), path = require('path');

const BASE = 'appYkc36EvioYoL1A';
const T_JOB = 'tblyPZZasXTM2tcrV', T_TAG = 'tblrDNuukfmi4gZFq', T_CO = 'tblBNNH9sJjldPmZZ', T_IND = 'tblfn5HIG6pPiQ2LE';
const F_TAGS = 'fldYNSqarLLDERI0a';      // 求人票「タグ」（複数選択）
const F_TAG_COUNT = 'fldEKHn2eFzH6qVOR'; // タグマスタ「付与件数」

const args = new Set(process.argv.slice(2));
const WRITE = args.has('--write'), COUNTS = args.has('--counts');
/* --cat=業界（中分類）,業界（大分類） … そのカテゴリのタグだけ全件で付け直す（他のタグは触らない） */
const CATS = (process.argv.find(a => a.startsWith('--cat=')) || '').slice(6).split(',').filter(Boolean);
const ALL = args.has('--all') || CATS.length > 0;

const dir = path.join(__dirname, '..', '..');
function findToken(){
  if(process.env.AIRTABLE_TOKEN) return process.env.AIRTABLE_TOKEN;
  const p = path.join(dir, 'airtable.local.json');
  if(fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')).token.trim();
  console.error('Airtableのトークンが見つかりません（airtable.local.json）'); process.exit(1);
}
const TOKEN = findToken();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(url, opt = {}){
  for(let i = 0; i < 5; i++){
    const res = await fetch(url, { ...opt, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' } });
    if(res.status === 429 || res.status >= 500){ await sleep(2000 * (i + 1)); continue; }
    const j = await res.json();
    if(!res.ok) throw new Error(`${res.status} ${JSON.stringify(j).slice(0, 300)}`);
    return j;
  }
  throw new Error('retry over');
}
async function all(table){
  /* 調整中に何度も回すとき用: CACHE_DIR を指定すると取得結果を使い回す */
  const cf = process.env.CACHE_DIR && path.join(process.env.CACHE_DIR, table + '.json');
  if(cf && fs.existsSync(cf)) return JSON.parse(fs.readFileSync(cf, 'utf8'));
  const out = []; let offset;
  do{
    const u = new URL(`https://api.airtable.com/v0/${BASE}/${table}`);
    u.searchParams.set('pageSize', '100');
    if(offset) u.searchParams.set('offset', offset);
    const j = await api(u);
    out.push(...j.records); offset = j.offset;
    process.stdout.write(`\r  ${table} ${out.length}件`);
    await sleep(210);
  }while(offset);
  process.stdout.write('\n');
  return out;
}

/* 判定対象フィールド（タグマスタの選択肢名）→ 求人票の列名。配列は連結して探す */
const TARGET = {
  'おすすめポイント': ['おすすめポイント', 'おすすめポイント①', 'おすすめポイント②'],
};
const TEXT_FIELDS = ['求人タイトル', '職種・募集ポジション', '仕事内容', '必須条件', '歓迎条件', '求める人物像', '給与（原文）',
  '勤務地', '勤務時間', '休日', '福利厚生', '選考プロセス', 'おすすめポイント', 'おすすめポイント①', 'おすすめポイント②', '会社情報'];

const str = v => Array.isArray(v) ? v.map(str).join('\n') : (v && typeof v === 'object') ? (v.name || '') : (v == null ? '' : String(v));

/* 判定キーワード列 → { inc:[RegExp], exc:[RegExp] } */
const isAscii = w => /^[\x20-\x7e]+$/.test(w);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function parseKeywords(src){
  const lines = String(src || '').split(/\r?\n/)
    .map(l => l.replace(/^補助キーワード\s*/, ''))
    .filter(l => !/^(数値判定：|列判定：|区分判定：|※)/.test(l.trim()) && !l.includes('。'));
  const inc = [], exc = [];
  for(let w of lines.join('\n').split('/')){
    w = w.replace(/^[ \t]+|[ \t]+$/g, '');
    const neg = w.startsWith('!'); if(neg) w = w.slice(1);
    if(w.replace(/\s/g, '').length < 2) continue;
    /* ○ は数字のつもりで書かれている（「最短○年で」「売上高○％増」） */
    let re = esc(w).replace(/[○◯]+/g, '[0-9０-９,，.]+');
    if(isAscii(w)) re = `(?<![A-Za-z0-9])${re}(?![A-Za-z0-9])`;
    (neg ? exc : inc).push(new RegExp(re));
  }
  return { inc, exc };
}

/* ---------- 数値・列での判定 ---------- */
const num = v => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return String(v ?? '').trim() && isFinite(n) ? n : null; };
function annualHolidays(t){ let best = null; for(const m of t.matchAll(/年間休日[^0-9０-９]{0,8}([0-9０-９]{2,3})/g)){ const n = +m[1].replace(/[０-９]/g, c => c.charCodeAt(0) - 0xFEE0); if(n >= 60 && n <= 200) best = Math.max(best ?? 0, n); } return best; }
function overtime(t){ let v = null; for(const m of t.matchAll(/(?:残業|時間外労働)[^0-9０-９。]{0,12}([0-9０-９]{1,3}(?:\.\d)?)\s*(?:時間|h|H)/g)){ const n = +m[1].replace(/[０-９]/g, c => c.charCodeAt(0) - 0xFEE0); v = v == null ? n : Math.max(v, n); } return v; }
const yearOf = s => { const m = String(s || '').match(/(\d{4})/); return m ? +m[1] : null; };

const SPECIAL = {
  '年収600万円以上':  j => salaryAtLeast(j, 600),
  '年収800万円以上':  j => salaryAtLeast(j, 800),
  '年収1000万円以上': j => salaryAtLeast(j, 1000),
  '年収1500万円以上': j => salaryAtLeast(j, 1500),
  '従業員100名以下':  j => j.emp != null && j.emp <= 100,
  '従業員1000名以上': j => j.emp != null && j.emp >= 1000,
  '上場企業':          j => j.listed === '上場',
  '非上場・オーナー企業': j => j.listed === '非上場',
  '東証プライム上場':   j => /プライム/.test(j.market),
  '東証スタンダード上場': j => /スタンダード/.test(j.market),
  '東証グロース上場':   j => /グロース/.test(j.market),
  '新卒・インターン向け': j => /新卒|インターン/.test(j.kubun),
};
/* キーワードに「足して」付ける（OR） */
const EXTRA = {
  '年間休日120日以上': j => (annualHolidays(j.text('休日') + '\n' + j.text('求人タイトル')) ?? 0) >= 120,
  '年間休日125日以上': j => (annualHolidays(j.text('休日') + '\n' + j.text('求人タイトル')) ?? 0) >= 125,
  '残業月20時間以内':   j => { const v = overtime(j.text('勤務時間') + '\n' + j.text('福利厚生') + '\n' + j.text('求人タイトル')); return v != null && v <= 20; },
  '創業50年以上の老舗': j => { const y = yearOf(j.founded); return y != null && y <= new Date().getFullYear() - 50; },
  '大手・グループ企業': j => j.emp != null && j.emp >= 1000,
  '第二新卒歓迎':       j => /第二新卒/.test(j.grad),
};
function salaryAtLeast(j, x){ return j.cap != null ? j.cap >= x : (j.low != null && j.low >= x); }

(async () => {
  console.log('取得中…');
  const [tagRecs, jobRecs, coRecs, indRecs] = [await all(T_TAG), await all(T_JOB), await all(T_CO), await all(T_IND)];

  const co = new Map(coRecs.map(r => [r.id, r.fields]));
  const ind = new Map(indRecs.map(r => [r.id, { mid: str(r.fields['業界中カテゴリ']).trim(), big: str(r.fields['業界大カテゴリ']).trim() }]));

  const tags = tagRecs.map(r => ({ id: r.id, name: str(r.fields['タグ名']).trim(), cat: str(r.fields['タグカテゴリ']),
      targets: r.fields['判定対象フィールド'] || [], ...parseKeywords(r.fields['判定キーワード']), old: r.fields['付与件数'] }))
    .filter(t => t.name);
  const tagNames = new Set(tags.map(t => t.name));

  const jobs = jobRecs.map(r => {
    const f = r.fields, c = co.get((f['会社名'] || [])[0]) || {};
    /* 業界は企業DBが正（サイトの attachIndustry() と同じ）。企業側が空のときだけ求人票の業界 */
    const indIds = (c['業界カテゴリ（企業）'] && c['業界カテゴリ（企業）'].length) ? c['業界カテゴリ（企業）'] : (f['業界カテゴリ'] || []);
    const cache = {};
    /* 「会社情報」は企業DBの会社概要＋事業内容（求人票のルックアップは会社概要だけなので企業DBから直接読む） */
    f['会社情報'] = [str(c['会社概要']) || str(f['会社情報']), str(c['事業内容'])].filter(Boolean).join('\n');
    return {
      id: r.id, f, oldTags: f['タグ'] || [],
      text: name => cache[name] ??= str(f[name]),
      cap: num(f['年収上限']), low: num(f['年収下限']),
      emp: c['従業員数（数値）'] ?? num(c['従業員数']),
      listed: str(c['上場区分'] || f['上場区分']), market: str(c['市場区分']), founded: c['設立年月日'],
      kubun: str(f['区分']), grad: str(f['対象卒業年']),
      inds: indIds.map(id => ind.get(id)).filter(Boolean),
    };
  });

  /* ---------- 判定 ---------- */
  const result = new Map();
  for(const j of jobs){
    const got = new Set();
    for(const t of tags){
      if(SPECIAL[t.name]){ if(SPECIAL[t.name](j)) got.add(t.name); continue; }
      if(t.cat === '業界（中分類）'){ if(j.inds.some(i => i.mid === t.name)) got.add(t.name); continue; }
      if(t.cat === '業界（大分類）'){ if(j.inds.some(i => i.big === t.name)) got.add(t.name); continue; }
      const fields = t.targets.length ? t.targets.flatMap(n => TARGET[n] || [n]) : TEXT_FIELDS;
      const hay = fields.map(n => j.text(n)).join('\n');
      let hit = t.inc.some(re => re.test(hay)) || (EXTRA[t.name] && EXTRA[t.name](j));
      if(hit && t.exc.some(re => re.test(hay))) hit = false;
      if(hit) got.add(t.name);
    }
    /* 「未経験から年収400万円以上」は未経験歓迎タグが前提 */
    if(got.has('未経験歓迎') && j.low != null && j.low >= 400) got.add('未経験から年収400万円以上');
    result.set(j.id, [...got]);
  }

  /* ---------- 既存タグとの照合（作り直しが元の判定をどこまで再現しているか） ---------- */
  const tagged = jobs.filter(j => j.oldTags.length);
  let tp = 0, fp = 0, fn = 0; const per = {};
  for(const j of tagged){
    const a = new Set(j.oldTags), b = new Set(result.get(j.id));
    for(const x of b){ if(a.has(x)) tp++; else { fp++; (per[x] ??= [0, 0])[0]++; } }
    for(const x of a){ if(!b.has(x)){ fn++; (per[x] ??= [0, 0])[1]++; } }
  }
  console.log(`\n既存タグのある求人 ${tagged.length}件で照合: 一致 ${tp} / 新たに付く ${fp} / 外れる ${fn}（一致率 ${(tp / (tp + fn) * 100).toFixed(1)}%）`);
  const worst = Object.entries(per).sort((a, b) => (b[1][0] + b[1][1]) - (a[1][0] + a[1][1])).slice(0, 15);
  if(worst.length) console.log('ずれの大きいタグ（新たに付く / 外れる）:\n' + worst.map(([k, [p, n]]) => `  ${k}  +${p} / -${n}`).join('\n'));

  if(process.env.DEBUG_TAG){
    const name = process.env.DEBUG_TAG, t = tags.find(x => x.name === name);
    const fields = t.targets.length ? t.targets.flatMap(n => TARGET[n] || [n]) : TEXT_FIELDS;
    for(const [lab, cond] of [['新たに付く', (a, b) => b && !a], ['外れる', (a, b) => a && !b]]){
      const xs = tagged.filter(j => cond(j.oldTags.includes(name), result.get(j.id).includes(name))).slice(0, 6);
      console.log(`--- ${name} ${lab}`);
      xs.forEach(j => console.log(j.id, JSON.stringify(fields.map(n => j.text(n)).join(' | ').slice(0, 400))));
    }
  }
  if(CATS.length){
    const inCat = new Set(tags.filter(t => CATS.includes(t.cat)).map(t => t.name));
    for(const j of jobs){
      const keep = j.oldTags.filter(n => !inCat.has(n));
      result.set(j.id, [...keep, ...result.get(j.id).filter(n => inCat.has(n))]);
    }
  }
  const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  const targets = jobs.filter(j => CATS.length ? !same(j.oldTags, result.get(j.id)) : (ALL || !j.oldTags.length));
  const avg = targets.length ? targets.reduce((s, j) => s + result.get(j.id).length, 0) / targets.length : 0;
  console.log(`\n書き込み対象 ${targets.length}件（${ALL ? '全件' : 'タグが空の求人'}）・1件あたり平均 ${avg.toFixed(1)}タグ`);
  const missing = new Set(); jobs.forEach(j => j.inds.forEach(i => { if(!tagNames.has(i.mid)) missing.add(i.mid); }));
  if(missing.size) console.log(`タグマスタに無い業界（中分類）: ${[...missing].join('、')}（付かない）`);

  if(WRITE){
    const rows = targets.filter(j => ALL || result.get(j.id).length);
    for(let i = 0; i < rows.length; i += 10){
      await api(`https://api.airtable.com/v0/${BASE}/${T_JOB}`, { method: 'PATCH',
        body: JSON.stringify({ typecast: true, records: rows.slice(i, i + 10).map(j => ({ id: j.id, fields: { [F_TAGS]: result.get(j.id) } })) }) });
      process.stdout.write(`\r  書き込み ${Math.min(i + 10, rows.length)}/${rows.length}`);
      await sleep(220);
    }
    process.stdout.write('\n');
  }

  if(COUNTS){
    /* 書き込み後の実際の付き方で数える（書き込まない求人は既存タグのまま） */
    const cnt = {};
    for(const j of jobs){
      const now = (WRITE && (ALL || !j.oldTags.length)) ? result.get(j.id) : j.oldTags;
      now.forEach(n => cnt[n] = (cnt[n] || 0) + 1);
    }
    const ups = tags.filter(t => (cnt[t.name] || 0) !== t.old);
    for(let i = 0; i < ups.length; i += 10){
      await api(`https://api.airtable.com/v0/${BASE}/${T_TAG}`, { method: 'PATCH',
        body: JSON.stringify({ records: ups.slice(i, i + 10).map(t => ({ id: t.id, fields: { [F_TAG_COUNT]: cnt[t.name] || 0 } })) }) });
      await sleep(220);
    }
    console.log(`付与件数を ${ups.length}タグ書き戻しました`);
  }
  if(!WRITE && !COUNTS) console.log('\n（判定のみ。反映は --write、件数の書き戻しは --counts）');
})().catch(e => { console.error(e); process.exit(1); });
