// 月末の掲載確認: 媒体（ジョブミル／キャリアバンク）の「今載っている求人一覧」と求人DBを突き合わせ、
// 媒体から消えた求人を「募集停止」にする。手順は jobsite/CLAUDE.md「募集停止した求人を閉じる」。
//
//   node tools/close/media-diff.js snapshot/jobmiru-2026-10-31.json snapshot/careerbank-2026-10-31.json
//     … 確認のみ。結果を tools/close/out/diff-<日付>.tsv に書く（消えた候補・照合できた件数）
//   … --write  照合できた求人に 媒体求人ID／媒体URL／媒体で最後に確認した日 を書き、消えた求人を募集停止にする
//
// スナップショットは JSON 配列: [{ media:'ジョブミル'|'キャリアバンク', mediaId, url, company, title }]
//   ブラウザで集めて保存したもの（collect-*.js を参照）。
//
// 照合の順番: ①媒体求人ID（前回までに照合済みなら完全一致）②正規化したタイトルの完全一致
//            ③同じ会社でタイトルの類似度 0.75 以上 ④会社違いでも類似度 0.9 以上
// ⚠ 取りこぼし（ログイン切れ・件数上限）で大量に閉じないよう、スナップショットが求人DBの70%未満、
//   または消えた候補が30%を超える媒体は書き込まない（--force で無視）。

const fs = require('fs'), path = require('path');
const BASE = 'appYkc36EvioYoL1A', JOBS = 'tblyPZZasXTM2tcrV', CO_TABLE = 'tblBNNH9sJjldPmZZ', CO_NAME = 'fld03vEbeabi8IQDN';
const F = {
  title: 'fldOoXnb7HxMN7b9W', company: 'fldoQsYnH5W90qiKW', source: 'fldCNV0yl7V85cT8c', status: 'fldLFxYGKjXQPoZsd',
  closedOn: 'fldSgPpnoq6iXLcOy', reason: 'fld39FFVl8vp7EoGO',
  mediaId: 'fld1DNpayAOb6bzML', mediaUrl: 'fldeI4rySsJ6sxogZ', seenOn: 'fldfebZp1NWzTPj9H',
};
const MEDIA = ['ジョブミル', 'キャリアバンク'];

const argv = process.argv.slice(2);
const WRITE = argv.includes('--write'), FORCE = argv.includes('--force');
const files = argv.filter(a => !a.startsWith('--'));
if(!files.length){ console.log('スナップショットのJSONを指定してください'); process.exit(1); }

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

/* 正規化: 全角半角・空白・記号の揺れを消す。会社名は法人格も落とす */
const norm = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[\s　・･\/／|｜_＿\-－―ー〜~、。,.]/g, '');
const normCo = s => norm(s).replace(/株式会社|有限会社|合同会社|一般社団法人|公益社団法人|\(株\)|㈱/g, '');
function grams(s){ const g = new Map(); for(let i = 0; i < s.length - 1; i++){ const k = s.slice(i, i + 2); g.set(k, (g.get(k) || 0) + 1); } return g; }
function dice(a, b){
  if(!a || !b) return 0; if(a === b) return 1;
  const A = grams(a), B = grams(b); let hit = 0, n = 0;
  A.forEach(v => n += v); B.forEach(v => n += v);
  A.forEach((v, k) => { hit += Math.min(v, B.get(k) || 0); });
  return n ? 2 * hit / n : 0;
}

(async () => {
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const snap = files.flatMap(f => JSON.parse(fs.readFileSync(f, 'utf8')));
  const cos = await listAll(CO_TABLE, [CO_NAME]);
  const coName = new Map(cos.map(c => [c.id, c.fields[CO_NAME] || '']));
  const recs = (await listAll(JOBS, Object.values(F)))
    .filter(r => MEDIA.includes(name(r.fields[F.source])) && name(r.fields[F.status]) !== '募集停止');

  const updates = [], report = [];
  for(const media of MEDIA){
    const S = snap.filter(s => s.media === media).map(s => ({ ...s, nt: norm(s.title), nc: normCo(s.company) }));
    const ours = recs.filter(r => name(r.fields[F.source]) === media);
    if(!S.length){ console.log(`${media}: スナップショットなし（飛ばします）`); continue; }
    const byId = new Map(S.map(s => [String(s.mediaId), s]));
    const byTitle = new Map(); S.forEach(s => { if(!byTitle.has(s.nt)) byTitle.set(s.nt, []); byTitle.get(s.nt).push(s); });
    const byCo = new Map(); S.forEach(s => { if(!byCo.has(s.nc)) byCo.set(s.nc, []); byCo.get(s.nc).push(s); });

    // 媒体の1件は求人DBの1件にしか当てない（同じタイトルの求人が複数あるとき、1件消えても見逃さないため）。
    // 媒体求人IDを持っている求人を先に照合する。
    const used = new Set(), free = s => !used.has(s);
    // 段階ごとに全件を回す（あいまい一致が、別の求人の完全一致の相手を先に取ってしまわないように）。
    const rows = ours.map(r => {
      const co = (r.fields[F.company] || []).map(id => coName.get(id)).join(' / ');
      let t = String(r.fields[F.title] || '');
      if(co && t.startsWith(co)) t = t.slice(co.length);   // 求人タイトル＝「会社名 媒体のタイトル」
      return { r, co, t, nt: norm(t), nc: normCo(co), hit: null };
    });
    const best = (x, pool, min) => { let b = null, sc = 0; for(const s of pool){ if(!free(s)) continue; const d = dice(x.nt, s.nt); if(d > sc){ sc = d; b = s; } } return sc >= min ? b : null; };
    const stages = [
      ['ID',         x => { const s = x.r.fields[F.mediaId] && byId.get(String(x.r.fields[F.mediaId])); return s && free(s) ? s : null; }],
      ['タイトル一致', x => { const c = (byTitle.get(x.nt) || []).filter(free); return c.find(s => s.nc === x.nc) || c[0] || null; }],
      ['同社で類似',   x => best(x, byCo.get(x.nc) || [], 0.75)],
      ['類似',        x => x.nt.length >= 8 ? best(x, S, 0.9) : null],
    ];
    const how = {};
    for(const [via, fn] of stages) for(const x of rows){
      if(x.hit) continue;
      const s = fn(x);
      if(s){ x.hit = s; used.add(s); how[via] = (how[via] || 0) + 1; }
    }
    const matched = rows.filter(x => x.hit).map(x => [x.r, x.hit]);
    const gone = rows.filter(x => !x.hit).map(x => [x.r, x.co, x.t]);
    const ratio = S.length / Math.max(ours.length, 1), goneRate = gone.length / Math.max(ours.length, 1);
    const unsafe = ratio < 0.7 || goneRate > 0.3;
    console.log(`${media}: 媒体 ${S.length}件 / 求人DB ${ours.length}件 → 照合 ${matched.length}件（${Object.entries(how).map(([k, v]) => `${k}${v}`).join('・')}）／ 媒体から消えた ${gone.length}件（${(goneRate * 100).toFixed(1)}%）`);
    if(unsafe) console.log(`  ⚠ ${ratio < 0.7 ? '媒体の件数が少なすぎます（取りこぼしの疑い）' : '消えた候補が30%を超えています'}。${FORCE ? '--force なので続けます' : 'この媒体は書き込みません'}`);
    gone.forEach(([r, co, t]) => report.push([media, '消えた', r.id, co, t.trim()].join('\t')));
    if(unsafe && !FORCE) continue;
    for(const [r, s] of matched){
      const f = { [F.seenOn]: today };
      if(s.mediaId && String(r.fields[F.mediaId] || '') !== String(s.mediaId)) f[F.mediaId] = String(s.mediaId);
      if(s.url && r.fields[F.mediaUrl] !== s.url) f[F.mediaUrl] = s.url;
      updates.push({ id: r.id, fields: f });
    }
    gone.forEach(([r]) => updates.push({ id: r.id, fields: { [F.status]: '募集停止', [F.closedOn]: today, [F.reason]: `${media}で掲載終了（${today}確認）` } }));
  }

  const outDir = path.join(__dirname, 'out'); fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `diff-${today}.tsv`);
  fs.writeFileSync(out, '﻿媒体\t判定\tレコードID\t会社\tタイトル\n' + report.join('\n'), 'utf8');
  console.log(`\n消えた候補の一覧: ${out}`);
  if(!WRITE){ console.log('（確認のみ。書き込むには --write）'); return; }
  for(let i = 0; i < updates.length; i += 10){
    await api(`https://api.airtable.com/v0/${BASE}/${JOBS}`, { method: 'PATCH', body: JSON.stringify({ records: updates.slice(i, i + 10), typecast: true }) });
    await sleep(220);
  }
  console.log(`${updates.length}件を書き込みました（うち募集停止 ${updates.filter(u => u.fields[F.status]).length}件）。`);
})().catch(e => { console.error(e); process.exit(1); });
