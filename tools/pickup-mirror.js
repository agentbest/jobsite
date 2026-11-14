/* 特化サイト（lp.〇〇tenshoku.com など）に「おすすめ企業特集」の入口ページを書き出す（2026-11-15）
   正（canonical）は jobs.agent-best.net/pickup/<theme>/。特化サイト側はこのページを /pickup/index.html に置くだけ。
   求人リストは開いたときに jobs の pickup/<theme>/jobs.json を読んで差し替えるので、掲載終了は向こうでも自動で外れる。
   会社を足した・理由を直したなど pickup-src/_features/<theme>.json を変えたときだけ、ここを回して各サイトに push する。

   node tools/pickup-mirror.js            … 全テーマ（site.repo がある特集）
   node tools/pickup-mirror.js pm ma      … 指定したテーマだけ
   書き出し先は C:\Users\user\<site.repo>\pickup\index.html（REPOS_DIR で変えられる） */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const pk = require(path.join(root, 'pickup-pages.js'));
const REPOS_DIR = process.env.REPOS_DIR || path.join(root, '..');

const L = JSON.parse(fs.readFileSync(path.join(root, 'data', 'list.json'), 'utf8'));
const live = new Set(L.r.map(r => r[L.k.indexOf('id')]));
const want = process.argv.slice(2);
for (const f of pk.readFeatures(root)) {
  if (want.length && !want.includes(f.slug)) continue;
  if (!f.site || !f.site.repo) continue;
  const { html } = pk.mirror(root, f.slug, live);
  const out = path.join(REPOS_DIR, f.site.repo, 'pickup', 'index.html');
  if (!fs.existsSync(path.join(REPOS_DIR, f.site.repo))) { console.warn(`${f.slug}: ${f.site.repo} が無いので飛ばしました`); continue; }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html, 'utf8');
  console.log(`${f.slug} → ${out}`);
}
