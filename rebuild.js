// 使い方: このフォルダで  node rebuild.js  を実行すると、
//   data/jobs.json  → template.html       → index.html
//   data/1day.json  → 1day-template.html  → 1day.html
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

function build(dataFile, tplFile, outFile, placeholder, fallback){
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
  const tpl = fs.readFileSync(tplPath, 'utf8');
  const out = tpl.replace(placeholder, () => embed(data));
  fs.writeFileSync(path.join(dir, outFile), out, 'utf8');
  return data;
}

const jobs = build('jobs.json', 'template.html', 'index.html', '__JOBS_DATA__', []);
if(jobs) console.log('index.html を再生成しました:', jobs.length, '件');

const events = build('1day.json', '1day-template.html', '1day.html', '__EVENTS_DATA__', []);
if(events) console.log('1day.html を再生成しました:', events.length, '件');
