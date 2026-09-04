// 使い方: このフォルダで  node fetch-employees.js  を実行すると、
// Airtable「求人DB（企業）」の 従業員数 列を data/employees.json（企業名 → 原文）に書き出します。
// そのあと  node rebuild.js  を実行すると、求人カード・求人詳細・絞り込みに反映されます。
//
// ★ このリポジトリは Public です。トークンをこのファイルに書かないでください。
//    トークンは次の順で探します:
//      1) 環境変数 AIRTABLE_TOKEN
//      2) このフォルダの airtable.local.json（{"token":"pat..."} ・.gitignore 済み）
//      3) ..\bes-crm\config.js（同じ端末に BES CRM がある場合）
//
// ⚠ なぜ jobs.json に書かずに別ファイルにするのか
//    ロゴ（fetch-logos.js → data/logos.json）と同じ理由。jobs.json は Airtable から
//    「取り直すたび丸ごと入れ替わるスナップショット」なので、企業テーブル由来の情報を
//    そこに書くと取り直すたびに消える。企業名で引く別ファイルに持たせる。
//
// ⚠ 従業員数は自由記述の列で、「約290名（2025年9月）」「連結3,039名、単体835名」のように
//    書き方がそろっていない。原文はそのまま持ち、人数として読む処理は template.html 側に置いてある
//    （empNum / EMP_BANDS）。ここで数値化しないのは、段の切り方を変えるたびに
//    Airtable を取り直さなくて済むようにするため。

const fs = require('fs'), path = require('path');

const BASE_ID  = 'appYkc36EvioYoL1A';   // base「人材紹介事業」
const TABLE_ID = 'tblBNNH9sJjldPmZZ';   // table「求人DB（企業）」
const F_NAME   = 'Name';                // 企業名（primary）
const F_EMP    = '従業員数';            // flda7sYQBsb05X781
const dir = __dirname;

/* ---------- トークンの取得（fetch-logos.js と同じ） ---------- */
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
  console.error(`
Airtable のトークンが見つかりませんでした。次のどれかを用意してください。

  A) 環境変数に入れる
       PowerShell:  $env:AIRTABLE_TOKEN = "pat..."
  B) このフォルダに airtable.local.json を作る（gitignore 済み・push されません）
       {"token": "pat..."}
  C) 同じ端末の ..\bes-crm\config.js に AIRTABLE_TOKEN がある状態にする

必要なスコープ: data.records:read
`.trim());
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchAll(){
  const out = [];
  let offset;
  do{
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
    url.searchParams.set('pageSize', '100');
    url.searchParams.append('fields[]', F_NAME);
    url.searchParams.append('fields[]', F_EMP);
    if(offset) url.searchParams.set('offset', offset);
    const res = await fetch(url, { headers:{ Authorization:`Bearer ${TOKEN}` } });
    if(!res.ok){
      const body = await res.text().catch(()=> '');
      throw new Error(`Airtable API エラー ${res.status} ${res.statusText}\n${body}`);
    }
    const json = await res.json();
    out.push(...json.records);
    offset = json.offset;
    await sleep(210);
  }while(offset);
  return out;
}

(async () => {
  /* 掲載している求人に出てくる企業だけに絞る（ロゴと同じ考え方） */
  const jobsPath = path.join(dir, 'data', 'jobs.json');
  if(!fs.existsSync(jobsPath)){
    console.error('data/jobs.json がありません。先に求人データを用意してください。');
    process.exit(1);
  }
  const jobs = JSON.parse(fs.readFileSync(jobsPath, 'utf8'));
  const wanted = new Set(jobs.map(j => j.company).filter(Boolean));

  const records = await fetchAll();
  const map = {};
  for(const rec of records){
    const f = rec.fields || {};
    const name = (f[F_NAME] || '').trim();
    const emp  = (f[F_EMP]  || '').trim();
    if(!name || !emp) continue;
    if(!wanted.has(name)) continue;
    /* 「―」「—」など、記載なしを意味する記号だけの値は載せない */
    if(!/[0-9０-９]/.test(emp) && !/非公開/.test(emp)) continue;
    map[name] = emp;
  }

  const sorted = {};
  Object.keys(map).sort((a, b) => a.localeCompare(b, 'ja')).forEach(k => sorted[k] = map[k]);
  fs.writeFileSync(path.join(dir, 'data', 'employees.json'), JSON.stringify(sorted, null, 2) + '\n', 'utf8');

  const missing = [...wanted].filter(c => !map[c]);
  console.log(`data/employees.json を書き出しました: ${Object.keys(map).length}社 / 掲載企業 ${wanted.size}社`);
  if(missing.length){
    console.log(`従業員数が未記入の企業 ${missing.length}社（Airtableの「従業員数」列を埋めてください）:`);
    missing.forEach(c => console.log(`   - ${c}`));
  }
  console.log('続けて  node rebuild.js  を実行すると求人カード・求人詳細・絞り込みに反映されます。');
})().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
