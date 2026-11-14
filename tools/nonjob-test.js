// 確認用：非求人フィルタ（nonjob.js）が data/list.json のどの求人に当たるかを出す。node tools/nonjob-test.js [YYYY-MM-DD]
const { nonJobReason } = require('../nonjob.js');
const d = require('../data/list.json'); const K = d.k; const g = (r, k) => r[K.indexOf(k)];
const today = process.argv[2] || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
let n = 0;
for (const r of d.r) {
  const why = nonJobReason(g(r, 'position') || '', today);
  if (why) { n++; console.log(why, '|', g(r, 'id'), '|', (g(r, 'company') || '').slice(0, 14), '|', (g(r, 'position') || '').slice(0, 60)); }
}
console.log(n + '件');
