// 求人を「募集停止」にする（Airtable の行は消さない）。翌朝の自動更新（または手元で fetch-jobs → rebuild）でサイトから消える。
//
//   node tools/close/close-jobs.js --company=株式会社SANN              … 会社名（部分一致）の求人を一覧するだけ（書かない）
//   node tools/close/close-jobs.js --ids=recXXX,recYYY                 … レコードID／求人ID(キー) で指定
//   node tools/close/close-jobs.js --file=closed.txt                   … 1行1件（レコードID か 求人ID(キー)）
//   node tools/close/close-jobs.js --expired                           … 本文の「募集終了日時」を過ぎた求人
//   node tools/close/close-jobs.js --selection                         … 選考進捗で終了区分＝募集終了になった求人(自社)
//   … どれも --write で書き込む。--reason="媒体で募集終了" で理由を残す。--reopen で募集中に戻す。
//
// トークンは fetch-jobs.js と同じ（環境変数 AIRTABLE_TOKEN → airtable.local.json）。

const fs = require('fs'), path = require('path');
const BASE = 'appYkc36EvioYoL1A', JOBS = 'tblyPZZasXTM2tcrV', SEL = 'tblObkrC123YXn6ue';
const F = {
  title: 'fldp0GXKIkufwPQFF', key: 'fldrNjBDq9DeZAy1R', company: 'fldoQsYnH5W90qiKW', jobContent: 'fldxZH1FmlN0WYMbK',
  selectionProcess: 'fldEQcK7fBwNps0tC', status: 'fldLFxYGKjXQPoZsd', closedOn: 'fldSgPpnoq6iXLcOy', reason: 'fld39FFVl8vp7EoGO',
};
const SEL_END = 'fldz3EtpZzGTz7L2o', SEL_JOB = 'fldE9SBlsc8U296Hb';
const CO_TABLE = 'tblBNNH9sJjldPmZZ', CO_NAME = 'fld03vEbeabi8IQDN';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const WRITE = !!args.write, REOPEN = !!args.reopen;

function token(){
  if(process.env.AIRTABLE_TOKEN) return process.env.AIRTABLE_TOKEN;
  const p = path.join(__dirname, '..', '..', 'airtable.local.json');
  if(fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')).token.trim();
  console.error('Airtableのトークンが見つかりません'); process.exit(1);
}
const TOKEN = token();
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(url, opt = {}){
  for(let i = 0; ; i++){
    const res = await fetch(url, { ...opt, headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' } });
    if(res.status === 429 && i < 5){ await sleep(30000); continue; }
    const j = await res.json();
    if(!res.ok) throw new Error(`${res.status} ${JSON.stringify(j).slice(0, 300)}`);
    return j;
  }
}
async function listAll(table, fields){
  const out = []; let offset;
  do{
    const u = new URL(`https://api.airtable.com/v0/${BASE}/${table}`);
    u.searchParams.set('pageSize', '100'); u.searchParams.set('returnFieldsByFieldId', 'true');
    fields.forEach(f => u.searchParams.append('fields[]', f));
    if(offset) u.searchParams.set('offset', offset);
    const j = await api(u); out.push(...j.records); offset = j.offset; await sleep(220);
  }while(offset);
  return out;
}
const name = v => (v && typeof v === 'object') ? v.name : v;
function endDateOf(text){   // fetch-jobs.js と同じ
  const m = String(text).match(/募集終了日時?\s*[:：]?\s*(\d{4})[-\/年](\d{1,2})[-\/月](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
}

(async () => {
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const recs = await listAll(JOBS, Object.values(F));
  const byKey = new Map(); recs.forEach(r => { byKey.set(r.id, r); if(r.fields[F.key]) byKey.set(String(r.fields[F.key]).trim(), r); });

  let targets = [], reason = typeof args.reason === 'string' ? args.reason : '';
  const want = [];
  if(typeof args.ids === 'string') want.push(...args.ids.split(','));
  if(typeof args.file === 'string') want.push(...fs.readFileSync(args.file, 'utf8').split(/\r?\n/));
  for(const w of want.map(s => s.trim()).filter(Boolean)){
    const r = byKey.get(w);
    if(r) targets.push(r); else console.log(`  見つかりません: ${w}`);
  }
  if(typeof args.company === 'string'){
    const cos = await listAll(CO_TABLE, [CO_NAME]);
    const ids = new Set(cos.filter(c => (c.fields[CO_NAME] || '').includes(args.company)).map(c => c.id));
    targets.push(...recs.filter(r => (r.fields[F.company] || []).some(id => ids.has(id))));
  }
  if(args.expired){
    targets.push(...recs.filter(r => { const d = endDateOf([r.fields[F.jobContent], r.fields[F.title], r.fields[F.selectionProcess]].filter(Boolean).join('\n')); return d && d < today; }));
    reason = reason || '募集終了日時を過ぎた';
  }
  if(args.selection){
    const sels = await listAll(SEL, [SEL_END, SEL_JOB]);
    const ids = new Set(sels.filter(s => name(s.fields[SEL_END]) === '募集終了').flatMap(s => s.fields[SEL_JOB] || []));
    targets.push(...recs.filter(r => ids.has(r.id)));
    reason = reason || '選考進捗で募集終了';
  }
  if(!want.length && !args.company && !args.expired && !args.selection){ console.log('対象の指定がありません（--ids / --file / --company / --expired / --selection）'); return; }

  targets = [...new Map(targets.map(r => [r.id, r])).values()]
    .filter(r => REOPEN ? name(r.fields[F.status]) === '募集停止' : name(r.fields[F.status]) !== '募集停止');
  console.log(`${REOPEN ? '募集中に戻す' : '募集停止にする'}求人: ${targets.length}件${reason ? `（理由: ${reason}）` : ''}`);
  targets.forEach(r => console.log(`  ${r.id}  ${(r.fields[F.title] || '').slice(0, 70)}`));
  if(!WRITE){ console.log('\n（確認のみ。書き込むには --write を付けてください）'); return; }

  for(let i = 0; i < targets.length; i += 10){
    const records = targets.slice(i, i + 10).map(r => ({ id: r.id, fields: REOPEN
      ? { [F.status]: '募集中', [F.closedOn]: null, [F.reason]: null }
      : { [F.status]: '募集停止', [F.closedOn]: today, ...(reason ? { [F.reason]: reason } : {}) } }));
    await api(`https://api.airtable.com/v0/${BASE}/${JOBS}`, { method: 'PATCH', body: JSON.stringify({ records, typecast: true }) });
    await sleep(220);
  }
  console.log(`\n${targets.length}件を書き込みました。サイトへの反映は翌朝6時の自動更新（急ぐなら fetch-jobs → fetch-tags → rebuild → push）。`);
})().catch(e => { console.error(e); process.exit(1); });
