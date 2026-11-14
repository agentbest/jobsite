/* 厳選特集（/pickup/）— 直接取引の企業ごとの企業LP（2026-11-14）
   松岡さん「注力企業・注力求人は専用LP」「直接取引している企業は全部、この方向性で出したい」。手本は他社エージェントの企業別LP（リメディ・Will Location の MACP）。

   pickup-src/<slug>.json（1社1ファイル。書き方は下の「データの書き方」）
        ↓ rebuild.js → static-pages.js の最後で build(root, 掲載中の求人ID) を呼ぶ
   pickup/index.html（厳選特集の一覧）・pickup/company/<slug>/index.html（企業LP）
   → sitemap.xml に入る（static-pages.js が urls を受け取る）

   ⚠ 守ること（文章を足すとき・会社を足すとき）
   - 公開情報だけ。エージェント向け情報（採用人数・年齢の目安・NG条件・手数料など）は書かない。非公開・限定公開の求人は載せない。
   - 確かめられない数字・「No.1」は書かない。数字は出典を cap に書く。出典に ATS 名（HRMOS・HERP・Lever）や媒体名は書かない（「同社の公開求人票」）。
   - 企業の採用ページ・応募ページへのリンクを置かない（直接応募の導線になる）。直接応募だけが対象の特典（入社祝い金など）も書かない。
   - 求人リンクは掲載中の求人だけ。掲載が終わった求人はここで自動的にリンクを外す（行は残す）。
   - 写真は Unsplash の確認済みの8枚だけ（pickup-src/_style.html の上のコメント・focus-lp\tools\SCHEMA.md）。人物写真を当社や同社の社員と書かない。
   - 「相談する理由」は pickup-src/_why.html（全LP共通の正本の写し）を差し込む。
   元データと下書きの道具は手元の C:\Users\user\focus-lp\（data/・tools/SCHEMA.md・tools/build.py）。社内メモ（_todo）・出典URL（_sources）はこのリポジトリには入れない。 */
const fs = require('fs'), path = require('path');

const SITE = 'https://jobs.agent-best.net';
const IMG = (id, w = 1200) => `https://images.unsplash.com/photo-${id}?w=${w}&q=75`;
const DEFAULT_AREA = 'IT・スタートアップ・M&A・コンサル';
const GA = 'G-1XXMP8Y1B4';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const e = s => esc(s).replace(/&lt;br&gt;/g, '<br>');   // 本文中の <br> だけ通す
const plain = s => String(s ?? '').replace(/<br>/g, '');

function head(title, desc, canonical, style, ogImg) {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${canonical}">
${ogImg ? `<meta property="og:image" content="${ogImg}"><meta name="twitter:card" content="summary_large_image">` : ''}
<link rel="icon" href="/favicon.ico">
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA}');</script>
${style}
</head>
<body>
`;
}

function companyPage(d, style, why, live) {
  const slug = d.slug, utm = `https://calendly.com/r_matsuoka?utm_source=pickup&utm_campaign=${slug}`;
  const cta = (label, cls = 'btn') => `<a class="${cls}" href="${utm}" target="_blank" rel="noopener" data-consult="pickup-${slug}">${e(label)}</a>`;
  const { hero: h, about: a, work: w, income: inc, selection: sel, jobs, fit } = d;
  const canonical = `${SITE}/pickup/company/${slug}/`;
  const o = [head(d.title, d.description, canonical, style, IMG(h.img, 1200))];
  o.push(`<header class="top"><div class="wrap">
  <a class="brand" href="/">エージェントベスト<small>おすすめ企業特集</small></a>
  ${cta('無料で相談する')}
</div></header>
<section class="hero" style="background-image:url('${IMG(h.img, 2000)}')"><div class="wrap">
  <p class="label">${e(h.label)}</p>
  <h1>${e(h.h1)}</h1>
  <p>${e(h.lead)}</p>
  <div class="ctas">${cta(h.cta || d.companyShort + 'への転職を相談する（無料）')}<a class="btn btn--line" href="#jobs">募集中のポジション</a></div>
  <div class="strip">${h.strip.map(s => `<div><b>${e(s.v)}<small>${e(s.unit || '')}</small></b><span>${e(s.label)}</span></div>`).join('')}</div>
  <p class="cap">${e(h.cap)}</p>
</div></section>
<section class="sec"><div class="wrap split">
  <div class="ph"><img src="${IMG(a.img, 1000)}" alt="${e(a.alt || 'イメージ')}" loading="lazy"></div>
  <div><div class="chapter"><i>01</i><span>COMPANY</span></div><h2>どんな会社か</h2>
  <p class="lead" style="margin-bottom:24px">${e(a.lead)}</p><ul class="points">${a.points.map(p => `<li><b>${e(p.b)}</b><p>${e(p.p)}</p></li>`).join('')}</ul><p class="cap">${e(a.cap)}</p></div>
</div></section>
<section class="sec sec--alt"><div class="wrap">
  <div class="split split--rev"><div class="ph ph--wide"><img src="${IMG(w.img)}" alt="${e(w.alt || 'イメージ')}" loading="lazy"></div>
  <div><div class="chapter"><i>02</i><span>WORK</span></div><h2>${e(w.h2)}</h2><p class="lead" style="margin:0">${e(w.lead)}</p></div></div>
  <div class="process" style="margin-top:48px">${w.steps.map(s => `<div><span class="n">${e(s.n)}</span><b>${e(s.b)}</b><p>${e(s.p)}</p></div>`).join('')}</div>${w.note ? `<p class="oneperson">${e(w.note)}</p>` : ''}
</div></section>
<section class="sec"><div class="wrap">
  <div class="chapter"><i>03</i><span>INCOME</span></div><h2>${e(inc.h2)}</h2><p class="lead">${e(inc.lead)}</p>
  <div class="stairs">${inc.stairs.map(s => `<div class="stair"><small>${e(s.small)}</small><b>${e(s.b)}</b><span>${e(s.span || '')}</span></div>`).join('')}</div>
  ${(inc.realized || []).length ? `<div class="realized">${inc.realized.map(r => `<div><small>${e(r.small)}</small><b>${e(r.b)}</b></div>`).join('')}</div>` : ''}
  ${inc.breakdown ? `<p class="breakdown">${e(inc.breakdown)}</p>` : ''}<p class="cap">${e(inc.cap)}</p>
</div></section>
<section class="sec night" style="background-image:url('${IMG(sel.img || '1606044466411-207a9a49711f', 2000)}')"><div class="wrap">
  <div class="chapter"><i>04</i><span>SELECTION</span></div><h2>${e(sel.h2)}</h2><p class="lead">${e(sel.lead)}</p>
  <div class="timeline"><div class="us"><span class="t">BEFORE</span><b>当社と面談</b><p>経歴の棚卸しと、どのポジションで受けるかを一緒に決めます。</p></div>${sel.steps.map(s => `<div><span class="t">${e(s.t)}</span><b>${e(s.b)}</b><p>${e(s.p)}</p></div>`).join('')}</div>
  <p class="cap">${e(sel.cap)}</p>
</div></section>
`);
  /* 求人：当サイトの求人ページがある行は、掲載中ならリンクし、掲載が終わっていたら行ごと外す（「募集中」と書いているため）。
     もともと当サイトに無い求人（BPIO など href の無い行）は文字だけで出す */
  const groups = jobs.groups.map(g => ({ ...g, items: g.items.map(j => {
    const id = (String(j.href || '').match(/\/job\/(rec[A-Za-z0-9]+)\//) || [])[1];
    if (id && !live.has(id)) return null;
    return { ...j, href: id ? `/job/${id}/?utm_source=pickup&utm_medium=company-lp&utm_campaign=${slug}` : null };
  }).filter(Boolean) })).filter(g => g.items.length);
  const tabs = groups.length > 1 ? groups.map((g, i) => `<button role="tab" aria-selected="${i ? 'false' : 'true'}" data-g="g${i}">${e(g.label)}</button>`).join('') : '';
  const lists = groups.map((g, i) => `<ul class="joblist" data-g="g${i}"${i ? ' hidden' : ''}>${g.items.map(j => {
    const inner = `<b>${e(j.title)}${j.pick ? '<span class="pick">厳選</span>' : ''}</b><span class="sal">${e(j.salary || '')}</span>`;
    return j.href ? `<li><a href="${j.href}">${inner}</a></li>` : `<li><div class="j">${inner}</div></li>`;
  }).join('')}</ul>`).join('');
  o.push(`<section class="sec" id="jobs"><div class="wrap">
  <div class="chapter"><i>05</i><span>POSITIONS</span></div><h2>募集中のポジション</h2><p class="lead">${e(jobs.lead)}</p>
  <div class="tabs" role="tablist">${tabs}</div>${lists}
</div></section>
<section class="sec sec--alt"><div class="wrap">
  <div class="split"><div class="ph ph--wide"><img src="${IMG(fit.img)}" alt="${e(fit.alt || 'イメージ')}" loading="lazy"></div>
  <div><div class="chapter"><i>06</i><span>FIT</span></div><h2>応募条件と、合う人</h2><p class="lead" style="margin:0">${e(fit.lead)}</p></div></div>
  <div class="fit" style="margin-top:40px"><div><h3>${e(fit.req.h3)}</h3><ul>${fit.req.items.map(x => `<li>${e(x)}</li>`).join('')}</ul></div><div><h3>${e(fit.fit.h3)}</h3><ul>${fit.fit.items.map(x => `<li>${e(x)}</li>`).join('')}</ul></div></div>
</div></section>
<section class="sec"><div class="wrap">
  <div class="chapter"><i>07</i><span>WHY AGENT BEST</span></div><h2>エージェントベストに相談する理由</h2>
  ${why.replace('{{AREA}}', esc(d.area || DEFAULT_AREA)).replace('{{COMPANY}}', esc(d.companyShort))}
</div></section>
<section class="sec sec--alt"><div class="wrap" style="max-width:860px">
  <div class="chapter"><i>08</i><span>FAQ</span></div><h2>よくある質問</h2>
  ${d.faq.map(q => `<details><summary>${e(q.q)}</summary><p>${e(q.a)}</p></details>`).join('')}
  <details><summary>相談したら必ず応募しないといけませんか？</summary><p>いいえ。話を聞いてから決めていただいて大丈夫です。${e(d.companyShort)}以外の選択肢も一緒に検討できます。</p></details>
</div></section>
<section class="closing" style="background-image:url('${IMG(d.closingImg || '1779275859289-9bcf24ee065a', 2000)}')"><div class="wrap">
  <h2>まずは、話を聞いてみませんか。</h2><p>どのポジションが合うか、今の経歴でどう見られるかからお話しします。相談は無料です。</p>
  ${cta('無料で相談する（オンライン30分）')}
</div></section>
${footer(`${e(d.footerSource)}最新の条件はご相談時にご確認ください。写真はイメージで、同社とは関係ありません。`, d.credits, d.related)}
${cta('無料で相談する', 'btn float')}
<script>
document.querySelectorAll('.tabs button').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.tabs button').forEach(x=>x.setAttribute('aria-selected',x===b));
  document.querySelectorAll('.joblist').forEach(u=>u.hidden=u.dataset.g!==b.dataset.g);
}));
document.addEventListener('click',ev=>{const a=ev.target.closest('a[data-consult]');if(a&&window.gtag)gtag('event','consult_click',{placement:a.dataset.consult});},true);
</script>
</body>
</html>
`);
  return { html: o.join(''), jobs: groups.reduce((n, g) => n + g.items.length, 0) };
}

function footer(note, credits, related, base = '') {
  return `<footer><div class="wrap">
  <dl><dt>運営</dt><dd>株式会社エージェントベスト</dd><dt>許可番号</dt><dd>有料職業紹介事業 13-ユ-316964</dd><dt>所在地</dt><dd>東京都港区六本木4-8-7 嶋田ビル5階</dd></dl>
  <p>${note}</p>
  ${credits ? `<p>写真：Unsplash（${e(credits)}）</p>` : ''}
  <p><a href="${base}/pickup/">厳選特集の一覧</a>${related ? `｜<a href="${esc(related.href)}">${e(related.label)}</a>` : ''}｜<a href="${base}/">求人を探す</a>｜<a href="${base}/company/">企業を探す</a></p>
</div></footer>`;
}

/* ───────── テーマ別のおすすめ企業特集（/pickup/<theme>/）— 2026-11-15 ─────────
   松岡さん「おすすめ企業特集を作り、サイトに合う企業だけ掲載してほしい」。
   pickup-src/_features/<theme>.json（1テーマ1ファイル）に、載せる会社（企業LPの slug）と、その会社の求人から
   テーマに合うものを拾う正規表現（match / exclude。企業LPの求人タイトルに当てる）と、選んだ理由（reason）を書く。
   - 求人は企業LP（pickup-src/<slug>.json）の求人リストから拾う。掲載中ならリンク、掲載終了なら外す、当サイトに無い求人は文字だけ（企業LPと同じ）。
   - canonical はこの jobs 側。特化サイト（lp.〇〇tenshoku.com 等）には tools/pickup-mirror.js で同じ中身の入口ページを書き出す
     （canonical は jobs を指し、求人リストは pickup/<theme>/jobs.json を読んで毎回差し替える＝掲載終了は向こうでも自動で外れる）。
   - 1社ごとの写真は使わない（写真は8枚しかなく、同じページで同じ写真を2回使わないため）。
   - 載せてよいのは直接取引の会社（企業LPがある会社）だけ。理由（reason）も公開情報だけで書く。年齢・性別・学歴を理由に書かない。 */
const PHOTOGRAPHER = {
  '1758095520684-99d5a1cc2768': 'Dmitrijs Tokyo', '1779275859289-9bcf24ee065a': 'Ryusei Machida', '1606044466411-207a9a49711f': 'Marek Okon',
  '1681489933902-bb3644b91d65': 'Sho Shimada', '1517048676732-d65bc937f952': 'Dylan Gillis', '1573164574572-cb89e39749b4': 'Christina @ wocintechchat.com',
  '1681505531034-8d67054e07f6': 'Amina Atar', '1634201580620-110223756709': 'Javier Haro',
};
const FEATURE_SHOW = 6;   // 1社あたり最初に見せる求人の数（残りは「ほか◯件」で企業LPへ）

/* 特集に載せる会社と求人を決める。cos＝{slug: 企業JSON}、live＝掲載中の求人ID */
function featureItems(f, cos, live) {
  return f.companies.map(c => {
    const co = cos[c.slug];
    if (!co) { console.warn(`  特集 ${f.slug}: 企業LP ${c.slug} が無いので外しました`); return null; }
    const re = new RegExp(c.match), ex = c.exclude ? new RegExp(c.exclude) : null;
    const jobs = [];
    for (const g of co.jobs.groups) for (const j of g.items) {
      if (!re.test(j.title) || (ex && ex.test(j.title))) continue;
      const id = (String(j.href || '').match(/\/job\/(rec[A-Za-z0-9]+)\//) || [])[1];
      if (id && !live.has(id)) continue;                       // 掲載終了は外す
      if (jobs.some(x => x.t === j.title)) continue;
      jobs.push({ t: j.title, s: j.salary || '', id: id || null });
    }
    const pre = c.prefer ? new RegExp(c.prefer) : null;          // prefer に当たる求人（未経験歓迎など）を先に
    jobs.sort((a, b) => (pre ? (pre.test(b.t) ? 1 : 0) - (pre.test(a.t) ? 1 : 0) : 0) || (b.id ? 1 : 0) - (a.id ? 1 : 0));   // 次にリンクできる求人を先に
    return { slug: c.slug, co, reason: c.reason, jobs };
  }).filter(Boolean);
}

function featureJobsHtml(slug, coSlug, jobs, base) {
  const q = `?utm_source=pickup&utm_medium=feature&utm_campaign=${slug}`;
  const li = jobs.slice(0, FEATURE_SHOW).map(j => {
    const inner = `<b>${e(j.t)}</b><span class="sal">${e(j.s)}</span>`;
    return j.id ? `<li><a href="${base}/job/${j.id}/${q}">${inner}</a></li>` : `<li><div class="j">${inner}</div></li>`;
  }).join('');
  const more = jobs.length > FEATURE_SHOW ? `<li class="more"><a href="${base}/pickup/company/${coSlug}/#jobs">ほか${jobs.length - FEATURE_SHOW}件のポジションを見る</a></li>` : '';
  return jobs.length ? li + more : `<li class="none"><a href="${base}/pickup/company/${coSlug}/#jobs">募集中のポジションは企業の特集ページでご覧ください</a></li>`;
}

/* opt.mirror＝特化サイトに置く入口ページとして書き出す（リンクを jobs の絶対URLにし、求人は jobs.json で差し替える） */
function featurePage(f, items, style, why, opt = {}) {
  const m = !!opt.mirror, base = m ? SITE : '';
  const canonical = `${SITE}/pickup/${f.slug}/`;
  const src = m ? `lp-${f.slug}` : 'pickup';
  const utm = `https://calendly.com/r_matsuoka?utm_source=${src}&utm_campaign=feature-${f.slug}`;
  const cta = (label, cls = 'btn') => `<a class="${cls}" href="${utm}" target="_blank" rel="noopener" data-consult="${src}-feature-${f.slug}">${e(label)}</a>`;
  const h = f.hero, ab = f.about || {};
  const nJobs = items.reduce((n, x) => n + x.jobs.length, 0);
  const aboutImg = ab.img || '1681489933902-bb3644b91d65', closeImg = f.closingImg || '1779275859289-9bcf24ee065a';
  const credits = [...new Set([h.img, aboutImg, closeImg])].map(i => PHOTOGRAPHER[i]).filter(Boolean).join('／');
  const points = ab.points || [
    { b: '伸びている会社を中心に', p: '業績が好調な会社や、事業を伸ばしている会社を中心に選んでいます。' },
    { b: 'テーマに合うポジションだけ', p: '各社の募集から、この特集のテーマに合うポジションだけを抜き出しています。' },
    { b: '募集中の求人だけ', p: '掲載が終わった求人は、毎朝の更新で自動的に外れます。' },
  ];
  const cards = items.map((x, i) => `<article class="fco" id="co-${x.slug}">
    <div class="fco__head"><span class="fco__n">${String(i + 1).padStart(2, '0')}</span><div><small>${e(x.co.hero.label)}</small><h3>${e(x.co.company)}</h3></div></div>
    <p class="fco__reason">${e(x.reason)}</p>
    <ul class="joblist" data-co="${x.slug}">${featureJobsHtml(f.slug, x.slug, x.jobs, base)}</ul>
    <p class="fco__more"><a class="btn btn--line" href="${base}/pickup/company/${x.slug}/?utm_source=${src}&utm_medium=feature&utm_campaign=${f.slug}">${e(x.co.companyShort)}の特集ページを見る</a></p>
  </article>`).join('');
  const brand = m ? `<a class="brand" href="${esc(f.site.url)}">エージェントベスト<small>${e(f.site.name)}</small></a>`
    : `<a class="brand" href="/">エージェントベスト<small>おすすめ企業特集</small></a>`;
  const related = m ? { href: f.site.url, label: `${f.site.name}のトップへ` } : (f.site ? { href: f.site.url, label: f.site.label } : null);
  const refresh = m ? `<script>
fetch('${SITE}/pickup/${f.slug}/jobs.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{if(!d)return;
const E=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const B='${SITE}',Q='?utm_source=pickup&utm_medium=feature&utm_campaign=${f.slug}',N=${FEATURE_SHOW};
document.querySelectorAll('ul.joblist[data-co]').forEach(u=>{const c=u.dataset.co,j=d.companies[c];if(!j)return;
const li=j.slice(0,N).map(x=>{const i='<b>'+E(x.t)+'</b><span class="sal">'+E(x.s)+'</span>';return x.id?'<li><a href="'+B+'/job/'+x.id+'/'+Q+'">'+i+'</a></li>':'<li><div class="j">'+i+'</div></li>'}).join('');
const more=j.length>N?'<li class="more"><a href="'+B+'/pickup/company/'+c+'/#jobs">ほか'+(j.length-N)+'件のポジションを見る</a></li>':'';
u.innerHTML=j.length?li+more:'<li class="none"><a href="'+B+'/pickup/company/'+c+'/#jobs">募集中のポジションは企業の特集ページでご覧ください</a></li>';});
}).catch(()=>{});
</script>` : '';
  return head(f.title, f.description, canonical, style, IMG(h.img, 1200)) + `<header class="top"><div class="wrap">
  ${brand}
  ${cta('無料で相談する')}
</div></header>
<section class="hero" style="min-height:78vh;background-image:url('${IMG(h.img, 2000)}')"><div class="wrap">
  <p class="label">${e(h.label)}</p>
  <h1>${e(h.h1)}</h1>
  <p>${e(h.lead)}</p>
  <div class="ctas">${cta(h.cta || '無料で相談する')}<a class="btn btn--line" href="#companies">掲載企業を見る</a></div>
  <div class="strip"><div><b>${items.length}<small>社</small></b><span>掲載企業</span></div><div><b>${nJobs}<small>件</small></b><span>テーマに合うポジション</span></div><div><b>${e((f.strip3 || {}).b || "成長中")}</b><span>${e((f.strip3 || {}).span || "の会社を中心に")}</span></div><div><b>無料</b><span>ご相談</span></div></div>
  <p class="cap">写真はイメージです</p>
</div></section>
<section class="sec"><div class="wrap split">
  <div class="ph"><img src="${IMG(aboutImg, 1000)}" alt="${e(ab.alt || 'イメージ')}" loading="lazy"></div>
  <div><div class="chapter"><i>01</i><span>ABOUT</span></div><h2>${e(ab.h2 || 'この特集について')}</h2>
  <p class="lead" style="margin-bottom:24px">${e(ab.lead || '')}</p><ul class="points">${points.map(p => `<li><b>${e(p.b)}</b><p>${e(p.p)}</p></li>`).join('')}</ul></div>
</div></section>
<section class="sec sec--alt" id="companies"><div class="wrap">
  <div class="chapter"><i>02</i><span>COMPANIES</span></div><h2>${e(f.companiesH2 || '掲載している企業')}</h2>
  <p class="lead">${e(f.companiesLead || '気になる会社があれば、どのポジションが合うかから一緒に考えます。')}</p>
  <div class="fcos">${cards}</div>
</div></section>
<section class="sec"><div class="wrap">
  <div class="chapter"><i>03</i><span>WHY AGENT BEST</span></div><h2>エージェントベストに相談する理由</h2>
  ${why.replace('{{AREA}}', esc(f.area || DEFAULT_AREA)).replace('{{COMPANY}}', 'ひとつの会社')}
</div></section>
<section class="sec sec--alt"><div class="wrap" style="max-width:860px">
  <div class="chapter"><i>04</i><span>FAQ</span></div><h2>よくある質問</h2>
  ${(f.faq || []).map(q => `<details><summary>${e(q.q)}</summary><p>${e(q.a)}</p></details>`).join('')}
  <details><summary>ここに載っていない会社も相談できますか？</summary><p>はい。この特集に載せているのは、おすすめの会社の一部です。ほかの会社の求人も含めて、条件に合うものを一緒に探します。</p></details>
  <details><summary>相談したら必ず応募しないといけませんか？</summary><p>いいえ。話を聞いてから決めていただいて大丈夫です。</p></details>
</div></section>
<section class="closing" style="background-image:url('${IMG(closeImg, 2000)}')"><div class="wrap">
  <h2>まずは、話を聞いてみませんか。</h2><p>どの会社・どのポジションが合うか、今の経歴でどう見られるかからお話しします。相談は無料です。</p>
  ${cta('無料で相談する（オンライン30分）')}
</div></section>
${footer('掲載している内容は、各社の公開求人票・公式サイト（2026年11月時点）にもとづきます。求人は毎朝更新し、掲載が終わったものは外しています。最新の条件はご相談時にご確認ください。写真はイメージで、各社とは関係ありません。', credits, related, base)}
${cta('無料で相談する', 'btn float')}
<style>
.fcos{display:grid;gap:24px}
.fco{background:var(--paper);border:1px solid var(--line);border-radius:4px;padding:32px 32px 28px}
.fco__head{display:flex;gap:20px;align-items:flex-start;margin-bottom:14px}
.fco__n{font-family:var(--serif);font-size:44px;line-height:1;color:var(--gold)}
.fco__head small{display:block;font-family:var(--mono);font-size:11px;letter-spacing:.16em;color:var(--ink-faint)}
.fco h3{font-family:var(--serif);font-size:clamp(20px,2.4vw,26px);line-height:1.4;margin:4px 0 0}
.fco__reason{color:var(--ink-soft);margin:0 0 20px;max-width:820px}
.fco .joblist li.more a,.fco .joblist li.none a{display:block;padding:14px 4px;font-size:14px;color:var(--gold);font-weight:700;text-decoration:none}
.fco__more{margin:20px 0 0}.fco__more .btn{padding:10px 22px;font-size:14px;color:var(--ink)}
@media (max-width:560px){.fco{padding:24px 18px 22px}.fco__n{font-size:34px}.fco__head{gap:14px}.joblist a,.joblist div.j{grid-template-columns:1fr}}
</style>
<script>document.addEventListener('click',ev=>{const a=ev.target.closest('a[data-consult]');if(a&&window.gtag)gtag('event','consult_click',{placement:a.dataset.consult});},true);</script>
${refresh}
</body>
</html>
`;
}

function readFeatures(root) {
  const dir = path.join(root, 'pickup-src', '_features');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    .sort((a, b) => (a.order || 99) - (b.order || 99));
}
function readCompanies(root) {
  const src = path.join(root, 'pickup-src'), cos = {};
  for (const f of fs.readdirSync(src).filter(f => f.endsWith('.json'))) { const d = JSON.parse(fs.readFileSync(path.join(src, f), 'utf8')); cos[d.slug] = d; }
  return cos;
}
function readParts(root) {
  const src = path.join(root, 'pickup-src');
  return {
    style: fs.readFileSync(path.join(src, '_style.html'), 'utf8'),
    why: fs.readFileSync(path.join(src, '_why.html'), 'utf8').split('-->').slice(1).join('-->').trim(),
  };
}

function indexPage(list, style, feats = []) {
  const canonical = `${SITE}/pickup/`;
  const title = 'おすすめ企業特集｜業績好調・成長中の企業を1社ずつ紹介｜エージェントベストジョブ転職';
  const desc = '業績好調・事業成長中の企業を中心に、エージェントベストがいまおすすめする会社を1社ずつ紹介します。仕事の中身・年収・選考の流れ・募集中のポジションを、公開情報をもとにまとめました。';
  /* 一覧のカードは写真を順番に変える（各社のヒーローは東京駅が多く、並べると同じ絵が続くため） */
  const POOL = ['1758095520684-99d5a1cc2768', '1779275859289-9bcf24ee065a', '1681489933902-bb3644b91d65', '1573164574572-cb89e39749b4', '1681505531034-8d67054e07f6', '1517048676732-d65bc937f952', '1606044466411-207a9a49711f'];
  const cards = list.map((x, i) => `<li><a class="pk" href="/pickup/company/${x.slug}/">
    <span class="pk__img" style="background-image:url('${IMG(POOL[i % POOL.length], 800)}')"></span>
    <span class="pk__body"><small>${e(x.label)}</small><b>${e(x.company)}</b><span>${e(plain(x.h1))}</span><em>募集中のポジション ${x.jobs}件</em></span>
  </a></li>`).join('');
  return head(title, desc, canonical, style, IMG('1758095520684-99d5a1cc2768', 1200)) + `<header class="top"><div class="wrap">
  <a class="brand" href="/">エージェントベスト<small>おすすめ企業特集</small></a>
  <a class="btn" href="https://calendly.com/r_matsuoka?utm_source=pickup&utm_campaign=index" target="_blank" rel="noopener" data-consult="pickup-index">無料で相談する</a>
</div></header>
<section class="hero" style="min-height:62vh;background-image:url('${IMG('1758095520684-99d5a1cc2768', 2000)}')"><div class="wrap">
  <p class="label">AGENT BEST ／ PICKUP</p>
  <h1>業績好調・成長中の、<br>${list.length}社のおすすめ企業特集。</h1>
  <p>業績が好調な会社や、事業を伸ばしている会社を中心に、エージェントベストがいまおすすめしたい企業を1社ずつまとめました。仕事の中身、年収の仕組み、選考の流れ、募集中のポジションまで、公開情報をもとに紹介しています。</p>
  <p class="cap">写真はイメージです</p>
</div></section>
${feats.length ? `<section class="sec"><div class="wrap">
  <div class="chapter"><i>01</i><span>THEMES</span></div><h2>テーマ別のおすすめ企業特集</h2>
  <p class="lead">職種やキャリアの方向ごとに、合う会社だけを集めました。</p>
  <ul class="pklist">${feats.map((f, i) => `<li><a class="pk" href="/pickup/${f.slug}/">
    <span class="pk__img" style="background-image:url('${IMG(f.hero.img, 800)}')"></span>
    <span class="pk__body"><small>${e(f.hero.label)}</small><b>${e(f.name)}</b><span>${e(plain(f.hero.h1))}</span><em>掲載企業 ${f.count}社</em></span>
  </a></li>`).join('')}</ul>
</div></section>
<section class="sec sec--alt">` : '<section class="sec">'}<div class="wrap">
  <div class="chapter"><i>${feats.length ? '02' : '01'}</i><span>COMPANIES</span></div><h2>企業の一覧</h2>
  <p class="lead">気になる会社があれば、どのポジションが合うかから一緒に考えます。</p>
  <ul class="pklist">${cards}</ul>
</div></section>
<style>
.pklist{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
@media (max-width:900px){.pklist{grid-template-columns:repeat(2,1fr)}}@media (max-width:560px){.pklist{grid-template-columns:1fr}}
.pk{display:flex;flex-direction:column;height:100%;text-decoration:none;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:4px;overflow:hidden;transition:transform .15s,border-color .15s}
.pk:hover{transform:translateY(-2px);border-color:var(--gold)}
.pk__img{display:block;aspect-ratio:16/9;background:#0b1020 center/cover no-repeat}
.pk__body{display:flex;flex-direction:column;gap:6px;padding:18px 18px 20px}
.pk__body small{font-family:var(--mono);font-size:11px;letter-spacing:.14em;color:var(--ink-faint)}
.pk__body b{font-size:17px;line-height:1.5}
.pk__body span{font-size:14px;color:var(--ink-soft);line-height:1.7}
.pk__body em{font-style:normal;font-size:13px;color:var(--gold);font-weight:700;margin-top:auto}
</style>
${footer('掲載している内容は、各社の公開求人票・公式サイト（2026年11月時点）にもとづきます。最新の条件はご相談時にご確認ください。写真はイメージで、各社とは関係ありません。', 'Dmitrijs Tokyo／Ryusei Machida／Sho Shimada／Christina @ wocintechchat.com／Amina Atar／Dylan Gillis／Marek Okon', null)}
</body>
</html>
`;
}

/* root＝リポジトリ直下、live＝掲載中の求人IDの Set。sitemap 用の URL を返す */
function build(root, live) {
  const src = path.join(root, 'pickup-src');
  if (!fs.existsSync(src)) return { urls: [] };
  const style = fs.readFileSync(path.join(src, '_style.html'), 'utf8');
  const why = fs.readFileSync(path.join(src, '_why.html'), 'utf8').split('-->').slice(1).join('-->').trim();
  const files = fs.readdirSync(src).filter(f => f.endsWith('.json')).sort();
  const list = [], keep = new Set();
  let unlinked = 0;
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(src, f), 'utf8'));
    const { html, jobs } = companyPage(d, style, why, live);
    unlinked += (html.match(/<div class="j">/g) || []).length;
    const dir = path.join(root, 'pickup', 'company', d.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
    keep.add(d.slug);
    list.push({ slug: d.slug, company: d.company, label: d.hero.label, h1: d.hero.h1, img: d.hero.img, jobs });
  }
  /* データを消した会社のページは消す */
  const cdir = path.join(root, 'pickup', 'company');
  for (const s of fs.readdirSync(cdir)) if (!keep.has(s)) fs.rmSync(path.join(cdir, s), { recursive: true, force: true });
  /* テーマ別のおすすめ企業特集（/pickup/<theme>/）と、特化サイトが読む jobs.json */
  const cos = readCompanies(root), feats = [];
  for (const f of readFeatures(root)) {
    if (f.slug === 'company') throw new Error('特集の slug に company は使えません');
    const items = featureItems(f, cos, live);
    if (items.length < 2) { console.warn(`  特集 ${f.slug}: 載せる会社が2社未満なので作りません`); continue; }
    const dir = path.join(root, 'pickup', f.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), featurePage(f, items, style, why), 'utf8');
    fs.writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify({ updated: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), companies: Object.fromEntries(items.map(x => [x.slug, x.jobs])) }), 'utf8');
    feats.push({ slug: f.slug, name: f.name, hero: f.hero, count: items.length, jobs: items.reduce((n, x) => n + x.jobs.length, 0) });
  }
  /* データを消した特集は消す（company/ は企業LP） */
  for (const s of fs.readdirSync(path.join(root, 'pickup'))) {
    const p = path.join(root, 'pickup', s);
    if (s !== 'company' && fs.statSync(p).isDirectory() && !feats.some(f => f.slug === s)) fs.rmSync(p, { recursive: true, force: true });
  }
  fs.writeFileSync(path.join(root, 'pickup', 'index.html'), indexPage(list, style, feats), 'utf8');
  console.log(`厳選特集（pickup/）を書き出しました: 企業LP ${list.length}社（当サイト未掲載の求人 ${unlinked}件は文字だけ・掲載終了の求人は外した）・テーマ別特集 ${feats.map(f => `${f.slug} ${f.count}社/${f.jobs}件`).join('・') || 'なし'}`);
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  return { urls: [{ loc: `${SITE}/pickup/`, lastmod: today, pri: '0.8' }]
    .concat(feats.map(f => ({ loc: `${SITE}/pickup/${f.slug}/`, lastmod: today, pri: '0.8' })))
    .concat(list.map(x => ({ loc: `${SITE}/pickup/company/${x.slug}/`, lastmod: today, pri: '0.8' }))) };
}

/* 特化サイトに置く入口ページを書き出す（tools/pickup-mirror.js から呼ぶ）。live＝掲載中の求人ID */
function mirror(root, slug, live) {
  const { style, why } = readParts(root);
  const f = readFeatures(root).find(x => x.slug === slug);
  if (!f) throw new Error(`特集 ${slug} がありません`);
  if (!f.site) throw new Error(`特集 ${slug} に site がありません`);
  const items = featureItems(f, readCompanies(root), live);
  return { f, html: featurePage(f, items, style, why, { mirror: true }) };
}

module.exports = { build, mirror, readFeatures };
