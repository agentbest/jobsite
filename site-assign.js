/* 1求人を載せるサイトを決める（data/site-assign.json）— 2026-11-15
 *
 * 松岡さん「必ず各求人は最高2つのサイトまでしか載せない」。決めた形（同日）：
 *   - jobs.agent-best.net には常に載せる（正規URL＝jobs の /job/<ID>/）
 *   - 2つ目は「skill」か「特化サイト1つ」のどちらか1つだけ
 *       skill に出る求人（site-split.js の skillOnly）→ jobs＋skill。特化サイトには出さない
 *       それ以外 → 特化サイトの条件に当たるものから PRIORITY の順で1つ（当たらなければ jobs だけ）
 *   - Airtable「掲載する特化サイト（手動）」fldCTFmQxQfo1vHAG が入っていればそれを優先（「jobsのみ」で特化サイトに出さない）。
 *     ⚠ 手動の値でも skill に出る求人は特化サイトに出さない（3サイトになるため）。ログに名指しする。
 *
 * 使う側：jobs-front（Vercel）の api/specialty.js が一覧をこのファイルで絞る。
 *   特化サイト・エージェントベストサーチで /job/<ID>/ を開いたら jobs へ 301（api/specialty-page.js・api/agent-guide.js）。
 * ⚠ 条件の正規表現は jobs-front の api/specialty.js にあったものの写し（この版が正。jobs-front 側は読み込みに失敗したときの保険）。
 */
const fs = require('fs');
const path = require('path');
const { skillOnly } = require('./site-split');

const SPECIALTY = {
  ma: { label: 'M&A転職', role: /m\s*(?:&|＆|and)\s*a(?![a-z])|事業承継|企業買収|合併買収|(?:^|[^a-z])(?:pmi|fas)(?![a-z])|mergers?\s+(?:&|and)\s+acquisitions?/i },
  embedded: { label: '組込み転職', role: /組み?込(?:み)?|ファーム(?:ウェア|ウエア)|embedded|firmware|IoT|車載(?:ソフト|制御)|マイコン|制御ソフト/i },
  pm: { label: 'PM転職', role: /プロ(?:ジェクト|ダクト)[・\s]?(?:マネ[ーイ]?ジャー?|マネジメント|責任者|リーダー?)|プロマネ|(?:^|[^a-z])(?:pjm|pdm|pmo|pm)(?![a-z])|(?:project|product)\s+manag(?:er|ement)/i },
  consult: { label: 'コンサル転職', role: /コンサル|consult(?:ant|ing)|アドバイザリー/i },
  sales: { label: '営業転職', role: /営業(?!事務|アシスタント|サポート|所|日)|セールス(?!フォース)|アカウント(?:エグゼクティブ|マネージャー)|\b(?:sales|account executive|account manager|SDR|BDR)\b/i },
};
/* 当たる特化サイトが複数あるときの優先順：狭い領域ほど先（M&Aコンサル営業 → M&A） */
const PRIORITY = ['ma', 'embedded', 'pm', 'consult', 'sales'];
const MANUAL = Object.fromEntries(Object.entries(SPECIALTY).map(([k, v]) => [v.label, k]));
MANUAL['jobsのみ'] = '';

function embeddedRole(position, category) {
  const role = (position + ' ' + category).normalize('NFKC');
  if (!SPECIALTY.embedded.role.test(role)) return false;
  if (/技術営業|プリセールス|セールスエンジニア|sales engineer|pre[- ]?sales|フィールドアプリケーションエンジニア|\bFAE\b/i.test(role)) return true;
  if (/人事|人材紹介|採用担当|マーケティング|営業|セールス|経理|総務|広報/.test(position)) return false;
  return /エンジニア|技術者|設計|開発|評価|テスト|検証|実装|プログラマ|engineer|developer|ソフトウェア|ファームウェア/i.test(role);
}
function matches(key, j) {
  const pos = String(j.position || ''), cat = String(j.jobCategory || ''), title = String(j.title || '');
  if (key === 'embedded') return embeddedRole(pos || title, cat);
  const re = SPECIALTY[key].role;
  return [pos, cat].some(v => re.test(v.normalize('NFKC'))) || (!pos && re.test(title.normalize('NFKC')));
}
function autoSite(j) { return PRIORITY.find(k => matches(k, j)) || ''; }

/* full＝jobs に載せる求人（全項目）。戻り値 { id: 'skill'|'ma'|… }（jobs だけの求人は入れない） */
function assign(full) {
  const out = {}, conflict = [];
  for (const j of full) {
    const onSkill = skillOnly(j);
    const manual = j.siteManual && Object.prototype.hasOwnProperty.call(MANUAL, j.siteManual) ? MANUAL[j.siteManual] : null;
    if (onSkill) {
      out[j.id] = 'skill';
      if (manual) conflict.push(`${j.id} ${j.siteManual}（skill に出る求人なので特化サイトには出さない）`);
      continue;
    }
    const site = manual !== null ? manual : autoSite(j);
    if (site) out[j.id] = site;
  }
  return { out, conflict };
}

function build(root, full) {
  const { out, conflict } = assign(full);
  const sites = {};
  Object.entries(out).forEach(([id, s]) => { (sites[s] = sites[s] || []).push(id); });
  Object.values(sites).forEach(a => a.sort());
  const updated = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  fs.writeFileSync(path.join(root, 'data', 'site-assign.json'), JSON.stringify({ updated, sites }), 'utf8');
  const cnt = Object.fromEntries(['skill'].concat(PRIORITY).map(k => [k, (sites[k] || []).length]));
  const manualN = full.filter(j => j.siteManual).length;
  console.log(`掲載サイトの割り当て（1求人は最大2サイト）: jobs ${full.length}件のうち skill ${cnt.skill}／`
    + PRIORITY.map(k => `${SPECIALTY[k].label} ${cnt[k]}`).join('・')
    + `／jobs だけ ${full.length - Object.keys(out).length}件（手動指定 ${manualN}件）`);
  if (conflict.length) { console.log(`  ⚠ 手動指定が skill と重なった求人 ${conflict.length}件:`); conflict.slice(0, 20).forEach(x => console.log('   ' + x)); }
  return out;
}

module.exports = { build, assign, autoSite, PRIORITY, SPECIALTY };
