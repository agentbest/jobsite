// 転職メディア（www.agent-best.net/media/）の記事ごとに「この記事を読んだ人向けの求人」を選び、
// 記事1本につき1ファイル data/media-jobs/<記事slug>.json に書く（2026-10-15）。
//
// 記事から自社サイトへの直接エントリーが0件に近く、記事末尾が求人一覧への文字リンク1本だけだったため、
// 記事の中に実際の求人カードを出す。記事側（agentbest-lp の src/components/ArticleJobs.astro）が
// 閲覧時にこのファイルを fetch して描画する。求人は毎朝入れ替わるので、記事側に焼き込まずここで毎朝作り直す。
//
//   入力: data/list.json（rebuild.js が書く・このサイトに載っている求人だけ）
//         data/media-index.json（fetch-media-companies.js が書く・[[slug, カテゴリ, ハブslug, 企業名, ハブ名], ...]）
//   出力: data/media-jobs/<slug>.json = { k: 'co'|'hub'|'group', l: 見出し用の名前, j: [[求人ID, 企業名, 職種名, 年収, 勤務地, ロゴ], ...] }
//         合う求人が1件も無い記事はファイルを作らない（記事側は404なら何も出さない＝従来の文字リンクだけ残る）。
//
// 選び方（記事1本に最大 PER 件）
//   1. 企業記事 … その会社の求人（年収上限の高い順）       → k='co'
//   2. 記事のハブと同じ職種の求人（JOBCAT_HUB で判定）    → k='hub'
//   2'. ハブ名の語（「AIエンジニア」→AI）が職種名・業界に入っている求人 → k='hub'
//      JOBCAT_HUB に無い職種（AI・SRE・Salesforce など）と業界ハブを拾うため
//   3. ハブが属する職種の大分類の求人（GROUP_BY_HUB）      → k='group'
//   2〜3 はハブ内の記事の並び順でずらして取る。全記事が同じ4件を出すと、求人側の露出が偏るため。
//
// ⚠ GROUP_BY_HUB は agentbest-lp の src/lib/jobsLink.ts の写し。ハブを足したら両方直す。
const fs = require('fs'), path = require('path');
const { jobHubOf, jobGroupOf, jobName, fmtSalary, locShort, GROUP_SLUG } = require('./static-pages');

const PER = 4;

const GROUP_BY_HUB = {};
const put = (group, hubs) => hubs.forEach(h => { GROUP_BY_HUB[h] = group; });
put('エンジニア', [
  'backend-engineer', 'frontend-engineer', 'fullstack-engineer', 'mobile-engineer', 'game-engineer',
  'embedded-engineer', 'bridge-se', 'qa-engineer', 'tech-lead', 'db-engineer', 'forward-deployed-engineer',
  'infra-engineer', 'cloud-engineer', 'network-engineer', 'sre', 'devops-engineer', 'platform-engineer',
  'security-engineer', 'corporate-it', 'ai-engineer', 'ml-engineer', 'mlops-engineer', 'data-engineer',
  'data-analyst', 'data-scientist', 'it-architect', 'solution-architect', 'cto-vpoe', 'engineering-manager',
  'dev-director', 'sier-industry', 'manufacturing-it-industry', 'telecom-industry', 'product-dev-industry',
]);
put('プロジェクト管理', ['project-manager', 'pmo', 'scrum-master', 'pm']);
put('事業企画', ['product-manager', 'business-planning', 'bizdev']);
put('デザイン', ['product-designer', 'uiux-designer']);
put('ITコンサルタント', [
  'it-consultant', 'dx-consultant', 'data-consultant', 'erp-consultant', 'sap-consultant',
  'salesforce-consultant', 'security-consultant', 'pmo-consultant', 'it-consulting-industry', 'dx-consulting-industry',
]);
put('コンサルタント', [
  'strategy-consultant', 'big4-consultant', 'business-consultant', 'hr-consultant', 'scm-consultant',
  'risk-consultant', 'sustainability-consultant', 'thinktank', 'freelance-consultant', 'post-consultant',
  'fas-consultant', 'turnaround-consultant', 'ma-advisor', 'consulting-industry', 'big4-industry',
  'hr-consulting-industry', 'smb-consulting-industry', 'boutique-consulting-industry', 'thinktank-industry',
  'fas-industry', 'turnaround-industry', 'ma-industry', 'succession-industry', 'consul',
]);
put('金融', ['ib-analyst', 'pe-investor', 'venture-capitalist', 'finance', 'ibd-industry', 'pe-industry', 'vc-industry', 'ma']);
put('営業', ['saas-sales', 'inside-sales', 'enterprise-sales', 'partner-sales', 'presales', 'customer-success', 'revenue-officer']);
put('マーケティング', ['web-marketer', 'digital-marketer', 'marketing-manager', 'pr']);
put('経営企画', ['corporate-planning']);
put('経営', ['cxo']);
put('人事', ['hrbp', 'recruiter']);
put('管理', ['legal']);
put('インターネットサービス', [
  'saas-industry', 'ai-industry', 'fintech-industry', 'hrtech-industry', 'healthtech-industry', 'edtech-industry',
  'legaltech-industry', 'proptech-industry', 'logitech-industry', 'adtech-industry', 'govtech-industry',
  'ec-industry', 'web3-industry', 'mobility-industry', 'iot-industry', 'game-industry', 'security-industry',
  'cloud-industry', 'megaventure-industry', 'startup',
]);

/* ハブ名から求人のタイトル・業界に当てる語を取り出す。「AIエンジニア」→AI、「SaaS営業（フィールドセールス）」→SaaS、
   「生成AI・AI」→生成AI／AI。職種そのものを表す一般語は外す（残すと「エンジニア」で全エンジニア求人に当たる）。 */
const GENERIC = /^(エンジニア|コンサルタント|コンサルティング|コンサル|営業|担当|候補|業界|企業|ファーム|職|系|専門|スタートアップ|IT|DX推進|マネージャー|リーダー)$/;
function keywordsOf(label){
  const words = String(label || '').replace(/（[^）]*）|\([^)]*\)/g, '')
    .split(/[・／\/、\s]+/)
    .map(w => w.replace(/(エンジニア|コンサルタント|コンサルティング|担当|候補|業界|ファーム|営業|研究員|アナリスト|投資担当)$/, '').trim())
    .filter(w => w.length >= 2 && !GENERIC.test(w));
  return [...new Set(words)];
}
function kwRegex(words){
  if(!words.length) return null;
  const esc = w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /* 英字の語は前後が英字でないときだけ当てる（AI が MAIL・PAID に当たらないように） */
  return new RegExp(words.map(w => /^[A-Za-z0-9]+$/.test(w) ? `(?<![A-Za-z])${esc(w)}(?![A-Za-z])` : esc(w)).join('|'), 'i');
}

/* 社名の正規化。fetch-media-companies.js / agentbest-lp の tools/jobsite-companies/fetch.mjs と同じ */
function norm(s){
  return String(s || '').normalize('NFKC').toLowerCase()
    .replace(/(株式会社|有限会社|合同会社|合資会社|一般社団法人|一般財団法人|公益財団法人|\(株\)|co\.,? ?ltd\.?|inc\.?|corporation|corp\.?|k\.k\.)/g, '')
    .replace(/[\s・.,\-‐－&＆'’]/g, '');
}

function build(root){
  const idxFile = path.join(root, 'data', 'media-index.json');
  const listFile = path.join(root, 'data', 'list.json');
  if(!fs.existsSync(idxFile) || !fs.existsSync(listFile)){
    console.log('記事向けの求人: data/media-index.json か data/list.json が無いので作りませんでした（node fetch-media-companies.js を先に）');
    return;
  }
  const articles = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
  const { k, r } = JSON.parse(fs.readFileSync(listFile, 'utf8'));
  const jobs = r.map(row => Object.fromEntries(k.map((key, i) => [key, row[i]])));

  /* 新しい順（同日なら年収上限の高い順）に並べた求人を、会社・ハブ・大分類ごとに引けるようにする */
  jobs.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || (b.salaryMax || 0) - (a.salaryMax || 0) || a.id.localeCompare(b.id));
  const byCo = new Map(), byHub = new Map(), byGroup = new Map();
  const push = (m, key, j) => { if(!key) return; if(!m.has(key)) m.set(key, []); m.get(key).push(j); };
  jobs.forEach(j => {
    push(byCo, norm(j.company), j);
    push(byHub, jobHubOf(j.jobCategory), j);
    push(byGroup, jobGroupOf(j.jobCategory), j);
  });
  byCo.forEach(a => a.sort((x, y) => (y.salaryMax || 0) - (x.salaryMax || 0)));

  /* ---------- 記事タグ（Airtable「記事タグ」→ tools/media/sync-articles.js → data/media-tags.json）----------
     記事タグが付いた記事は、タグの条件（職種キーワード OR 求人タグ）に合う求人を、タグの「出すサイト」から選ぶ（k='tag'）。
     skill の求人は data/skill-list.json（同じく sync-articles.js が取る）。カードの7番目に 's' を付け、記事側がリンク先を skill にする */
  const tagFile = path.join(root, 'data', 'media-tags.json');
  const mt = fs.existsSync(tagFile) ? JSON.parse(fs.readFileSync(tagFile, 'utf8')) : { t: {}, a: {} };
  const tagNames = JSON.parse(fs.readFileSync(path.join(root, 'data', 'tags.json'), 'utf8')).map(t => t.name);
  jobs.forEach(j => { j._site = 'jobs'; j._tags = (j.t || []).map(i => tagNames[i]); });
  let skillJobs = [];
  const skillFile = path.join(root, 'data', 'skill-list.json');
  if(fs.existsSync(skillFile)){
    const s = JSON.parse(fs.readFileSync(skillFile, 'utf8'));
    skillJobs = s.r.map(row => Object.fromEntries(s.k.map((key, i) => [key, row[i]])));
    skillJobs.forEach(j => { j._site = 'skill'; j._tags = (j.t || []).map(i => s.tags[i]); });
    skillJobs.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || (b.salaryMax || 0) - (a.salaryMax || 0) || a.id.localeCompare(b.id));
  } else console.log('記事向けの求人: data/skill-list.json が無いので、記事タグの求人は jobs の求人だけから選びます（node tools/media/sync-articles.js）');
  const tagPoolCache = new Map();
  const tagPoolOf = id => {
    if(tagPoolCache.has(id)) return tagPoolCache.get(id);
    const d = mt.t[id];
    const re = d && kwRegex(String(d.kw || '').split('/').map(s => s.trim()).filter(s => s.length >= 2));
    const jt = new Set((d && d.jt) || []);
    const src = !d ? [] : d.site === 'jobs' ? jobs : d.site === 'skill' ? skillJobs : jobs.concat(skillJobs);
    /* 強い一致＝職種名・職種カテゴリにキーワード、または求人タグ。弱い一致＝求人タイトル・業界にだけキーワード
       （「◆AI」と書いてある営業職などが AI の記事に出るのを後ろに回す）。強い一致が PER 件あれば強い一致だけを使う。
       jobs と skill は混ぜて新しい順（同日なら年収上限の高い順） */
    const strong = [], weak = [];
    if(re || jt.size) src.forEach(j => {
      if((re && re.test(`${j.position || ''} ${j.jobCategory || ''}`)) || j._tags.some(t => jt.has(t))) strong.push(j);
      else if(re && re.test(`${j.title || ''} ${(j.industry || []).join(' ')}`)) weak.push(j);
    });
    const order = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || (b.salaryMax || 0) - (a.salaryMax || 0) || a.id.localeCompare(b.id);
    strong.sort(order); weak.sort(order);
    const pool = strong.length >= PER ? strong : strong.concat(weak);
    tagPoolCache.set(id, pool);
    return pool;
  };
  const tagSeen = new Map();   // 記事タグの組み合わせごとの通し番号（ずらし用）
  const coAll = new Map();     // 企業記事用：jobs と skill の両方からその会社の求人
  jobs.concat(skillJobs).forEach(j => push(coAll, norm(j.company), j));
  coAll.forEach(a => a.sort((x, y) => (y.salaryMax || 0) - (x.salaryMax || 0)));

  const card = j => [j.id, j.company || '企業非公開', jobName(j), fmtSalary(j), locShort(j), j.logo || '', j._site === 'skill' ? 's' : ''];
  /* pool の offset 番目から巡回して、まだ選んでいない求人を足す */
  const takeFrom = (pool, offset, picked) => {
    for(let i = 0; i < pool.length && picked.length < PER; i++){
      const j = pool[(offset + i) % pool.length];
      if(!picked.includes(j)) picked.push(j);
    }
  };

  const outDir = path.join(root, 'data', 'media-jobs');
  fs.rmSync(outDir, { recursive: true, force: true });   // 消えた記事・合う求人が無くなった記事のファイルを残さない
  fs.mkdirSync(outDir, { recursive: true });

  const seen = new Map();   // ハブごとの記事の通し番号（ずらし用）
  const stat = { co: 0, hub: 0, group: 0, none: 0 };
  const kwCache = new Map();   // ハブ名 → 語で当たった求人（新しい順）
  const kwPoolOf = label => {
    if(kwCache.has(label)) return kwCache.get(label);
    const re = kwRegex(keywordsOf(label));
    const pool = re ? jobs.filter(j => re.test(`${j.position || ''} ${j.title || ''} ${j.jobCategory || ''} ${(j.industry || []).join(' ')}`)) : [];
    kwCache.set(label, pool);
    return pool;
  };
  articles.forEach(([slug, cat, hub, companyName, hubLabel]) => {
    const n = seen.get(hub) || 0; seen.set(hub, n + 1);
    const picked = [];
    let kind = '', label = '';
    const tagIds = (mt.a[slug] || []).filter(id => mt.t[id]);
    if(tagIds.length){
      if(cat === '企業' && companyName){
        takeFrom(coAll.get(norm(companyName)) || [], 0, picked);
        if(picked.length){ kind = 'co'; label = picked[0].company; }
      }
      const key = tagIds.join(',');
      const tn = tagSeen.get(key) || 0; tagSeen.set(key, tn + 1);
      for(const id of tagIds){
        const pool = tagPoolOf(id);
        if(picked.length < PER && pool.length){
          takeFrom(pool, (tn * PER) % pool.length, picked);
          if(!kind){ kind = 'tag'; label = mt.t[id].n; }
        }
      }
      if(picked.length){
        stat[kind] = (stat[kind] || 0) + 1;
        fs.writeFileSync(path.join(outDir, `${slug}.json`), JSON.stringify({ k: kind, l: label, j: picked.map(card) }), 'utf8');
        return;
      }
      picked.length = 0; kind = ''; label = '';   // タグに合う求人が無ければ、従来の選び方に戻す
    }
    if(cat === '企業' && companyName){
      takeFrom(byCo.get(norm(companyName)) || [], 0, picked);
      if(picked.length){ kind = 'co'; label = picked[0].company; }
    }
    const hubPool = byHub.get(hub) || [];
    const group = GROUP_BY_HUB[hub];
    const groupPool = (group && GROUP_SLUG[group] && byGroup.get(group)) || [];
    if(picked.length < PER && hubPool.length){
      takeFrom(hubPool, (n * PER) % hubPool.length, picked);
      if(!kind) kind = 'hub';
    }
    const kwPool = picked.length < PER ? kwPoolOf(hubLabel) : [];
    if(picked.length < PER && kwPool.length){
      takeFrom(kwPool, (n * PER) % kwPool.length, picked);
      if(!kind) kind = 'hub';
    }
    if(picked.length < PER && groupPool.length){
      takeFrom(groupPool, (n * PER) % groupPool.length, picked);
      if(!kind){ kind = 'group'; label = group; }
    }
    if(!picked.length){ stat.none++; return; }
    stat[kind]++;
    fs.writeFileSync(path.join(outDir, `${slug}.json`), JSON.stringify({ k: kind, l: label, j: picked.map(card) }), 'utf8');
  });
  console.log(`記事向けの求人: ${articles.length}本中 記事タグ${stat.tag || 0}・自社の求人${stat.co}・同じ職種${stat.hub}・同じ大分類${stat.group}・該当なし${stat.none} → data/media-jobs/`);
}

module.exports = { build };
if(require.main === module) build(__dirname);
