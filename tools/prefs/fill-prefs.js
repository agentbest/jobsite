// 求人DB（求人票）の「勤務地（都道府県）」が空の求人を、勤務地の原文から埋める（2026-10-11）。
// 判定は rebuild.js の areasOf() と同じ（都道府県名 → 無ければ市区町村・略称）。どちらも無く「全国」「海外」とあればその値。
// 求人タイトルからは拾わない（社名が入っていて「大阪ガス」「京都銀行」を勤務地と取り違えるため）。
// ⚠ 本社所在地では代用しない（取引先構内・全国勤務の求人が本社の県で出てしまうため）。
// ⚠ 既に値が入っている求人は触らない。
//
//   node tools/prefs/fill-prefs.js          … 判定だけ（件数と、埋まらない求人の例を出す）
//   node tools/prefs/fill-prefs.js --write  … 書き込む
// ★ このリポジトリは Public。トークンは airtable.local.json（.gitignore 済み）か環境変数 AIRTABLE_TOKEN から読む。

const fs = require('fs'), path = require('path');
const BASE = 'appYkc36EvioYoL1A', T_JOB = 'tblyPZZasXTM2tcrV';
const F_LOC = 'fldsIgsArolZDt1I5', F_PREFS = 'flddnoD5qZtuAISOO', F_TITLE = 'fldOoXnb7HxMN7b9W';
const WRITE = process.argv.includes('--write');
const dir = path.join(__dirname, '..', '..');
const TOKEN = process.env.AIRTABLE_TOKEN || JSON.parse(fs.readFileSync(path.join(dir, 'airtable.local.json'), 'utf8')).token.trim();
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

/* ---- rebuild.js の PREFS / AREA_HINT / TOKYO_WARDS / areasOf() の写し。あちらを直したらこちらも ---- */
const PREFS = ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"];
const AREA_HINT = {};
{
  const BARE_NG = new Set(["福島県","長崎県","大分県","宮崎県","山口県"]);
  PREFS.forEach(p => { if(p !== "北海道" && !BARE_NG.has(p)) AREA_HINT[p.replace(/[都府県]$/, "")] = p; });
  Object.assign(AREA_HINT, {
    "札幌":"北海道","仙台":"宮城県","盛岡":"岩手県","秋田市":"秋田県","山形市":"山形県",
    "郡山市":"福島県","いわき市":"福島県","福島市":"福島県","水戸":"茨城県","つくば":"茨城県",
    "宇都宮":"栃木県","前橋":"群馬県","高崎":"群馬県","さいたま":"埼玉県","川口市":"埼玉県",
    "船橋":"千葉県","柏市":"千葉県","横浜":"神奈川県","川崎市":"神奈川県","相模原":"神奈川県",
    "甲府":"山梨県","松本市":"長野県","金沢":"石川県","四日市":"三重県","浜松":"静岡県",
    "名古屋":"愛知県","豊田市":"愛知県","岡崎市":"愛知県","大津市":"滋賀県","堺市":"大阪府",
    "神戸":"兵庫県","西宮":"兵庫県","姫路":"兵庫県","下関":"山口県","山口市":"山口県",
    "高松":"香川県","松山市":"愛媛県","北九州":"福岡県","博多":"福岡県","天神":"福岡県",
    "長崎市":"長崎県","佐世保":"長崎県","大分市":"大分県","宮崎市":"宮崎県","那覇":"沖縄県",
  });
}
const TOKYO_WARDS = ["千代田区","新宿区","文京区","台東区","墨田区","江東区","品川区","目黒区","大田区",
  "世田谷区","渋谷区","中野区","杉並区","豊島区","荒川区","板橋区","練馬区","足立区","葛飾区","江戸川区"];
function areasOf(loc){
  loc = String(loc || "");
  const hit = PREFS.filter(p => loc.includes(p));
  if(hit.length) return hit;
  const out = new Set();
  if(TOKYO_WARDS.some(w => loc.includes(w))) out.add("東京都");
  for(const k in AREA_HINT) if(loc.includes(k)) out.add(AREA_HINT[k]);
  return [...out];
}
function prefsOf(loc){
  const a = areasOf(loc);
  if(a.length) return a;
  if(/全国/.test(loc)) return ['全国'];
  if(/海外/.test(loc)) return ['海外'];
  return [];
}

(async () => {
  const recs = []; let offset;
  do{
    const u = new URL(`https://api.airtable.com/v0/${BASE}/${T_JOB}`);
    u.searchParams.set('pageSize', '100'); u.searchParams.set('returnFieldsByFieldId', 'true');
    [F_LOC, F_PREFS, F_TITLE].forEach(f => u.searchParams.append('fields[]', f));
    if(offset) u.searchParams.set('offset', offset);
    const j = await api(u); recs.push(...j.records); offset = j.offset;
    await sleep(210);
  }while(offset);
  const empty = recs.filter(r => !(r.fields[F_PREFS] || []).length);
  const plan = empty.map(r => ({ id: r.id, loc: r.fields[F_LOC] || '', title: r.fields[F_TITLE] || '', prefs: prefsOf(r.fields[F_LOC] || '') }));
  const ok = plan.filter(p => p.prefs.length), ng = plan.filter(p => !p.prefs.length);
  const by = {}; ok.forEach(p => p.prefs.forEach(x => by[x] = (by[x] || 0) + 1));
  console.log(`全 ${recs.length}件中、勤務地（都道府県）が空 ${empty.length}件 → 埋まる ${ok.length}件 / 埋まらない ${ng.length}件`);
  console.log(Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k} ${v}`).join('、'));
  console.log('埋まらない例:'); ng.slice(0, 15).forEach(p => console.log(`  ${p.id} ${JSON.stringify(p.loc.slice(0, 90))}`));
  if(process.env.NG_OUT) fs.writeFileSync(process.env.NG_OUT, ng.map(p => `${p.id}\t${p.title.replace(/\s+/g, ' ')}\t${p.loc.replace(/\s+/g, ' ')}`).join('\n'));
  if(!WRITE) return console.log('\n（判定のみ。反映は --write）');
  for(let i = 0; i < ok.length; i += 10){
    await api(`https://api.airtable.com/v0/${BASE}/${T_JOB}`, { method: 'PATCH',
      body: JSON.stringify({ records: ok.slice(i, i + 10).map(p => ({ id: p.id, fields: { [F_PREFS]: p.prefs } })) }) });
    await sleep(220);
  }
  console.log(`書き込みました: ${ok.length}件`);
})().catch(e => { console.error(e); process.exit(1); });
