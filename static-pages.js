// 静的ページの生成（rebuild.js から呼ばれる）
//
//   job/<求人ID>/index.html   … 求人1件ずつの本物のページ（JobPosting 構造化データ・求人ごとの title/OGP 付き）
//   jobs/<職種>/index.html    … 職種の求人一覧（例 /jobs/engineer/）
//   jobs/<職種>/<勤務地>/     … 職種×勤務地の求人一覧（例 /jobs/engineer/tokyo/。件数が LP_MIN 以上のものだけ）
//   area/<勤務地>/index.html  … 勤務地の求人一覧（例 /area/osaka/）
//   sitemap.xml / robots.txt
//   assets/site.css           … template.html の <style> をそのまま書き出したもの（静的ページはこれを読む）
//
// なぜ作るか（2026-09-12）: index.html は1枚の HTML で、求人詳細は ?job= を JS で開く作り。
// Google から見ると「一覧1ページ」しか無く、5,700件の求人は検索に載っていなかった。
// 求人ごとに素の HTML を置き、JobPosting の構造化データを付けて Google しごと検索の入口にする。
//
// ⚠ 見た目は template.html の CSS をそのまま使う（assets/site.css）。クラス名は検索画面の求人詳細と同じ。
//    template.html 側でクラス名を変えたら、ここと job-template.html も直すこと。
// ⚠ 文言（応募CTAの注記・担当者紹介）は template.html の ctaHtml() / author と同じ内容を持っている。
//    片方だけ直さないこと。
// ⚠ 生成物（job/ jobs/ area/ sitemap.xml assets/site.css）は直接編集しない。次の rebuild で消える。
const fs = require('fs'), path = require('path');

const SITE = 'https://jobs.agent-best.net';
const LP_MIN = 10;          /* 職種×勤務地ページを作る最低件数。少ないページを量産しても検索には載らない */
const LP_LIST_MAX = 50;     /* 一覧ページに並べる求人の上限（残りは「すべて見る」で検索画面へ） */
const RELATED_MAX = 6;      /* 求人ページの「同じ職種の求人」の件数 */

/* 職種の大分類 → URL のスラッグ。⚠ 変えると URL が変わる（検索エンジンの評価がリセットされる）。
   ここに無い大分類はページを作らず、ビルド時に名指しで警告する。 */
const GROUP_SLUG = {
  'エンジニア':'engineer', '営業':'sales', 'プロジェクト管理':'project-management', '電気・電子':'electrical',
  'その他':'other', '管理':'corporate', '機械':'mechanical', 'マーケティング':'marketing', '小売・飲食':'retail-food',
  'コンサルタント':'consultant', '事業企画':'business-planning', 'ITコンサルタント':'it-consultant', '人事':'hr',
  '施工管理':'construction-management', '経営企画':'corporate-planning', '制作・クリエイティブ':'creative',
  '建築・土木':'architecture-civil', 'インターネットサービス':'internet-service', '不動産':'real-estate', '金融':'finance',
  '広告':'advertising', '教師・講師・インストラクター':'instructor', '物流・購買・貿易':'logistics', 'デザイン':'design',
  '経営':'executive', '交通・運輸':'transport', '半導体':'semiconductor', '士業':'professional', '食品':'food',
  '旅行・ホテル':'travel-hotel', '医療・看護・薬剤':'medical',
};
const PREF_SLUG = {
  '北海道':'hokkaido','青森県':'aomori','岩手県':'iwate','宮城県':'miyagi','秋田県':'akita','山形県':'yamagata','福島県':'fukushima',
  '茨城県':'ibaraki','栃木県':'tochigi','群馬県':'gunma','埼玉県':'saitama','千葉県':'chiba','東京都':'tokyo','神奈川県':'kanagawa',
  '新潟県':'niigata','富山県':'toyama','石川県':'ishikawa','福井県':'fukui','山梨県':'yamanashi','長野県':'nagano','岐阜県':'gifu',
  '静岡県':'shizuoka','愛知県':'aichi','三重県':'mie','滋賀県':'shiga','京都府':'kyoto','大阪府':'osaka','兵庫県':'hyogo','奈良県':'nara',
  '和歌山県':'wakayama','鳥取県':'tottori','島根県':'shimane','岡山県':'okayama','広島県':'hiroshima','山口県':'yamaguchi',
  '徳島県':'tokushima','香川県':'kagawa','愛媛県':'ehime','高知県':'kochi','福岡県':'fukuoka','佐賀県':'saga','長崎県':'nagasaki',
  '熊本県':'kumamoto','大分県':'oita','宮崎県':'miyazaki','鹿児島県':'kagoshima','沖縄県':'okinawa',
};
/* 地域ブロック。template.html の AREA_BLOCKS と同じ並び・同じ名前（検索画面の ?area= に渡すため）。
   北海道はブロック名と県名が同じなので、ブロックとしては作らず県のページだけにする。 */
const BLOCKS = [
  ['関東', 'kanto', ['東京都','神奈川県','埼玉県','千葉県','茨城県','栃木県','群馬県']],
  ['関西', 'kansai', ['大阪府','京都府','兵庫県','滋賀県','奈良県','和歌山県']],
  ['東海', 'tokai', ['愛知県','静岡県','岐阜県','三重県']],
  ['九州・沖縄', 'kyushu-okinawa', ['福岡県','熊本県','長崎県','鹿児島県','大分県','宮崎県','佐賀県','沖縄県']],
  ['東北', 'tohoku', ['宮城県','福島県','岩手県','青森県','山形県','秋田県']],
  ['中国', 'chugoku', ['広島県','岡山県','山口県','鳥取県','島根県']],
  ['北陸・甲信越', 'hokuriku-koshinetsu', ['石川県','長野県','新潟県','福井県','富山県','山梨県']],
  ['四国', 'shikoku', ['愛媛県','香川県','高知県','徳島県']],
];

/* ---------- template.html から定数を読む（応募先・Calendly・LINE などを二重に持たないため） ---------- */
function readConst(tpl, name){
  const m = tpl.match(new RegExp(`const ${name}\\s*=\\s*("([^"\\\\]|\\\\.)*"|'([^'\\\\]|\\\\.)*')`));
  if(!m) throw new Error(`template.html に const ${name} が見つかりません`);
  return new Function(`return ${m[1]}`)();
}
function readObject(tpl, name){
  const m = tpl.match(new RegExp(`const ${name}\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  if(!m) throw new Error(`template.html に const ${name} が見つかりません`);
  return new Function(`return {${m[1]}}`)();
}

/* ---------- template.html と同じ整形（表示が食い違わないように、同じ規則で書いてある） ---------- */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MD_ESC = /\\([!-\/:-@\[-\x60{-~])/g;
const MD_ESC_HTML = /\\(&amp;|&quot;|&#39;|&lt;|&gt;|[!-\/:-@\[-\x60{-~])/g;
const YEN = /\\(?=[0-9])/g;
const mdUnesc = s => String(s == null ? '' : s).replace(YEN, '￥').replace(MD_ESC, '$1');
function rich(src){
  if(!src) return '';
  const t = String(src).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = t.split('\n');
  let html = '', listBuf = [], para = [];
  const inline = s => {
    s = esc(s);
    s = s.replace(/&lt;(https?:\/\/[^\s&>]+)&gt;/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/(^|[^"=\/])(https?:\/\/[^\s<)）"]+)/g, (m, p, u) => p + '<a href="' + u + '" target="_blank" rel="noopener">' + u + '</a>');
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<strong>$2</strong>');
    s = s.replace(YEN, '￥').replace(MD_ESC_HTML, '$1');
    return s;
  };
  const flushList = () => { if(listBuf.length){ html += '<ul>' + listBuf.map(x => '<li>' + inline(x) + '</li>').join('') + '</ul>'; listBuf = []; } };
  const flushPara = () => { if(para.length){ html += '<p>' + para.map(inline).join('<br>') + '</p>'; para = []; } };
  for(const raw of lines){
    const line = raw.replace(/\s+$/, '').replace(/\\+$/, '').trim();
    if(!line){ flushList(); flushPara(); continue; }
    const hm = line.match(/^(#{2,4})\s+(.*)$/);
    if(hm){ flushList(); flushPara(); const tag = hm[1].length >= 4 ? 'h5' : 'h4'; html += '<' + tag + '>' + inline(hm[2]) + '</' + tag + '>'; continue; }
    const bm = line.match(/^(?:[-*＊]|・|●|◦|‣)\s*(.*)$/);
    if(bm){ flushPara(); listBuf.push(bm[1]); continue; }
    flushList(); para.push(line);
  }
  flushList(); flushPara();
  return html;
}
/* 構造化データ・meta description 用の素の文（Markdown を落として1行にする） */
function plain(src, max){
  const t = String(src || '').replace(/\r/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '').replace(/^\s*[-*・–—]\s*/gm, '').replace(/[*_`>|\\]/g, '')
    .replace(/\s+/g, ' ').trim();
  return max && t.length > max ? t.slice(0, max) + '…' : t;
}
function fmtSalary(j){
  const mn = j.salaryMin, mx = j.salaryMax;
  if(mn != null && mx != null) return mn === mx ? `${mn}万円` : `${mn}〜${mx}万円`;
  if(mx != null) return `〜${mx}万円`;
  if(mn != null) return `${mn}万円〜`;
  return '応相談';
}
const EMP_TYPES = ['正社員','契約社員','業務委託','無期雇用派遣','派遣社員','アルバイト・パート','インターン'];
function empList(j){
  const s = (j && j.employment) ? String(j.employment).trim() : '';
  if(!s) return [];
  const hit = EMP_TYPES.filter(t => s.includes(t));
  return hit.length ? hit : [s];
}
/* schema.org の employmentType。契約社員・業務委託は CONTRACTOR、派遣は TEMPORARY */
const EMP_SCHEMA = {'正社員':'FULL_TIME','契約社員':'CONTRACTOR','業務委託':'CONTRACTOR','無期雇用派遣':'TEMPORARY','派遣社員':'TEMPORARY','アルバイト・パート':'PART_TIME','インターン':'INTERN'};
function jobName(j){ return j.position || j.jobCategory || j.title || '求人'; }
function jobGroupOf(v){ const m = String(v || '').match(/（([^（）]+)）\s*$/); return m ? m[1] : 'その他'; }
const CO_TRIM = /^(株式会社|有限会社|合同会社|一般社団法人|特定非営利活動法人)\s*|\s*(株式会社|有限会社|合同会社)$/g;
function coInitial(name){
  const s = (name || '').replace(CO_TRIM, '').trim();
  if(!s) return '?';
  const m = s.match(/[A-Za-z0-9]{1,2}|[^\s]/);
  return m ? m[0].toUpperCase() : '?';
}
function logoHtml(j, extra){
  const cls = 'jrow__logo' + (extra ? ' ' + extra : '');
  if(j.logo) return `<span class="${cls} jrow__logo--img"><img src="/${esc(j.logo)}" alt="" loading="lazy" decoding="async"></span>`;
  return `<span class="${cls}" aria-hidden="true">${esc(coInitial(j.company))}</span>`;
}
/* 勤務地の短い表記（カード用）。template.html の locLabel() を簡略化したもの */
const PREFS = Object.keys(PREF_SLUG);
function locShort(j){
  const loc = String(j.location || '');
  const areas = j.areas || [];
  const lines = loc.split(/\n/).map(s => s.trim()).filter(Boolean);
  let base = '';
  for(const s of lines){
    const p = PREFS.find(x => s.includes(x)); if(!p) continue;
    const rest = s.slice(s.indexOf(p) + p.length);
    const m = rest.match(/^\s*([^\s0-9０-９]{1,8}?[市区町村郡][市町村]?)/);
    base = m ? p + m[1] : p; break;
  }
  if(!base && areas.length) base = areas[0];
  if(!base) base = (lines[0] || '').slice(0, 20);
  if(base && areas.length > 1) base += ' 他' + (areas.length - 1);
  return base;
}
const jobPath = j => `/job/${encodeURIComponent(j.id)}/`;
const applyHref = (APPLY_PAGE, j) => `/${APPLY_PAGE}?job=${encodeURIComponent(j.id)}`;

/* ---------- 求人1件のページ ---------- */
function jobPage(ctx, j, related){
  const { C, jobTpl: tpl, tagCat, tagSlug, tagDesc, tagCatsAll } = ctx;
  const name = jobName(j);
  const co = j.company || '企業非公開';
  const canon = SITE + jobPath(j);
  const apply = applyHref(C.APPLY_PAGE, j);

  /* 見出しのタグ（検索画面の renderDetail と同じ順） */
  const tags = [];
  if(j.jobCategory) tags.push(`<span class="tag tag--cat">${esc(j.jobCategory)}</span>`);
  empList(j).forEach(t => tags.push(`<span class="tag">${esc(t)}</span>`));
  (j.industry || []).forEach(i => tags.push(`<span class="tag">${esc(i)}</span>`));
  if(j.remote) tags.push('<span class="tag tag--remote">リモート可</span>');

  const sec = (title, body, isRich) => body ? `<div class="pd-sec"><h3>${esc(title)}</h3>${isRich ? `<div class="rich">${rich(body)}</div>` : body}</div>` : '';
  const metaRow = (k, v) => v ? `<dt>${esc(k)}</dt><dd>${esc(mdUnesc(v))}</dd>` : '';
  const url = (typeof j.url === 'string' && /^https?:\/\//.test(j.url)) ? j.url : null;
  const siteRow = url ? `<dt>企業サイト</dt><dd><a href="${esc(url)}" target="_blank" rel="noopener nofollow">${esc(url.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a></dd>` : '';
  const coMeta = [metaRow('所在地', j.companyAddress), metaRow('従業員数', j.employees), metaRow('上場区分', j.listedStatus), siteRow].join('');
  const coBody = j.companyInfo ? `<div class="rich">${rich(j.companyInfo)}</div>` : '';
  const coSec = (coBody || coMeta) ? `<div class="pd-sec"><h3>企業情報</h3>${coBody}${coMeta ? `<dl class="pd-meta">${coMeta}</dl>` : ''}</div>` : '';
  const reqMeta = [metaRow('給与（原文）', j.salaryRaw), metaRow('勤務地', j.location), metaRow('勤務時間', j.workHours), metaRow('休日・休暇', j.holidays), metaRow('福利厚生', j.benefits)].join('');

  /* この求人のタグ。押すと検索画面でそのタグに絞り込む（?tag=スラッグ） */
  const tagSec = (() => {
    const list = (j.tags || []).filter(t => tagCat[t] !== undefined && tagCat[t] !== '業界（中分類）');
    if(!list.length) return '';
    let b = '';
    const cats = tagCatsAll.concat('その他');
    cats.forEach(c => {
      const vals = c === 'その他' ? list.filter(t => !tagCatsAll.includes(tagCat[t])) : list.filter(t => tagCat[t] === c);
      if(!vals.length) return;
      b += `<div class="pd-tagcat"><p class="pd-tagcat__h">${esc(c)}</p><div class="pd-tagcat__row">`
        + vals.map(t => tagSlug[t] ? `<a class="tag tag--jt tag--link" href="/?tag=${encodeURIComponent(tagSlug[t])}"${tagDesc[t] ? ` title="${esc(tagDesc[t])}"` : ''}>${esc(t)}</a>` : `<span class="tag tag--jt">${esc(t)}</span>`).join('')
        + '</div></div>';
    });
    return `<div class="pd-sec"><h3>この求人のタグ</h3>${b}</div>`;
  })();

  const consult = (() => {
    const p = new URLSearchParams(); p.set('a1', `求人サイトを見て相談したいこと：${co}${co && name ? ' / ' : ''}${name}`);
    return C.CONSULT_URL + (C.CONSULT_URL.includes('?') ? '&' : '?') + p.toString();
  })();
  const inquiry = way => {
    const p = new URLSearchParams();
    p.set('prefill_ご希望の連絡方法', way); p.set('prefill_対象求人', name); p.set('prefill_企業名', j.company || '');
    p.set('prefill_求人レコードID', j.id); p.set('hide_求人レコードID', 'true');
    return C.INQUIRY_FORM_URL + (C.INQUIRY_FORM_URL.includes('?') ? '&' : '?') + p.toString();
  };
  const lineMsg = (() => {
    const msg = `求人サイトを見てご連絡しました。下記の求人について相談したいです。\n■求人：${name}\n■企業：${j.company || ''}\n■ページ：${canon}\n`;
    return `https://line.me/R/oaMessage/${encodeURIComponent(C.LINE_OA_ID)}/?${encodeURIComponent(msg)}`;
  })();
  const ARROW = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  const cta = `<div class="pd-cta">
      <a class="btn-apply" href="${esc(apply)}" data-apply="${esc(j.id)}">この求人に応募する ${ARROW}</a>
      <a class="btn-ghost" href="${esc(consult)}" target="_blank" rel="noopener">まず話だけ聞いてみる</a>
      <a class="btn-ghost" href="${esc(inquiry(C.WAY_TEL))}" target="_blank" rel="noopener">電話で軽く話を聞きたい</a>
      <a class="btn-ghost" href="${esc(inquiry(C.WAY_MAIL))}" target="_blank" rel="noopener">メールで質問する</a>
    </div>
    <div class="pd-line">
      <p class="pd-line__ttl">${C.LINE_ICON}LINEで相談する・応募する</p>
      <p class="pd-line__lead">フォーム入力も経歴書も不要です。<b>「${esc(name)}」について聞きたい</b>とLINEで送っていただければ、担当（松岡）が直接お返事します。<b>質問だけ・情報収集だけでもかまいません。</b></p>
      <div class="pd-line__btns">
        <a class="pd-line__btn" href="${esc(C.LINE_ADD_URL)}" target="_blank" rel="noopener noreferrer" data-line-cta="static-detail-add">${C.LINE_ICON}① 友だち追加する</a>
        <a class="pd-line__btn pd-line__btn--sub" href="${esc(lineMsg)}" target="_blank" rel="noopener noreferrer" data-line-cta="static-detail-msg">② この求人について送る</a>
      </div>
      <ol class="pd-line__steps"><li>友だち追加</li><li>この求人について送信</li><li>担当から返信</li><li>そのままLINEでやり取り</li></ol>
      <p class="pd-line__note">すでに友だちの方は②だけでかまいません（求人名が入った状態でLINEが開きます）。うまく開かないときは、LINEで ID <b>${esc(C.LINE_OA_ID)}</b> を検索してください。</p>
    </div>
    <p class="pd-ctanote">「応募する」を押すと、<b>転職支援サービスの申し込みフォーム</b>に進みます。企業へ直接応募するのではなく、担当エージェント（株式会社エージェントベスト）が<b>企業へ推薦</b>する形で選考が進みます。<b>ご利用は無料</b>です（紹介手数料は採用企業負担）。<br>
      まだ転職を決めていない段階でもかまいません。<b>経歴書のご用意は不要</b>です。この求人の背景や求められている経験など、公開情報にないところからお話しします。</p>
    <p class="pd-ctamail">「電話で軽く話を聞きたい」は<b>日程を決めずに、こちらから折り返す</b>形です。ご希望の時間帯だけ伺います。</p>`;

  const u = encodeURIComponent(canon), t = encodeURIComponent(`${name}｜${co}`);
  const shareBtn = (key, label, href) => `<a class="jshare__btn jshare__btn--${key}" href="${esc(href)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(label)}" title="${esc(label)}">${C.SHARE_ICONS[key] || ''}</a>`;
  const share = `<div class="jshare"><span class="jshare__lbl">この求人をシェア</span><div class="jshare__list">
      ${shareBtn('x', 'Xでシェア', `https://x.com/intent/post?url=${u}&text=${t}`)}
      ${shareBtn('facebook', 'Facebookでシェア', `https://www.facebook.com/sharer/sharer.php?u=${u}`)}
      ${shareBtn('linkedin', 'LinkedInでシェア', `https://www.linkedin.com/sharing/share-offsite/?url=${u}`)}
      <a class="jshare__btn jshare__btn--hatena" href="${esc(`https://b.hatena.ne.jp/entry/panel/?url=${u}&btitle=${t}`)}" target="_blank" rel="noopener noreferrer" aria-label="はてなブックマークに追加" title="はてなブックマークに追加"><span class="jshare__b">B!</span></a>
    </div></div>`;

  /* 同じ職種の求人（内部リンク。検索エンジンが求人から求人へ辿れるように） */
  const group = jobGroupOf(j.jobCategory);
  const gslug = GROUP_SLUG[group];
  const pref = (j.areas || [])[0];
  const more = [];
  if(gslug && pref && PREF_SLUG[pref] && ctx.lpExists(`jobs/${gslug}/${PREF_SLUG[pref]}`)) more.push(`<a href="/jobs/${gslug}/${PREF_SLUG[pref]}/">${esc(pref)}の${esc(group)}の求人一覧</a>`);
  if(gslug) more.push(`<a href="/jobs/${gslug}/">${esc(group)}の求人一覧</a>`);
  if(pref && PREF_SLUG[pref] && ctx.lpExists(`area/${PREF_SLUG[pref]}`)) more.push(`<a href="/area/${PREF_SLUG[pref]}/">${esc(pref)}の求人一覧</a>`);
  const relSec = related.length ? `<div class="pd-sec"><h3>同じ職種の他の求人</h3><ul class="rel">${related.map(r => `<li><span class="co">${esc(r.company || '企業非公開')}</span><a href="${esc(jobPath(r))}">${esc(jobName(r))}</a><div class="m"><b>${esc(fmtSalary(r))}</b>${locShort(r) ? ' ・ ' + esc(locShort(r)) : ''}</div></li>`).join('')}</ul>
      ${more.length ? `<div class="pd-more">${more.join('')}</div>` : ''}</div>` : '';

  const author = `<div class="pd-author">
      <p class="lbl">この求人を担当するエージェント</p>
      <p class="name"><a href="${esc(C.PROFILE_URL)}" target="_blank" rel="noopener">松岡 良次</a></p>
      <p class="bio">株式会社エージェントベスト代表。大手人材会社およびスタートアップ人材企業にて、IT・スタートアップ・メガベンチャー企業の採用支援に従事。独立後はIT・スタートアップ・コンサル領域に特化し、20〜30代のキャリア支援を行う。（厚生労働大臣許可 13-ユ-316964）</p>
    </div>`;

  const main = `<div class="dt-head">
      <div class="dt-co-row">${logoHtml(j, 'jrow__logo--lg')}<p class="dt-co">${esc(co)}</p></div>
      <h1 class="dt-title">${esc(name)}</h1>
      <div class="pd-tags">${tags.join('')}</div>
    </div>
    ${coSec}
    ${tagSec}
    ${sec('仕事内容', j.jobContent, true)}
    ${sec('必須条件', j.must, true)}
    ${sec('歓迎条件', j.welcome, true)}
    ${sec('求める人物像', j.idealPerson, true)}
    ${reqMeta ? `<div class="pd-sec"><h3>募集要項</h3><dl class="pd-meta">${reqMeta}</dl></div>` : ''}
    ${sec('選考プロセス', j.selectionProcess, true)}
    <div class="pd-sec"><h3>この求人に応募する</h3>${cta}</div>
    ${share}
    ${relSec}
    ${author}`;

  const side = `<div class="dt-card">
    <span class="k">想定年収</span><span class="v">${esc(fmtSalary(j))}</span>
    <a class="btn-apply" href="${esc(apply)}" data-apply="${esc(j.id)}">この求人に応募する</a>
    <a class="btn-detail" href="${esc(consult)}" target="_blank" rel="noopener">まず話だけ聞いてみる</a>
    <a class="line-btn" href="${esc(C.LINE_ADD_URL)}" target="_blank" rel="noopener noreferrer" data-line-cta="static-side">${C.LINE_ICON}<span>LINEで相談する</span></a>
    <p class="dt-card__note">押した先は<b>転職支援サービスの申し込み</b>です。企業へは<b>当社から推薦する形</b>で選考が進みます。<b>ご利用は無料</b>（手数料は採用企業負担）。</p>
    <span class="dt-open"><a href="/?job=${encodeURIComponent(j.id)}">検索画面で開く</a>（気になる求人に保存・条件を変えて探す）</span>
  </div>`;
  const bar = `<span class="sal"><small>想定年収</small>${esc(fmtSalary(j))}</span>
    <a class="line-btn" href="${esc(C.LINE_ADD_URL)}" target="_blank" rel="noopener noreferrer" data-line-cta="static-bar" aria-label="LINEで相談する">${C.LINE_ICON}<span>LINE</span></a>
    <a class="btn-apply" href="${esc(apply)}" data-apply="${esc(j.id)}">この求人に応募する</a>`;

  /* JobPosting 構造化データ（Google しごと検索）。
     datePosted は掲載開始日（first-seen.json）。無ければ Airtable の作成日時（recordCreatedAt）。
     validThrough は分からないので入れない（Google の指針: 期限が不明なら省く）。
     directApply は false（企業へ直接応募ではなく、当社経由で推薦する形のため）。 */
  const descHtml = [j.jobContent && `<h4>仕事内容</h4>${rich(j.jobContent)}`, j.must && `<h4>必須条件</h4>${rich(j.must)}`, j.welcome && `<h4>歓迎条件</h4>${rich(j.welcome)}`].filter(Boolean).join('');
  const datePosted = j.createdAt || (j.recordCreatedAt || '').slice(0, 10) || null;
  const ld = {
    '@context': 'https://schema.org', '@type': 'JobPosting',
    title: name,
    description: descHtml || plain(j.companyInfo, 500) || name,
    identifier: { '@type': 'PropertyValue', name: '株式会社エージェントベスト', value: j.id },
    hiringOrganization: Object.assign({ '@type': 'Organization', name: co }, url ? { sameAs: url } : {}),
    jobLocation: { '@type': 'Place', address: Object.assign({ '@type': 'PostalAddress', addressCountry: 'JP' },
      pref ? { addressRegion: pref } : {}, j.location ? { streetAddress: plain(j.location, 120) } : {}) },
    employmentType: [...new Set(empList(j).map(e => EMP_SCHEMA[e] || 'OTHER'))],
    directApply: false,
    url: canon,
  };
  if(datePosted) ld.datePosted = datePosted;
  if(j.salaryMin != null || j.salaryMax != null){
    const v = { '@type': 'QuantitativeValue', unitText: 'YEAR' };
    if(j.salaryMin != null) v.minValue = j.salaryMin * 10000;
    if(j.salaryMax != null) v.maxValue = j.salaryMax * 10000;
    if(j.salaryMin != null && j.salaryMax == null) v.value = j.salaryMin * 10000;
    ld.baseSalary = { '@type': 'MonetaryAmount', currency: 'JPY', value: v };
  }
  const crumbLd = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'ホーム', item: SITE + '/' },
    ...(gslug ? [{ '@type': 'ListItem', position: 2, name: `${group}の求人`, item: `${SITE}/jobs/${gslug}/` }] : []),
    { '@type': 'ListItem', position: gslug ? 3 : 2, name, item: canon },
  ]};

  const title = `${name}｜${co}（${fmtSalary(j)}） - ミドル・ハイクラス転職 求人検索`;
  const desc = plain(j.jobContent || j.must || j.companyInfo, 110) || `${co}の${name}の求人。`;
  const crumb = `<a href="/">ホーム</a><span class="sep">›</span>${gslug ? `<a href="/jobs/${gslug}/">${esc(group)}の求人</a><span class="sep">›</span>` : ''}<span class="cur">${esc(name)}</span>`;
  const back = gslug ? `/jobs/${gslug}/` : '/';
  return tpl
    .replace('__TITLE__', () => esc(title.length > 70 ? `${name}｜${co} - 求人検索` : title))
    .replace(/__OGTITLE__/g, () => esc(`${name}｜${co}（${fmtSalary(j)}）`))
    .replace(/__DESC__/g, () => esc(desc))
    .replace(/__CANON__/g, () => esc(canon))
    .replace('__JSONLD__', () => JSON.stringify([ld, crumbLd]).replace(/<\//g, '<\\/'))
    .replace(/__APPLY__/g, () => esc(apply))
    .replace(/__ID__/g, () => esc(j.id))
    .replace('__BACK__', () => esc(back))
    .replace('__CRUMB__', () => crumb)
    .replace('__MAIN__', () => main)
    .replace('__SIDE__', () => side)
    .replace('__BAR__', () => bar);
}

/* ---------- 職種・勤務地の一覧ページ ---------- */
function cardHtml(ctx, j){
  const name = jobName(j);
  const tags = [];
  empList(j).forEach(t => tags.push(`<span class="tag">${esc(t)}</span>`));
  if(j.jobCategory) tags.push(`<span class="tag tag--cat">${esc(j.jobCategory)}</span>`);
  if(j.remote) tags.push('<span class="tag tag--remote">リモート可</span>');
  const ind = (j.industry && j.industry[0]) ? `<span class="jrow__ind">${esc(j.industry[0])}</span>` : '';
  const loc = locShort(j);
  const band = ctx.empBandOf(j.employeeCount);
  const lead = plain(j.jobContent || j.must || j.companyInfo, 72);
  return `<article class="jrow">
    <div class="jrow__top">${logoHtml(j)}<span class="jrow__co">${esc(j.company || '企業非公開')}</span>${ind}</div>
    <h3 class="jrow__title"><a href="${esc(jobPath(j))}">${esc(name)}</a></h3>
    <div class="card__tags">${tags.join('')}</div>
    ${lead ? `<p class="jrow__desc">${esc(lead)}</p>` : ''}
    <dl class="jrow__meta">
      <dt>想定年収</dt><dd><span class="jrow__sal">${esc(fmtSalary(j))}</span></dd>
      ${loc ? `<dt>勤務地</dt><dd>${esc(loc)}</dd>` : ''}
      ${band ? `<dt>従業員数</dt><dd>${esc(band)}</dd>` : ''}
    </dl>
    <div class="jrow__act">
      <a class="btn-detail" href="${esc(jobPath(j))}">詳細を見る</a>
      <a class="btn-apply" href="${esc(applyHref(ctx.C.APPLY_PAGE, j))}" data-apply="${esc(j.id)}">応募する</a>
    </div>
  </article>`;
}
/* 一覧の並び: 掲載開始日が新しい順 → 年収の高い順（検索画面の「新着順」＋「おすすめ順」に近い） */
function sortForList(arr){
  return arr.slice().sort((a, b) => (Date.parse(b.createdAt || 0) || 0) - (Date.parse(a.createdAt || 0) || 0) || (b.salaryMax || b.salaryMin || 0) - (a.salaryMax || a.salaryMin || 0));
}
function landingPage(ctx, p){
  /* p: { rel:'jobs/engineer/tokyo', title:'東京都のエンジニア求人', h1, jobs:[…], crumbs:[[name,href]…], pills:[{label,href,n}…], pillsTitle, allHref } */
  const jobs = sortForList(p.jobs);
  const n = jobs.length;
  const nSal800 = jobs.filter(j => (j.salaryMax || 0) >= 800).length;
  const nRemote = jobs.filter(j => j.remote).length;
  const nListed = jobs.filter(j => j.listedStatus === '上場').length;
  const cos = new Set(jobs.map(j => j.company).filter(Boolean)).size;
  const canon = `${SITE}/${p.rel}/`;
  const desc = `${p.title}を${n.toLocaleString()}件掲載。年収800万円以上 ${nSal800}件・リモート可 ${nRemote}件。株式会社エージェントベストが運営する20代・30代向けハイクラス転職の求人検索。ご利用は無料です。`;
  const main = `<h1>${esc(p.h1)}<small style="font-size:.7em;color:var(--ink-3);font-weight:700;margin-left:8px">${n.toLocaleString()}件</small></h1>
    <p class="lp__lead">${esc(p.title)}を掲載しています。企業へ直接応募するのではなく、当社から推薦する形で選考が進みます。ご利用は無料です。</p>
    <ul class="lp__stats"><li><b>${n.toLocaleString()}</b>件</li><li><b>${cos.toLocaleString()}</b>社</li><li><b>${nSal800.toLocaleString()}</b>件が年収800万円以上</li><li><b>${nRemote.toLocaleString()}</b>件がリモート可</li><li><b>${nListed.toLocaleString()}</b>件が上場企業</li></ul>
    ${p.pills && p.pills.length ? `<nav class="lp__nav" aria-label="${esc(p.pillsTitle)}"><p>${esc(p.pillsTitle)}</p><div class="lp__pills">${p.pills.map(x => `<a href="${esc(x.href)}">${esc(x.label)}<b>${x.n.toLocaleString()}</b></a>`).join('')}</div></nav>` : ''}
    ${p.pills2 && p.pills2.length ? `<nav class="lp__nav" aria-label="${esc(p.pills2Title)}"><p>${esc(p.pills2Title)}</p><div class="lp__pills">${p.pills2.map(x => `<a href="${esc(x.href)}">${esc(x.label)}<b>${x.n.toLocaleString()}</b></a>`).join('')}</div></nav>` : ''}
    <div class="joblist">${jobs.slice(0, LP_LIST_MAX).map(j => cardHtml(ctx, j)).join('')}</div>
    <div class="lp__all"><a href="${esc(p.allHref)}">${n > LP_LIST_MAX ? `残り${(n - LP_LIST_MAX).toLocaleString()}件を含むすべての求人を絞り込んで見る` : 'この条件で絞り込んで検索する'} →</a></div>
    <div class="lp__cta"><h2>掲載していない非公開求人もあります</h2><p>重要なポジションほど公開されず、非公開で動いています。希望を送っていただければ、掲載外の求人も含めて個別にお探しします。まだ転職を決めていない段階でもかまいません。</p>
      <div class="pd-cta"><a class="btn-apply" href="/${esc(ctx.C.APPLY_PAGE)}" data-apply="">転職支援に申し込む（無料）</a><a class="btn-ghost" href="${esc(ctx.C.CONSULT_URL)}" target="_blank" rel="noopener">まず話だけ聞いてみる</a><a class="line-btn" href="${esc(ctx.C.LINE_ADD_URL)}" target="_blank" rel="noopener noreferrer" data-line-cta="static-lp">${ctx.C.LINE_ICON}<span>LINEで相談する</span></a></div></div>`;
  const crumb = [['ホーム', '/'], ...p.crumbs].map(([nm, href], i, a) => i === a.length - 1 ? `<span class="cur">${esc(nm)}</span>` : `<a href="${esc(href)}">${esc(nm)}</a><span class="sep">›</span>`).join('');
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: p.title, url: canon, description: desc };
  const html = ctx.lpTpl
    .replace('__TITLE__', () => esc(`${p.title}（${n.toLocaleString()}件） - ミドル・ハイクラス転職 求人検索`))
    .replace(/__OGTITLE__/g, () => esc(`${p.title}（${n.toLocaleString()}件）`))
    .replace(/__DESC__/g, () => esc(desc))
    .replace(/__CANON__/g, () => esc(canon))
    .replace('__CRUMB__', () => crumb)
    .replace('__MAIN__', () => main + `<script type="application/ld+json">${JSON.stringify(ld).replace(/<\//g, '<\\/')}</script>`);
  return html;
}

/* ---------- 生成物の掃除（掲載終了の求人ページ・件数が減って消える一覧ページ） ---------- */
function syncDir(dir, keep, label){
  fs.mkdirSync(dir, { recursive: true });
  let removed = 0;
  fs.readdirSync(dir).forEach(f => {
    const p = path.join(dir, f);
    if(!keep.has(f) && fs.statSync(p).isDirectory()){ fs.rmSync(p, { recursive: true, force: true }); removed++; }
  });
  return removed;
}
function writePage(root, rel, html){
  const d = path.join(root, rel);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'index.html'), html, 'utf8');
}

/* ---------- 入口 ---------- */
function readArray(tpl, name){
  const m = tpl.match(new RegExp(`const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\n\\];`));
  if(!m) throw new Error(`template.html に const ${name} が見つかりません`);
  return new Function(`return [${m[1]}]`)();
}
function build(root, full){
  const tpl = fs.readFileSync(path.join(root, 'template.html'), 'utf8');
  const jobTpl = fs.readFileSync(path.join(root, 'job-template.html'), 'utf8');
  const lpTpl = fs.readFileSync(path.join(root, 'landing-template.html'), 'utf8');

  /* 1. CSS を書き出す（検索画面と同じ見た目にする） */
  const style = tpl.match(/<style>\n?([\s\S]*?)<\/style>/);
  if(!style) throw new Error('template.html に <style> が見つかりません');
  fs.writeFileSync(path.join(root, 'assets', 'site.css'), `/* rebuild.js が template.html の <style> から書き出したもの。直接編集しない */\n${style[1]}`, 'utf8');

  /* 2. template.html から定数を読む（応募先・Calendly・LINE・シェアのアイコン・従業員数の段） */
  const C = {};
  ['APPLY_PAGE','INQUIRY_FORM_URL','WAY_TEL','WAY_MAIL','CONSULT_URL','PROFILE_URL','LINE_ADD_URL','LINE_OA_ID','LINE_ICON'].forEach(k => { C[k] = readConst(tpl, k); });
  C.SHARE_ICONS = readObject(tpl, 'SHARE_ICONS');
  const EMP_BANDS = readArray(tpl, 'EMP_BANDS');
  const empBandOf = n => (typeof n === 'number' && n > 0) ? EMP_BANDS.find(b => n <= b.max).label : '';
  const tagPath = path.join(root, 'data', 'tags.json');
  const TAGS = fs.existsSync(tagPath) ? JSON.parse(fs.readFileSync(tagPath, 'utf8')) : [];
  const lpSet = new Set();
  const ctx = {
    C, empBandOf, jobTpl, lpTpl,
    tagCat: Object.fromEntries(TAGS.map(t => [t.name, t.cat || ''])),
    tagSlug: Object.fromEntries(TAGS.map(t => [t.name, t.slug])),
    tagDesc: Object.fromEntries(TAGS.map(t => [t.name, t.desc || ''])),
    tagCatsAll: [...new Set(TAGS.map(t => t.cat).filter(Boolean))],
    lpExists: rel => lpSet.has(rel),
  };

  /* 3. 一覧ページの組み合わせを先に決める（求人ページから「◯◯の求人一覧」へリンクするため） */
  const byGroup = new Map();   // 大分類 → 求人
  const byPref = new Map();    // 都道府県 → 求人
  const unknownGroups = new Set();
  full.forEach(j => {
    const g = jobGroupOf(j.jobCategory);
    if(!GROUP_SLUG[g]) unknownGroups.add(g);
    if(!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(j);
    (j.areas || []).forEach(p => { if(!byPref.has(p)) byPref.set(p, []); byPref.get(p).push(j); });
  });
  if(unknownGroups.size) console.log(`⚠ static-pages.js の GROUP_SLUG に無い職種の大分類（一覧ページを作りません）: ${[...unknownGroups].join(', ')}`);
  const prefsOf = a => a.isBlock ? BLOCKS.find(x => x[0] === a.name)[2] : [a.name];
  const inArea = (a, j) => (j.areas || []).some(p => prefsOf(a).includes(p));
  /* 勤務地の単位: ブロック（関東…）と都道府県。ページを作るのは LP_MIN 件以上のものだけ */
  const areaUnits = [];
  BLOCKS.forEach(([name, slug]) => { const a = { name, slug, isBlock: true }; a.jobs = full.filter(j => inArea(a, j)); if(a.jobs.length >= LP_MIN) areaUnits.push(a); });
  Object.entries(PREF_SLUG).forEach(([name, slug]) => { const jobs = byPref.get(name) || []; if(jobs.length >= LP_MIN) areaUnits.push({ name, slug, jobs, isBlock: false }); });
  const groups = [...byGroup.entries()].filter(([g]) => GROUP_SLUG[g]).sort((a, b) => b[1].length - a[1].length);
  const pages = [];
  groups.forEach(([g, jobs]) => {
    const gslug = GROUP_SLUG[g];
    const combos = areaUnits.map(a => ({ a, jobs: jobs.filter(j => inArea(a, j)) })).filter(x => x.jobs.length >= LP_MIN);
    pages.push({ rel: `jobs/${gslug}`, title: `${g}の転職・求人`, h1: `${g}の求人`, jobs, crumbs: [[`${g}の求人`, `/jobs/${gslug}/`]],
      pillsTitle: '勤務地で絞る', pills: combos.map(x => ({ label: x.a.name, href: `/jobs/${gslug}/${x.a.slug}/`, n: x.jobs.length })),
      pills2Title: '他の職種', pills2: groups.filter(([g2]) => g2 !== g).map(([g2, js]) => ({ label: g2, href: `/jobs/${GROUP_SLUG[g2]}/`, n: js.length })),
      allHref: `/?cat=${encodeURIComponent(g)}` });
    combos.forEach(x => {
      const others = groups.filter(([g2]) => g2 !== g).map(([g2, js]) => ({ g2, n: js.filter(j => inArea(x.a, j)).length })).filter(o => o.n >= LP_MIN);
      pages.push({ rel: `jobs/${gslug}/${x.a.slug}`, title: `${x.a.name}の${g}の転職・求人`, h1: `${x.a.name}の${g}の求人`, jobs: x.jobs,
        crumbs: [[`${g}の求人`, `/jobs/${gslug}/`], [x.a.name, `/jobs/${gslug}/${x.a.slug}/`]],
        pillsTitle: `${g}の他の勤務地`, pills: combos.filter(y => y !== x).map(y => ({ label: y.a.name, href: `/jobs/${gslug}/${y.a.slug}/`, n: y.jobs.length })),
        pills2Title: `${x.a.name}の他の職種`, pills2: others.map(o => ({ label: o.g2, href: `/jobs/${GROUP_SLUG[o.g2]}/${x.a.slug}/`, n: o.n })),
        allHref: `/?cat=${encodeURIComponent(g)}&area=${encodeURIComponent(x.a.name)}` });
    });
  });
  areaUnits.forEach(a => {
    pages.push({ rel: `area/${a.slug}`, title: `${a.name}の転職・求人`, h1: `${a.name}の求人`, jobs: a.jobs, crumbs: [[`${a.name}の求人`, `/area/${a.slug}/`]],
      pillsTitle: '職種で絞る', pills: groups.map(([g, js]) => ({ g, n: js.filter(j => inArea(a, j)).length })).filter(x => x.n >= LP_MIN).map(x => ({ label: x.g, href: `/jobs/${GROUP_SLUG[x.g]}/${a.slug}/`, n: x.n })),
      pills2Title: '他の勤務地', pills2: areaUnits.filter(b => b !== a).map(b => ({ label: b.name, href: `/area/${b.slug}/`, n: b.jobs.length })),
      allHref: `/?area=${encodeURIComponent(a.name)}` });
  });
  pages.forEach(p => lpSet.add(p.rel));

  /* 4. 求人ページ */
  const jobRoot = path.join(root, 'job');
  const removedJobs = syncDir(jobRoot, new Set(full.map(j => j.id)));
  full.forEach(j => {
    const g = jobGroupOf(j.jobCategory);
    const pref = (j.areas || [])[0];
    const pool = (byGroup.get(g) || []).filter(x => x !== j);
    const related = sortForList(pref ? pool.filter(x => (x.areas || []).includes(pref)) : []).slice(0, RELATED_MAX);
    if(related.length < RELATED_MAX) sortForList(pool.filter(x => !related.includes(x))).slice(0, RELATED_MAX - related.length).forEach(x => related.push(x));
    writePage(jobRoot, j.id, jobPage(ctx, j, related));
  });
  console.log(`job/<求人ID>/index.html を書き出しました: ${full.length}件${removedJobs ? `（掲載終了 ${removedJobs}件のページを削除）` : ''}`);

  /* 5. 一覧ページ（件数が減って LP_MIN を割ったページは消す） */
  ['jobs', 'area'].forEach(top => syncDir(path.join(root, top), new Set(pages.filter(p => p.rel.startsWith(top + '/')).map(p => p.rel.split('/')[1]))));
  groups.forEach(([g]) => syncDir(path.join(root, 'jobs', GROUP_SLUG[g]), new Set(pages.filter(p => p.rel.startsWith(`jobs/${GROUP_SLUG[g]}/`)).map(p => p.rel.split('/')[2]))));
  pages.forEach(p => writePage(root, p.rel, landingPage(ctx, p)));
  const nCombo = pages.filter(p => p.rel.split('/').length === 3).length;
  console.log(`一覧ページを書き出しました: 職種 ${groups.length}・職種×勤務地 ${nCombo}・勤務地 ${areaUnits.length}（各 ${LP_MIN}件以上）`);

  /* 6. sitemap.xml / robots.txt */
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const urls = [{ loc: `${SITE}/`, lastmod: today, pri: '1.0' }]
    .concat(pages.map(p => ({ loc: `${SITE}/${p.rel}/`, lastmod: today, pri: '0.8' })))
    .concat(full.map(j => ({ loc: SITE + jobPath(j), lastmod: j.createdAt || (j.recordCreatedAt || today).slice(0, 10), pri: '0.6' })));
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map(u => `<url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod}</lastmod><priority>${u.pri}</priority></url>`).join('\n') + '\n</urlset>\n';
  fs.writeFileSync(path.join(root, 'sitemap.xml'), xml, 'utf8');
  /* data/（求人JSON）と assets/ は検索結果に出しても意味が無いので除外する */
  fs.writeFileSync(path.join(root, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /data/\n\nSitemap: ${SITE}/sitemap.xml\n`, 'utf8');
  console.log(`sitemap.xml を書き出しました: ${urls.length} URL`);
}

module.exports = { build };
