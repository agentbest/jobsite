/* 転職ガイド（/guide/）— 求人の読み方・職種ごとの実務の記事（2026-11-22〜）
   ハチワレさん「求人が中心のサイト（記事0本）は記事を追加しよう」。計画は agentbest/content-expansion（1サイト約2,000本）。

   _guide/articles/<slug>.md（原稿。書き方は _guide/RULES.md）
   _guide/taxonomy.json（グループ → ハブ。ハブは職種の中分類と結びつく）
   _guide/plan.tsv（企画一覧。python tools/make-guide-plan.py で再生成。slug は変えない）
        ↓ rebuild.js → static-pages.js の 5c で build() を呼ぶ
   guide/index.html・guide/hub/<hub>/[<p>/]・guide/<slug>/・guide/search/・guide/search.json → sitemap.xml に入る

   ⚠ /media/ は jobs-front が www.agent-best.net/media/ へ 301 するので使えない。/guide/ に置く。
   ⚠ 記事が0本のときは guide/ を作らない（空のページを公開しない）。
   ⚠ 書きかけの原稿は _guide/drafts/（.gitignore 済み）に置く。articles/ に移したものだけが公開される。

   www.agent-best.net/media（職種別の転職ガイド・年収・面接・職務経歴書）と重ねないため、ここは
   「求人票の読み方」「その職種の求人で実際に求められていること」「応募〜内定の実務」に寄せる。
   差別化は掲載データ：職種のハブに属する記事には、その職種の掲載求人の件数・提示年収の中央値・募集中の企業・
   新着の求人を毎朝のビルドで差し込む（本文には数字を書かせず、ここで出す＝古くならない）。 */
const fs = require('fs'), path = require('path');

const PER_PAGE = 30;
const CARDS = 4;        // 記事の下に出す求人カードの数
const DATA_MIN = 5;     // これ未満の件数ならデータの囲みを出さない
const BOX = { view: 'エージェントベストの見解', point: 'ポイント', caution: '注意' };

function build(root, ctx, full, h){
  const { esc, cardHtml, sortForList, writePage, jobGroupOf, GROUP_SLUG, SITE } = h;
  const src = path.join(root, '_guide');
  const out = path.join(root, 'guide');
  const artDir = path.join(src, 'articles');
  const files = fs.existsSync(artDir) ? fs.readdirSync(artDir).filter(f => f.endsWith('.md')) : [];
  if(!files.length){
    fs.rmSync(out, { recursive: true, force: true });
    console.log('転職ガイド: 記事が0本なので guide/ は作りません。');
    return { urls: [] };
  }
  const tax = JSON.parse(fs.readFileSync(path.join(src, 'taxonomy.json'), 'utf8'));
  const HUB = {};
  tax.groups.forEach(g => g.hubs.forEach(([slug, label, m]) => { HUB[slug] = { label, group: g.name, m: m || null }; }));

  const arts = files.map(f => parseArticle(path.join(artDir, f), f.replace(/\.md$/, '')))
    .filter(a => a.status !== 'draft')
    .sort((a, b) => (b.updated || b.pubDate).localeCompare(a.updated || a.pubDate) || a.slug.localeCompare(b.slug));
  const unknown = arts.filter(a => !HUB[a.hub]);
  if(unknown.length) throw new Error(`_guide/taxonomy.json にないハブの記事: ${unknown.map(a => `${a.slug}（${a.hub}）`).join('、')}`);
  const bySlug = Object.fromEntries(arts.map(a => [a.slug, a]));
  const byHub = {};
  arts.forEach(a => (byHub[a.hub] = byHub[a.hub] || []).push(a));

  /* ハブ → 掲載求人。m = { c:[中分類…], g:[大分類…] }。c は jobCategory の「（」より前と一致、g は大分類と一致。両方あれば AND */
  const subOf = j => String(j.jobCategory || '').replace(/（[^（）]*）\s*$/, '').trim();
  const hubJobs = {};
  for(const [slug, x] of Object.entries(HUB)){
    if(!x.m) continue;
    const cs = x.m.c ? new Set(x.m.c) : null, gs = x.m.g ? new Set(x.m.g) : null;
    hubJobs[slug] = full.filter(j => (!cs || cs.has(subOf(j))) && (!gs || gs.has(jobGroupOf(j.jobCategory))));
  }
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const med = arr => { const a = arr.filter(v => v != null && v > 0).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };

  fs.rmSync(out, { recursive: true, force: true });
  const urls = [];
  const artUrl = a => `/guide/${a.slug}/`;
  const hubUrl = (hb, p = 1) => `/guide/hub/${hb}/${p > 1 ? p + '/' : ''}`;
  const crumbHtml = list => [['ホーム', '/'], ...list].map(([nm, href], i, a) => i === a.length - 1 ? `<span class="cur">${esc(nm)}</span>` : `<a href="${esc(href)}">${esc(nm)}</a><span class="sep">›</span>`).join('');
  const page = ({ title, desc, canon, crumb, main, ld, robots }) => {
    let html = ctx.lpTpl;
    if(robots) html = html.replace('<meta name="robots" content="index,follow">', () => `<meta name="robots" content="${robots}">`);
    return html
      .replace('__TITLE__', () => esc(`${title} - エージェントベストジョブ転職`))
      .replace(/__OGTITLE__/g, () => esc(title))
      .replace(/__DESC__/g, () => esc(desc))
      .replace(/__CANON__/g, () => esc(SITE + canon))
      .replace('__CRUMB__', () => crumbHtml(crumb))
      .replace('__MAIN__', () => GUIDE_CSS + main + (ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/<\//g, '<\\/')}</script>` : ''));
  };
  const card = a => `<a class="gd-card" href="${artUrl(a)}"><span class="gd-hub">${esc(HUB[a.hub].label)}</span><h3>${esc(a.title)}</h3><p>${esc(a.description)}</p></a>`;
  const searchBox = `<form class="gd-search" action="/guide/search/" role="search"><input type="search" name="q" placeholder="記事を検索（例：法人営業 求人票、みなし残業、内定 条件）" aria-label="記事を検索"><button type="submit">検索</button></form>`;
  const cta = (title = '求人票だけでは分からないことを、面談でお伝えします') => `<div class="lp__cta"><h2>${esc(title)}</h2><p>同じ職種名でも、企業ごとに仕事の範囲や求める経験は違います。希望を送っていただければ、掲載外の求人も含めて個別にお探しします。ご利用は無料です。</p>
      <div class="pd-cta"><a class="btn-apply" href="/${esc(ctx.C.APPLY_PAGE)}" data-apply="">転職支援に申し込む（無料）</a><a class="btn-ghost" href="${esc(ctx.C.CONSULT_URL)}" target="_blank" rel="noopener">まず話だけ聞いてみる</a><a class="line-btn" href="${esc(ctx.C.LINE_ADD_URL)}" target="_blank" rel="noopener noreferrer" data-line-cta="guide">${ctx.C.LINE_ICON}<span>LINEで相談する</span></a></div></div>`;
  const hubNav = current => tax.groups.map(g => `<nav class="lp__nav" aria-label="${esc(g.name)}"><p>${esc(g.name)}</p><div class="lp__pills">${g.hubs.filter(([hb]) => byHub[hb] || hb === current).map(([hb, label]) => `<a href="${hubUrl(hb)}"${hb === current ? ' aria-current="true"' : ''}>${esc(label)}<b>${(byHub[hb] || []).length}</b></a>`).join('')}</div></nav>`).filter(s => /<a /.test(s)).join('');

  /* その職種の掲載データ（記事・ハブの下に出す）。件数が少ないときは出さない */
  function dataBlock(hb, slugForUtm){
    const jobs = hubJobs[hb];
    if(!jobs || jobs.length < DATA_MIN) return '';
    const label = HUB[hb].label;
    const cos = new Set(jobs.map(j => j.company).filter(Boolean)).size;
    const mn = med(jobs.map(j => j.salaryMin)), mx = med(jobs.map(j => j.salaryMax));
    const remote = jobs.filter(j => j.remote).length;
    const gcount = new Map(); jobs.forEach(j => { const g = jobGroupOf(j.jobCategory); gcount.set(g, (gcount.get(g) || 0) + 1); });
    const mainG = [...gcount.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const gslug = GROUP_SLUG[mainG];
    const coMap = new Map();
    jobs.forEach(j => { const c = ctx.coOf && ctx.coOf(j); if(c){ const e = coMap.get(c.id) || [c, 0]; e[1]++; coMap.set(c.id, e); } });
    const topCos = [...coMap.values()].sort((a, b) => b[1] - a[1] || String(a[0].name).localeCompare(String(b[0].name))).slice(0, 6);
    /* 記事ごとに違う求人を出す（slug のハッシュで開始位置をずらす。並びは新着順なので毎朝入れ替わる） */
    const sorted = sortForList(jobs);
    let x = 0; for(const ch of slugForUtm || hb) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
    const pool = sorted.slice(0, Math.min(sorted.length, 40));
    const pick = []; for(let k = 0; k < Math.min(CARDS, pool.length); k++) pick.push(pool[(x + k) % pool.length]);
    return `<section class="gd-data" aria-label="${esc(label)}の掲載求人のデータ">
      <h2>${esc(label)}の求人をデータで見る</h2>
      <p class="gd-data__note">${esc(today)}時点でエージェントベストジョブ転職に掲載中の求人の集計です（毎朝更新）。年収は求人票に企業が記載した提示額で、転職市場全体の相場を示すものではありません。</p>
      <ul class="lp__stats"><li><b>${jobs.length.toLocaleString()}</b>件</li><li><b>${cos.toLocaleString()}</b>社が募集中</li>${mn ? `<li>提示年収の中央値 下限<b>${mn.toLocaleString()}</b>万円</li>` : ''}${mx ? `<li>上限<b>${mx.toLocaleString()}</b>万円</li>` : ''}<li><b>${remote.toLocaleString()}</b>件がリモート可</li></ul>
      ${topCos.length ? `<nav class="lp__nav" aria-label="募集中の企業"><p>${esc(label)}を募集中の企業</p><div class="lp__pills">${topCos.map(([c, n]) => `<a href="${esc(ctx.coPath(c))}">${esc(c.name)}<b>${n}</b></a>`).join('')}</div></nav>` : ''}
      <div class="joblist">${pick.map(j => cardHtml(ctx, j)).join('')}</div>
      ${gslug ? `<div class="lp__all"><a href="/jobs/${esc(gslug)}/">${esc(mainG)}の求人をすべて見る →</a></div>${fs.existsSync(path.join(root, 'jobs', gslug, 'market', 'index.html')) ? `<p class="gd-data__more"><a href="/jobs/${esc(gslug)}/market/">${esc(mainG)}の求人・年収動向（職種別の中央値・勤務地・推移）→</a></p>` : ''}` : ''}
    </section>`;
  }

  /* ---------- トップ ---------- */
  {
    const latest = arts.slice(0, 12);
    const groupsHtml = tax.groups.map(g => {
      const inG = arts.filter(a => HUB[a.hub].group === g.name);
      if(!inG.length) return '';
      return `<section class="gd-sec"><h2>${esc(g.name)}</h2>${g.desc ? `<p class="gd-sub">${esc(g.desc)}</p>` : ''}
        <div class="lp__pills">${g.hubs.filter(([hb]) => byHub[hb]).map(([hb, label]) => `<a href="${hubUrl(hb)}">${esc(label)}<b>${byHub[hb].length}</b></a>`).join('')}</div>
        <div class="gd-grid">${inG.slice(0, 4).map(card).join('')}</div></section>`;
    }).join('');
    const desc = `求人票の読み方、職種ごとに求人で求められる経験、応募から内定までの進め方を、中途採用の求人を扱う立場からまとめた記事集（${arts.length.toLocaleString()}本）。`;
    writePage(root, 'guide', page({
      title: '転職ガイド｜求人の読み方と応募・選考の進め方', desc, canon: '/guide/', crumb: [['転職ガイド', '/guide/']],
      main: `<h1>転職ガイド<small style="font-size:.6em;color:var(--ink-3);font-weight:700;margin-left:8px">${arts.length.toLocaleString()}本</small></h1>
    <p class="lp__lead">求人票のどこを読めばよいか、その職種の求人で実際に求められていること、応募から内定までの進め方をまとめています。記事の下には、その職種でいま募集中の求人と掲載データを毎朝更新して載せています。</p>
    ${searchBox}
    <section class="gd-sec"><h2>新着の記事</h2><div class="gd-grid">${latest.map(card).join('')}</div></section>
    ${groupsHtml}
    ${cta()}`,
      ld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: '転職ガイド', url: SITE + '/guide/', description: desc }
    }));
    urls.push({ loc: SITE + '/guide/', lastmod: arts[0].updated || arts[0].pubDate, pri: '0.7' });
  }

  /* ---------- ハブ（記事のあるハブだけ作る） ---------- */
  for(const [hb, info] of Object.entries(HUB)){
    const list = byHub[hb] || [];
    if(!list.length) continue;
    const pages = Math.ceil(list.length / PER_PAGE);
    for(let p = 1; p <= pages; p++){
      const items = list.slice((p - 1) * PER_PAGE, p * PER_PAGE);
      const pager = pages > 1 ? `<nav class="gd-pager" aria-label="ページ送り">${Array.from({ length: pages }, (_, i) => i + 1).map(n => n === p ? `<span aria-current="page">${n}</span>` : `<a href="${hubUrl(hb, n)}">${n}</a>`).join('')}</nav>` : '';
      writePage(root, hubUrl(hb, p).slice(1, -1), page({
        title: `${info.label}の転職ガイド${p > 1 ? `（${p}ページ目）` : ''}｜求人の読み方と選考`,
        desc: `${info.label}の求人の読み方、求められる経験、応募から内定までの進め方の記事一覧（${list.length}本）。`,
        canon: hubUrl(hb, p), crumb: [['転職ガイド', '/guide/'], [info.label, hubUrl(hb)]],
        main: `<h1>${esc(info.label)}の転職ガイド</h1>
    <p class="lp__lead">${esc(info.group)}／${list.length}本の記事</p>
    <div class="gd-grid">${items.map(card).join('')}</div>
    ${pager}
    ${p === 1 ? dataBlock(hb, hb) : ''}
    ${cta()}`
      }));
      urls.push({ loc: SITE + hubUrl(hb, p), lastmod: items[0].updated || items[0].pubDate, pri: '0.6' });
    }
  }

  /* ---------- 記事 ---------- */
  for(const a of arts){
    const { html: body, toc, faq } = renderMarkdown(a.body, esc, bySlug);
    const related = [
      ...(a.related || []).map(s => bySlug[s]).filter(Boolean),
      ...(byHub[a.hub] || []).filter(x => x.slug !== a.slug)
    ].filter((x, i, arr) => x.slug !== a.slug && arr.indexOf(x) === i).slice(0, 6);
    const hub = HUB[a.hub];
    const ld = [{
      '@context': 'https://schema.org', '@type': 'Article',
      headline: a.title, description: a.description,
      datePublished: a.pubDate, dateModified: a.updated || a.pubDate,
      author: { '@type': 'Organization', name: '株式会社エージェントベスト', url: 'https://www.agent-best.net/' },
      publisher: { '@type': 'Organization', name: '株式会社エージェントベスト', url: 'https://www.agent-best.net/' },
      mainEntityOfPage: SITE + artUrl(a)
    }, {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'ホーム', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: '転職ガイド', item: SITE + '/guide/' },
        { '@type': 'ListItem', position: 3, name: hub.label, item: SITE + hubUrl(a.hub) },
        { '@type': 'ListItem', position: 4, name: a.title }
      ]
    }];
    if(faq.length) ld.push({ '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: faq.map(([q, ans]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: ans } })) });
    writePage(root, `guide/${a.slug}`, page({
      title: a.title, desc: a.description, canon: artUrl(a),
      crumb: [['転職ガイド', '/guide/'], [hub.label, hubUrl(a.hub)], [a.title, artUrl(a)]],
      main: `<article class="gd-art">
    <a class="gd-hub" href="${hubUrl(a.hub)}">${esc(hub.label)}</a>
    <h1>${esc(a.title)}</h1>
    <p class="gd-meta">公開 ${esc(a.pubDate)}${a.updated && a.updated !== a.pubDate ? `／更新 ${esc(a.updated)}` : ''}　監修：株式会社エージェントベスト（有料職業紹介 13-ユ-316964）</p>
    ${toc.length > 2 ? `<nav class="gd-toc" aria-label="目次"><strong>目次</strong><ol>${toc.map(([id, t]) => `<li><a href="#${id}">${esc(t)}</a></li>`).join('')}</ol></nav>` : ''}
    <div class="gd-body">
${body}
    </div>
    ${a.sources && a.sources.length ? `<section class="gd-sources"><h2>参考にした公的情報・資料</h2><ul>${a.sources.map(s => `<li><a href="${esc(s.u)}" target="_blank" rel="noopener nofollow">${esc(s.t)}</a></li>`).join('')}</ul><p>記事の内容は公開日時点の情報にもとづきます。制度は変わることがあるため、手続きの前に各機関の最新情報をご確認ください。</p></section>` : ''}
  </article>
  ${dataBlock(a.hub, a.slug)}
  ${cta()}
  ${related.length ? `<section class="gd-sec"><h2>あわせて読みたい</h2><div class="gd-grid">${related.map(card).join('')}</div></section>` : ''}
  <p class="gd-data__more"><a href="${hubUrl(a.hub)}">${esc(hub.label)}の記事をもっと見る →</a>　<a href="/guide/">転職ガイドのトップへ →</a></p>
  ${hubNav(a.hub)}`,
      ld
    }));
    urls.push({ loc: SITE + artUrl(a), lastmod: a.updated || a.pubDate, pri: '0.6' });
  }

  /* ---------- 検索（noindex） ---------- */
  fs.writeFileSync(path.join(out, 'search.json'), JSON.stringify(arts.map(a => ({ u: artUrl(a), t: a.title, d: a.description, h: HUB[a.hub].label, k: (a.tags || []).join(' ') }))), 'utf8');
  writePage(root, 'guide/search', page({
    title: '転職ガイドの記事を検索', desc: '転職ガイドの記事を検索できます。', canon: '/guide/search/', robots: 'noindex,follow',
    crumb: [['転職ガイド', '/guide/'], ['検索', '/guide/search/']],
    main: `<h1>記事を検索</h1>${searchBox}<p class="lp__lead" id="gd-count"></p><div class="gd-grid" id="gd-list"></div>
<script>
(function(){var esc=function(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
var q=new URLSearchParams(location.search).get('q')||'';document.querySelector('.gd-search input').value=q;
fetch('/guide/search.json').then(function(r){return r.json();}).then(function(all){var w=q.toLowerCase().split(/\\s+/).filter(Boolean);
var hit=w.length?all.filter(function(a){var s=(a.t+' '+a.d+' '+a.h+' '+a.k).toLowerCase();return w.every(function(x){return s.indexOf(x)>=0;});}):[];
document.getElementById('gd-count').textContent=w.length?'「'+q+'」の記事 '+hit.length+'本':'キーワードを入れて検索してください';
document.getElementById('gd-list').innerHTML=hit.slice(0,100).map(function(a){return '<a class="gd-card" href="'+a.u+'"><span class="gd-hub">'+esc(a.h)+'</span><h3>'+esc(a.t)+'</h3><p>'+esc(a.d)+'</p></a>';}).join('');});})();
</script>`
  }));

  console.log(`転職ガイド: 記事 ${arts.length}本・ハブ ${Object.keys(byHub).length}件を書き出しました。`);
  return { urls };
}

const GUIDE_CSS = `<style>
  .gd-search{display:flex;gap:8px;margin:0 0 22px}.gd-search input{flex:1;min-width:0;padding:11px 14px;border:1px solid var(--line);border-radius:999px;font:inherit;background:var(--surface)}
  .gd-search button{padding:0 20px;border:0;border-radius:999px;background:var(--accent);color:#fff;font-weight:800;cursor:pointer}
  .gd-sec{margin:28px 0}.gd-sec>h2{font-size:18px;margin:0 0 10px}.gd-sub{margin:-4px 0 10px;color:var(--ink-3);font-size:13px}
  .gd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:12px;margin:12px 0}
  .gd-card{display:block;padding:14px 16px;border:1px solid var(--line);border-radius:var(--r-card,12px);background:var(--surface);color:var(--ink);text-decoration:none}
  .gd-card:hover{border-color:var(--accent)}.gd-card h3{font-size:15px;line-height:1.5;margin:4px 0 6px}.gd-card p{margin:0;font-size:13px;color:var(--ink-3);line-height:1.6}
  .gd-hub{display:inline-block;font-size:11.5px;font-weight:700;color:var(--accent);text-decoration:none}
  .gd-pager{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:18px 0}.gd-pager a,.gd-pager span{min-width:36px;padding:6px 10px;text-align:center;border:1px solid var(--line);border-radius:8px;text-decoration:none;color:var(--ink-2)}.gd-pager span{background:var(--accent);color:#fff;border-color:var(--accent)}
  .gd-art{max-width:760px}.gd-art h1{font-size:clamp(21px,3.4vw,28px);line-height:1.45;margin:6px 0 8px}
  .gd-meta{font-size:12.5px;color:var(--ink-3);margin:0 0 18px}
  .gd-toc{margin:0 0 24px;padding:14px 18px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2)}.gd-toc ol{margin:6px 0 0;padding-left:1.4em;font-size:14px;line-height:1.9}
  .gd-body{font-size:16px;line-height:1.95;color:var(--ink)}.gd-body h2{font-size:21px;line-height:1.5;margin:40px 0 14px;padding:0 0 8px;border-bottom:2px solid var(--line)}
  .gd-body h3{font-size:17.5px;margin:28px 0 10px}.gd-body h4{font-size:16px;margin:22px 0 8px}.gd-body p{margin:0 0 16px}
  .gd-body ul,.gd-body ol{margin:0 0 18px;padding-left:1.4em}.gd-body li{margin:0 0 6px}
  .gd-body .gd-tw{overflow-x:auto;margin:0 0 18px}.gd-body table{border-collapse:collapse;width:100%;font-size:14.5px;line-height:1.7}
  .gd-body th,.gd-body td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}.gd-body th{background:var(--surface-2)}
  .gd-body blockquote{margin:0 0 18px;padding:10px 16px;border-left:4px solid var(--line);color:var(--ink-2)}
  .gd-box{margin:22px 0;padding:16px 18px;border-radius:10px;border:1px solid var(--line);background:var(--surface-2)}.gd-box p:last-child,.gd-box ul:last-child{margin-bottom:0}
  .gd-box__label{font-weight:800;font-size:14px;margin:0 0 6px}.gd-box--view{border-color:var(--accent);background:var(--surface)}.gd-box--view .gd-box__label{color:var(--accent)}
  .gd-box--caution{border-color:#e0a100;background:#fffaf0}.gd-box--caution .gd-box__label{color:#9a6700}
  .gd-sources{margin:30px 0 0;font-size:13.5px}.gd-sources h2{font-size:15px;margin:0 0 6px}.gd-sources p{color:var(--ink-3);font-size:12.5px}
  .gd-data{margin:34px 0;padding:18px 20px;border:1px solid var(--line);border-radius:var(--r-card,12px);background:var(--surface-2)}.gd-data h2{font-size:18px;margin:0 0 6px}
  .gd-data__note{font-size:12.5px;color:var(--ink-3);margin:0 0 12px}.gd-data__more{font-size:14px;margin:10px 0}
</style>`;

/* ---------- 原稿のパース（freelance の media.js と同じ書式） ---------- */
function parseArticle(file, slug){
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if(!m) throw new Error(`frontmatter がありません: ${file}`);
  const a = { slug, body: m[2] };
  for(const line of m[1].split('\n')){
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if(!kv) continue;
    let v = kv[2].trim();
    if(/^[\[{]/.test(v)){ try{ v = JSON.parse(v); }catch(e){ throw new Error(`${file} の ${kv[1]} が JSON として読めません`); } }
    else v = v.replace(/^"(.*)"$/, '$1');
    a[kv[1]] = v;
  }
  for(const k of ['title', 'description', 'hub', 'pubDate']) if(!a[k]) throw new Error(`${file} に ${k} がありません`);
  return a;
}

/* ---------- Markdown（記事で使う範囲だけ）。まだ無い記事へのリンクは文字だけにする ---------- */
function renderMarkdown(md, esc, bySlug){
  const toc = [], faq = [];
  let n = 0;
  const inline = s => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => {
      const own = u.match(/^\/guide\/([a-z0-9-]+)\/$/);
      if(own && !bySlug[own[1]] && !['search', 'hub'].includes(own[1])) return t;
      const ext = /^https?:/.test(u) && !u.startsWith('https://jobs.agent-best.net');
      return `<a href="${u}"${ext ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`;
    });
  const lines = md.split('\n');
  let i = 0, inFaq = false, faqQ = null, faqA = [];
  const flushFaq = () => { if(faqQ) faq.push([faqQ, faqA.join(' ').replace(/<[^>]+>/g, '')]); faqQ = null; faqA = []; };
  function block(stopAt){
    const html = [];
    while(i < lines.length){
      const line = lines[i];
      if(stopAt && line.trim() === ':::'){ i++; break; }
      if(!line.trim()){ i++; continue; }
      let mm;
      if((mm = line.match(/^:::(\w+)\s*(.*)$/))){
        i++;
        const kind = mm[1], label = mm[2] || BOX[kind] || '';
        const inner = block(true);
        html.push(`<aside class="gd-box gd-box--${kind}">${label ? `<p class="gd-box__label">${esc(label)}</p>` : ''}${inner}</aside>`);
        continue;
      }
      if((mm = line.match(/^(#{2,4})\s+(.+)$/))){
        const lv = mm[1].length, text = mm[2].trim();
        i++;
        if(lv === 2){
          flushFaq();
          inFaq = /よくある(ご)?質問|FAQ/.test(text);
          const id = 's' + (++n);
          toc.push([id, text]);
          html.push(`<h2 id="${id}">${inline(text)}</h2>`);
        }else{
          if(inFaq && lv === 3){ flushFaq(); faqQ = text.replace(/^Q[.．:：]?\s*/, ''); }
          html.push(`<h${lv}>${inline(text)}</h${lv}>`);
        }
        continue;
      }
      if(/^\s*[-*]\s+/.test(line)){
        const items = [];
        while(i < lines.length && /^\s*[-*]\s+/.test(lines[i])){ items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; }
        html.push(`<ul>${items.map(t => `<li>${inline(t)}</li>`).join('')}</ul>`);
        continue;
      }
      if(/^\s*\d+[.)]\s+/.test(line)){
        const items = [];
        while(i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])){ items.push(lines[i].replace(/^\s*\d+[.)]\s+/, '')); i++; }
        html.push(`<ol>${items.map(t => `<li>${inline(t)}</li>`).join('')}</ol>`);
        continue;
      }
      if(/^\|/.test(line)){
        const rows = [];
        while(i < lines.length && /^\|/.test(lines[i])){ rows.push(lines[i]); i++; }
        const cells = r => r.replace(/^\||\|\s*$/g, '').split('|').map(c => c.trim());
        const hasHead = rows[1] && /^\|?\s*:?-{2,}/.test(rows[1]);
        const headRow = hasHead ? cells(rows[0]) : null;
        const bodyRows = (hasHead ? rows.slice(2) : rows).map(cells);
        html.push(`<div class="gd-tw"><table>${headRow ? `<thead><tr>${headRow.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead>` : ''}<tbody>${bodyRows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      if(/^>\s?/.test(line)){
        const q = [];
        while(i < lines.length && /^>\s?/.test(lines[i])){ q.push(lines[i].replace(/^>\s?/, '')); i++; }
        html.push(`<blockquote><p>${q.map(inline).join('<br>')}</p></blockquote>`);
        continue;
      }
      const p = [];
      while(i < lines.length && lines[i].trim() && !/^(#{2,4}\s|:::|\s*[-*]\s+|\s*\d+[.)]\s+|\||>)/.test(lines[i])){ p.push(lines[i].trim()); i++; }
      const ph = `<p>${p.map(inline).join('<br>')}</p>`;
      if(inFaq && faqQ) faqA.push(ph);
      html.push(ph);
    }
    return html.join('\n');
  }
  const html = block(false);
  flushFaq();
  return { html, toc, faq };
}

module.exports = { build, parseArticle };
