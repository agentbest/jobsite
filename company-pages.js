// 企業ページの生成（static-pages.js から呼ばれる）
//
//   company/<企業ID>/index.html … 企業1社ずつのページ（会社概要・基本情報・募集中の求人・Organization 構造化データ）
//   company/index.html          … 企業一覧（社名・業界・本社・企業規模・上場で絞り込める）
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
  const companies = JSON.parse(fs.readFileSync(coPathFile, 'utf8'));
  const tpl = fs.readFileSync(path.join(root, 'company-template.html'), 'utf8');

  /* ロゴは求人と同じ data/logos.json（企業名 → パス）から。無い会社は頭文字タイル */
  const logoFile = path.join(root, 'data', 'logos.json');
  const logos = fs.existsSync(logoFile) ? JSON.parse(fs.readFileSync(logoFile, 'utf8')) : {};
  const PREFS = Object.keys(PREF_SLUG);
  const byId = new Map(), byName = new Map();
  companies.forEach(c => {
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
        <div class="pd-more"><a href="/company/${(c.industryBig || [])[0] ? `?ind=${encodeURIComponent(c.industryBig[0])}` : ''}">${esc((c.industryBig || [])[0] || '')}の企業一覧を見る</a></div></div>` : ''}
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

  /* ---------- 企業一覧 ---------- */
  function indexPage(){
    const canon = SITE + '/company/';
    const list = companies.slice().sort(rank);
    const withJobs = list.filter(c => c.jobs.length).length;
    const bigs = [...byBig.entries()].sort((a, b) => b[1].length - a[1].length);
    const prefs = PREFS.filter(p => list.some(c => c.pref === p)).concat(list.some(c => c.pref === '海外') ? ['海外'] : []);
    const opt = (arr, label) => `<option value="">${label}</option>` + arr.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    /* 1,670社ぶんを1枚に置くので、行はできるだけ短く（ロゴ無し・属性名は1文字）。社名の検索は行の文字列そのものを使う */
    const rows = list.map(c => `<li data-i="${esc((c.industryBig || [])[0] || '')}" data-p="${esc(c.pref || '')}" data-s="${esc(c.size || '')}" data-l="${esc(c.listed || '')}" data-j="${c.jobs.length}"><div class="co-list__txt"><a class="co-list__name" href="${esc(coPath(c))}">${esc(c.name)}</a><div class="co-list__meta">${esc([(c.industry || [])[0], c.pref, c.size, listedLabel(c) === '非上場' ? '' : listedLabel(c)].filter(Boolean).join(' · '))}</div></div><span class="co-list__n">${c.jobs.length ? `<b>${c.jobs.length}</b>件募集中` : '募集なし'}</span></li>`).join('\n');
    const main = `<h1>企業一覧<small style="font-size:.7em;color:var(--ink-3);font-weight:700;margin-left:8px">${list.length.toLocaleString()}社</small></h1>
      <p class="lp__lead">当社が扱う企業の会社概要と募集中の求人をまとめています。求人が出ていない企業も、非公開で募集している場合や今後の募集をご案内できる場合があります。</p>
      <ul class="lp__stats"><li><b>${list.length.toLocaleString()}</b>社</li><li><b>${withJobs.toLocaleString()}</b>社が募集中</li><li><b>${list.filter(c => c.listed === '上場').length.toLocaleString()}</b>社が上場企業</li></ul>
      <nav class="lp__nav" aria-label="業界で絞る"><p>業界で絞る</p><div class="lp__pills">${bigs.map(([b, arr]) => `<a href="/company/?ind=${encodeURIComponent(b)}" data-ind-link="${esc(b)}">${esc(b)}<b>${arr.length}</b></a>`).join('')}</div></nav>
      <form class="co-filter" id="cf" onsubmit="return false">
        <input type="search" id="cf-q" placeholder="社名で探す" aria-label="社名で探す" autocomplete="off">
        <select id="cf-ind" aria-label="業界">${opt(bigs.map(([b]) => b), '業界：すべて')}</select>
        <select id="cf-pref" aria-label="本社">${opt(prefs, '本社：すべて')}</select>
        <select id="cf-size" aria-label="企業規模">${opt(SIZE_ORDER.filter(s => list.some(c => c.size === s)), '企業規模：すべて')}</select>
        <select id="cf-listed" aria-label="上場区分">${opt(['上場', '非上場'], '上場区分：すべて')}</select>
        <label><input type="checkbox" id="cf-jobs"> 募集中の企業だけ</label>
      </form>
      <p class="co-count"><b id="cf-n">${list.length.toLocaleString()}</b>社</p>
      <ul class="co-list" id="co-list">${rows}</ul>
      <div class="co-more" id="cf-more"><button type="button">さらに表示する</button></div>
      <div class="lp__cta"><h2>気になる企業が見つからないときは</h2><p>掲載していない企業・非公開求人も含めて、希望に近いところを個別にお探しします。まだ転職を決めていない段階でもかまいません。ご利用は無料です。</p>
        <div class="pd-cta"><a class="btn-apply" href="/${esc(C.APPLY_PAGE)}" data-apply="">転職支援に申し込む（無料）</a><a class="btn-ghost" href="${esc(C.CONSULT_URL)}" target="_blank" rel="noopener">まず話だけ聞いてみる</a><a class="line-btn" href="${esc(C.LINE_ADD_URL)}" target="_blank" rel="noopener noreferrer" data-line-cta="static-company-index">${C.LINE_ICON}<span>LINEで相談する</span></a></div></div>`;
    const script = `<script>
(function(){
  var PAGE=100, shown=PAGE;
  var q=document.getElementById('cf-q'), ind=document.getElementById('cf-ind'), pref=document.getElementById('cf-pref'), size=document.getElementById('cf-size'), listed=document.getElementById('cf-listed'), jobs=document.getElementById('cf-jobs');
  var rows=[].slice.call(document.querySelectorAll('#co-list > li')), nEl=document.getElementById('cf-n'), more=document.getElementById('cf-more');
  function norm(s){ return (s||'').toLowerCase().replace(/[\\u30a1-\\u30f6]/g, function(c){ return String.fromCharCode(c.charCodeAt(0)-0x60); }).replace(/\\s+/g,''); }
  function apply(){
    var kw=norm(q.value), hit=0;
    rows.forEach(function(li){
      var ok=(!kw || (li._n || (li._n=norm(li.querySelector('.co-list__name').textContent))).indexOf(kw)>=0)
        && (!ind.value || li.getAttribute('data-i')===ind.value)
        && (!pref.value || li.getAttribute('data-p')===pref.value)
        && (!size.value || li.getAttribute('data-s')===size.value)
        && (!listed.value || li.getAttribute('data-l')===listed.value)
        && (!jobs.checked || +li.getAttribute('data-j')>0);
      li.hidden = !ok || hit>=shown; if(ok) hit++;
    });
    nEl.textContent=hit.toLocaleString();
    more.style.display = hit>shown ? '' : 'none';
    if(typeof window.gtag==='function' && (kw||ind.value||pref.value||size.value||listed.value||jobs.checked)) window.gtag('event','company_filter',{keyword:kw?1:0, industry:ind.value, pref:pref.value, size:size.value, listed:listed.value, jobs_only:jobs.checked?1:0, hits:hit});
  }
  function reset(){ shown=PAGE; apply(); }
  [q].forEach(function(el){ el.addEventListener('input', reset); });
  [ind,pref,size,listed,jobs].forEach(function(el){ el.addEventListener('change', reset); });
  more.querySelector('button').addEventListener('click', function(){ shown+=PAGE; apply(); });
  document.querySelectorAll('[data-ind-link]').forEach(function(a){ a.addEventListener('click', function(e){ e.preventDefault(); ind.value=a.getAttribute('data-ind-link'); history.replaceState(null,'','/company/?ind='+encodeURIComponent(ind.value)); reset(); window.scrollTo({top:document.getElementById('cf').offsetTop-80,behavior:'smooth'}); }); });
  var p=new URLSearchParams(location.search);
  if(p.get('ind')) ind.value=p.get('ind'); if(p.get('pref')) pref.value=p.get('pref'); if(p.get('q')) q.value=p.get('q');
  reset();
})();
</script>`;
    const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: '企業一覧', url: canon, description: `${list.length}社の会社概要と募集中の求人。` };
    return tpl
      .replace('__TITLE__', () => esc(`企業一覧（${list.length.toLocaleString()}社）会社概要と募集中の求人 - ミドル・ハイクラス転職 求人検索`))
      .replace(/__OGTITLE__/g, () => esc(`企業一覧（${list.length.toLocaleString()}社）会社概要と募集中の求人`))
      .replace(/__DESC__/g, () => esc(`${list.length.toLocaleString()}社の会社概要（本社・設立・資本金・従業員数・上場区分・事業内容）と募集中の求人${full.length.toLocaleString()}件。業界・本社・企業規模で絞り込めます。転職支援は無料です。`))
      .replace(/__CANON__/g, () => esc(canon))
      .replace('__JSONLD__', () => JSON.stringify(ld).replace(/<\//g, '<\\/'))
      .replace('__CRUMB__', () => `<a href="/">ホーム</a><span class="sep">›</span><span class="cur">企業一覧</span>`)
      .replace('__MAIN__', () => main)
      .replace('__SCRIPT__', () => script);
  }

  const coRoot = path.join(root, 'company');
  const removed = syncDir(coRoot, new Set(companies.map(c => c.id)));
  if(removed) console.log(`⚠ 企業ページを ${removed}社ぶん削除しました（data/companies.json から消えた会社。Airtable で削除されたものです）`);
  companies.forEach(c => writePage(coRoot, c.id, companyPage(c)));
  fs.writeFileSync(path.join(coRoot, 'index.html'), indexPage(), 'utf8');
  const withJobs = companies.filter(c => c.jobs.length).length;
  console.log(`company/<企業ID>/index.html を書き出しました: ${companies.length}社（募集中 ${withJobs}社・求人0件 ${companies.length - withJobs}社）＋企業一覧`);

  const urls = [{ loc: SITE + '/company/', lastmod: null, pri: '0.8' }]
    .concat(companies.map(c => ({ loc: SITE + coPath(c), lastmod: c.updatedAt || null, pri: '0.7' })));
  return { coOf, urls, coPath, count: companies.length };
}

module.exports = { build, coPath };
