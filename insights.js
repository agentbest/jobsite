/* 当社だけの一次情報（2026-11-25 ハチワレさん「3はする」）
   直接取引の企業について、当社が採用担当から直接聞いたこと・当社経由の選考で分かったことを
   求人ページ（その会社の全求人）と企業ページに出す。

   置き場所: insights/<pickup-src と同じ slug>.json。"approved": true のものだけ出す。
   ⚠ このリポジトリは Public。下書き（打ち合わせの原文・候補者の選考記録）はリポジトリの外
     C:\Users\user\jobsite-insights-drafts\ に置き、ハチワレさんが確認した文だけをここへ入れる。
   ⚠ 書かないこと: 候補者が特定できる話・手数料や契約・エージェント向けの条件（年齢・転職回数・NG）・
     年齢/性別/学歴を理由にした書き方（CLAUDE.md・記憶 jobsite-no-agent-side-info）。

   形式:
   { "slug": "wisevine", "company": "株式会社WiseVine", "asof": "2026年11月", "approved": true,
     "background": ["募集の背景…"], "selection": ["選考の流れ・見られる点…"], "fit": ["選考が進みやすい経歴…"],
     "record": "当社からの紹介実績（任意・1文）",
     "jobs": { "recXXXXXXXXXXXXXX": { "background": [...], "selection": [...], "fit": [...] } } }  // 求人ごとの追記（任意） */
const fs = require('fs');
const path = require('path');

function load(root){
  const dir = path.join(root, 'insights');
  const byJob = new Map();
  if(!fs.existsSync(dir)) return { byJob, list: [] };
  const list = [];
  fs.readdirSync(dir).filter(f => f.endsWith('.json')).forEach(f => {
    const ins = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if(ins.approved !== true) return;
    list.push(ins);
    /* その会社の求人＝pickup-src/<slug>.json に載っている求人 ＋ insights の jobs に書いた求人 */
    const src = path.join(root, 'pickup-src', `${ins.slug}.json`);
    const ids = new Set(Object.keys(ins.jobs || {}));
    if(fs.existsSync(src)) for(const m of fs.readFileSync(src, 'utf8').matchAll(/\/job\/(rec[A-Za-z0-9]{14})\//g)) ids.add(m[1]);
    ids.forEach(id => byJob.set(id, ins));
  });
  return { byJob, list };
}

const ul = (items, esc) => `<ul style="margin:0;padding-left:1.2em;line-height:1.9">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;

/* 求人ページ・企業ページの共通ブロック。jobId を渡すと求人ごとの追記を先に出す。hTag は h2（企業ページ）か h3（求人ページ） */
function html(ins, esc, { jobId, hTag = 'h3' } = {}){
  if(!ins) return '';
  const per = (jobId && ins.jobs && ins.jobs[jobId]) || {};
  const part = (label, key) => {
    const items = [].concat(per[key] || [], ins[key] || []);
    return items.length ? `<p style="margin:12px 0 4px;font-weight:700">${label}</p>${ul(items, esc)}` : '';
  };
  const body = part('募集の背景', 'background') + part('選考の流れと見られる点', 'selection') + part('選考が進みやすい経歴', 'fit');
  if(!body) return '';
  return `<div class="pd-sec pd-insight"><${hTag}>エージェントベストが企業から聞いていること</${hTag}>
    <p style="margin:0;font-size:13px;color:var(--ink-3)">当社の担当が${esc(ins.company)}の採用担当と直接やり取りする中で聞いた内容と、当社からの紹介で分かったことです（${esc(ins.asof)}時点）。求人票には載っていない話を含みます。</p>
    ${body}${ins.record ? `<p style="margin:12px 0 0;font-size:13px">${esc(ins.record)}</p>` : ''}
    <p style="margin:10px 0 0;font-size:12px;color:var(--ink-3)">ポジションや時期によって変わることがあります。いまの状況は担当にお尋ねください。</p></div>`;
}

module.exports = { load, html };
