// 使い方: node tools/check-guide.js [--drafts] [slug ...]
// 転職ガイドの原稿を _guide/RULES.md のルールで検査する。警告が1件でもあれば終了コード1。
//   既定は _guide/articles/（公開分）。--drafts で _guide/drafts/（書きかけ）を検査する。
// freelance の tools/check-media.js を jobs 用にしたもの。
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '_guide');
const tax = JSON.parse(fs.readFileSync(path.join(root, 'taxonomy.json'), 'utf8'));
const hubs = new Set(tax.groups.flatMap(g => g.hubs.map(h => h[0])));
const plan = Object.fromEntries(fs.readFileSync(path.join(root, 'plan.tsv'), 'utf8').replace(/\r/g, '').trim().split('\n').slice(1)
  .map(l => l.split('\t')).map(([no, hub, slug, title]) => [slug, { hub, title }]));

// 制度・法律の数字を扱うハブは、公的な出典を必須にする
const NEED_SOURCES = new Set(['posting-terms', 'salary-terms', 'working-conditions', 'offer', 'labor']);
const NG = [
  [/(?<!「)必ず(?!しも|ご確認|確認|ご相談)/, '「必ず」（「必ずしも」「必ずご確認ください」は可）'],
  [/確実に/, '「確実に」'], [/絶対(?!に避け)/, '「絶対」'], [/圧倒的/, '「圧倒的」'],
  [/ではないでしょうか/, '「〜ではないでしょうか」'], [/いかがでしょうか/, '「いかがでしょうか」'],
  [/リクナビ|マイナビ|doda|デューダ|ビズリーチ|BIZREACH|エン転職|エン・ジャパン|green-japan|Wantedly|ウォンテッドリー|indeed|インディード|求人ボックス|LinkedIn|リンクトイン|type転職|転職会議|OpenWork|オープンワーク|ジョブミル|キャリアバンク|キャリコネ|ミイダス|AMBI|アンビ|ReSUM|パーソルキャリア|リクルートエージェント|JAC|ジェイエイシー|ワークポート|パソナ|ランスタッド|マイケルペイジ|ロバート・ウォルターズ|レバテック|Geekly|ギークリー|HRMOS|HERP|Lever/i, '媒体・他社エージェント・ATS の名前'],
  [/当社の手数料|弊社の手数料|紹介手数料は\d|手数料率|(理論)?年収の\d+(\.\d+)?[%％]/, '当社の手数料'],
  [/(\d+歳|年齢|男性|女性|学歴|大卒|高卒|国籍)(だから|なので|のため|が理由)/, '年齢・性別・学歴・国籍を理由にした表現'],
  [/一緒に整理するようにしています|書面で回答しています|ようにしています|を徹底しています|必ずお伝えしています/, '決まっていない当社の運用（RULES.md の範囲だけ）'],
];

const args = process.argv.slice(2);
const drafts = args.includes('--drafts');
const targets = args.filter(a => !a.startsWith('--'));
const dir = path.join(root, drafts ? 'drafts' : 'articles');
if(!fs.existsSync(dir)){ console.log(`${dir} がありません`); process.exit(0); }
const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') && (!targets.length || targets.includes(f.replace(/\.md$/, ''))));
let warn = 0;
for(const f of files){
  const slug = f.replace(/\.md$/, '');
  const raw = fs.readFileSync(path.join(dir, f), 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const msgs = [];
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if(!m){ console.log(`✖ ${slug}: frontmatter がない`); warn++; continue; }
  const fm = {};
  for(const line of m[1].split('\n')){
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if(kv) fm[kv[1]] = kv[2].trim();
  }
  const body = m[2];
  const parse = k => { try{ return JSON.parse(fm[k] || '[]'); }catch(e){ msgs.push(`${k} が JSON として読めない`); return []; } };
  const sources = parse('sources'), tags = parse('tags'), related = parse('related');
  if(!plan[slug]) msgs.push('plan.tsv にない slug');
  else if(plan[slug].hub !== fm.hub) msgs.push(`hub が plan.tsv（${plan[slug].hub}）と違う`);
  if(!hubs.has(fm.hub)) msgs.push(`taxonomy.json にない hub: ${fm.hub}`);
  for(const k of ['title', 'description', 'pubDate']) if(!fm[k]) msgs.push(`${k} がない`);
  const tl = (fm.title || '').length;
  if(tl < 20 || tl > 50) msgs.push(`title の長さ ${tl}字（20〜50字）`);
  const dl = (fm.description || '').length;
  if(dl < 60 || dl > 140) msgs.push(`description の長さ ${dl}字（60〜140字）`);
  if(!tags.length) msgs.push('tags が空');
  for(const r of related) if(!plan[r]) msgs.push(`related に plan.tsv にない slug: ${r}`);
  if(/^#\s/m.test(body)) msgs.push('本文に H1（# 見出し）がある');
  const views = (body.match(/^:::view/gm) || []).length;
  if(views < 2) msgs.push(`エージェントベストの見解（:::view）が ${views} 箇所（2箇所必要）`);
  const opens = (body.match(/^:::\w+/gm) || []).length, closes = (body.match(/^:::\s*$/gm) || []).length;
  if(opens !== closes) msgs.push(`::: の開きと閉じの数が合わない（${opens}/${closes}）`);
  const faqIdx = body.search(/^## よくある(ご)?質問/m);
  if(faqIdx < 0) msgs.push('「## よくある質問」がない');
  else if((body.slice(faqIdx).match(/^### /gm) || []).length < 3) msgs.push('よくある質問の ### が3つ未満');
  const toha = body.split('\n').find(l => /^## [^｜|？?]{1,20}とは(\s|$|｜|\|)/.test(l));
  if(toha) msgs.push(`H2 が「〜とは」で始まる: ${toha}`);
  const len = body.replace(/^:::.*$/gm, '').replace(/[#|*\-\s>`]/g, '').length;
  if(len < 3500) msgs.push(`本文が短い（約${len}字・3,500字以上）`);
  if(len > 9000) msgs.push(`本文が長すぎる（約${len}字・9,000字以下）`);
  if(NEED_SOURCES.has(fm.hub) && !sources.length) msgs.push('sources が空（制度を扱うハブは公的な出典が必要）');
  for(const s of sources) if(!s.t || !/^https:\/\//.test(s.u || '')) msgs.push(`sources の形が不正: ${JSON.stringify(s)}`);
  // 本文に年収・件数の具体的な数字を書かない（掲載データはテンプレートが毎朝差し込む）
  // 公的な上限額・控除額（出典つき）は書いてよいので、年収・求人に直接かかる額と件数だけ止める
  const num = body.match(/(年収|月給|給与|提示額)[^。\n]{0,8}\d{3,4}万円|\d{3,4}万円(以上|台|前後|程度)?の(求人|年収)|\d[\d,]*件の求人|求人(は|が)\d[\d,]*件/);
  if(num) msgs.push(`本文に年収額・求人件数がある（…${body.slice(Math.max(0, num.index - 12), num.index + 12).replace(/\n/g, ' ')}…）。掲載データはページ下に自動で出るので、本文では出典つきの数字以外を書かない`);
  for(const lk of body.match(/\]\((\/[^)\s]*)\)/g) || []){
    const u = lk.slice(2, -1);
    const g = u.match(/^\/guide\/([a-z0-9-]+)\/$/);
    if(g && !plan[g[1]]) msgs.push(`plan.tsv にない記事へのリンク: ${u}`);
    else if(!g && u !== '/' && !/^\/(jobs\/[a-z-]+\/(market\/)?|company\/|feature\/[a-z0-9-]+\/|apply\.html|guide\/)$/.test(u) && !/^\/(jobs|company|feature)\//.test(u)) msgs.push(`サイト内リンクの形が想定外: ${u}`);
  }
  const text = m[1] + '\n' + body;
  for(const [re, label] of NG){ const hit = text.match(re); if(hit) msgs.push(`使わない表現: ${label}（…${text.slice(Math.max(0, hit.index - 10), hit.index + 15).replace(/\n/g, ' ')}…）`); }
  if(msgs.length){ warn += msgs.length; console.log(`✖ ${slug}\n  - ${msgs.join('\n  - ')}`); }
  else console.log(`✓ ${slug}（約${len}字）`);
}
console.log(`\n${files.length} 本を検査、警告 ${warn} 件`);
process.exit(warn ? 1 : 0);
