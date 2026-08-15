# jobsite — 求人検索サイト jobs.agent-best.net

Airtableの求人456件を検索できる**静的求人サイト「求人検索 — キャリアの選択肢」**（求職者向け・一般公開）。マイページ（会員機能）付き。

- 公開URL: https://jobs.agent-best.net/ （GitHub Pages・HTTPS強制）
- リポジトリ: **Public**（機密なし＝求人データ／テンプレ／rebuild.js のみと確認済み）

## ⚠ ビルドフロー（最重要）

**`index.html` を直接編集しない。** 編集するのは `template.html` と `data/jobs.json`。

```
template.html / data/jobs.json を編集
  → node rebuild.js      （index.html を再生成・件数を表示）
  → commit & push        （数十秒で反映）
```

`index.html` は自己完結の静的HTML（約3.5MB・CDN非依存）。詳細・Airtable取得元・フィールド対応は `README.md` にある。

## データ元

Airtable base「人材紹介事業」`appYkc36EvioYoL1A` / table「求人DB（求人票）」`tblyPZZasXTM2tcrV`（456件スナップショット）。

## サイトの位置づけ・表記

- **「ミドルクラス・ハイクラス向け求人サイト」**として訴求する。**「転職サイト」とは書かない**（中途422件のほかに新卒29件・インターン5件を含むため）。見出しは「その経験に、見合うポジションを。」
- 年収800万以上/1,000万以上の件数はテンプレ内JSで**データ連動集計**（`salaryMax` 基準）。ハードコードしない。
- デザイン: 藍×山吹、日本語ゴシック。検索／絞り込み（エリア・職種74・業界12・年収・リモート）／詳細スライド／ライト・ダーク対応。
- フッターに運営者情報: **株式会社エージェントベスト／東京都港区六本木4-8-7 嶋田ビル5階／有料職業紹介事業 13-ユ-316964**
- 応募CTAには「当社から企業へ推薦する形で選考が進む」「ご利用は無料（手数料は採用企業負担）」を明記する。

## 応募・相談の導線

テンプレ先頭の定数で管理: `APPLY_FORM_URL` / `CONSULT_URL` / `CONTACT_MAIL` / `PROFILE_URL`

- 「この求人に応募する」→ Airtable応募フォーム（テーブル `求人応募（サイト）` `tblmHnF3Vq1WXT9ix`）
- 「担当エージェントに詳しい話を聞きたい」→ `https://calendly.com/r_matsuoka`
- 「企業サイト」は目立たせない方針（企業情報dlの1行リンク）

⚠ 求人名・企業名・求人レコードIDを `prefill_◯◯` で自動入力しているため、**Airtable側のフィールド名を変えるとプリフィルが壊れる**。

## プライバシーポリシーは2本立て（混ぜない）

| | ファイル | 立場 |
|---|---|---|
| 人材紹介（有料職業紹介） | `privacy.html` | 当社が**ご本人を求人企業へ推薦**する。同意した企業にだけ情報提供 |
| 求人広告掲載（募集情報等提供） | `privacy-ad.html` | 当社は**掲載と取り次ぎのみ**。選考の当事者ではない。応募＝当該企業への提供に同意 |

**最大の違いは「第三者提供の建て付け」**。紹介＝個別同意、広告＝応募行為＝同意。ここを混ぜない。
両方に共通で職業安定法の記載（収集しない情報＝人種・民族・社会的身分・門地・本籍・出生地、思想信条、労働組合加入状況）がある。
**法務チェックは未実施。**
解析ツールを追加・変更したら**プライバシーポリシー第9項（GA利用）も必ず直す**。

## マイページ（会員機能）— 2026-08-15公開

### 設計の要（変えるときは理由を確認する）

**2段階で動く1つのコード**。`template.html` 冒頭の定数が空か否かで挙動が切り替わる。

```javascript
const SUPABASE_URL = "";        // 空 = この端末に保存モード（localStorage）
const SUPABASE_ANON_KEY = "";   // 埋める = メールログインモード（今ここ）
```

鍵を空に戻せばログイン無しモードに即戻せる。**障害時の退避路として覚えておく。**

機能: お気に入り★／最近見た求人／会員プロフィール／履歴書・職務経歴書アップロード／退会。

### ⚠ セキュリティ上、絶対に緩めてはいけないもの

- **Storage の RLS 4本**（select/insert/update/delete）。条件は
  `bucket_id='documents' and (storage.foldername(name))[1] = auth.uid()::text`。
  これとバケット非公開が「他人の履歴書を見られない」の担保。**消すと全員の書類が漏れる。**
- **`delete_own_account()` の where 句**。`security definer` 関数で `auth.uid()` の行しか消せないようにしてある。**緩めると他人のアカウントが消せる。**
- **Secret key / service_role は絶対にサイトに貼らない。**

### 実装メモ（ハマりどころ）

- 求人カード `.card` は `<button>` なので、★は `<button>` にできず `<span role="button" tabindex="0">` で実装。`#grid` の委譲ハンドラで `.fav` を先に判定して `return` し、詳細パネルが開くのを防いでいる。
- ★のクリック判定は `#grid` 用と document 用の**2系統**（マイページ内・詳細パネルの★は `#grid` の外にあるため）。
- スマホでは★のタップ範囲を42pxに拡大済み（32pxだと押し外す）。
- 希望職種・経験職種は求人データから自動生成。`j.jobGroup` ＝ `jobCategory` 末尾の括弧（「法人営業（営業）」→「営業」）で22分類。⚠ **`jobCategory` の命名規則（末尾の括弧＝大分類）を崩すと壊れる。**
- 希望勤務地は都道府県ではなく**9つの地域ブロック**（`AREA_BLOCKS`）。求人があるのは11都府県だけなので都道府県で聞くと選択肢が偏る。
- 書類の閲覧は `createSignedUrl(path, 60)`。**`window.open` は await の前に同期で開く**（ポップアップブロック回避）。
- 削除の順番は **①書類の実体（Storage API）→②DBの行→③auth.users**。逆にするとファイルが残る。
- **`confirm()` は使わない**（ブラウザ操作が固まるため）。ページ内のボタンで二段階にする。
- `saveProfile` は `myProfile` を**マージ更新**する（上書きすると画面から書類が消える）。
- 最近見た求人は `jobsite-seen`（localStorage）に直近15件。**ログインしてもサーバーへは同期しない。**

### Supabase

| 項目 | 値 |
|---|---|
| プロジェクト | `jobsite-tokyo` / ID `jvdnabtpxcyfnogdulea` |
| リージョン | **Northeast Asia (Tokyo)** |
| 鍵 | **Publishable key**（`sb_publishable_…`）。旧anonキーではない |

⚠ **リージョンの罠**: Regionで「Asia-Pacific」を選ぶと**Singaporeになる**。「SPECIFIC REGIONS」から Northeast Asia (Tokyo) を明示的に選ぶこと。後から変更不可。`privacy.html` に「日本国内のデータセンターに保管」と書いてあるので、東京でないと記載と矛盾する。

## シェアボタン

X / Facebook / LinkedIn / はてなブックマーク / リンクをコピー（＋スマホは端末の共有シート）。`template.html` の `shareHtml()`。

- **外部SDK（Twitter widgets.js・Facebook SDK）は読み込まない。** 読者の閲覧履歴が各社に渡るうえ表示も遅い。ただのリンクとして自前で持つ。
- **コピーは合成クリック（`.click()`）では必ず失敗する。** テストは実クリックで確認すること。
- 求人ごとのURLは `?job=<求人ID>`。`openDetail`/`closeDetail` で **replaceState** して付け外し（履歴を増やさない）。**OGPは求人ごとに出し分けできない**（静的サイト＝1つのHTML）ので、求人名はX投稿の本文側で補っている。

## GA4

測定ID `G-1XXMP8Y1B4`。カスタムイベント: `job_detail_open` / `apply_click` / `consult_click` / `search` / `filter_use` / `lp_click` / `corporate_click` / `job_share`。
外部リンクのクリックは document の capture で一括計測しているので、ボタンを追加しても漏れない。`track()` は gtag 未読込でも落ちない。

## 相互リンク

トップのピル型「専門ページ」とフッターから求職者向けLPへ。各LP側もナビ＋フッターに「求人を探す↗」がある。
求人詳細パネル最下部の「この求人を担当するエージェント」ブロックは、`agentbest/agentbest-lp` の `AuthorBlock.astro` からのコピー＝**同じ文章が複数リポジトリに重複**している。略歴・許可番号を直すときは全部直すこと。

## push のルール

- ローカルで **`node rebuild.js` を通してブラウザ確認してから** commit & push。コミットメッセージは日本語。**push後は必ず何を変えたか報告する。**
- **以下に触れるときは必ず止まって事前確認する**:
  1. ドメイン・DNS・CNAME
  2. **個人情報・フォーム・認証**（マイページのログイン、RLS、応募フォームは全部ここ）
  3. 費用が発生する変更（Supabase Pro への切替など）
  4. 既存ページ・データの削除、求人データの一括置換
  5. 複数リポジトリへの一括変更
- Publicリポジトリ。push前にトークン・APIキーの混入をgrepで確認する（**Supabase の Secret key が入っていないこと**を特に確認）。
