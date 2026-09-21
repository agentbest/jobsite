// 使い方: このフォルダで  node fetch-companies.js  を実行すると、
// Airtable「求人DB（企業）」の全社を取得して data/companies.json を書き出します。
// そのあと  node rebuild.js  で企業ページ（company/<企業ID>/）と企業一覧（company/）が再生成されます。
//
// なぜ求人とは別に持つか（2026-09-21・松岡さんの方針）:
//   求人は Airtable の鏡で毎朝入れ替わる「流動的なもの」。検索エンジンの評価はそこに期待しない。
//   企業の会社概要は、求人が0件になっても掲載し続ける「蓄積するもの」。URL を固定して社名検索を受ける。
//   なので企業は「掲載中の求人に出てくる会社だけ」ではなく、テーブルの全社を取る。
//
// ★ このリポジトリは Public です。トークンをこのファイルに書かないでください（fetch-jobs.js と同じ探し方）。

const fs = require('fs'), path = require('path');

const BASE_ID  = 'appYkc36EvioYoL1A';   // base「人材紹介事業」
const TABLE_ID = 'tblBNNH9sJjldPmZZ';   // table「求人DB（企業）」
const IND_TABLE = 'tblfn5HIG6pPiQ2LE', IND_NAME = 'fldXKyZtMheTlkX1r', IND_BIG = 'fldElJiVIGobEOc99';   // 求人票（業界マスタ）
const IND_CODE = 'fldgSjs3J8VpbX7j0', IND_BIG_CODE = 'fldTfGbKKiRQ1UkBq';   // 中code / 大code（企業一覧の業界ページの URL に使う。⚠ 変えると URL が変わる）
const dir = __dirname;

/* fieldId → companies.json のキー */
const F = {
  name:          'fld03vEbeabi8IQDN', // Name（企業名・primary）
  cid:           'fldc00Oz8xvDq1r3T', // 企業ID
  tagline:       'fldKVPuWAF54NxzFy', // タグライン
  overview:      'fldMCvNkGokYGeYEt', // 会社概要
  biz:           'fldnKPCDWSmvARTGA', // 事業内容
  url:           'fldbMJjGHozZbHdhx', // ホームページURL
  addr:          'fldEbNE3iR1g7AJxn', // 会社住所
  pref:          'fldfgDKbbgt8rIE1D', // 本社都道府県
  founded:       'fldJyOwBwMwC1YFqg', // 設立年月日
  capital:       'fldJ50FzGaS4dBcX9', // 資本金
  ceo:           'fldRjwEP0ZDzL3hNf', // 代表者名
  employees:     'flda7sYQBsb05X781', // 従業員数（原文）
  employeeCount: 'fldTazycQVisRgCpR', // 従業員数（数値）
  size:          'fldPd6KbT9SAlC40V', // 企業規模
  listed:        'flduxB9dU2zsuElsv', // 上場区分
  market:        'fldlO5BmafTWiiQqG', // 市場区分
  industry:      'fldMKCvGbSltNTdjy', // 業界カテゴリ（企業）→ 名前に解決する
  jobs:          'fldobp7GCOtEGxdND', // 求人DB（求人票）のリンク（重複社名の主レコードを決めるのに使う）
  updatedAt:     'fldqMaa2nzZvOkD0I', // 最終更新日時（sitemap の lastmod）
};

function findToken(){
  if(process.env.AIRTABLE_TOKEN) return process.env.AIRTABLE_TOKEN;
  const local = path.join(dir, 'airtable.local.json');
  if(fs.existsSync(local)){
    try{ const t = JSON.parse(fs.readFileSync(local, 'utf8')).token; if(t) return t.trim(); }catch(e){}
  }
  const crmConfig = path.join(dir, '..', 'bes-crm', 'config.js');
  if(fs.existsSync(crmConfig)){
    try{ const t = require(crmConfig).AIRTABLE_TOKEN; if(t) return t; }catch(e){}
  }
  return null;
}
const TOKEN = findToken();
if(!TOKEN){
  console.error('Airtableのトークンが見つかりません。airtable.local.json に {"token":"pat..."} を置いてください。');
  process.exit(1);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function listAll(table, fields){
  const out = [];
  let offset;
  do{
    const u = new URL(`https://api.airtable.com/v0/${BASE_ID}/${table}`);
    u.searchParams.set('pageSize', '100');
    u.searchParams.set('returnFieldsByFieldId', 'true');
    fields.forEach(f => u.searchParams.append('fields[]', f));
    if(offset) u.searchParams.set('offset', offset);
    const res = await fetch(u, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const j = await res.json();
    if(!res.ok) throw new Error(`${res.status} ${JSON.stringify(j).slice(0, 300)}`);
    out.push(...j.records);
    offset = j.offset;
    if(offset) await sleep(210);
  }while(offset);
  return out;
}
const str = v => (v == null ? '' : String(Array.isArray(v) ? v[0] : (typeof v === 'object' ? (v.name || '') : v))).trim();

(async () => {
  console.log('業界マスタを取得しています');
  const inds = await listAll(IND_TABLE, [IND_NAME, IND_BIG, IND_CODE, IND_BIG_CODE]);
  const indName = new Map(inds.map(r => [r.id, { mid: r.fields[IND_NAME] || '', big: r.fields[IND_BIG] || '', code: r.fields[IND_CODE], bigCode: r.fields[IND_BIG_CODE] }]));

  console.log('求人DB（企業）を取得しています');
  const recs = await listAll(TABLE_ID, Object.values(F));

  /* 1レコード → 1社の形に */
  const all = recs.map(r => {
    const f = r.fields;
    const c = {
      id: r.id,
      name: str(f[F.name]),
      cid: str(f[F.cid]) || null,
      tagline: str(f[F.tagline]) || null,
      overview: (f[F.overview] || '').trim() || null,
      biz: (f[F.biz] || '').trim() || null,
      url: str(f[F.url]) || null,
      addr: str(f[F.addr]) || null,
      pref: str(f[F.pref]) || null,
      founded: str(f[F.founded]) || null,
      capital: str(f[F.capital]) || null,
      ceo: str(f[F.ceo]) || null,
      employees: str(f[F.employees]) || null,
      employeeCount: (typeof f[F.employeeCount] === 'number') ? f[F.employeeCount] : null,
      size: str(f[F.size]) || null,
      listed: str(f[F.listed]) || null,
      market: str(f[F.market]) || null,
      industry: [...new Set((f[F.industry] || []).map(id => (indName.get(id) || {}).mid).filter(Boolean))],
      industryBig: [...new Set((f[F.industry] || []).map(id => (indName.get(id) || {}).big).filter(Boolean))],
      industryCode: [...new Set((f[F.industry] || []).map(id => (indName.get(id) || {}).code).filter(v => v != null))],
      industryBigCode: [...new Set((f[F.industry] || []).map(id => (indName.get(id) || {}).bigCode).filter(v => v != null))],
      industryMidBig: (f[F.industry] || []).map(id => indName.get(id)).filter(x => x && x.code != null).map(x => [x.code, x.bigCode]),   // 中code → 大code（業界ページの親子。会社の並び順に依存しないように対で持つ）
      updatedAt: String(f[F.updatedAt] || r.createdTime || '').slice(0, 10) || null,
      _jobs: (f[F.jobs] || []).length,
    };
    return c;
  }).filter(c => c.name);

  /* 同じ社名のレコードが複数ある（2026-09-21 時点で48社）。ページは1社1枚にしたいので、
     求人のリンクが多いレコードを主にして、空いている項目だけ他のレコードから埋める。
     主にならなかったレコードの ID は aliases に残す（求人側の会社リンクがそちらを向いていても企業ページに辿れるように）。 */
  const byName = new Map();
  all.forEach(c => { if(!byName.has(c.name)) byName.set(c.name, []); byName.get(c.name).push(c); });
  const filled = c => Object.values(c).filter(v => v != null && v !== '' && !(Array.isArray(v) && !v.length)).length;
  const companies = [];
  const merged = [];
  for(const [name, group] of byName){
    group.sort((a, b) => b._jobs - a._jobs || filled(b) - filled(a) || (a.id < b.id ? -1 : 1));
    const main = group[0];
    main.aliases = [];
    for(const o of group.slice(1)){
      main.aliases.push(o.id);
      for(const k of Object.keys(o)){
        if(k === 'id' || k === '_jobs' || k === 'aliases') continue;
        const empty = main[k] == null || main[k] === '' || (Array.isArray(main[k]) && !main[k].length);
        if(empty && o[k] != null && o[k] !== '' && !(Array.isArray(o[k]) && !o[k].length)) main[k] = o[k];
      }
      if(o.updatedAt && (!main.updatedAt || o.updatedAt > main.updatedAt)) main.updatedAt = o.updatedAt;
    }
    if(group.length > 1) merged.push(`${name}（${group.length}件 → ${main.id}）`);
    delete main._jobs;
    if(!main.aliases.length) delete main.aliases;
    companies.push(main);
  }
  companies.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const out = path.join(dir, 'data', 'companies.json');
  /* 1行1社で書く（git の差分が「変わった会社の行」だけになる） */
  fs.writeFileSync(out, '[\n' + companies.map(c => JSON.stringify(c)).join(',\n') + '\n]\n', 'utf8');
  console.log(`\ndata/companies.json を書き出しました: ${companies.length}社（レコード ${recs.length}件・${(fs.statSync(out).size/1024/1024).toFixed(1)}MB）`);
  if(merged.length){
    console.log(`  同じ社名のレコードをまとめました ${merged.length}社（Airtable 側で1社1レコードに整理してください）:`);
    merged.forEach(m => console.log(`   - ${m}`));
  }
  const cnt = k => companies.filter(c => c[k] != null && c[k] !== '' && !(Array.isArray(c[k]) && !c[k].length)).length;
  console.log(`  会社概要 ${cnt('overview')}・事業内容 ${cnt('biz')}・本社都道府県 ${cnt('pref')}・設立 ${cnt('founded')}・資本金 ${cnt('capital')}・従業員数 ${cnt('employees')}・上場区分 ${cnt('listed')}・業界 ${cnt('industry')}`);
  console.log('\n次は  node rebuild.js  を実行してください。');
})().catch(e => { console.error('\nERROR', e.message); process.exit(1); });
