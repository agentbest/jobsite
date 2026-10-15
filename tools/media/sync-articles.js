// 転職メディア（www.agent-best.net/media/）の記事を Airtable「掲載記事一覧」に同期し、記事タグを data/media-tags.json に書き出す（2026-10-15）。
//
//   node tools/media/sync-articles.js          … 確認だけ（Airtable に書かない。data/media-tags.json は書く）
//   node tools/media/sync-articles.js --write  … Airtable に書く（毎朝の Actions はこちら）
//
// 流れ
//   1. www.agent-best.net/media/search.json（記事一覧）を読む
//   2. Airtable「掲載記事一覧」tblrWvmu0frs5NbiA を記事slugで突き合わせ、無い記事は作る・変わった列だけ直す
//      同期する列: タイトル / URL / カテゴリ / ハブ / ハブ名 / 企業名 / meta description / 最終同期
//      ⚠ 正は記事ファイル（agentbest-lp の src/content/media/*.md）。Airtable でタイトルを直しても記事は変わらず、翌朝戻る
//   3. 記事タグが空の記事に、共通タグ（tblBxgZS5X5bAZqRR・旧名 記事タグ）の「初期ハブ」が記事のハブと一致するタグを付ける
//      ⚠ 一度でも記事タグが入っている記事は触らない（人が直した値を上書きしない）
//   4. data/media-tags.json = { t: { タグID: { n: タグ名, kw: 職種キーワード, site: 'both'|'jobs'|'skill', jt: [求人タグ名] } },
//                              a: { 記事slug: [タグID, ...] } } を書く → media-jobs.js が読む
//
// 人が触る列は 共通タグ / 狙うキーワード / メモ（と Airtable 既定の Status など）だけ。
// 取得に失敗したら data/media-tags.json は前回のまま（求人の更新は止めない）。
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const WRITE = process.argv.includes('--write');
const BASE = 'https://api.airtable.com/v0/appYkc36EvioYoL1A/';
const T_ART = 'tblrWvmu0frs5NbiA', T_ATAG = 'tblBxgZS5X5bAZqRR', T_JTAG = 'tblrDNuukfmi4gZFq';
const SRC = 'https://www.agent-best.net/media/search.json';
const SITE_OF = { '両方': 'both', 'jobs（600万円以上）': 'jobs', 'skill（手に職）': 'skill' };

function token(){
  if(process.env.AIRTABLE_TOKEN) return process.env.AIRTABLE_TOKEN;
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'airtable.local.json'), 'utf8'));
  return j.token || Object.values(j).find(v => typeof v === 'string' && v.startsWith('pat'));
}
const H = { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(url, opt = {}){
  for(let i = 0; i < 5; i++){
    const res = await fetch(url, { headers: H, ...opt });
    if(res.status === 429){ await sleep(1500); continue; }
    const j = await res.json();
    if(j.error) throw new Error(`${url} → ${JSON.stringify(j.error)}`);
    return j;
  }
  throw new Error('429 が続きました');
}
async function all(table){
  const out = []; let offset = '';
  do {
    const j = await api(`${BASE}${table}?pageSize=100${offset ? '&offset=' + offset : ''}`);
    out.push(...j.records); offset = j.offset || '';
  } while(offset);
  return out;
}
async function batch(table, method, records){
  for(let i = 0; i < records.length; i += 10){
    await api(BASE + table, { method, body: JSON.stringify({ records: records.slice(i, i + 10), typecast: true }) });
    await sleep(220);
  }
}

(async () => {
  let idx;
  try {
    const res = await fetch(SRC);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    idx = await res.json();
  } catch(e) {
    console.log(`⚠ ${SRC} を取得できませんでした（${e.message}）。記事の同期をやめます（data/media-tags.json は前回のまま）`);
    return;
  }
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const articles = idx.i.map(r => ({
    slug: r[0], title: r[1] || '', desc: r[2] || '', cat: idx.c[r[3]] || '',
    hub: (idx.s || [])[r[4]] || '', hubName: idx.h[r[4]] || '', company: r[5] || '',
  }));

  const [artRecs, tagRecs, jtagRecs] = await Promise.all([all(T_ART), all(T_ATAG), all(T_JTAG)]);
  const jtagName = new Map(jtagRecs.map(r => [r.id, r.fields['タグ名']]));
  const tagsByHub = new Map();
  const tagDefs = {};
  tagRecs.forEach(r => {
    const f = r.fields;
    if(!f['タグ名']) return;
    tagDefs[r.id] = { n: f['タグ名'], kw: f['職種キーワード'] || '', site: SITE_OF[f['出すサイト']] || 'both',
      jt: (f['求人タグ'] || []).map(id => jtagName.get(id)).filter(Boolean) };
    String(f['初期ハブ'] || '').split(',').map(s => s.trim()).filter(Boolean).forEach(h => {
      if(!tagsByHub.has(h)) tagsByHub.set(h, []);
      tagsByHub.get(h).push(r.id);
    });
  });

  const bySlug = new Map();
  const blank = [];
  artRecs.forEach(r => { const s = r.fields['記事slug']; if(s) bySlug.set(s, r); else if(Object.keys(r.fields).filter(k => k !== 'Attachment Summary').length === 0) blank.push(r.id); });

  const creates = [], updates = [], assign = {};
  for(const a of articles){
    const want = {
      'タイトル': a.title, 'URL': `https://www.agent-best.net/media/${a.slug}/`, 'カテゴリ': a.cat || null,
      'ハブ': a.hub, 'ハブ名': a.hubName, '企業名': a.company, 'meta description': a.desc,
    };
    const rec = bySlug.get(a.slug);
    const cur = rec ? rec.fields : {};
    let tags = cur['共通タグ'] || [];
    const fields = {};
    for(const [k, v] of Object.entries(want)) if((cur[k] || '') !== (v || '')) fields[k] = v;
    if(!tags.length && tagsByHub.has(a.hub)){ tags = tagsByHub.get(a.hub); fields['共通タグ'] = tags; }
    assign[a.slug] = tags.filter(id => tagDefs[id]);
    if(!rec) creates.push({ fields: { '記事slug': a.slug, ...fields, '最終同期': today } });
    else if(Object.keys(fields).length) updates.push({ id: rec.id, fields: { ...fields, '最終同期': today } });
  }
  const gone = [...bySlug.keys()].filter(s => !articles.some(a => a.slug === s));

  /* skill.agent-best.net の求人一覧も取っておく（記事タグの「出すサイト」で skill の求人も選ぶため）。
     data/skill-list.json = { k, r, tags: [タグ名...] }。⚠ .gitignore（約3MB・毎日変わる）。取れなければ前回のまま */
  try {
    const [list, tg] = await Promise.all(['data/list.json', 'data/tags.json'].map(p =>
      fetch('https://skill.agent-best.net/' + p).then(r => { if(!r.ok) throw new Error(`${p} HTTP ${r.status}`); return r.json(); })));
    fs.writeFileSync(path.join(ROOT, 'data', 'skill-list.json'), JSON.stringify({ k: list.k, r: list.r, tags: tg.map(t => t.name) }), 'utf8');
    console.log(`skill の求人 ${list.r.length}件 → data/skill-list.json`);
  } catch(e) { console.log(`⚠ skill の求人一覧を取得できませんでした（${e.message}）。前回の data/skill-list.json を使います`); }

  const out = { t: tagDefs, a: assign };
  fs.writeFileSync(path.join(ROOT, 'data', 'media-tags.json'), JSON.stringify(out), 'utf8');
  const tagged = Object.values(assign).filter(v => v.length).length;
  console.log(`記事 ${articles.length}本 ／ Airtable 新規 ${creates.length}・更新 ${updates.length}・空行 ${blank.length}`
    + `${gone.length ? `・サイトから消えた記事 ${gone.length}（Airtable には残す）` : ''}`);
  console.log(`記事タグ ${Object.keys(tagDefs).length}個 ／ タグ付きの記事 ${tagged}本 → data/media-tags.json`);
  const noHub = articles.filter(a => !assign[a.slug].length).map(a => a.hub);
  if(noHub.length) console.log(`  タグの無い記事 ${noHub.length}本（ハブ: ${[...new Set(noHub)].slice(0, 10).join(', ')}）→ 記事タグの「初期ハブ」に足すと次回から付く`);

  if(!WRITE) return console.log('（Airtable には書いていません。--write で反映）');
  await batch(T_ART, 'POST', creates);
  await batch(T_ART, 'PATCH', updates);
  if(blank.length){ for(let i = 0; i < blank.length; i += 10) await api(`${BASE}${T_ART}?` + blank.slice(i, i + 10).map(id => 'records[]=' + id).join('&'), { method: 'DELETE' }); }
  console.log('Airtable に反映しました');
})().catch(e => { console.log('⚠ 記事の同期に失敗しました:', e.message); });
