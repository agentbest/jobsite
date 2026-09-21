// 企業ページの生成（static-pages.js から呼ばれる）
//
//   company/<企業ID>/index.html … 企業1社ずつのページ（会社概要・基本情報・募集中の求人・Organization 構造化データ）
//   company/index.html          … 企業一覧の入口（業界リンク＋募集中の企業。絞り込みは data/companies-list.json を fetch）
//   company/industry/<中code>/  … 業種（中分類）ごとの全社リスト。company/industry/b<大code>/ は大分類
//
// なぜ作るか（2026-09-21・松岡さんの方針）:
//   求人ページは Airtable の鏡で毎朝入れ替わる「流動的なもの」。検索エンジンの評価はそこに期待しない。
//   企業ページは data/companies.json（求人DB（企業）の全社）から作り、**求人が0件になっても消さない**。
//   URL を固定して蓄積し、「◯◯ 年収」「◯◯ 評判」のような社名検索の受け皿にする。
//   求人は企業ページの中の「募集中の求人」欄として付け外しされるだけ。
//
// ⚠ 企業ページの URL は /company/<Airtable のレコードID>/。レコードを作り直すと URL が変わる（評価がリセットされる）。
//    同じ社名のレコードが複数あるときは fetch-companies.js が1社にまとめ、他のレコードIDは aliases に残す。
// ⚠ 生成物（company/）は直接編集しない。次の rebuild で消える。
const fs = require('fs'), path = require('path');

const CO_JOBS_MAX = 30;      /* 企業ページに並べる求人の上限（残りは検索画面へ） */
const CO_RELATED = 12;       /* 「同じ業界の企業」の件数 */
const SIZE_ORDER = ['〜50名', '51〜100名', '101〜300名', '301〜1,000名', '1,001名以上'];

const coPath = c => `/company/${encodeURIComponent(c.id)}/`;

/* 「2018年12月20日（創立1979年9月）」→ 2018-12-20 / 「1979年9月」→ 1979-09 / 「1979年」→ 1979。読めなければ null */
function foundingDate(s){
  const m = String(s || '').match(/(\d{4})\s*年(?:\s*(\d{1,2})\s*月)?(?:\s*(\d{1,2})\s*日)?/);
  if(!m) return null;
  const y = m[1], mo = m[2] && m[2].padStart(2, '0'), d = m[3] && m[3].padStart(2, '0');
  return d && mo ? `${y}-${mo}-${d}` : mo ? `${y}-${mo}` : y;
}

function build(root, ctx, full, H){
  const { esc, plain, fmtSalary, cardHtml, logoHtml, sortForList, writePage, syncDir, PREF_SLUG, SITE, jobPath } = H;
  const { C } = ctx;
  const coPathFile = path.join(root, 'data', 'companies.json');
  if(!fs.existsSync(coPathFile)){
    console.log('data/companies.json が無いので、企業ページは作りません（node fetch-companies.js）。');
    return { coOf: () => null, urls: [] };
  }
  const allCompanies = JSON.parse(fs.readFileSync(coPathFile, 'utf8'));
  const tpl = fs.readFileSync(path.join(root, 'company-template.html'), 'utf8');
  /* 会社概要も事業内容も無い会社はページを作らない（社名と住所だけの薄いページを量産すると、検索エンジンの評価がサイト全体で下がる）。
     企業DBは1万社に増やす途中（company-db-10k-goal）なので、概要が入っていない会社が今後増える。概要が入れば次のビルドで自動的にページができる。
     ⚠ 求人がある会社は概要が無くてもページを作る（求人ページからのリンク先が要るため）。 */


  /* ロゴは求人と同じ data/logos.json（企業名 → パス）から。無い会社は頭文字タイル */
  const logoFile = path.join(root, 'data', 'logos.json');
  const logos = fs.existsSync(logoFile) ? JSON.parse(fs.readFileSync(logoFile, 'utf8')) : {};
  const PREFS = Object.keys(PREF_SLUG);
  const byId = new Map(), byName = new Map();
  allCompanies.forEach(c => {
    c.jobs = [];
    c.company = c.name;                                   /* logoHtml / coInitial が j.company を見るため */
    if(logos[c.name] && fs.existsSync(path.join(root, logos[c.name]))) c.logo = logos[c.name];
    /* 本社都道府県が空でも住所が「山形県…」なら県は分かる */
    if(!c.pref && c.addr){ const p = PREFS.find(p => c.addr.startsWith(p)); if(p) c.pref = p; }
    byId.set(c.id, c); (c.aliases || []).forEach(a => byId.set(a, c));
    if(!byName.has(c.name)) byName.set(c.name, c);
  });
  /* 求人 → 企業。会社リンクのレコードID（companyId）が正。無い古いデータは社名の完全一致で引く */
  const coOf = j => (j.companyId && byId.get(j.companyId)) || (j.company && byName.get(j.company)) || null;
  const orphan = new Set();
  full.forEach(j => { const c = coOf(j); if(c) c.jobs.push(j); else if(j.company) orphan.add(j.company); });
  const companies = allCompanies.filter(c => c.overview || c.biz || c.jobs.length);
  const thin = allCompanies.length - companies.length;
  if(thin) console.log(`会社概要・事業内容が空で求人も無い ${thin}社は企業ページを作りません（Airtable に概要が入れば次のビルドで作られます）`);
  if(orphan.size) console.log(`⚠ 企業DBに無い会社の求人 ${orphan.size}社（企業ページにリンクしません）: ${[...orphan].slice(0, 10).join(', ')}${orphan.size > 10 ? ' …' : ''}`);

  const chip = (t, cls) => t ? `<span class="tag${cls ? ' ' + cls : ''}">${esc(t)}</span>` : '';
  const salRange = c => {
    const mins = c.jobs.map(j => j.salaryMin).filter(v => v != null), maxs = c.jobs.map(j => j.salaryMax).filter(v => v != null);
    if(!mins.length && !maxs.length) return '';
    const lo = mins.length ? Math.min(...mins) : null, hi = maxs.length ? Math.max(...maxs) : null;
    return lo != null && hi != null ? `${lo}〜${hi}万円` : lo != null ? `${lo}万円〜` : `〜${hi}万円`;
  };
  const listedLabel = c => c.listed === '上場' ? (c.market && c.market !== '非上場' ? c.market : '上場') : (c.listed || '');
  const byIndustry = new Map(), byBig = new Map();
  companies.forEach(c => {
    (c.industry || []).forEach(i => { if(!byIndustry.has(i)) byIndustry.set(i, []); byIndustry.get(i).push(c); });
    (c.industryBig || []).forEach(i => { if(!byBig.has(i)) byBig.set(i, []); byBig.get(i).push(c); });
  });
  const rank = (a, b) => b.jobs.length - a.jobs.length || a.name.localeCompare(b.name, 'ja');
  const consultUrl = c => { const p = new URLSearchParams(); p.set('a1', `求人サイトを見て相談したいこと：${c.name}について`); return C.CONSULT_URL + (C.CONSULT_URL.includes('?') ? '&' : '?') + p.toString(); };

  /* ---------- 企業1社のページ ---------- */
  function companyPage(c){
    const canon = SITE + coPath(c);
    const n = c.jobs.length;
    const jobs = sortForList(c.jobs);
    const sal = salRange(c);
    const url = (typeof c.url === 'string' && /^https?:\/\//.test(c.url)) ? c.url : null;
    const row = (k, v) => v ? `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>` : '';
    const meta = [
      row('本社所在地', c.addr || c.pref),
      row('設立', c.founded),
      row('資本金', c.capital),
      row('代表者', c.ceo),
      row('従業員数', c.employees),
      row('上場区分', listedLabel(c)),
      row('業界', (c.industry || []).join('、')),
      url ? `<dt>ホームページ</dt><dd><a href="${esc(url)}" target="_blank" rel="noopener nofollow">${esc(url.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a></dd>` : '',
    ].join('');
    /* 同じ業界の企業（中分類 → 足りなければ大分類）。募集中の求人が多い順 */
    let rel = [];
    const pick = pool => (pool || []).filter(x => x !== c && !rel.includes(x)).sort(rank);
    (c.industry || []).forEach(i => { rel = rel.concat(pick(byIndustry.get(i))); });
    if(rel.length < 4) (c.industryBig || []).forEach(i => { rel = rel.concat(pick(byBig.get(i))); });
    rel = rel.slice(0, CO_RELATED);
    const jobsSec = n
      ? `<div class="joblist">${jobs.slice(0, CO_JOBS_MAX).map(j => cardHtml(ctx, j)).join('')}</div>
         ${n > CO_JOBS_MAX ? `<div class="lp__all"><a href="/?q=${encodeURIComponent(c.name)}">残り${(n - CO_JOBS_MAX).toLocaleString()}件を含むすべての求人を見る →</a></div>` : ''}`
      : `<div class="co-empty"><b>現在、掲載中の公開求人はありません。</b><br>非公開で募集している場合や、今後の募集を先にご案内できる場合があります。${esc(c.name)}への転職を考えている方は、下のフォームまたはLINEからご相談ください。</div>`;
    const main = `<div class="co-head">${logoHtml(c, 'jrow__logo--lg')}<div class="co-head__txt"><h1>${esc(c.name)}</h1>
        ${c.tagline ? `<p class="co-head__tag">${esc(c.tagline)}</p>` : ''}
        <div class="co-head__chips">${chip((c.industry || [])[0])}${chip(c.pref)}${chip(c.size)}${chip(listedLabel(c) === '非上場' ? '' : listedLabel(c), 'tag--cat')}</div></div></div>
      <ul class="lp__stats"><li><b>${n.toLocaleString()}</b>件 募集中</li>${sal ? `<li>想定年収 <b>${esc(sal)}</b></li>` : ''}${c.employeeCount ? `<li>従業員数 <b>${c.employeeCount.toLocaleString()}</b>名</li>` : ''}</ul>
      ${c.overview ? `<div class="pd-sec"><h2>会社概要</h2><p class="co-txt">${esc(c.overview)}</p></div>` : ''}
      ${c.biz ? `<div class="pd-sec"><h2>事業内容</h2><p class="co-txt">${esc(c.biz)}</p></div>` : ''}
      ${meta ? `<div class="pd-sec"><h2>基本情報</h2><dl class="pd-meta">${meta}</dl></div>` : ''}
      <div class="pd-sec" id="jobs"><h2>${esc(c.name)}の求人（${n.toLocaleString()}件）</h2>${jobsSec}</div>
      ${rel.length ? `<div class="pd-sec"><h2>同じ業界の企業</h2><div class="lp__pills">${rel.map(x => `<a href="${esc(coPath(x))}">${esc(x.name)}<b>${x.jobs.length}</b></a>`).join('')}</div>
        <div class="pd-more">${(c.industryCode || [])[0] != null ? `<a href="${esc(indPath(c.industryCode[0]))}">${esc((c.industry || [])[0])}の企業一覧</a>` : ''}${(c.industryBigCode || [])[0] != null ? `<a href="${esc(bigPath(c.industryBigCode[0]))}">${esc((c.industryBig || [])[0])}の企業一覧</a>` : ''}</div></div>` : ''}
      <div class="lp__cta"><h2>${esc(c.name)}への転職を相談する</h2><p>この企業の求人の背景や選考の傾向など、公開情報にないところからお話しします。掲載していない非公開求人がある場合もあります。まだ転職を決めていない段階でもかまいません。ご利用は無料です。</p>
        <div class="pd-cta"><a class="btn-apply" href="/${esc(C.APPLY_PAGE)}" data-apply="">転職支援に申し込む（無料）</a><a class="btn-ghost" href="${esc(consultUrl(c))}" target="_blank" rel="noopener">まず話だけ聞いてみる</a><a class="line-btn" href="${esc(C.LINE_ADD_URL)}" target="_blank" rel="noopener noreferrer" data-line-cta="static-company">${C.LINE_ICON}<span>LINEで相談する</span></a></div></div>
      <p class="co-note">企業情報は公開情報をもとに当社が作成しています。求人は毎日更新され、募集が終了した求人は表示されなくなります。内容に誤りがある場合は<a href="https://www.agent-best.net/contact" target="_blank" rel="noopener">お問い合わせ</a>からお知らせください。</p>`;
    const crumb = `<a href="/">ホーム</a><span class="sep">›</span><a href="/company/">企業一覧</a><span class="sep">›</span><span class="cur">${esc(c.name)}</span>`;
    const org = { '@type': 'Organization', name: c.name, url: url || canon, description: plain(c.overview || c.biz, 300) || undefined };
    if(c.addr || c.pref) org.address = Object.assign({ '@type': 'PostalAddress', addressCountry: 'JP' }, c.pref ? { addressRegion: c.pref } : {}, c.addr ? { streetAddress: c.addr } : {});
    const fd = foundingDate(c.founded); if(fd) org.foundingDate = fd;
    if(c.employeeCount) org.numberOfEmployees = { '@type': 'QuantitativeValue', value: c.employeeCount };
    if(c.logo) org.logo = `${SITE}/${c.logo}`;
    const ld = { '@context': 'https://schema.org', '@graph': [
      org,
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'ホーム', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: '企業一覧', item: SITE + '/company/' },
        { '@type': 'ListItem', position: 3, name: c.name, item: canon } ] },
    ]};
    const title = `${c.name}の会社概要・転職/求人情報（募集中${n}件） - ミドル・ハイクラス転職 求人検索`;
    const descHead = plain(c.overview || c.biz, 90);
    const desc = `${descHead ? descHead + ' ' : ''}${c.name}の会社概要（${[c.pref, listedLabel(c), c.size && `従業員${c.size}`].filter(Boolean).join('・')}）と募集中の求人${n}件${sal ? `（想定年収${sal}）` : ''}。転職支援は無料です。`;
    return tpl
      .replace('__TITLE__', () => esc(title.length > 70 ? `${c.name}の会社概要・求人（${n}件） - 求人検索` : title))
      .replace(/__OGTITLE__/g, () => esc(`${c.name}の会社概要・転職/求人情報（募集中${n}件）`))
      .replace(/__DESC__/g, () => esc(desc))
      .replace(/__CANON__/g, () => esc(canon))
      .replace('__JSONLD__', () => JSON.stringify(ld).replace(/<\//g, '<\\/'))
      .replace('__CRUMB__', () => crumb)
      .replace('__MAIN__', () => main)
      .replace('__SCRIPT__', '');
  }

  /* ---------- 企業一覧（company/）と業界ページ（company/industry/<code>/） ----------
     企業DBは1万社に増やす途中（company-db-10k-goal）なので、全社を1枚に静的に並べる作りにはしない。
       company/                      … 入口。絞り込みは data/companies-list.json（軽い表）を fetch して JS で引く。
                                        静的には業界（大分類→中分類）へのリンクと、募集中の企業だけを並べる（クローラーの導線）
       company/industry/<中code>/    … 中分類ごとの全社リスト（静的・都道府県などで JS 絞り込み）。検索エンジンが全社に辿れるのはここ
       company/industry/b<大code>/   … 大分類のページ。中分類へのリンク＋上位 BIG_LIST_MAX 社
     ⚠ URL は業界マスタの 中code / 大code。コードを変えると URL が変わる。 */
  const BIG_LIST_MAX = 300;
  const indPath = code => `/company/industry/${encodeURIComponent(code)}/`;
  const bigPath = code => `/company/industry/b${encodeURIComponent(code)}/`;
  const byMid = new Map(), byBigCode = new Map();     /* code → { name, list } */
  const midToBig = new Map();
  companies.forEach(c => {
    (c.industry || []).forEach((n, i) => { const code = (c.industryCode || [])[i]; if(code == null) return;
      if(!byMid.has(code)) byMid.set(code, { name: n, list: [] }); byMid.get(code).list.push(c);
    });
    (c.industryMidBig || []).forEach(([mid, big]) => { if(mid != null && big != null && !midToBig.has(mid)) midToBig.set(mid, big); });
    (c.industryBig || []).forEach((n, i) => { const code = (c.industryBigCode || [])[i]; if(code == null) return;
      if(!byBigCode.has(code)) byBigCode.set(code, { name: n, list: [] }); byBigCode.get(code).list.push(c); });
  });
  const bigsSorted = [...byBigCode.entries()].sort((x, y) => y[1].list.length - x[1].list.length);
  const midsOf = bc => [...byMid.entries()].filter(([code]) => midToBig.get(code) === bc).sort((x, y) => y[1].list.length - x[1].list.length);
  const rowHtml = c => `<li data-p="${esc(c.pref || '')}" data-s="${esc(c.size || '')}" data-l="${esc(c.listed || '')}" data-j="${c.jobs.length}"><div class="co-list__txt"><a class="co-list__name" href="${esc(coPath(c))}">${esc(c.name)}</a><div class="co-list__meta">${esc([(c.industry || [])[0], c.pref, c.size, listedLabel(c) === '非上場' ? '' : listedLabel(c)].filter(Boolean).join(' · '))}</div></div><span class="co-list__n">${c.jobs.length ? `<b>${c.jobs.length}</b>件募集中` : '募集なし'}</span></li>`;
  const ctaHtml = placement => `<div class="lp__cta"><h2>気になる企業が見つからないときは</h2><p>掲載していない企業・非公開求人も含めて、希望に近いところを個別にお探しします。まだ転職を決めていない段階でもかまいません。ご利用は無料です。</p>
        <div class="pd-cta"><a class="btn-apply" href="/${esc(C.APPLY_PAGE)}" data-apply="">転職支援に申し込む（無料）</a><a class="btn-ghost" href="${esc(C.CONSULT_URL)}" target="_blank" rel="noopener">まず話だけ聞いてみる</a><a class="line-btn" href="${esc(C.LINE_ADD_URL)}" target="_blank" rel="noopener noreferrer" data-line-cta="${esc(placement)}">${C.LINE_ICON}<span>LINEで相談する</span></a></div></div>`;
  const PREFS_ALL = PREFS.concat('海外');
  const opt = (arr, label) => `<option value="">${label}</option>` + arr.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  /* 行の絞り込み（社名・都道府県・企業規模・上場・募集中）。静的に並べた <li> の data-* を見る。業界ページで使う */
  const listScript = `<script>
(function(){
  var PAGE=100, shown=PAGE;
  var pref=document.getElementById('cf-pref'), size=document.getElementById('cf-size'), listed=document.getElementById('cf-listed'), jobs=document.getElementById('cf-jobs'), q=document.getElementById('cf-q');
  var rows=[].slice.call(document.querySelectorAll('#co-list > li')), nEl=document.getElementById('cf-n'), more=document.getElementById('cf-more');
  if(!rows.length||!nEl) return;
  function norm(s){ return (s||'').toLowerCase().replace(/[\\u30a1-\\u30f6]/g, function(c){ return String.fromCharCode(c.charCodeAt(0)-0x60); }).replace(/\\s+/g,''); }
  function apply(){
    var kw=q?norm(q.value):'', hit=0;
    rows.forEach(function(li){
      var ok=(!kw || (li._n || (li._n=norm(li.querySelector('.co-list__name').textContent))).indexOf(kw)>=0)
        && (!pref||!pref.value || li.getAttribute('data-p')===pref.value)
        && (!size||!size.value || li.getAttribute('data-s')===size.value)
        && (!listed||!listed.value || li.getAttribute('data-l')===listed.value)
        && (!jobs||!jobs.checked || +li.getAttribute('data-j')>0);
      li.hidden = !ok || hit>=shown; if(ok) hit++;
    });
    nEl.textContent=hit.toLocaleString();
    if(more) more.style.display = hit>shown ? '' : 'none';
  }
  function reset(){ shown=PAGE; apply(); }
  [q,pref,size,listed,jobs].forEach(function(el){ if(el) el.addEventListener(el.tagName==='INPUT'&&el.type==='search'?'input':'change', reset); });
  if(more) more.querySelector('button').addEventListener('click', function(){ shown+=PAGE; apply(); });
  var p=new URLSearchParams(location.search); if(pref&&p.get('pref')) pref.value=p.get('pref');
  reset();
})();
</script>`;
  const filterForm = (prefs, sizes) => `<form class="co-filter" id="cf" onsubmit="return false">
        <input type="search" id="cf-q" placeholder="社名で探す" aria-label="社名で探す" autocomplete="off">
        <select id="cf-pref" aria-label="本社">${opt(prefs, '本社：すべて')}</select>
        <select id="cf-size" aria-label="企業規模">${opt(sizes, '企業規模：すべて')}</select>
        <select id="cf-listed" aria-label="上場区分">${opt(['上場', '非上場'], '上場区分：すべて')}</select>
        <label><input type="checkbox" id="cf-jobs"> 募集中の企業だけ</label>
      </form>`;
  const prefsIn = list => PREFS_ALL.filter(p => list.some(c => c.pref === p));
  const sizesIn = list => SIZE_ORDER.filter(sz => list.some(c => c.size === sz));
  const listBlock = (list, max) => `<p class="co-count"><b id="cf-n">${list.length.toLocaleString()}</b>社</p>
      <ul class="co-list" id="co-list">${list.slice(0, max || list.length).map(rowHtml).join('\n')}</ul>
      <div class="co-more" id="cf-more"><button type="button">さらに表示する</button></div>`;
  const pageHtml = (o) => {
    /* o: { rel, title, ogTitle, desc, h1, crumbs:[[name,href]], main, script } */
    const canon = `${SITE}${o.rel}`;
    const trail = [['ホーム', '/']].concat(o.rel === '/company/' ? [['企業一覧', '/company/']] : [['企業一覧', '/company/']].concat(o.crumbs));
    const crumb = trail.map(([nm, href], i, a) => i === a.length - 1 ? `<span class="cur">${esc(nm)}</span>` : `<a href="${esc(href)}">${esc(nm)}</a><span class="sep">›</span>`).join('');
    const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: o.h1, url: canon, description: o.desc };
    return tpl
      .replace('__TITLE__', () => esc(o.title))
      .replace(/__OGTITLE__/g, () => esc(o.ogTitle || o.h1))
      .replace(/__DESC__/g, () => esc(o.desc))
      .replace(/__CANON__/g, () => esc(canon))
      .replace('__JSONLD__', () => JSON.stringify(ld).replace(/<\//g, '<\\/'))
      .replace('__CRUMB__', () => crumb)
      .replace('__MAIN__', () => o.main)
      .replace('__SCRIPT__', () => o.script || '');
  };

  /* 入口 company/ */
  function indexPage(){
    const list = companies.slice().sort(rank);
    const withJobs = list.filter(c => c.jobs.length);
    const indNav = bigsSorted.map(([bc, b]) => `<a href="${esc(bigPath(bc))}">${esc(b.name)}<b>${b.list.length.toLocaleString()}</b></a>`).join('');
    const main = `<h1>企業一覧<small style="font-size:.7em;color:var(--ink-3);font-weight:700;margin-left:8px">${list.length.toLocaleString()}社</small></h1>
      <p class="lp__lead">当社が扱う企業の会社概要と募集中の求人をまとめています。求人が出ていない企業も、非公開で募集している場合や今後の募集をご案内できる場合があります。</p>
      <ul class="lp__stats"><li><b>${list.length.toLocaleString()}</b>社</li><li><b>${withJobs.length.toLocaleString()}</b>社が募集中</li><li><b>${list.filter(c => c.listed === '上場').length.toLocaleString()}</b>社が上場企業</li></ul>
      <nav class="lp__nav" aria-label="業界で探す"><p>業界で探す</p><div class="lp__pills">${indNav}</div></nav>
      <div class="pd-sec"><h2>社名・本社・企業規模で探す</h2>
        <form class="co-filter" id="cf" onsubmit="return false">
          <input type="search" id="cf-q" placeholder="社名で探す" aria-label="社名で探す" autocomplete="off">
          <select id="cf-ind" aria-label="業界">${opt(bigsSorted.map(([, b]) => b.name), '業界：すべて')}</select>
          <select id="cf-pref" aria-label="本社">${opt(prefsIn(list), '本社：すべて')}</select>
          <select id="cf-size" aria-label="企業規模">${opt(sizesIn(list), '企業規模：すべて')}</select>
          <select id="cf-listed" aria-label="上場区分">${opt(['上場', '非上場'], '上場区分：すべて')}</select>
          <label><input type="checkbox" id="cf-jobs"> 募集中の企業だけ</label>
        </form>
        <p class="co-count" id="cf-status" hidden><b id="cf-n">0</b>社</p>
        <ul class="co-list" id="cf-list" hidden></ul>
        <div class="co-more" id="cf-more" hidden><button type="button">さらに表示する</button></div>
      </div>
      <div class="pd-sec" id="hiring"><h2>募集中の企業（${withJobs.length.toLocaleString()}社）</h2>
        <ul class="co-list">${withJobs.map(rowHtml).join('\n')}</ul></div>
      ${ctaHtml('static-company-index')}`;
    /* 絞り込みは全社ぶんの軽い表（data/companies-list.json）を、条件が触られたときに1回だけ取りに行く */
    const script = `<script>
(function(){
  var PAGE=100, shown=PAGE, data=null, loading=false;
  var q=document.getElementById('cf-q'), ind=document.getElementById('cf-ind'), pref=document.getElementById('cf-pref'), size=document.getElementById('cf-size'), listed=document.getElementById('cf-listed'), jobs=document.getElementById('cf-jobs');
  var status=document.getElementById('cf-status'), nEl=document.getElementById('cf-n'), list=document.getElementById('cf-list'), more=document.getElementById('cf-more'), hiring=document.getElementById('hiring');
  function norm(s){ return (s||'').toLowerCase().replace(/[\\u30a1-\\u30f6]/g, function(c){ return String.fromCharCode(c.charCodeAt(0)-0x60); }).replace(/\\s+/g,''); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function active(){ return !!(norm(q.value)||ind.value||pref.value||size.value||listed.value||jobs.checked); }
  function render(){
    if(!active()){ status.hidden=true; list.hidden=true; more.hidden=true; hiring.hidden=false; return; }
    hiring.hidden=true;
    if(!data){ if(!loading){ loading=true; fetch('/data/companies-list.json').then(function(r){ return r.json(); }).then(function(d){ data=d; render(); }).catch(function(){ status.hidden=false; nEl.textContent='?'; }); } return; }
    var kw=norm(q.value), hit=[];
    for(var i=0;i<data.length;i++){ var r=data[i];
      if(kw && (r._n||(r._n=norm(r[1]))).indexOf(kw)<0) continue;
      if(ind.value && r[3]!==ind.value) continue;
      if(pref.value && r[4]!==pref.value) continue;
      if(size.value && r[5]!==size.value) continue;
      if(listed.value && r[6]!==listed.value) continue;
      if(jobs.checked && !r[7]) continue;
      hit.push(r); }
    status.hidden=false; nEl.textContent=hit.length.toLocaleString();
    list.hidden=false; list.innerHTML=hit.slice(0,shown).map(function(r){
      return '<li><div class="co-list__txt"><a class="co-list__name" href="/company/'+encodeURIComponent(r[0])+'/">'+esc(r[1])+'</a><div class="co-list__meta">'+esc([r[2],r[4],r[5],r[6]==='上場'?'上場':''].filter(Boolean).join(' · '))+'</div></div><span class="co-list__n">'+(r[7]?'<b>'+r[7]+'</b>件募集中':'募集なし')+'</span></li>'; }).join('');
    more.hidden = hit.length<=shown;
    if(typeof window.gtag==='function') window.gtag('event','company_filter',{keyword:kw?1:0, industry:ind.value, pref:pref.value, size:size.value, listed:listed.value, jobs_only:jobs.checked?1:0, hits:hit.length});
  }
  function reset(){ shown=PAGE; render(); }
  q.addEventListener('input', reset);
  [ind,pref,size,listed,jobs].forEach(function(el){ el.addEventListener('change', reset); });
  more.querySelector('button').addEventListener('click', function(){ shown+=PAGE; render(); });
  var p=new URLSearchParams(location.search);
  if(p.get('ind')) ind.value=p.get('ind'); if(p.get('pref')) pref.value=p.get('pref'); if(p.get('q')) q.value=p.get('q');
  reset();
})();
</script>`;
    return pageHtml({ rel: '/company/', title: `企業一覧（${list.length.toLocaleString()}社）会社概要と募集中の求人 - ミドル・ハイクラス転職 求人検索`,
      h1: '企業一覧', desc: `${list.length.toLocaleString()}社の会社概要（本社・設立・資本金・従業員数・上場区分・事業内容）と募集中の求人${full.length.toLocaleString()}件。業界・本社・企業規模で絞り込めます。転職支援は無料です。`,
      crumbs: [], main, script });
  }
  /* 大分類のページ */
  function bigPage(bc, b){
    const list = b.list.slice().sort(rank);
    const withJobs = list.filter(c => c.jobs.length).length;
    const mids = midsOf(bc);
    const main = `<h1>${esc(b.name)}の企業一覧<small style="font-size:.7em;color:var(--ink-3);font-weight:700;margin-left:8px">${list.length.toLocaleString()}社</small></h1>
      <p class="lp__lead">${esc(b.name)}に分類される企業の会社概要と募集中の求人です。${withJobs ? `${withJobs.toLocaleString()}社が現在募集中。` : ''}求人が出ていない企業への転職も、非公開の募集を含めてご相談いただけます。</p>
      ${mids.length ? `<nav class="lp__nav" aria-label="業種で絞る"><p>業種で絞る</p><div class="lp__pills">${mids.map(([code, m]) => `<a href="${esc(indPath(code))}">${esc(m.name)}<b>${m.list.length.toLocaleString()}</b></a>`).join('')}</div></nav>` : ''}
      <nav class="lp__nav" aria-label="他の業界"><p>他の業界</p><div class="lp__pills">${bigsSorted.filter(([c2]) => c2 !== bc).map(([c2, b2]) => `<a href="${esc(bigPath(c2))}">${esc(b2.name)}<b>${b2.list.length.toLocaleString()}</b></a>`).join('')}</div></nav>
      ${filterForm(prefsIn(list), sizesIn(list))}
      ${listBlock(list, BIG_LIST_MAX)}
      ${list.length > BIG_LIST_MAX ? `<p class="co-note">募集中の企業を優先して上位${BIG_LIST_MAX}社を表示しています。すべての企業は上の「業種で絞る」から各業種のページでご覧いただけます。</p>` : ''}
      ${ctaHtml('static-company-big')}`;
    return pageHtml({ rel: bigPath(bc), title: `${b.name}の企業一覧（${list.length.toLocaleString()}社）会社概要・求人 - ミドル・ハイクラス転職 求人検索`,
      h1: `${b.name}の企業一覧`, desc: `${b.name}の企業${list.length.toLocaleString()}社の会社概要と募集中の求人。${mids.map(([, m]) => m.name).slice(0, 6).join('・')}${mids.length > 6 ? 'など' : ''}の業種から探せます。転職支援は無料です。`,
      crumbs: [[b.name, bigPath(bc)]], main, script: listScript });
  }
  /* 中分類のページ（全社を静的に並べる） */
  function midPage(code, m){
    const list = m.list.slice().sort(rank);
    const bc = midToBig.get(code); const b = bc != null ? byBigCode.get(bc) : null;
    const withJobs = list.filter(c => c.jobs.length).length;
    const sibs = bc != null ? midsOf(bc).filter(([c2]) => c2 !== code) : [];
    const main = `<h1>${esc(m.name)}の企業一覧<small style="font-size:.7em;color:var(--ink-3);font-weight:700;margin-left:8px">${list.length.toLocaleString()}社</small></h1>
      <p class="lp__lead">${esc(m.name)}${b ? `（${esc(b.name)}）` : ''}に分類される企業の会社概要と募集中の求人です。${withJobs ? `${withJobs.toLocaleString()}社が現在募集中。` : ''}</p>
      ${sibs.length ? `<nav class="lp__nav" aria-label="同じ業界の他の業種"><p>${esc(b.name)}の他の業種</p><div class="lp__pills">${sibs.map(([c2, m2]) => `<a href="${esc(indPath(c2))}">${esc(m2.name)}<b>${m2.list.length.toLocaleString()}</b></a>`).join('')}</div></nav>` : ''}
      ${filterForm(prefsIn(list), sizesIn(list))}
      ${listBlock(list)}
      ${ctaHtml('static-company-mid')}`;
    return pageHtml({ rel: indPath(code), title: `${m.name}の企業一覧（${list.length.toLocaleString()}社）会社概要・求人 - ミドル・ハイクラス転職 求人検索`,
      h1: `${m.name}の企業一覧`, desc: `${m.name}の企業${list.length.toLocaleString()}社の会社概要（本社・設立・資本金・従業員数・上場区分）と募集中の求人。本社・企業規模で絞り込めます。転職支援は無料です。`,
      crumbs: b ? [[b.name, bigPath(bc)], [m.name, indPath(code)]] : [[m.name, indPath(code)]], main, script: listScript });
  }
  /* 絞り込み用の軽い表 [id, 社名, 業種(中分類), 業界(大分類), 本社, 企業規模, 上場区分, 募集中件数] */
  const listJson = JSON.stringify(companies.slice().sort(rank).map(c => [c.id, c.name, (c.industry || [])[0] || '', (c.industryBig || [])[0] || '', c.pref || '', c.size || '', c.listed || '', c.jobs.length]));
  fs.writeFileSync(path.join(root, 'data', 'companies-list.json'), listJson, 'utf8');

  const coRoot = path.join(root, 'company');
  const removed = syncDir(coRoot, new Set(companies.map(c => c.id).concat('industry')));
  if(removed) console.log(`⚠ 企業ページを ${removed}社ぶん削除しました（data/companies.json から消えた会社。Airtable で削除されたものです）`);
  companies.forEach(c => writePage(coRoot, c.id, companyPage(c)));
  fs.writeFileSync(path.join(coRoot, 'index.html'), indexPage(), 'utf8');
  /* 業界ページ。無くなった業界のディレクトリは消す。⚠ syncDir は company/ 直下の「企業IDでないディレクトリ」も消すので industry を keep に足してある */
  const indRoot = path.join(coRoot, 'industry');
  const indKeep = new Set([...byMid.keys()].map(String).concat([...byBigCode.keys()].map(c => 'b' + c)));
  syncDir(indRoot, indKeep);
  byBigCode.forEach((b, bc) => writePage(indRoot, 'b' + bc, bigPage(bc, b)));
  byMid.forEach((m, code) => writePage(indRoot, String(code), midPage(code, m)));
  const withJobs = companies.filter(c => c.jobs.length).length;
  console.log(`company/<企業ID>/index.html を書き出しました: ${companies.length}社（募集中 ${withJobs}社・求人0件 ${companies.length - withJobs}社）＋企業一覧＋業界ページ ${byBigCode.size + byMid.size}`);

  const urls = [{ loc: SITE + '/company/', lastmod: null, pri: '0.8' }]
    .concat([...byBigCode.keys()].map(bc => ({ loc: SITE + bigPath(bc), lastmod: null, pri: '0.7' })))
    .concat([...byMid.keys()].map(code => ({ loc: SITE + indPath(code), lastmod: null, pri: '0.7' })))
    .concat(companies.map(c => ({ loc: SITE + coPath(c), lastmod: c.updatedAt || null, pri: '0.7' })));
  return { coOf, urls, coPath, count: companies.length };
}

module.exports = { build, coPath };
