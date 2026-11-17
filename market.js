// 職種の大分類ごとの「求人・年収動向」ページ（jobs/<職種>/market/）と、その数字の JSON（data/market-index.json）を作る（2026-11-18）。
//
// ハチワレさん「jobs の PV を増やす」施策の7（自社データの一次情報ページ）と2（年収記事に実数を出す）。
//   - ページ：掲載中の求人の求人票に書かれた提示年収・勤務地・職種を集計したもの。毎朝のビルドで数字が入れ替わる。
//     検索・AI に「この会社のデータ」として引用されることを狙う。集計の方法と母数を必ずページに書く（数字だけ出さない）。
//   - data/market-index.json：コーポレートの記事（agentbest-lp の SalaryFacts.astro）がビルド時に読む。
//       { updated, groups: { <大分類slug>: { l, n, cos, nSal, medMin, medMax, p800, remote, new30 } },
//         hubs:   { <メディアのハブslug>: { g, n, cos, nSal, medMin, medMax } } }   ※ハブは JOBCAT_HUB で引けた求人だけ・10件以上
//   - data/market-history.json：月ごとのスナップショット { 'YYYY-MM': { <slug>: { n, cos, medMin, medMax, remote } } }。
//     その月の最後のビルドの値で上書きしていく＝月末の値が残る。前月比はここから出す。⚠ 消さない（推移が途切れる）。
//
// ⚠ 年収は Airtable の 年収下限／上限 列（求人票の提示額）。月給からの換算や推測はしない（salary-hint.js と同じ考え方）。
// ⚠ 書いてよいのは掲載データから機械的に言えることだけ。「市場全体の相場」とは書かない（あくまで当サイト掲載求人の集計）。
const fs = require('fs'), path = require('path');

const PAGE_MIN = 30;   // これ未満の大分類はページを作らない（母数が小さいと中央値がぶれる）
const HUB_MIN = 10;
const BANDS = [[0, 400, '400万円未満'], [400, 600, '400〜599万円'], [600, 800, '600〜799万円'], [800, 1000, '800〜999万円'], [1000, 1e9, '1,000万円以上']];

const med = arr => { const a = arr.filter(v => v != null && v > 0).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
const q = (arr, p) => { const a = arr.filter(v => v != null && v > 0).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : null; };
const man = v => v == null ? '—' : `${v.toLocaleString()}万円`;
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

function stats(jobs, today){
  const sal = jobs.filter(j => j.salaryMin || j.salaryMax);
  const d30 = new Date(Date.parse(today) - 30 * 864e5).toISOString().slice(0, 10);
  return {
    n: jobs.length,
    cos: new Set(jobs.map(j => j.company).filter(Boolean)).size,
    nSal: sal.length,
    medMin: med(sal.map(j => j.salaryMin)), medMax: med(sal.map(j => j.salaryMax)),
    p25: q(sal.map(j => j.salaryMin), .25), p75: q(sal.map(j => j.salaryMin), .75),
    p800: jobs.filter(j => (j.salaryMax || 0) >= 800).length,
    remote: jobs.filter(j => j.remote).length,
    listed: jobs.filter(j => j.listedStatus === '上場').length,
    new30: jobs.filter(j => j.createdAt && j.createdAt >= d30).length,
  };
}

function build(root, ctx, groups, H){
  const { esc, jobGroupOf, jobHubOf, GROUP_SLUG, SITE, writePage } = H;
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const ym = today.slice(0, 7);
  const ymLabel = `${today.slice(0, 4)}年${Number(today.slice(5, 7))}月`;

  /* 推移の控え（今月の値を上書き） */
  const histFile = path.join(root, 'data', 'market-history.json');
  const hist = fs.existsSync(histFile) ? JSON.parse(fs.readFileSync(histFile, 'utf8')) : {};
  hist[ym] = {};

  const index = { updated: today, groups: {}, hubs: {} };
  const urls = [], made = new Set();

  groups.forEach(([g, jobs]) => {
    const slug = GROUP_SLUG[g];
    const s = stats(jobs, today);
    index.groups[slug] = { l: g, n: s.n, cos: s.cos, nSal: s.nSal, medMin: s.medMin, medMax: s.medMax, p800: s.p800, remote: s.remote, new30: s.new30 };
    hist[ym][slug] = { n: s.n, cos: s.cos, medMin: s.medMin, medMax: s.medMax, remote: s.remote };
    if(s.n < PAGE_MIN) return;

    /* 職種（中分類）別・勤務地別 */
    const byMid = new Map();
    jobs.forEach(j => { const m = String(j.jobCategory || '').replace(/（[^（）]*）\s*$/, '').trim(); if(!m) return; if(!byMid.has(m)) byMid.set(m, []); byMid.get(m).push(j); });
    const mids = [...byMid.entries()].filter(([, a]) => a.length >= 5).sort((a, b) => b[1].length - a[1].length).slice(0, 12)
      .map(([m, a]) => { const sa = a.filter(j => j.salaryMin || j.salaryMax); return [m, a.length, med(sa.map(j => j.salaryMin)), med(sa.map(j => j.salaryMax))]; });
    const byPref = new Map();
    jobs.forEach(j => (j.areas || []).forEach(p => byPref.set(p, (byPref.get(p) || 0) + 1)));
    const prefs = [...byPref.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const sal = jobs.filter(j => j.salaryMin);
    const bands = BANDS.map(([lo, hi, label]) => [label, sal.filter(j => j.salaryMin >= lo && j.salaryMin < hi).length]);
    const bandMax = Math.max(1, ...bands.map(b => b[1]));

    /* 前月比（先月の控えがあるときだけ） */
    const months = Object.keys(hist).filter(k => hist[k][slug]).sort();
    const prevYm = months.filter(k => k < ym).pop();
    const prev = prevYm ? hist[prevYm][slug] : null;
    const trendRows = months.slice(-12).map(k => { const h = hist[k][slug]; return `<tr><td>${esc(k.replace('-', '年'))}月</td><td>${h.n.toLocaleString()}件</td><td>${h.cos.toLocaleString()}社</td><td>${man(h.medMin)}</td><td>${man(h.medMax)}</td></tr>`; }).join('');
    const diff = (a, b) => b == null || a == null ? '' : `（前月比 ${a - b >= 0 ? '+' : ''}${(a - b).toLocaleString()}）`;

    const rel = `jobs/${slug}/market`;
    const canon = `${SITE}/${rel}/`;
    const title = `${g}の求人・年収動向（${ymLabel}）`;
    const lead = `エージェントベストジョブ転職に掲載中の${g}の求人${s.n.toLocaleString()}件（${s.cos.toLocaleString()}社）を集計しました。`
      + (s.medMin ? `求人票に書かれた提示年収の中央値は下限${man(s.medMin)}・上限${man(s.medMax)}、` : '')
      + `年収上限が800万円以上の求人は${s.p800.toLocaleString()}件（${pct(s.p800, s.n)}%）、リモート可は${s.remote.toLocaleString()}件（${pct(s.remote, s.n)}%）です。`;
    const desc = `${lead} 毎朝更新。`;
    const tbl = (head, rows) => `<div style="overflow-x:auto"><table class="mk-tbl"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
    const main = `<h1>${esc(title)}</h1>
    <p class="lp__lead">${esc(lead)}</p>
    <ul class="lp__stats"><li><b>${s.n.toLocaleString()}</b>件${esc(diff(s.n, prev && prev.n))}</li><li><b>${s.cos.toLocaleString()}</b>社</li><li>年収中央値 <b>${s.medMin ? s.medMin.toLocaleString() : '—'}〜${s.medMax ? s.medMax.toLocaleString() : '—'}</b>万円</li><li>直近30日の新着 <b>${s.new30.toLocaleString()}</b>件</li><li>上場企業 <b>${s.listed.toLocaleString()}</b>件</li></ul>
    <section class="mk-sec"><h2>提示年収の分布（年収下限）</h2>
      <p class="mk-note">年収が書かれた${s.nSal.toLocaleString()}件のうち、年収下限で数えています。年収下限の真ん中の半分は${man(s.p25)}〜${man(s.p75)}です。</p>
      <ul class="mk-bars">${bands.map(([label, k]) => `<li><span class="mk-bars__l">${esc(label)}</span><span class="mk-bars__b"><i style="width:${Math.round(k / bandMax * 100)}%"></i></span><span class="mk-bars__n">${k.toLocaleString()}件</span></li>`).join('')}</ul>
    </section>
    ${mids.length ? `<section class="mk-sec"><h2>職種別の件数と提示年収（中央値）</h2>${tbl(['職種', '件数', '年収下限', '年収上限'], mids.map(([m, k, a, b]) => `<tr><td>${esc(m)}</td><td>${k.toLocaleString()}件</td><td>${man(a)}</td><td>${man(b)}</td></tr>`).join(''))}</section>` : ''}
    ${prefs.length ? `<section class="mk-sec"><h2>勤務地（都道府県）</h2>${tbl(['都道府県', '件数', '割合'], prefs.map(([p, k]) => `<tr><td>${esc(p)}</td><td>${k.toLocaleString()}件</td><td>${pct(k, s.n)}%</td></tr>`).join(''))}<p class="mk-note">1つの求人に複数の勤務地があるときは、それぞれに数えています。</p></section>` : ''}
    <section class="mk-sec"><h2>月ごとの推移</h2>${months.length >= 2 ? tbl(['月', '件数', '社数', '年収下限の中央値', '年収上限の中央値'], trendRows) : `<p class="mk-note">${esc(ymLabel)}から記録を始めました。来月以降、ここに月ごとの推移が並びます。</p>`}</section>
    <section class="mk-sec"><h2>このデータについて</h2>
      <ul class="mk-about"><li>対象：${esc(today)}時点でエージェントベストジョブ転職に掲載中の中途採用の求人のうち、職種の大分類が「${esc(g)}」のもの</li>
      <li>年収：求人票に企業が記載した提示年収（年収下限・上限）。月給・時給からの換算はしていません。年収の記載が無い求人は年収の集計から除いています</li>
      <li>当サイトに掲載している求人の集計で、転職市場全体の相場を示すものではありません</li>
      <li>毎朝の求人更新にあわせて数字を更新しています。引用される場合は出典として本ページのURLを記載してください</li></ul>
    </section>
    <div class="lp__all"><a href="/jobs/${esc(slug)}/">${esc(g)}の求人${s.n.toLocaleString()}件を見る →</a></div>
    <nav class="lp__nav" aria-label="他の職種の動向"><p>他の職種の求人・年収動向</p><div class="lp__pills">${groups.filter(([g2, js]) => g2 !== g && js.length >= PAGE_MIN).map(([g2, js]) => `<a href="/jobs/${GROUP_SLUG[g2]}/market/">${esc(g2)}<b>${js.length.toLocaleString()}</b></a>`).join('')}</div></nav>
    <div class="lp__cta"><h2>数字だけでは分からないことを、面談でお伝えします</h2><p>同じ職種でも、企業ごとに求める経験や年収の決まり方は大きく違います。いまの経歴でどのくらいの年収が狙えるか、どの企業が採用に動いているかを個別にお話しします。ご利用は無料です。</p>
      <div class="pd-cta"><a class="btn-apply" href="/${esc(ctx.C.APPLY_PAGE)}" data-apply="">転職支援に申し込む（無料）</a><a class="btn-ghost" href="${esc(ctx.C.CONSULT_URL)}" target="_blank" rel="noopener">まず話だけ聞いてみる</a></div></div>
    <style>
      .mk-sec{margin:26px 0}.mk-sec h2{font-size:18px;margin:0 0 10px}
      .mk-note{font-size:13px;color:var(--ink-3);margin:6px 0 10px}
      .mk-tbl{width:100%;border-collapse:collapse;font-size:14px}.mk-tbl th,.mk-tbl td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
      .mk-tbl th:first-child,.mk-tbl td:first-child{text-align:left;white-space:normal}.mk-tbl th{font-size:12px;color:var(--ink-3);background:var(--surface-2)}
      .mk-bars{list-style:none;margin:0;padding:0;display:grid;gap:6px}.mk-bars li{display:grid;grid-template-columns:120px 1fr 64px;gap:10px;align-items:center;font-size:13px}
      .mk-bars__b{height:14px;background:var(--surface-2);border-radius:4px;overflow:hidden}.mk-bars__b i{display:block;height:100%;background:var(--accent)}
      .mk-bars__n{text-align:right;font-family:var(--mono)}
      .mk-about{margin:0;padding-left:1.2em;font-size:13.5px;color:var(--ink-2);line-height:1.8}
    </style>`;
    const crumb = [['ホーム', '/'], [`${g}の求人`, `/jobs/${slug}/`], ['求人・年収動向', `/${rel}/`]]
      .map(([nm, href], i, a) => i === a.length - 1 ? `<span class="cur">${esc(nm)}</span>` : `<a href="${esc(href)}">${esc(nm)}</a><span class="sep">›</span>`).join('');
    const ld = { '@context': 'https://schema.org', '@type': 'Dataset', name: title, url: canon, description: desc,
      creator: { '@id': 'https://www.agent-best.net/#organization' }, publisher: { '@id': 'https://www.agent-best.net/#organization' },
      dateModified: today, temporalCoverage: today, isAccessibleForFree: true, inLanguage: 'ja',
      variableMeasured: ['求人件数', '掲載企業数', '提示年収（年収下限・上限）の中央値', 'リモート可の求人数'] };
    const html = ctx.lpTpl
      .replace('__TITLE__', () => esc(`${title} - エージェントベストジョブ転職`))
      .replace(/__OGTITLE__/g, () => esc(title))
      .replace(/__DESC__/g, () => esc(desc))
      .replace(/__CANON__/g, () => esc(canon))
      .replace('__CRUMB__', () => crumb)
      .replace('__MAIN__', () => main + `<script type="application/ld+json">${JSON.stringify(ld).replace(/<\//g, '<\\/')}</script>`);
    writePage(root, rel, html);
    made.add(slug);
    urls.push({ loc: canon, lastmod: today, pri: '0.7' });
  });

  /* メディアのハブ単位（記事に出す数字） */
  const byHub = new Map();
  groups.forEach(([, jobs]) => jobs.forEach(j => { const h = jobHubOf(j.jobCategory); if(!h) return; if(!byHub.has(h)) byHub.set(h, []); byHub.get(h).push(j); }));
  byHub.forEach((jobs, h) => {
    if(jobs.length < HUB_MIN) return;
    const s = stats(jobs, today);
    index.hubs[h] = { g: GROUP_SLUG[jobGroupOf(jobs[0].jobCategory)] || '', n: s.n, cos: s.cos, nSal: s.nSal, medMin: s.medMin, medMax: s.medMax };
  });

  fs.writeFileSync(path.join(root, 'data', 'market-index.json'), JSON.stringify(index), 'utf8');
  fs.writeFileSync(histFile, JSON.stringify(Object.fromEntries(Object.keys(hist).sort().map(k => [k, hist[k]]))), 'utf8');
  console.log(`求人・年収動向ページ: ${made.size}本（${PAGE_MIN}件以上の大分類）・記事用のハブの数字 ${Object.keys(index.hubs).length}件 → jobs/<職種>/market/・data/market-index.json`);
  return { urls, made };
}

module.exports = { build };
