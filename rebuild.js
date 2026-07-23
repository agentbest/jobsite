// 使い方: このフォルダで  node rebuild.js  を実行すると、
// data/jobs.json を template.html に流し込んで index.html を再生成します。
const fs = require('fs'), path = require('path');
const dir = __dirname;
const all = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'jobs.json'), 'utf8'));
let json = JSON.stringify(all);
const SEP = new RegExp('[\\u2028\\u2029]', 'g');
json = json.replace(/<\//g, '<\\/').replace(SEP, m => '\\u' + m.charCodeAt(0).toString(16));
const tpl = fs.readFileSync(path.join(dir, 'template.html'), 'utf8');
const out = tpl.replace('__JOBS_DATA__', () => json);
fs.writeFileSync(path.join(dir, 'index.html'), out, 'utf8');
console.log('index.html を再生成しました:', all.length, '件');
