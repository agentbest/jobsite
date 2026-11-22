# 使い方: python tools/make-guide-plan.py
# _guide/plan.tsv（転職ガイドの企画一覧）を作り直す。企画を足すときはこのファイルに足す。
# ⚠ slug は URL。一度公開した slug は変えない・消さない（並び順・番号は変わってよい）。
#
# 重ねない相手：www.agent-best.net/media は職種ごとに career-guide / career-path / certification / company-size /
# english / failure / from-scratch / future / how-to-use-agent / in-20s / in-30s / interview / market-trend /
# motivation / resume / salary(-600/-1000) / skills / work-style を書いている。ここではそれを避け、
# 「求人票の読み方」「その職種の求人で実際に求められていること」「応募〜内定の実務」に寄せる。
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from guide_role_topics import ROLE_TOPICS
from guide_topics_extra import TOPICS_EXTRA

ROOT = os.path.join(os.path.dirname(__file__), '..', '_guide')
tax = json.load(open(os.path.join(ROOT, 'taxonomy.json'), encoding='utf-8'))

# 職種ハブ × 共通の切り口（{r} = ハブの表示名）
ROLE_THEMES = [
    ('posting', '{r}の求人票の読み方｜仕事内容と応募条件で確認したいこと'),
    ('requirements', '{r}の求人の必須要件・歓迎要件｜満たしていないときの考え方'),
    ('job-scope', '{r}の仕事の範囲｜求人ごとに担当業務がどう違うか'),
    ('salary-range', '{r}の求人に書かれた年収の読み方｜提示額の幅と決まり方'),
    ('hiring-background', '{r}の募集背景の読み方｜増員・欠員補充・新組織の違い'),
    ('grade', '{r}の求人のポジション別の違い｜メンバー・リーダー・管理職'),
    ('industry-diff', '{r}の求人は業界でどう違う？会社選びの見方'),
    ('selection-flow', '{r}の選考の流れ｜書類から内定までに見られること'),
    ('offer-check', '{r}の内定で確認したい条件｜オファー面談の進め方'),
    ('similar-jobs', '{r}と近い職種の求人の違い｜応募先の広げ方'),
    ('first-90days', '{r}として入社した後の3か月｜求人票から立ち上がりを読む'),
    ('compare-offers', '{r}の求人を比べるときの軸｜複数の会社で迷ったら'),
    ('job-title', '{r}の求人で使われる職種名・肩書きの違い'),
    ('jd-keywords', '{r}の求人によく出る用語と略語｜意味と読み取り方'),
    ('evaluation', '{r}の評価のされ方｜求人票の評価制度・インセンティブの読み方'),
    # 2026-11-22 追加（末尾に足す）
    ('hiring-check', '{r}の求人に応募する前に確かめたいこと'),
    ('questions-to-ask', '{r}の面接で求人票について確かめたいこと'),
    ('mismatch', '{r}の入社後のギャップを防ぐ｜求人票で見落としやすいところ'),
    ('team-structure', '{r}の求人の配属先とチーム体制の読み方'),
]

# 職種に関係しないハブの企画（slug, タイトル）
TOPICS = {
    'posting-terms': [
        ('minashi-zangyo', 'みなし残業（固定残業代）の求人の読み方｜何時間分かと超えた分'),
        ('nenpousei', '年俸制の求人で確認したいこと｜残業代・賞与・支払い方'),
        ('shiyou-kikan', '試用期間がある求人の読み方｜期間・条件の違いと注意点'),
        ('tenkin-ari', '「転勤あり」の求人で確認したいこと｜範囲・頻度・会社の運用'),
        ('kinmuchi-henko', '勤務地の「変更の範囲」とは何か｜2024年の明示ルールと読み方'),
        ('gyoumu-henko', '業務内容の「変更の範囲」の読み方｜職種が変わる可能性を知る'),
        ('seishain-keiyaku', '正社員と契約社員の求人の違い｜期間の定めと更新の書かれ方'),
        ('muki-koyou', '無期転換ルールと求人票｜有期契約の求人で確認したいこと'),
        ('haken-shoukai', '紹介予定派遣の求人とは｜直接雇用までの流れと確認点'),
        ('gyomu-itaku-kyujin', '業務委託の求人と雇用の求人の違い｜社会保険・税金・働き方'),
        ('kanrishoku-kyujin', '「管理職」の求人と残業代｜管理監督者の考え方'),
        ('hissu-kangei', '必須条件と歓迎条件の違い｜どこまで満たせば応募できるか'),
        ('kyujin-kousin', '求人票の掲載日・更新日の読み方｜募集が続いているかを知る'),
        ('jinbutsuzou', '求人票の「求める人物像」の読み方｜書かれ方から分かること'),
        ('senkou-process', '求人票の「選考プロセス」の読み方｜面接の回数と期間'),
        ('hikoukai-kyujin', '非公開求人とは何か｜公開されない理由と探し方'),
        ('kyujin-kotoba', '求人票によく出る言葉の意味｜「裁量」「スピード感」「風通し」'),
        ('mikeiken-kangei', '「未経験歓迎」と「経験者優遇」の書かれ方の違い'),
        ('position-name', '求人の職種名とポジション名の違い｜同じ名前でも中身が違う理由'),
        ('daini-shinsotsu-kyujin', '第二新卒歓迎の求人の読み方｜求められることと応募の考え方'),
        ('kyujin-houtei-meiji', '求人票に書くことが決まっている項目｜労働条件の明示のルール'),
        ('kyujin-jitsujou', '求人票と実際の条件が違ったら｜確認の順番と相談先'),
    ],
    'salary-terms': [
        ('nenshu-haba', '求人の年収の幅（400〜800万円など）はどう決まるのか'),
        ('riron-nenshu', '「理論年収」「想定年収」の読み方｜賞与・残業代の扱い'),
        ('kihonkyu-teate', '基本給と手当の違い｜求人票の給与欄の読み方'),
        ('shoyo-kyujin', '賞与の書かれ方の読み方｜「年2回」「業績連動」「前年実績」'),
        ('incentive-kyujin', 'インセンティブ・歩合の求人の読み方｜固定給との割合'),
        ('gekkyu-nenshu', '月給の求人を年収で考えるときの注意点'),
        ('tedori', '年収と手取りの違い｜社会保険料と税金で引かれるもの'),
        ('stock-option', 'ストックオプションがある求人で確認したいこと'),
        ('taishokukin', '退職金制度の書かれ方｜確定拠出年金・退職一時金の違い'),
        ('jutaku-teate', '住宅手当・家賃補助の求人の読み方｜条件と課税'),
        ('kotsuhi', '交通費支給の書かれ方｜上限・全額・非課税の範囲'),
        ('zangyodai-keisan', '残業代の計算のしかた｜割増率と時間単価の考え方'),
        ('nenshu-kakunin', '面接で年収を確認するタイミングと聞き方'),
        ('genshu-tenshoku', '年収が下がる転職を考えるときの判断材料'),
        ('nenshu-kosho', '年収交渉はできるのか｜内定前後の進め方'),
        ('gensen-choshu', '転職した年の源泉徴収票と年末調整｜前職の分の扱い'),
        ('juminzei-tenshoku', '転職と住民税｜退職時期で支払い方が変わる理由'),
    ],
    'working-conditions': [
        ('remote-kyujin', 'リモート可の求人の読み方｜フル・一部・条件付きの違い'),
        ('flex-kyujin', 'フレックスタイム制の求人の読み方｜コアタイムと清算期間'),
        ('sairyo-roudou', '裁量労働制の求人で確認したいこと｜対象業務と働き方'),
        ('zangyo-heikin', '求人票の「平均残業時間」の読み方｜数字の出し方と確かめ方'),
        ('kyujitsu-kyujin', '年間休日の読み方｜120日・125日と完全週休2日制'),
        ('kanzen-shukyu', '「完全週休2日制」と「週休2日制」の違い'),
        ('yukyu', '有給休暇の付与日数と取りやすさの確かめ方'),
        ('fukuri-kosei', '福利厚生の欄の読み方｜法定と会社独自の違い'),
        ('shakai-hoken', '社会保険完備とは｜求人票の保険の書かれ方'),
        ('kyakusaki-joui', '客先常駐の求人の読み方｜勤務先と契約の形'),
        ('shukkin-hindo', '出社頻度の確かめ方｜求人票と面接で聞くこと'),
        ('fukugyo-kyujin', '副業可の求人の読み方｜届出と制限の範囲'),
        ('ikuji-kaigo', '育児・介護と両立できる求人の見方｜制度と使われ方'),
        ('shucchou', '出張の多い求人の読み方｜頻度・範囲の確かめ方'),
        ('shift-kyujin', 'シフト制・交代勤務の求人の読み方'),
        ('kinmu-jikan', '勤務時間の書かれ方｜所定労働時間と休憩'),
    ],
    'company-check': [
        ('jojo-kubun', '上場企業と非上場企業の求人の違い｜情報の出方と確かめ方'),
        ('startup-kyujin', 'スタートアップの求人を読むときの見方｜資金調達と組織の段階'),
        ('megaventure', 'メガベンチャーの求人の特徴｜事業の数と異動'),
        ('gaishi-kyujin', '外資系企業の求人の読み方｜職務記述書と報酬の考え方'),
        ('kogaisha', '子会社・グループ会社の求人で確認したいこと'),
        ('jugyoin-su', '従業員数の読み方｜連結と単体の違い'),
        ('shihonkin', '資本金・売上高から何が分かるか｜求人の会社情報欄'),
        ('setsuritsu', '設立年数と求人の関係｜新しい会社・歴史のある会社'),
        ('jigyo-naiyo', '会社の事業内容を理解する方法｜求人票と公開資料'),
        ('ir-yomikata', '上場企業のIR資料で転職前に見ておきたいところ'),
        ('kuchikomi', '口コミの読み方と使い方｜偏りを前提にする'),
        ('heikin-nenrei', '平均年齢・平均勤続年数の数字の読み方'),
        ('rishoku', '離職率の確かめ方｜公開データと面接での聞き方'),
        ('soshiki-zu', '組織図・配属先を確かめる方法｜面接で聞くこと'),
        ('jishasabisu', '自社サービスと受託の会社の違い｜求人票の見分け方'),
        ('fukusu-kyujin', '同じ会社が複数の求人を出しているときの選び方'),
        ('company-page', '企業ページの見方｜会社概要・募集中の求人・業界'),
    ],
    'application': [
        ('oubo-handan', '応募するか迷ったときの判断のしかた｜条件を3つに分ける'),
        ('oubo-sushi', '何社に応募するのがよいか｜並行して進める数の考え方'),
        ('heigan', '複数の会社を並行して受けるときの進め方'),
        ('zaishoku-tenshoku', '在職中に転職活動を進めるときの時間の作り方'),
        ('rishoku-tenshoku', '退職してから転職活動をするときの注意点'),
        ('oubo-shorui', '応募書類で求人ごとに変えるところ・変えないところ'),
        ('shiboudouki-kyujin', '求人票から志望理由を組み立てる方法'),
        ('blank', '職歴に空白期間があるときの応募の考え方'),
        ('tenshoku-kaisu', '転職回数が多いときの応募書類の書き方'),
        ('shoruisenkou', '書類選考の結果が出るまでの期間と待ち方'),
        ('shorui-otoshi', '書類選考で見送られる理由と次に直すところ'),
        ('saioubo', '一度見送られた会社に再応募できるか'),
        ('suisen', '推薦で応募するとは｜人材紹介の応募の流れ'),
        ('oubo-torikeshi', '応募を取り消したいときの伝え方'),
        ('kyujin-sagashikata', '求人の探し方｜職種・勤務地・条件の絞り方'),
        ('kibou-joken', '希望条件の優先順位の付け方'),
    ],
    'selection': [
        ('mensetsu-kaisu', '中途採用の面接は何回あるか｜段階ごとに見られること'),
        ('casual-mendan', 'カジュアル面談と面接の違い｜準備と聞いてよいこと'),
        ('tekisei-kensa', '適性検査・筆記試験がある選考の準備'),
        ('kadai', '課題選考・ワークサンプルがある求人の進め方'),
        ('online-mensetsu', 'オンライン面接で準備すること'),
        ('saishu-mensetsu', '最終面接で見られること｜役員面接の準備'),
        ('gyakushitsumon', '面接の逆質問で求人票の分からないところを確かめる'),
        ('reference', 'リファレンスチェックがある選考の流れ'),
        ('senkou-kikan', '選考期間はどのくらいか｜応募から内定までの目安'),
        ('mensetsu-nittei', '面接の日程調整の進め方｜在職中の場合'),
        ('kekka-renraku', '面接の結果連絡が来ないときの考え方'),
        ('senkou-jitai', '選考を辞退するときの伝え方'),
        ('fukusu-senkou', '複数の選考の進み具合をそろえる方法'),
        ('mensetsu-fukuso', '中途採用の面接の服装｜指定がないときの考え方'),
        ('kenkoshindan', '入社前の健康診断・提出書類の扱い'),
    ],
    'offer': [
        ('naitei-tsuuchi', '内定通知書と労働条件通知書の違い｜確認したい項目'),
        ('offer-mendan', 'オファー面談で確認すること｜年収・役割・評価'),
        ('naitei-henji', '内定の返事はいつまでに｜期限の延ばし方'),
        ('naitei-jitai', '内定を辞退するときの伝え方'),
        ('naitei-hikaku', '複数の内定で迷ったときの比べ方'),
        ('taishoku-kosho', '退職の伝え方と時期｜引き止めへの対応'),
        ('taishoku-tetsuzuki', '退職の手続き｜返却物・受け取る書類'),
        ('nyusha-bi', '入社日の決め方｜引き継ぎと有給の消化'),
        ('nenkin-hoken', '転職時の年金・健康保険の切り替え'),
        ('rishoku-hyo', '離職票と雇用保険｜転職先が決まっているとき'),
        ('nyusha-junbi', '入社前に準備しておくこと'),
        ('nyusha-go', '入社後に条件が違ったときの確かめ方と相談先'),
        ('shiyou-kikan-nyusha', '試用期間中に気をつけること'),
        ('kyougi-kinshi', '退職時の誓約書・競業避止の読み方'),
        ('naitei-torikeshi', '内定取り消しはどんなときに起きるか'),
    ],
}

rows = []
seen = set()
def add(hub, slug, title):
    if slug in seen:
        raise SystemExit(f'slug が重複しています: {slug}')
    seen.add(slug)
    rows.append((hub, slug, title))

for g in tax['groups']:
    for hub, label, m in g['hubs']:
        if m is None:
            for slug, title in TOPICS.get(hub, []) + TOPICS_EXTRA.get(hub, []):
                add(hub, slug, title)
        else:
            for t, title in ROLE_THEMES:
                add(hub, f'{hub}-{t}', title.format(r=label))
            for t, title in ROLE_TOPICS.get(hub, []):
                add(hub, f'{hub}-{t}', title)

unknown = [h for h in ROLE_TOPICS if h not in {x[0] for g in tax['groups'] for x in g['hubs']}]
if unknown:
    raise SystemExit(f'taxonomy に無いハブ: {unknown}')
missing = [h for g in tax['groups'] for h, _, m in g['hubs'] if m is None and h not in TOPICS]
if missing:
    print('⚠ 企画が無いハブ:', ', '.join(missing))
long = [(s, t) for _, s, t in rows if len(t) > 50]
for s, t in long:
    print(f'⚠ タイトルの長さ {len(t)}字: {s} {t}')

with open(os.path.join(ROOT, 'plan.tsv'), 'w', encoding='utf-8', newline='\n') as f:
    f.write('no\thub\tslug\ttitle\n')
    for i, (hub, slug, title) in enumerate(rows, 1):
        f.write(f'{i}\t{hub}\t{slug}\t{title}\n')
print(f'plan.tsv を書き出しました: {len(rows)} 本')
