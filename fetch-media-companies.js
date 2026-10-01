// 転職メディア（www.agent-best.net/media/）の企業記事と、求人DB（企業）の企業を社名で突き合わせる。
//   node fetch-media-companies.js  → data/media-companies.json（{ 企業レコードID: [記事slug, 記事タイトル] }）
//
// 企業ページ・求人ページから「◯◯の評判・年収・選考対策（転職メディア）」へリンクするため（2026-10-01）。
// 記事側の一覧はコーポレートの検索インデックス /media/search.json を読む（i: [slug, title, desc, カテゴリ番号, ハブ番号, 企業名, …]）。
// 取得に失敗したら前回の data/media-companies.json をそのまま使う（求人の更新は止めない）。
//
// ⚠ 逆向き（記事→企業ページ）は agentbest-lp の tools/jobsite-companies/fetch.mjs。社名の正規化 norm() は同じものを使う。
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'data', 'media-companies.json');
const SRC = 'https://www.agent-best.net/media/search.json';

/* 社名の正規化：全角半角・法人格・空白や記号の違いを吸収する */
function norm(s){
  return String(s || '').normalize('NFKC').toLowerCase()
    .replace(/(株式会社|有限会社|合同会社|合資会社|一般社団法人|一般財団法人|公益財団法人|\(株\)|co\.,? ?ltd\.?|inc\.?|corporation|corp\.?|k\.k\.)/g, '')
    .replace(/[\s・.,\-‐－ー&＆'’]/g, '');
}

(async () => {
  let idx;
  try {
    const res = await fetch(SRC);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    idx = await res.json();
  } catch(e) {
    console.log(`⚠ ${SRC} を取得できませんでした（${e.message}）。data/media-companies.json は前回のままにします。`);
    return;
  }
  const catCompany = idx.c.indexOf('企業');
  const articles = idx.i.filter(r => r[3] === catCompany && r[5]);
  const companies = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'companies.json'), 'utf8'));
  const byNorm = new Map();
  companies.forEach(c => { const k = norm(c.name); if(!byNorm.has(k)) byNorm.set(k, []); byNorm.get(k).push(c); });
  const out = {};
  let miss = 0;
  articles.forEach(([slug, title, , , , name]) => {
    const cs = byNorm.get(norm(name));
    if(!cs){ miss++; return; }
    /* 「AI inside 株式会社」「AI inside株式会社」のような二重登録は、どれにも同じ記事を付ける */
    cs.forEach(c => { out[c.id] = [slug, title]; });
  });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`転職メディアの企業記事 ${articles.length}本 → 企業ページと一致 ${articles.length - miss}本（企業DBに無い ${miss}本）。data/media-companies.json に ${Object.keys(out).length}社`);
})();
