/* ---------- jobs.agent-best.net と skill.agent-best.net の振り分け（2026-10-15・松岡さん決定） ----------
   中途の求人は、かならずどちらか一方のサイトにだけ出す。
     jobs  … 年収の下限が 600万円以上（下限が無ければ上限で見る）かつ 施工管理でない
     skill … それ以外すべて（600万円未満・年収未記載・施工管理・工場や店舗などの低年収も含む）
   ⚠ このファイルは agentbest/jobsite と agentbest/skill で**まったく同じ中身**にする（鏡写し）。
     片方だけ直すと、同じ求人が両方に出る／どちらにも出ない。直したら両方にコピーして両方 rebuild する。
   ⚠ Airtable のデータは触らない。掲載先の判断はビルド側だけに置く（midCareerOnly() と同じ考え方）。 */
const HIGH_CLASS_MIN = 600;                       /* 万円 */
const SKILL_ONLY_GROUPS = new Set(['施工管理']);  /* 年収に関係なく skill に出す職種の大分類 */

function jobGroupOf(v){ const m = String(v || '').match(/（([^（）]+)）\s*$/); return m ? m[1] : 'その他'; }
function salaryFloor(j){ return j.salaryMin != null ? j.salaryMin : (j.salaryMax != null ? j.salaryMax : null); }

function isHighClass(j){
  if(SKILL_ONLY_GROUPS.has(jobGroupOf(j.jobCategory))) return false;
  const f = salaryFloor(j);
  return f != null && f >= HIGH_CLASS_MIN;
}

/* site: 'jobs' | 'skill'。戻り値 { kept, moved }。moved は相手のサイトに出る求人（404.html の転送先に使う） */
function splitForSite(jobs, site){
  const mine = site === 'jobs' ? isHighClass : (j => !isHighClass(j));
  const kept = [], moved = [];
  jobs.forEach(j => (mine(j) ? kept : moved).push(j));
  const other = site === 'jobs' ? 'skill.agent-best.net' : 'jobs.agent-best.net';
  const unknown = moved.concat(kept).filter(j => salaryFloor(j) == null).length;
  console.log(`サイト振り分け（${site}）: 掲載 ${kept.length}件 ／ ${other} 側へ ${moved.length}件`
    + `（基準: 年収下限 ${HIGH_CLASS_MIN}万円以上かつ ${[...SKILL_ONLY_GROUPS].join('／')}以外が jobs。年収未記載 ${unknown}件は skill）`);
  return { kept, moved };
}

module.exports = { HIGH_CLASS_MIN, SKILL_ONLY_GROUPS, isHighClass, splitForSite, salaryFloor };
