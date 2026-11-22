// 使い方: node tools/next-batch.js [本数=36] [--json]
// 転職ガイドの次に書く記事を plan.tsv から選ぶ（articles/ と drafts/ にあるものは除く）。
// 並び：職種ハブは掲載求人の多い順に、切り口の順（posting → requirements → job-scope …）で横に回す。
//       職種に関係しないハブ（求人票の読み方・応募・選考・内定）は1弾あたり TOPIC_SHARE 本を混ぜる。
// 出力：6本ずつの組（同じグループの記事がなるべく同じ組に入る）。
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const G = path.join(root, '_guide');
const N = parseInt(process.argv[2], 10) || 36;
const TOPIC_SHARE = Math.round(N / 3);
const tax = JSON.parse(fs.readFileSync(path.join(G, 'taxonomy.json'), 'utf8'));
const plan = fs.readFileSync(path.join(G, 'plan.tsv'), 'utf8').replace(/\r/g, '').trim().split('\n').slice(1).map(l => { const [no, hub, slug, title] = l.split('\t'); return { no: +no, hub, slug, title }; });
const done = new Set(['articles', 'drafts'].flatMap(d => fs.existsSync(path.join(G, d)) ? fs.readdirSync(path.join(G, d)).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, '')) : []));
const todo = plan.filter(p => !done.has(p.slug));

// 職種ハブの求人件数
const sub = j => String(j.jobCategory || '').replace(/（[^（）]*）\s*$/, '').trim();
const grp = j => { const m = String(j.jobCategory || '').match(/（([^（）]+)）\s*$/); return m ? m[1] : 'その他'; };
const jobs = fs.readdirSync(path.join(root, 'data', 'jobs')).map(f => JSON.parse(fs.readFileSync(path.join(root, 'data', 'jobs', f), 'utf8')));
const hubInfo = {};
tax.groups.forEach(g => g.hubs.forEach(([h, label, m]) => {
  hubInfo[h] = { group: g.name, role: !!m, n: m ? jobs.filter(j => (!m.c || m.c.includes(sub(j))) && (!m.g || m.g.includes(grp(j)))).length : 0 };
}));

const roleHubs = Object.keys(hubInfo).filter(h => hubInfo[h].role).sort((a, b) => hubInfo[b].n - hubInfo[a].n);
// 職種ハブ：ハブごとの未着手を plan の順（= 切り口の順）に並べ、ラウンドロビン
const queues = Object.fromEntries(roleHubs.map(h => [h, todo.filter(p => p.hub === h)]));
const roleOrder = [];
for(let r = 0; roleHubs.some(h => queues[h].length); r++) roleHubs.forEach(h => { if(queues[h].length) roleOrder.push(queues[h].shift()); });
// 共通ハブ：ハブを順に回す
const topicHubs = Object.keys(hubInfo).filter(h => !hubInfo[h].role);
const tq = Object.fromEntries(topicHubs.map(h => [h, todo.filter(p => p.hub === h)]));
const topicOrder = [];
while(topicHubs.some(h => tq[h].length)) topicHubs.forEach(h => { if(tq[h].length) topicOrder.push(tq[h].shift()); });

let nTopic = Math.min(TOPIC_SHARE, topicOrder.length), nRole = Math.min(N - nTopic, roleOrder.length);
if(nRole + nTopic < N) nTopic = Math.min(N - nRole, topicOrder.length);
// 職種は2本ずつ（posting と requirements など同じハブの続き）がまとまるよう、ハブ単位で取る
const pick = [...roleOrder.slice(0, nRole), ...topicOrder.slice(0, nTopic)];
// 組分け：グループ → ハブ → plan の順に並べて6本ずつ
const gi = Object.fromEntries(tax.groups.map((g, i) => [g.name, i]));
pick.sort((a, b) => gi[hubInfo[a.hub].group] - gi[hubInfo[b.hub].group] || a.hub.localeCompare(b.hub) || a.no - b.no);
const chunks = [];
for(let i = 0; i < pick.length; i += 6) chunks.push(pick.slice(i, i + 6));
if(process.argv.includes('--json')) console.log(JSON.stringify(chunks.map(c => c.map(p => ({ slug: p.slug, hub: p.hub, group: hubInfo[p.hub].group, title: p.title })))));
else {
  console.log(`未着手 ${todo.length}本（公開・下書き ${done.size}本）。次の ${pick.length}本：`);
  chunks.forEach((c, i) => console.log(`組${i + 1}: ` + c.map(p => p.slug).join(' ')));
}
