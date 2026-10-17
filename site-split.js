/* ---------- jobs.agent-best.net と skill.agent-best.net の振り分け ----------
   2026-10-16 松岡さん指示で作り替え: 「skill に重要な求人が載っているので職種で分けたい。まず jobs は求人票DBにあるものは掲載」
   「未経験可能な転職や、ブルーカラー系職種を skill に掲載されるようにしたい」。
     jobs  … 中途の求人を載せる（年収では落とさない）。ただし職種が JOBS_HIDDEN_* に当たる求人は出さない（下記）
     skill … jobs の一部。次のどれかに当たる求人だけを載せる（年収は見ない）
       1) 未経験可 … タグ UNEXPERIENCED_TAGS のどれか、または求人名・職種名に「未経験」
       2) ブルーカラー・現場系の職種 … 職種（小分類）が BLUE_COLLAR_CATEGORIES、または大分類が BLUE_COLLAR_GROUPS
          技術職（設計・生産技術など）… 大分類が TECH_GROUPS（10/16 追加・松岡さん「設計・生産技術などの技術職もいれよう」）
       3) 職種が「その他」「オープンポジション」・空のときだけ、求人名・職種名に BLUE_COLLAR_WORDS（製造・配送・介護…）
     両サイトに同じ求人が出る（skill の求人は jobs にも必ずある）。
   2026-10-17 松岡さん指示: 職種カテゴリの大カテゴリ「保育・教育・通訳」「その他」「美容・ブライダル・ホテル・交通」
     「流通・小売・飲食」「芸能・エンタメ」と、中カテゴリ「建築・土木」は jobs に出さない（skill の基準は変えない）。
     大・中カテゴリは Airtable「求人票（職種マスタ）」tblyM7SCIRzLoSQG7 の値。求人の職種カテゴリは「小分類（中カテゴリ）」なので
     末尾の括弧＝中カテゴリで判定する。職種マスタに中カテゴリを足したら JOBS_HIDDEN_GROUPS も見直す。
     同日追加の指示「jobs と skill は出る求人を分けて欲しい」「重なるのは仕方ない。施工管理・電気電子/機械/半導体などの技術職は skill が良い」:
       施工管理と TECH_GROUPS（技術職）も jobs に出さない。jobs に出さない求人はすべて skill に出す（どちらにも出ない求人を作らない）。
       両方に出るのは「未経験可」の求人だけ。
     moved（404 の転送先）は相手のサイトに実際に載る求人だけ。
   旧基準（2026-10-15〜10-16）: jobs＝年収下限600万円以上かつ施工管理以外、skill＝それ以外。重複なしだった。
   ⚠ このファイルは agentbest/jobsite と agentbest/skill で**まったく同じ中身**にする（鏡写し）。
     片方だけ直すと、両サイトの件数・転送（moved.json）が食い違う。直したら両方にコピーして両方 rebuild する。
   ⚠ Airtable のデータは触らない。掲載先の判断はビルド側だけに置く（midCareerOnly() と同じ考え方）。 */
const HIGH_CLASS_MIN = 600;                       /* 万円（旧基準。いまは振り分けに使っていない） */
const UNEXPERIENCED_TAGS = new Set(['未経験歓迎', '業界未経験歓迎', '職種未経験歓迎', '未経験から年収400万円以上']);
const BLUE_COLLAR_GROUPS = new Set(['施工管理', '小売・飲食', '交通・運輸', '旅行・ホテル', '保育', '医療・看護・薬剤']);
const TECH_GROUPS = new Set(['機械', '電気・電子', '半導体', '建築・土木', '食品']);  /* 機械設計・回路設計・制御設計・生産技術・建築設計・電気設備設計など */
const BLUE_COLLAR_CATEGORIES = new Set([
  '製図・CADオペレーター（建築・土木）', '積算（建築・土木）', 'その他（建築・土木）',
  '商品・在庫管理（物流・購買・貿易）', '生産管理（機械）', '品質管理（機械）'
]);
const BLUE_COLLAR_WORDS = /製造|工場|組立|組み立て|加工|検査|梱包|軽作業|オペレーター|技能|配送|ドライバー|運転|倉庫|仕分け|フォークリフト|リーチリフト|清掃|警備|介護|ケアマネ|ヘルパー|看護|保育|整備|塗装|板金|溶接|電気工事|配管|大工|職人|施工|現場|設備|保守|メンテナンス|調理|販売|接客|店舗|ホール|フロント|コンシェルジュ|美容/;
/* jobs に出さない職種。大カテゴリ → その中カテゴリ（2026-10-17 時点の職種マスタ）＋中カテゴリ「建築・土木」 */
const JOBS_HIDDEN_BIG = new Set(['保育・教育・通訳', 'その他', '美容・ブライダル・ホテル・交通', '流通・小売・飲食', '芸能・エンタメ']);
const JOBS_HIDDEN_GROUPS = new Set([
  '教師・講師・インストラクター', '保育', '通訳・翻訳',                                  /* 保育・教育・通訳 */
  'その他',                                                                              /* その他 */
  '交通・運輸', '旅行・ホテル', 'ブライダル・葬祭', 'エステ・理美容・リラクゼーション',   /* 美容・ブライダル・ホテル・交通 */
  '小売・飲食', '流通',                                                                  /* 流通・小売・飲食 */
  '芸能・エンタメ',                                                                      /* 芸能・エンタメ */
  '建築・土木',                                                                          /* 中カテゴリ（大カテゴリ 建築・不動産 の一部） */
  '施工管理'                                                                             /* 10/17 追加。技術職は TECH_GROUPS を jobsShown() で見る */
]);
const OTHER_CATEGORY = /^(その他（その他）|オープンポジション)?$/;

function jobGroupOf(v){ const m = String(v || '').match(/（([^（）]+)）s*$/); return m ? m[1] : 'その他'; }
function salaryFloor(j){ return j.salaryMin != null ? j.salaryMin : (j.salaryMax != null ? j.salaryMax : null); }
function nameOf(j){ return String(j.title || '') + ' ' + String(j.position || ''); }

function isUnexperienced(j){ return (j.tags || []).some(t => UNEXPERIENCED_TAGS.has(t)) || /未経験/.test(nameOf(j)); }
function isBlueCollar(j){
  const c = String(j.jobCategory || '').trim();
  if(BLUE_COLLAR_CATEGORIES.has(c) || BLUE_COLLAR_GROUPS.has(jobGroupOf(c))) return true;
  if(TECH_GROUPS.has(jobGroupOf(c))) return true;
  return OTHER_CATEGORY.test(c) && BLUE_COLLAR_WORDS.test(nameOf(j));
}
function skillOnly(j){ return isUnexperienced(j) || isBlueCollar(j) || !jobsShown(j); }  /* skill の掲載基準（jobs に出さない求人は必ず skill へ） */
/* jobs の掲載基準。⚠ jobGroupOf() は括弧が無いと「その他」を返すので使わない（オープンポジション・空を隠さないため） */
function jobsShown(j){
  const c = String(j.jobCategory || '').trim(), m = c.match(/（([^（）]+)）s*$/);
  return !(JOBS_HIDDEN_BIG.has(c) || (m && (JOBS_HIDDEN_GROUPS.has(m[1]) || TECH_GROUPS.has(m[1]))));
}
function keptOn(site){ return site === 'jobs' ? jobsShown : skillOnly; }

/* site: 'jobs' | 'skill'。戻り値 { kept, moved }。moved は相手のサイトに出る求人（404.html の転送先に使う） */
function splitForSite(jobs, site){
  const mine = keptOn(site), theirs = keptOn(site === 'jobs' ? 'skill' : 'jobs');
  const kept = [], moved = [];
  jobs.forEach(j => { if(mine(j)) kept.push(j); else if(theirs(j)) moved.push(j); });
  const hidden = jobs.length - kept.length - moved.length;
  const other = site === 'jobs' ? 'skill.agent-best.net' : 'jobs.agent-best.net';
  const nU = kept.concat(moved).filter(isUnexperienced).length, nB = kept.concat(moved).filter(isBlueCollar).length;
  console.log(`サイト振り分け（${site}）: 掲載 ${kept.length}件 ／ ${other} だけにある求人 ${moved.length}件`
    + (hidden ? `・どちらにも出さない ${hidden}件` : '')
    + `（基準: jobs は中途から一部職種・施工管理・技術職を除く。skill は jobs に出ない求人＋未経験可 ${nU}件・ブルーカラー・技術職 ${nB}件）`);
  return { kept, moved };
}

module.exports = { HIGH_CLASS_MIN, UNEXPERIENCED_TAGS, BLUE_COLLAR_GROUPS, BLUE_COLLAR_CATEGORIES, TECH_GROUPS, JOBS_HIDDEN_BIG, JOBS_HIDDEN_GROUPS, isUnexperienced, isBlueCollar, skillOnly, jobsShown, splitForSite, salaryFloor };
