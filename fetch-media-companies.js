// 転職メディア（www.agent-best.net/media/）の記事一覧から、求人サイトがリンクに使う2つの表を作る。
//   node fetch-media-companies.js  → data/media-companies.json（{ 企業レコードID: [記事slug, 記事タイトル] }）… 企業記事と求人DB（企業）を社名で突き合わせ
//                                 → data/media-guides.json（{ ハブslug: [[記事slug, タイトル, 種類], …] }）… 求人ページの「応募前に読む」用
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
    .replace(/[\s・.,\-‐－&＆'’]/g, '');   // ⚠ 長音「ー」は消さない（アルー/アール が同じになる）
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
  const ambiguous = [];
  articles.forEach(([slug, title, , , , name]) => {
    const cs = byNorm.get(norm(name));
    if(!cs){ miss++; return; }
    /* 社名が同じ（または正規化すると同じ）会社が複数あるときは、どの会社の記事か社名だけでは決められないので付けない。
       同じ会社の二重登録は 2026-10-29 に Airtable 側で統合済み。残っているのはグリッド・シンカのような別会社 */
    if(cs.length > 1){ ambiguous.push(`${name}（${cs.length}社）`); return; }
    out[cs[0].id] = [slug, title];
  });
  if(ambiguous.length) console.log(`⚠ 同じ社名の会社が複数あるため記事を付けなかった企業記事 ${ambiguous.length}本: ${ambiguous.join(', ')}`);
  fs.writeFileSync(OUT, JSON.stringify(out));
  /* 職種ごとの選考対策記事。slug が {ハブ}-resume / -interview / -motivation / -salary で揃っている（media-gen の命名規則） */
  const KIND = { resume: '職務経歴書', interview: '面接対策', motivation: '志望動機', salary: '年収相場' };
  const guides = {};
  idx.i.forEach(([slug, title]) => {
    const m = slug.match(/^(.+)-(resume|interview|motivation|salary)$/);
    if(!m) return;
    (guides[m[1]] = guides[m[1]] || []).push([slug, title, KIND[m[2]]]);
  });
  const ORDER = ['職務経歴書', '志望動機', '面接対策', '年収相場'];
  Object.values(guides).forEach(a => a.sort((x, y) => ORDER.indexOf(x[2]) - ORDER.indexOf(y[2])));
  fs.writeFileSync(path.join(__dirname, 'data', 'media-guides.json'), JSON.stringify(guides));
  /* 記事ごとの求人（media-jobs.js）用の記事一覧 [[slug, カテゴリ, ハブslug, 企業名, ハブ名], ...]。
     ハブslug は search.json の s（h と同じ並び）。s が無い古いインデックスでは null＝企業記事だけ求人が付く */
  const hubSlugs = idx.s || [];
  const mediaIndex = idx.i.map(r => [r[0], idx.c[r[3]], hubSlugs[r[4]] || null, r[5] || '', idx.h[r[4]] || '']);
  fs.writeFileSync(path.join(__dirname, 'data', 'media-index.json'), JSON.stringify(mediaIndex));
  console.log(`記事一覧: ${mediaIndex.length}本（ハブslugあり ${mediaIndex.filter(r => r[2]).length}本） → data/media-index.json`);
  console.log(`職種ガイド記事: ${Object.keys(guides).length}職種ぶん → data/media-guides.json`);
  console.log(`転職メディアの企業記事 ${articles.length}本 → 企業ページと一致 ${articles.length - miss}本（企業DBに無い ${miss}本）。data/media-companies.json に ${Object.keys(out).length}社`);
})();
