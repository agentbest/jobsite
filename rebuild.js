// 使い方: このフォルダで  node rebuild.js  を実行すると、
//   data/jobs.json  → template.html        → index.html
//   data/jobs.json  → apply-template.html  → apply.html   （求人の見出しだけを差し込む）
//   data/1day.json  → 1day-template.html   → 1day.html
// を再生成します。data/1day.json は  node fetch-1day.js  で Airtable から取得します。
const fs = require('fs'), path = require('path');
const dir = __dirname;

// <script> 内に安全に埋め込めるようエスケープする
const SEP = new RegExp('[\\u2028\\u2029]', 'g');
function embed(data){
  return JSON.stringify(data)
    .replace(/<\//g, '<\\/')
    .replace(SEP, m => '\\u' + m.charCodeAt(0).toString(16));
}

function build(dataFile, tplFile, outFile, placeholder, fallback, transform){
  const dataPath = path.join(dir, 'data', dataFile);
  const tplPath  = path.join(dir, tplFile);
  if(!fs.existsSync(tplPath)){
    console.log(`${tplFile} が無いのでスキップしました。`);
    return null;
  }
  let data = fallback;
  if(fs.existsSync(dataPath)){
    data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  }else{
    console.log(`data/${dataFile} が無いので空で生成します。`);
  }
  if(transform) data = transform(data);
  const tpl = fs.readFileSync(tplPath, 'utf8');
  const out = tpl.replace(placeholder, () => embed(data));
  fs.writeFileSync(path.join(dir, outFile), out, 'utf8');
  return data;
}

/* このサイトは中途採用（転職）だけを載せる。
   Airtable 側に新卒・インターンが残っていても、ここで必ず落としてから埋め込む。
   ⚠ この関数を外すと、新卒・インターンの求人が「転職サイト」として公開される。 */
function midCareerOnly(jobs){
  /* ⚠ 区分が空の求人はここに落ちてくる（中途が9割なので既定は中途）。
     ただし黙って載せると誤掲載に気づけないので、必ず名指しで警告する。 */
  const noKubun = jobs.filter(j => !j.kubun);
  if(noKubun.length){
    console.log(`⚠ 区分が空の求人が ${noKubun.length}件あります。中途として載せます。Airtableで区分を入れてください:`);
    noKubun.slice(0, 10).forEach(j => console.log(`   - ${j.company || '企業名なし'} / ${j.position || j.title || j.id}`));
    if(noKubun.length > 10) console.log(`   …ほか ${noKubun.length - 10}件`);
  }
  const kept = jobs.filter(j => !j.kubun || j.kubun === '中途');
  const dropped = jobs.length - kept.length;
  if(dropped > 0){
    const by = {};
    jobs.forEach(j => { if(j.kubun && j.kubun !== '中途') by[j.kubun] = (by[j.kubun]||0)+1; });
    const detail = Object.entries(by).map(([k,v]) => `${k} ${v}件`).join(' / ');
    console.log(`中途以外を除外しました: ${dropped}件（${detail}）`);
  }
  return kept;
}

const jobs = build('jobs.json', 'template.html', 'index.html', '__JOBS_DATA__', [], midCareerOnly);
if(jobs) console.log('index.html を再生成しました:', jobs.length, '件（中途のみ）');

/* 申し込みフォームは「どの求人から来たか」を見出しに出すだけなので、
   求人データ全部（3.5MB）ではなく ID・企業名・職種名・年収だけを持たせる。 */
function fmtSalary(j){
  const mn = j.salaryMin, mx = j.salaryMax;
  if(mn != null && mx != null) return mn === mx ? `${mn}万円` : `${mn}〜${mx}万円`;
  if(mx != null) return `〜${mx}万円`;
  if(mn != null) return `${mn}万円〜`;
  return '';
}
if(jobs){
  const mini = jobs.map(j => ({
    id: j.id,
    company: j.company || '',
    name: j.position || j.jobCategory || j.title || '求人',
    salary: fmtSalary(j),
  }));
  const tplPath = path.join(dir, 'apply-template.html');
  if(fs.existsSync(tplPath)){
    const out = fs.readFileSync(tplPath, 'utf8').replace('__JOBS_MINI__', () => embed(mini));
    fs.writeFileSync(path.join(dir, 'apply.html'), out, 'utf8');
    console.log('apply.html を再生成しました:', mini.length, '件の求人見出しを内蔵');
  }else{
    console.log('apply-template.html が無いのでスキップしました。');
  }
}

const events = build('1day.json', '1day-template.html', '1day.html', '__EVENTS_DATA__', []);
if(events) console.log('1day.html を再生成しました:', events.length, '件');
