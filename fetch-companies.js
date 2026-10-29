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
  /* 業界マスタそのものも書き出す（data/industry-master.json）。検索画面の業界ツリー（中分類→大分類）は
     以前 template.html に手書きの対応表（IND_GROUP）を持っていたが、マスタに中分類を足すたびに書き忘れて
     「その他」に落ちていたので、2026-09-22 からマスタをそのまま流し込む。 */
  const masterOut = inds.map(r => ({ code: r.fields[IND_CODE], name: r.fields[IND_NAME] || '', big: r.fields[IND_BIG] || '', bigCode: r.fields[IND_BIG_CODE], id: r.id }))
    .filter(x => x.name).sort((a, b) => (a.code || 0) - (b.code || 0));
  fs.writeFileSync(path.join(dir, 'data', 'industry-master.json'), JSON.stringify(masterOut, null, 1), 'utf8');
  console.log(`data/industry-master.json を書き出しました: ${masterOut.length}件`);

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
    };
    return c;
  }).filter(c => c.name);

  /* 1レコード＝1社。社名が同じでもまとめない（2026-10-29）。
     以前は同じ社名のレコードを1社にまとめていたが、同じ会社の重複は Airtable 側で統合し終えた（74組）。
     残っている同名レコードは「グリッド」「シンカ」「MRT」のような別会社なので、まとめると他社の求人・ロゴ・会社概要が混ざる。
     同名の会社は company-pages.js が本社の市区町村を添えて見分けられるようにする。
     ⚠ 同じ会社のレコードが新たに重複したときは、下の一覧に出るので Airtable 側で統合する（ここでまとめ直さない）。 */
  const byName = new Map();
  all.forEach(c => { if(!byName.has(c.name)) byName.set(c.name, []); byName.get(c.name).push(c); });
  const sameName = [...byName].filter(([, g]) => g.length > 1).map(([name, g]) => `${name}（${g.map(c => `${c.id} ${c.addr || c.url || ''}`.trim()).join(' ／ ')}）`);
  const companies = all;
  companies.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const out = path.join(dir, 'data', 'companies.json');
  /* 1行1社で書く（git の差分が「変わった会社の行」だけになる） */
  fs.writeFileSync(out, '[\n' + companies.map(c => JSON.stringify(c)).join(',\n') + '\n]\n', 'utf8');
  console.log(`\ndata/companies.json を書き出しました: ${companies.length}社（レコード ${recs.length}件・${(fs.statSync(out).size/1024/1024).toFixed(1)}MB）`);
  if(sameName.length){
    console.log(`  同じ社名のレコード ${sameName.length}組（別会社なら別ページのまま。同じ会社なら Airtable 側で統合してください）:`);
    sameName.forEach(m => console.log(`   - ${m}`));
  }
  const cnt = k => companies.filter(c => c[k] != null && c[k] !== '' && !(Array.isArray(c[k]) && !c[k].length)).length;
  console.log(`  会社概要 ${cnt('overview')}・事業内容 ${cnt('biz')}・本社都道府県 ${cnt('pref')}・設立 ${cnt('founded')}・資本金 ${cnt('capital')}・従業員数 ${cnt('employees')}・上場区分 ${cnt('listed')}・業界 ${cnt('industry')}`);
  console.log('\n次は  node rebuild.js  を実行してください。');
})().catch(e => { console.error('\nERROR', e.message); process.exit(1); });
