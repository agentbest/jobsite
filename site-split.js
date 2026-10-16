/* ---------- jobs.agent-best.net と skill.agent-best.net の振り分け ----------
   2026-10-16 松岡さん指示で作り替え: 「skill に重要な求人が載っているので職種で分けたい。まず jobs は求人票DBにあるものは掲載」
   「未経験可能な転職や、ブルーカラー系職種を skill に掲載されるようにしたい」。
     jobs  … 中途の求人をすべて載せる（年収・職種で落とさない）。moved は空＝ skill へ転送する求人は無い
     skill … jobs の一部。次のどれかに当たる求人だけを載せる（年収は見ない）
       1) 未経験可 … タグ UNEXPERIENCED_TAGS のどれか、または求人名・職種名に「未経験」
       2) ブルーカラー・現場系の職種 … 職種（小分類）が BLUE_COLLAR_CATEGORIES、または大分類が BLUE_COLLAR_GROUPS
       3) 職種が「その他」「オープンポジション」・空のときだけ、求人名・職種名に BLUE_COLLAR_WORDS（製造・配送・介護…）
     両サイトに同じ求人が出る（skill の求人は jobs にも必ずある）。
   旧基準（2026-10-15〜10-16）: jobs＝年収下限600万円以上かつ施工管理以外、skill＝それ以外。重複なしだった。
   ⚠ このファイルは agentbest/jobsite と agentbest/skill で**まったく同じ中身**にする（鏡写し）。
     片方だけ直すと、両サイトの件数・転送（moved.json）が食い違う。直したら両方にコピーして両方 rebuild する。
   ⚠ Airtable のデータは触らない。掲載先の判断はビルド側だけに置く（midCareerOnly() と同じ考え方）。 */
const HIGH_CLASS_MIN = 600;                       /* 万円（旧基準。いまは振り分けに使っていない） */
const UNEXPERIENCED_TAGS = new Set(['未経験歓迎', '業界未経験歓迎', '職種未経験歓迎', '未経験から年収400万円以上']);
const BLUE_COLLAR_GROUPS = new Set(['施工管理', '小売・飲食', '交通・運輸', '旅行・ホテル', '保育', '医療・看護・薬剤']);
const BLUE_COLLAR_CATEGORIES = new Set([
  '製図・CADオペレーター（建築・土木）', '積算（建築・土木）', 'その他（建築・土木）',
  '商品・在庫管理（物流・購買・貿易）', '生産管理（機械）', '品質管理（機械）'
]);
const BLUE_COLLAR_WORDS = /製造|工場|組立|組み立て|加工|検査|梱包|軽作業|オペレーター|技能|配送|ドライバー|運転|倉庫|仕分け|フォークリフト|リーチリフト|清掃|警備|介護|ケアマネ|ヘルパー|看護|保育|整備|塗装|板金|溶接|電気工事|配管|大工|職人|施工|現場|設備|保守|メンテナンス|調理|販売|接客|店舗|ホール|フロント|コンシェルジュ|美容/;
const OTHER_CATEGORY = /^(その他（その他）|オープンポジション)?$/;

function jobGroupOf(v){ const m = String(v || '').match(/（([^（）]+)）s*$/); return m ? m[1] : 'その他'; }
function salaryFloor(j){ return j.salaryMin != null ? j.salaryMin : (j.salaryMax != null ? j.salaryMax : null); }
function nameOf(j){ return String(j.title || '') + ' ' + String(j.position || ''); }

function isUnexperienced(j){ return (j.tags || []).some(t => UNEXPERIENCED_TAGS.has(t)) || /未経験/.test(nameOf(j)); }
function isBlueCollar(j){
  const c = String(j.jobCategory || '').trim();
  if(BLUE_COLLAR_CATEGORIES.has(c) || BLUE_COLLAR_GROUPS.has(jobGroupOf(c))) return true;
  return OTHER_CATEGORY.test(c) && BLUE_COLLAR_WORDS.test(nameOf(j));
}
function skillOnly(j){ return isUnexperienced(j) || isBlueCollar(j); }  /* skill の掲載基準 */

/* site: 'jobs' | 'skill'。戻り値 { kept, moved }。moved は相手のサイトに出る求人（404.html の転送先に使う） */
function splitForSite(jobs, site){
  const mine = site === 'jobs' ? (() => true) : skillOnly;
  const kept = [], moved = [];
  jobs.forEach(j => (mine(j) ? kept : moved).push(j));
  const other = site === 'jobs' ? 'skill.agent-best.net' : 'jobs.agent-best.net';
  const nU = kept.concat(moved).filter(isUnexperienced).length, nB = kept.concat(moved).filter(isBlueCollar).length;
  console.log(`サイト振り分け（${site}）: 掲載 ${kept.length}件 ／ ${other} だけにある求人 ${moved.length}件`
    + `（基準: jobs は中途全件。skill は未経験可 ${nU}件・ブルーカラー系 ${nB}件のどちらか）`);
  return { kept, moved };
}

module.exports = { HIGH_CLASS_MIN, UNEXPERIENCED_TAGS, BLUE_COLLAR_GROUPS, BLUE_COLLAR_CATEGORIES, isUnexperienced, isBlueCollar, skillOnly, splitForSite, salaryFloor };
