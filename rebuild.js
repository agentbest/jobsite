// 使い方: このフォルダで  node rebuild.js  を実行すると、
//   data/jobs.json（＋ data/logos.json） → template.html        → index.html
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

/* 企業ロゴ。Airtable「求人DB（企業）」の ロゴ 列から取り込んだ画像を、
   data/logos.json（企業名 → リポジトリ内のパス）経由で求人1件ずつに差し込む。
   ⚠ ロゴを jobs.json 側に書かないのは、jobs.json が Airtable からの
     「取り直すたび丸ごと入れ替わるスナップショット」だから。書くと毎回消える。
   ⚠ Airtable の添付URLは数時間で失効するので、URLを直接持たせてはいけない。
     画像は assets/logos/ に置いて、そのパスを logos.json に書く（node fetch-logos.js）。
   企業名の完全一致で引く。Airtable 側で社名を変えたら logos.json も直すこと。 */
function attachLogos(jobs){
  const logoPath = path.join(dir, 'data', 'logos.json');
  if(!fs.existsSync(logoPath)){
    console.log('data/logos.json が無いので、ロゴは頭文字タイルのままにします。');
    return jobs;
  }
  const logos = JSON.parse(fs.readFileSync(logoPath, 'utf8'));
  /* ⚠ ファイルが実在しないパスを埋め込むと、カードに壊れた画像が出る。
     頭文字タイルの方がまだきれいなので、無いものは名指しで警告して落とす。 */
  const usable = {};
  for(const [company, rel] of Object.entries(logos)){
    if(fs.existsSync(path.join(dir, rel))) usable[company] = rel;
    else console.log(`⚠ ロゴ画像が見つかりません（頭文字タイルにします）: ${company} → ${rel}`);
  }
  let hit = 0;
  const missing = new Set();
  jobs.forEach(j => {
    const rel = usable[j.company];
    if(rel){ j.logo = rel; hit++; }
    else if(j.company) missing.add(j.company);
  });
  console.log(`企業ロゴ: ${hit}件の求人に表示（${Object.keys(usable).length}社）`);
  if(missing.size){
    console.log(`ロゴ未登録の企業 ${missing.size}社（頭文字タイルで表示）:`);
    [...missing].forEach(c => console.log(`   - ${c}`));
  }
  return jobs;
}

const jobs = build('jobs.json', 'template.html', 'index.html', '__JOBS_DATA__', [],
  data => attachLogos(midCareerOnly(data)));
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

/* 1day選考会も求人と同じで、Airtableの1つのテーブルを jobs と shinsotsu が共有している。
   このサイトは中途の回だけを載せる。⚠ shinsotsu 側には鏡写しの newGradOnly() があり、
   片方だけ直すと同じ回が両サイトに出る／どちらにも出ない状態になる。 */
function midCareerEvents(events){
  /* ⚠ 区分が空の回はここに落ちてくる（求人と同じく既定は中途）。
     黙って載せると誤掲載に気づけないので、必ず名指しで警告する。 */
  const noKubun = events.filter(e => !e.kubun);
  if(noKubun.length){
    console.log(`⚠ 区分が空の1day選考会が ${noKubun.length}件あります。中途として載せます。Airtableで区分を入れてください:`);
    noKubun.forEach(e => console.log(`   - ${e.date || '日付なし'} / ${e.title || e.id}`));
  }
  const kept = events.filter(e => !e.kubun || e.kubun === '中途');
  const dropped = events.length - kept.length;
  if(dropped > 0) console.log(`中途以外の1day選考会を除外しました: ${dropped}件`);
  return kept;
}

const events = build('1day.json', '1day-template.html', '1day.html', '__EVENTS_DATA__', [], midCareerEvents);
if(events) console.log('1day.html を再生成しました:', events.length, '件（中途のみ）');
