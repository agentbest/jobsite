// 求人DB（求人票）に「共通タグ（自動）」を付け直し、記事向けの求人選びに使う data/common-tags-jobs.json を書く（2026-10-15）。
//
//   node tools/media/assign-common-tags.js          … 判定だけ（Airtable に書かない。data/common-tags-jobs.json は書く）
//   node tools/media/assign-common-tags.js --write  … Airtable の「共通タグ（自動）」を書き換える（毎朝の Actions はこちら）
//
// 共通タグ＝記事と求人で共通のタグマスター（Airtable「共通タグ」tblBxgZS5X5bAZqRR）。記事は掲載記事一覧の「共通タグ」列、
// 求人は求人票の3列で持つ:
//   共通タグ（自動）       … このスクリプトが毎朝付け直す。⚠ 手で直しても翌朝戻る
//   共通タグ（手動で追加） … 人が足す。スクリプトは触らない
//   共通タグ（外す）       … 自動で付いたが付けたくないもの。スクリプトは触らない
//   この求人の共通タグ ＝ 自動 ∪ 手動で追加 − 外す   → data/common-tags-jobs.json { 求人ID: [タグID, ...] }（media-jobs.js が読む）
//
// 判定（タグの条件は data/media-tags.json の t ＝ tools/media/sync-articles.js が先に書く）
//   職種キーワード（/区切り OR）が 職種名・職種カテゴリ・業界 のどれかに入っている、または 求人タグ（求人票の「タグ」列）のどれかが付いている
//   ⚠ 求人タイトルは見ない（「◆AI」「建設特化」などタイトルの飾りで別職種に付くのを避ける）
//   英字だけの語は前後が英字でないときだけ一致（AI が MAIL に当たらない）
// 入力の求人は data/jobs.json（node fetch-jobs.js・募集中の全件）。jobs.json に無い求人の行は触らない。
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const WRITE = process.argv.includes('--write');
const BASE = 'https://api.airtable.com/v0/appYkc36EvioYoL1A/tblyPZZasXTM2tcrV';
const F_AUTO = '共通タグ（自動）', F_ADD = '共通タグ（手動で追加）', F_DEL = '共通タグ（外す）';

function token(){
  if(process.env.AIRTABLE_TOKEN) return process.env.AIRTABLE_TOKEN;
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'airtable.local.json'), 'utf8'));
  return j.token || Object.values(j).find(v => typeof v === 'string' && v.startsWith('pat'));
}
const H = { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(url, opt = {}){
  for(let i = 0; i < 6; i++){
    const res = await fetch(url, { headers: H, ...opt });
    if(res.status === 429 || res.status >= 500){ await sleep(1500 * (i + 1)); continue; }
    const j = await res.json();
    if(j.error) throw new Error(JSON.stringify(j.error));
    return j;
  }
  throw new Error(`${url} が応答しません`);
}
function kwRegex(kw){
  const words = String(kw || '').split('/').map(s => s.trim()).filter(s => s.length >= 2);
  if(!words.length) return null;
  const esc = w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(words.map(w => /^[A-Za-z0-9 ]+$/.test(w) ? `(?<![A-Za-z])${esc(w)}(?![A-Za-z])` : esc(w)).join('|'), 'i');
}

(async () => {
  const mt = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'media-tags.json'), 'utf8'));
  const rules = Object.entries(mt.t).map(([id, d]) => ({ id, n: d.n, re: kwRegex(d.kw), jt: new Set(d.jt || []) }));
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'jobs.json'), 'utf8'));
  const jobs = Array.isArray(d) ? d : d.jobs;

  const auto = new Map();
  for(const j of jobs){
    const text = `${j.position || ''} ${j.jobCategory || ''} ${(j.industry || []).join(' ')}`;
    const tags = new Set(j.tags || []);
    auto.set(j.id, rules.filter(r => (r.re && r.re.test(text)) || [...r.jt].some(t => tags.has(t))).map(r => r.id).sort());
  }

  /* Airtable の今の3列を読む（全件・3列だけ） */
  const cur = new Map();
  let offset = '';
  const q = [F_AUTO, F_ADD, F_DEL].map(f => 'fields[]=' + encodeURIComponent(f)).join('&');
  do {
    const r = await api(`${BASE}?pageSize=100&${q}${offset ? '&offset=' + offset : ''}`);
    r.records.forEach(x => cur.set(x.id, x.fields));
    offset = r.offset || '';
  } while(offset);

  const updates = [], final = {};
  const per = {};
  for(const [id, tagIds] of auto){
    const f = cur.get(id);
    if(!f) continue;
    const before = [...(f[F_AUTO] || [])].sort();
    if(before.join() !== tagIds.join()) updates.push({ id, fields: { [F_AUTO]: tagIds } });
    const del = new Set(f[F_DEL] || []);
    const fin = [...new Set(tagIds.concat(f[F_ADD] || []))].filter(t => !del.has(t));
    if(fin.length) final[id] = fin;
    fin.forEach(t => { per[t] = (per[t] || 0) + 1; });
  }
  fs.writeFileSync(path.join(ROOT, 'data', 'common-tags-jobs.json'), JSON.stringify(final), 'utf8');
  const none = jobs.length - Object.keys(final).length;
  console.log(`共通タグ: 求人 ${jobs.length}件中 ${Object.keys(final).length}件に付与（付かない ${none}件）／ Airtable を直す行 ${updates.length}件 → data/common-tags-jobs.json`);
  console.log('  ' + rules.map(r => `${r.n} ${per[r.id] || 0}`).join(' / '));
  if(!WRITE) return console.log('（Airtable には書いていません。--write で反映）');
  for(let i = 0; i < updates.length; i += 10){
    await api(BASE, { method: 'PATCH', body: JSON.stringify({ records: updates.slice(i, i + 10) }) });
    await sleep(220);
    if(i && i % 1000 === 0) console.log(`  ${i}/${updates.length}`);
  }
  console.log('Airtable の「共通タグ（自動）」を更新しました');
})().catch(e => { console.log('⚠ 共通タグの付与に失敗しました:', e.message); process.exitCode = 0; });
