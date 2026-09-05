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
  }else if(dataFile === 'jobs.json' && fs.existsSync(path.join(dir, 'data', 'jobs'))){
    /* data/jobs.json は 50MB 超になったのでリポジトリに置かない（.gitignore）。
       無い端末では data/jobs/<求人ID>.json（＝掲載中の中途求人の全項目）から復元する。 */
    const d = path.join(dir, 'data', 'jobs');
    data = fs.readdirSync(d).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')));
    console.log(`data/jobs.json が無いので data/jobs/*.json から復元しました: ${data.length}件（新しい求人を載せるには node fetch-jobs.js）`);
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

/* 従業員数。Airtable「求人DB（企業）」の 従業員数 列を、data/employees.json（企業名 → 原文）
   経由で求人1件ずつに差し込む（node fetch-employees.js で取得）。
   ⚠ ロゴと同じで jobs.json 側には書かない。jobs.json は Airtable からの
     「取り直すたび丸ごと入れ替わるスナップショット」なので、書くと毎回消える。
   ⚠ 人数（employeeCount）は Airtable の「従業員数（数値）」列が正。原文から推測しない。
     人数が空の会社は「企業規模」の段に入らない（＝絞り込みで出ない）。埋めるときは Airtable の列を埋める。
   ⚠ 原文（employees）は原文のまま渡す。求人詳細にはこちらをそのまま出す。
     段の切り方（EMP_BANDS）だけは template.html 側にあり、人数から計算している。
   企業名の完全一致で引く。Airtable 側で社名を変えたら employees.json も直すこと。 */
function attachEmployees(jobs){
  const empPath = path.join(dir, 'data', 'employees.json');
  if(!fs.existsSync(empPath)){
    console.log('data/employees.json が無いので、従業員数と「企業規模」の絞り込みは出しません。');
    return jobs;
  }
  const emp = JSON.parse(fs.readFileSync(empPath, 'utf8'));
  let hit = 0, withNum = 0;
  const missing = new Set(), noNum = new Set();
  jobs.forEach(j => {
    /* 値は {raw, n}。昔の「企業名 → 原文の文字列」だけの形も読めるようにしてある */
    const v = emp[j.company];
    if(!v){ if(j.company) missing.add(j.company); return; }
    const o = (typeof v === 'string') ? { raw: v } : v;
    if(o.raw){ j.employees = o.raw; hit++; }
    if(typeof o.n === 'number'){ j.employeeCount = o.n; withNum++; }
    else if(j.company) noNum.add(j.company);
  });
  console.log(`従業員数: ${hit}件の求人に表示（うち人数あり ${withNum}件・${Object.keys(emp).length}社）`);
  if(missing.size){
    console.log(`従業員数が未登録の企業 ${missing.size}社（「企業規模」で絞ると出ません）:`);
    [...missing].forEach(c => console.log(`   - ${c}`));
  }
  if(noNum.size){
    console.log(`人数が読めない企業 ${noNum.size}社（原文は出るが「企業規模」では絞り込めません）:`);
    [...noNum].forEach(c => console.log(`   - ${c}`));
  }
  return jobs;
}

/* ---------- 一覧用の軽い項目だけを index.html に埋め、本文は data/jobs/<求人ID>.json に分ける ----------
   2026-09-06 に掲載を422件→5,700件超に広げた。全項目を埋め込むと index.html が 20MB を超えるので、
   一覧・検索・絞り込みに要る項目（下の LIGHT_KEYS）だけを埋め、仕事内容・条件・企業情報などの長文は
   求人を開いたときにブラウザが data/jobs/<求人ID>.json を読む（template.html の loadDetail）。
   ⚠ 検索の対象は一覧側の項目＋タグ＋リード文（lead）。本文の全文検索はしない。 */
const PREFS = ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"];
/* template.html の plainLead() と同じ。カードの2行目に出すリード文（120字） */
function plainLead(src){
  if(!src) return '';
  const t = String(src).replace(/\r/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*・–—]\s*/gm, '')
    .replace(/[*_`>|\\]/g, '')
    .replace(/\s+/g, ' ').trim();
  return t.length > 120 ? t.slice(0, 120) + '…' : t;
}
/* 一覧用の項目。キーを行ごとに繰り返さず {k:[キー], r:[[値…]]} の表形式で埋める（5,700件で約1MB節約）。
   タグは名前ではなく data/tags.json の並び順の番号（t）で持つ（1件あたり平均27タグ。名前だと4MB超になる）。
   template.html 側で展開する（JOBS の定義と JOBS.forEach の中）。 */
const LIGHT_KEYS = ['id','company','position','title','employment','kubun','salaryMin','salaryMax','location',
  'jobCategory','industry','url','listedStatus','createdAt','gradYear','t','logo','employees','employeeCount','areas','remote','lead'];
function lighten(full){
  const tagPath = path.join(dir, 'data', 'tags.json');
  const tagIdx = new Map();
  if(fs.existsSync(tagPath)) JSON.parse(fs.readFileSync(tagPath, 'utf8')).forEach((t, i) => tagIdx.set(t.name, i));
  const rows = full.map(j => {
    const o = {};
    LIGHT_KEYS.forEach(k => { if(j[k] !== undefined && j[k] !== null && j[k] !== '') o[k] = j[k]; });
    /* 求人タイトル(表示)は「会社名＋ポジション」なので、ポジションがあれば持たない（検索は会社名・ポジションで引ける） */
    if(o.position) delete o.title;
    /* 勤務地はカードでは県＋市区町村に整形されるだけなので長い原文は切る（詳細では原文が出る） */
    if(typeof o.location === 'string' && o.location.length > 70) o.location = o.location.slice(0, 70);
    if(typeof o.createdAt === 'string') o.createdAt = o.createdAt.slice(0, 10);
    o.t = (j.tags || []).map(n => tagIdx.get(n)).filter(i => i !== undefined);
    const loc = j.location || '';
    o.areas = PREFS.filter(p => loc.includes(p));
    o.remote = /在宅|リモート|テレワーク|フルリモート/.test(loc + ' ' + (j.jobContent || '') + ' ' + (j.benefits || ''));
    const lead = plainLead(j.jobContent || j.must || j.companyInfo || '');
    o.lead = lead.length > 72 ? lead.slice(0, 72) + '…' : lead;
    return LIGHT_KEYS.map(k => (o[k] === undefined ? null : o[k]));
  });
  /* 行末の null は落として短くする（展開側は足りない列を空として扱う） */
  rows.forEach(r => { while(r.length && r[r.length - 1] === null) r.pop(); });
  return { k: LIGHT_KEYS, r: rows };
}
function writeDetails(full){
  const d = path.join(dir, 'data', 'jobs');
  fs.mkdirSync(d, { recursive: true });
  const keep = new Set(full.map(j => `${j.id}.json`));
  let removed = 0;
  fs.readdirSync(d).forEach(f => { if(f.endsWith('.json') && !keep.has(f)){ fs.unlinkSync(path.join(d, f)); removed++; } });
  full.forEach(j => fs.writeFileSync(path.join(d, `${j.id}.json`), JSON.stringify(j), 'utf8'));
  console.log(`data/jobs/ に求人の詳細を書き出しました: ${full.length}件${removed ? `（掲載終了 ${removed}件を削除）` : ''}`);
}

const jobs = build('jobs.json', 'template.html', 'index.html', '__JOBS_DATA__', [],
  data => { const full = attachEmployees(attachLogos(midCareerOnly(data))); writeDetails(full); return lighten(full); });
const jobRows = jobs ? jobs.r.map(r => { const o = {}; jobs.k.forEach((k, i) => { if(r[i] != null) o[k] = r[i]; }); return o; }) : [];
if(jobs) console.log('index.html を再生成しました:', jobRows.length, '件（中途のみ・一覧用の項目だけ内蔵）');

/* タグの目録（data/tags.json ＝ node fetch-tags.js で取得）。
   絞り込みをカテゴリごとの箱に分けるための「名前・スラッグ・カテゴリ」だけを持つ。
   ⚠ 件数はここに入れない。中途だけに絞ったあとの件数はブラウザ側で数える。
   ⚠ 求人1件ずつのタグは data/jobs.json の tags 側にある。突き合わせは**タグ名の完全一致**。
     Airtableでタグ名を変えたら、求人側のタグも付け直す（node fetch-jobs.js からやり直す）。 */
function attachTags(){
  const indexPath = path.join(dir, 'index.html');
  if(!fs.existsSync(indexPath)) return;
  const tagPath = path.join(dir, 'data', 'tags.json');
  let tags = [];
  if(fs.existsSync(tagPath)) tags = JSON.parse(fs.readFileSync(tagPath, 'utf8'));
  else console.log('data/tags.json が無いので、タグの絞り込みは出しません（node fetch-tags.js）。');
  const html = fs.readFileSync(indexPath, 'utf8').replace('__TAGS_DATA__', () => embed(tags));
  fs.writeFileSync(indexPath, html, 'utf8');
  if(!tags.length) return;
  /* 目録にあるのに、どの求人にも付いていないタグを名指しで出す。
     絞り込みには0件として出るので、消したいときは Airtable の「サイト掲載」を落とす。 */
  const used = new Set();
  jobRows.forEach(j => (j.t || []).forEach(i => { if(tags[i]) used.add(tags[i].name); }));
  const unused = tags.filter(t => !used.has(t.name));
  const cats = new Set(tags.map(t => t.cat).filter(Boolean));
  console.log(`タグ: ${tags.length}件 / ${cats.size}カテゴリを絞り込みに出します`
    + `（掲載中の求人に付いているのは ${tags.length - unused.length}件）`);
  if(unused.length) console.log(`  0件のタグ ${unused.length}件（絞り込みには出ます）: ${unused.map(t => t.name).join(', ')}`);
  const noTag = jobRows.filter(j => !j.t || !j.t.length).length;
  if(noTag) console.log(`  ⚠ タグが1つも付いていない求人が ${noTag}件あります（node fetch-jobs.js からやり直してください）`);
}
attachTags();

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
  /* 表形式 [id, 会社名, 職種名, 年収]。apply-template.html 側で {id,company,name,salary} に展開する */
  const mini = jobRows.map(j => [j.id, j.company || '', j.position || j.jobCategory || j.title || '求人', fmtSalary(j)]);
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

/* 1day選考会は専用ページをナビから外し、検索結果の1位のPR枠に一本化した。
   index.html にはPR枠に出すぶん（直近3件の日程・タイトル・参加企業）だけを渡す。
   ⚠ 1day.json を更新したら rebuild.js を回すこと。回さないと一覧のPR枠が古いままになる。 */
function onedayMini(list){
  const today = new Date().toISOString().slice(0, 10);
  return (list || [])
    .filter(e => e.status !== 'closed')
    .filter(e => !e._iso || e._iso >= today)
    .slice(0, 3)
    .map(e => ({
      date: e.date || '',
      title: e.title || '1day選考会',
      company: e.companyLabel || '',
    }));
}
{
  const indexPath = path.join(dir, 'index.html');
  if(fs.existsSync(indexPath)){
    const mini = onedayMini(events);
    const html = fs.readFileSync(indexPath, 'utf8').replace('__ONEDAY_MINI__', () => embed(mini));
    fs.writeFileSync(indexPath, html, 'utf8');
    console.log('検索結果1位のPR枠:', mini.length ? `次回 ${mini[0].date}（掲載 ${mini.length}件）` : '開催なし（案内を受け取る導線を表示）');
  }
}
