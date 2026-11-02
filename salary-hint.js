/* ---------- 年収が空の求人の給与表示（backlog #26・2026-11-03） ----------
   Airtable の 年収下限/上限 が両方とも空の求人（月給だけ・応相談・原文空・時給など）は、
   それまで一覧・詳細で「応相談」とだけ出ていた。ここでは 給与（原文）の種類で出し分ける。
     月給・月額・月収・月俸・月例賃金 に金額がある … 原文の月給をそのまま出す（例「月給300,000円〜415,000円」）＋注記「年収は面談時にご案内」
     時給・日給・単価 に金額がある                … 原文をそのまま出す（例「時給2,000円〜3,000円」）
     金額が無い・原文が空                         … 「年収は面談時にご案内」
   ⚠ 月給×12 のような年収への換算はしない（松岡さんのルール。年収の正は Airtable の 年収下限/上限 列）。
   ⚠ 原文を書き換えない。整形は 全角数字→半角・空白と通貨記号（\ ￥）の除去・範囲記号（- ～ ~ から）→「〜」だけ。
   ⚠ 金額として成り立たないものは出さない（月給は下限 10万〜300万円、時給・日給は 500〜10万円の範囲だけ）。
     「住宅手当 月額2万円」を月給と読む、「月収550万円〜750万円」（年額の誤記）をそのまま出す、を避けるため。外れたものは「年収は面談時にご案内」。
   rebuild.js（data/list.json の salHint 列）と static-pages.js（求人ページ・一覧ページ）が使う。
   ⚠ agentbest/skill にも同じファイルを置く（site-split.js と同じ鏡写し）。 */
const NUM = '[0-9０-９][0-9０-９,，]*(?:[.．][0-9０-９]+)?';
const AMT = `[\\\\￥¥]?${NUM}(?:[\\s　]*万)?(?:[\\s　]*${NUM})?(?:[\\s　]*円)?(?:[\\s　]*以上)?`;
const DASH = '(?:[〜~～\\-‐－–—ー]|から)';
const MONTH_KEYS = '月給|月額|月収|月俸|月例賃金|月例給';
const HOUR_KEYS = '時給|時間単価|日給|日額|単価';
const RE_MONTH = new RegExp(`(${MONTH_KEYS})[\\s　:：・]*(${AMT})(?:[\\s　]*(${DASH})[\\s　]*(${AMT})?)?`);
const RE_HOUR = new RegExp(`(${HOUR_KEYS})[\\s　:：・]*(${AMT})(?:[\\s　]*(${DASH})[\\s　]*(${AMT})?)?`);
const RANGE = { month: [100000, 3000000], hour: [500, 100000] };   /* 下限の金額（円）がこの範囲に入るものだけ */
const NONE_TEXT = '年収は面談時にご案内';

function z2h(s){ return String(s || '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/，/g, ',').replace(/．/g, '.'); }
function cleanAmt(s){ return z2h(s).replace(/[\s　\\￥¥]+/g, ''); }
/* 「21万1000円」「300,000円」「27万」→ 円の整数。読めなければ null */
function yen(amt){
  const m = cleanAmt(amt).match(/^([0-9,]+(?:\.[0-9]+)?)(万)?([0-9,]+)?/);
  if(!m) return null;
  const a = parseFloat(m[1].replace(/,/g, '')), b = m[3] ? parseInt(m[3].replace(/,/g, ''), 10) : 0;
  return m[2] ? Math.round(a * 10000 + b) : a;
}
function pick(re, kind, s){
  const m = s.match(re);
  if(!m) return null;
  const lo = yen(m[2]);
  if(lo == null || lo < RANGE[kind][0] || lo > RANGE[kind][1]) return null;
  let t = m[1] + cleanAmt(m[2]);
  if(m[3]) t += '〜' + (m[4] ? cleanAmt(m[4]) : '');
  return { kind, text: t };
}
/* 給与（原文）→ { kind: 'month' | 'hour' | 'none', text }。年収の数値がある求人には使わない（呼ぶ側で判定） */
function salaryHint(raw){
  const s = String(raw || '');
  return pick(RE_MONTH, 'month', s) || pick(RE_HOUR, 'hour', s) || { kind: 'none', text: NONE_TEXT };
}
/* 一覧・詳細に出す短い文字列。年収の数値がある求人と、金額が読めない求人は null（呼ぶ側が「年収は面談時にご案内」を出す） */
function salHintOf(j){
  if(j.salaryMin != null || j.salaryMax != null) return null;
  const h = salaryHint(j.salaryRaw);
  return h.kind === 'none' ? null : h.text;
}

module.exports = { salaryHint, salHintOf, NONE_TEXT };
