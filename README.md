# 求人検索サイト（Airtable → 求人サイト）

Softr で作ろうとしていた「Airtable の求人データを綺麗な UI で検索できる求人サイト」を
Claude Code で作ったもの。求職者向け・一般公開を想定。

## 公開中のプレビュー（Artifact）
- URL: https://claude.ai/code/artifact/56e0a9c1-947d-473b-84ea-dae90d469b25
- 状態: **非公開**（作成者のみ閲覧可）。他人に見せるには Artifact ページ右上の共有メニューから公開する。
- 更新方法: `index.html` を編集して、同じ会話で再発行すると **同じ URL** に反映される。
  別会話から更新する場合は、その URL を `url` として渡す（渡さないと別 URL が発行される）。

## フォルダ構成
- `index.html` … 完成した求人サイト（単一ファイル・中途422件を内蔵）
- `template.html` … その元テンプレート（`__JOBS_DATA__` が差し込み位置）
- `apply.html` … 転職支援サービスの申し込みフォーム（求人の「応募する」の遷移先）
- `apply-template.html` … その元テンプレート（`__JOBS_MINI__` が差し込み位置）
- `data/jobs.json` … Airtable から取得した求人データ 456 件（正規化済み・compact JSON）
  ⚠ このうち **中途 422 件だけ**が `index.html` に入る。`rebuild.js` の `midCareerOnly()` が新卒・インターンを落とす。
- `SUPABASE_SETUP.md` … マイページに「会員登録・ログイン」を足すときの手順書
- `APPLY_SETUP.md` … **応募フォームの受け皿（Supabase の applications テーブル）を作る手順書**
- `rebuild.js` … `data/jobs.json` を各テンプレートに流し込んで HTML を再生成
  - 実行: このフォルダで `node rebuild.js`
  - デザインや機能を変えたいときは `template.html` / `apply-template.html` を編集 → `node rebuild.js`
  - ⚠ `index.html` と `apply.html` は生成物。**直接編集しても次回のビルドで消える**

## データの更新（最新化）手順
`data/jobs.json` は「取得時点のスナップショット」。最新化したいときは Claude（Airtable 連携）に
以下を伝えて `data/jobs.json` を作り直してもらい、`node rebuild.js` を実行する。

### Airtable 取得元
- Base: `人材紹介事業` / baseId `appYkc36EvioYoL1A`
- Table: `求人DB（求人票）` / tableId `tblyPZZasXTM2tcrV`（全 456 件。サイトに出るのは中途 422 件）
- 会社情報は Table `求人DB（企業）` / `tblBNNH9sJjldPmZZ` とリンク（会社名・会社情報・URL・会社住所・上場区分は lookup で取得済み）

### 使用フィールド（fieldId → jobs.json のキー）
| fieldId | 内容 | jobs.json キー |
|---|---|---|
| fldp0GXKIkufwPQFF | 求人タイトル(表示) | title |
| fldoQsYnH5W90qiKW | 会社名(link) | company |
| fldwyqGnE2veXVaJo | 職種・募集ポジション | position |
| fldKceIwtiUSMmZaH | 雇用形態 | employment |
| fldZrrfEai4UaVtNV | 区分 | kubun |
| fld8g1uhuhAhkVxjS / fldIaQVH5rsmzoo9Y | 年収下限 / 上限 | salaryMin / salaryMax |
| fldeGeORYsBiYJNIF | 給与（原文） | salaryRaw |
| fldsIgsArolZDt1I5 | 勤務地 | location |
| fldrDT2UQOqO0L06f | 勤務時間 | workHours |
| fldK16PPXO2RZO011 | 休日 | holidays |
| fldUNtnN6ueSqeWvU | 福利厚生 | benefits |
| fldxZH1FmlN0WYMbK | 仕事内容 | jobContent |
| fld3mrIQScRgqWHox | 必須条件 | must |
| fldwxt81X7jzHvF5H | 歓迎条件 | welcome |
| fldy4cP88TI3Ihht1 | 求める人物像 | idealPerson |
| fldEQcK7fBwNps0tC | 選考プロセス | selectionProcess |
| flduLYPcGIpxSpFHg | 職種カテゴリ | jobCategory |
| fldBZFa0Fa2iS072D | 業界カテゴリ(link) | industry |
| fld4cEbkkOP57tEqT | 会社情報(lookup) | companyInfo |
| fldcZfB9BkIPXNi0Z | URL(lookup) | url |
| fldSfExGKjQUFanwx | 会社住所(lookup) | companyAddress |
| fld4KFQmkPBfCiczK | 上場区分(lookup) | listedStatus |

`prefectures`（勤務地からの都道府県判定）と `remote`（在宅/リモート判定）は
`template.html` 内の JS で実行時に自動付与している（データには持たせていない）。

### 任意フィールド `createdAt`（入れると「新着順」と NEW バッジが出る）

`data/jobs.json` の各求人に `createdAt`（例 `"2026-08-01T09:00:00.000Z"`。Airtable の `createdTime` 相当）を
足すと、並び替えに**「新着順」**が増えて既定になり、掲載14日以内の求人に **NEW バッジ**が付く。
**入っていなければ、どちらも表示されない**（新しさを偽らないため）。いまの jobs.json には入っていない。

## 画面の形（ワークポート／JAC 型）

2026-08-21に、ワークポート（workport.co.jp）とJACの求人サイトの型に寄せた。

```
ヘッダー：ロゴ／グローバルナビ／キーワード検索／マイページ／「転職支援に申し込む 無料」
パンくず：ホーム › 求人情報一覧
┌─ 絞り込み ─┬─ 検索結果 ────────────────────┐
│ 働き方・年収 │ 現在の検索条件（チップ）              │
│             │ 422件の求人   並び替え▼  表示件数▼    │
│ 勤務地エリア │ ┌─ 求人1件＝横長カード1行 ───────┐ │
│ 職種カテゴリ │ │ 企業名／業界              ★     │ │
│ 業界        │ │ 職種名（リンク）                 │ │
│ 雇用形態    │ │ タグ／仕事内容の冒頭2行          │ │
│            │ │ 想定年収・勤務地                 │ │
│            │ │        [詳細を見る] [応募する]   │ │
│            │ └────────────────────────┘ │
│            │      ‹ 前へ 1 2 3 … 16 次へ ›       │
└───────────┴──────────────────────────┘
```

- **求人詳細は別ページ扱い**（`?job=<求人ID>`・pushState）。左に本文、右に「想定年収＋応募ボタン」の固定レール。
  スマホでは画面下に応募バーが張り付く。戻るボタン・URL共有が普通のページと同じように効く
- **「応募する」→ `apply.html`**（転職支援サービスの申し込みフォーム）。企業へ直接応募するのではなく、
  当社から推薦する形で選考が進む、という人材紹介の建て付けをフォーム側で明示している

## 実装している機能
- キーワード検索（職種・企業名・仕事内容など横断）
- 絞り込み: 勤務地エリア（都道府県自動判定）/ リモート可 / 年収下限スライダー /
  職種カテゴリ（74種）/ 業界（12種）/ 雇用形態
  （「区分」は中途のみになったため 2026-08-28 に廃止）
- 並び替え: おすすめ / 年収が高い・低い / 企業名（＋データに `createdAt` があれば「新着順」）
- 表示件数 30 / 50 / 100 件のページネーション
- 求人詳細ページ（仕事内容などを Markdown 整形表示・企業サイトへのリンク・シェアボタン）
- 4ステップの申し込みフォーム `apply.html`（送信先は Supabase・入力途中は端末に一時保存）
- ライト/ダークテーマ、スマホ対応
- **マイページ（気になる求人）** … 求人カード右上の★で保存 → ヘッダー「マイページ」から一覧
  - 初期状態は **localStorage（その端末だけ）** に保存。サーバー不要・費用ゼロ
  - `template.html` の `SUPABASE_URL` / `SUPABASE_ANON_KEY` を設定すると
    **メールでログイン（パスワード不要）** に切り替わり、端末をまたいで同期される
  - 手順は `SUPABASE_SETUP.md` を参照

## 問い合わせフォーム（相談の入口）

求人詳細の「電話で軽く話を聞きたい」「メールで質問する」の送信先です。
**応募フォームとは別物**で、履歴書・職務経歴書は受け取りません（意図的にそうしています）。

Airtable テーブル: **求人の問い合わせ（サイト）** `tbltITsj4OmX5B2PJ`（base `appYkc36EvioYoL1A`）

フォームビュー: **この求人について聞く** `viw2sJmpVaocBc9KK`
共有URL: `https://airtable.com/appYkc36EvioYoL1A/shrxmcjkaIdktH1Qk`（`INQUIRY_FORM_URL` に設定済み）

電話番号と電話のご希望時間帯は、「ご希望の連絡方法」が「電話で折り返してほしい」のときだけ出る**条件表示**にしてあります。メールで質問したいだけの人に電話番号を聞くと離脱するためです。送信があると `r_matsuoka@agent-best.net` に通知が飛びます。

### ⚠ 作り直すときは（フォームビューの共有URLはAPIから作れない）

テーブルとフィールドはAPIで作れますが、**フォームビューと共有URLはAirtableの画面でしか作れません。**
作り直す場合は下記のとおりに設定してください。**`INQUIRY_FORM_URL` を空にすると `mailto:` にフォールバック**するので、その間もリンクは死にません。

1. Airtable で **求人の問い合わせ（サイト）** を開く
2. 左のビュー一覧から **＋ → Form** で新しいフォームビューを作る
3. フォームに出す項目を、この順で並べる

   | 項目 | 設定 |
   |---|---|
   | ご希望の連絡方法 | **必須**（サイト側からプリフィルされるので、実質は確認用） |
   | 氏名 | **必須** |
   | メールアドレス | **必須** |
   | 電話番号 | 任意 ＋ **条件表示**：「ご希望の連絡方法」が「電話で折り返してほしい」のときだけ表示 |
   | 電話のご希望時間帯 | 任意 ＋ 同じ条件表示 |
   | ご質問・聞きたいこと | **任意**（必須にしない。書けない段階の人を落とさないため） |
   | 対象求人 / 企業名 | フォームには出さなくてよい（プリフィルで入る） |
   | 求人レコードID | **非表示**（`hide_` で隠している） |

4. 右上 **Share form** → 共有リンクをコピー
5. `template.html` の `INQUIRY_FORM_URL` に貼る → `node rebuild.js` → commit & push

### Slack 通知

問い合わせが入ると Slack の **#notification_siteoubo**（`C0BKL6YEDPV`）へ投稿します。
Airtable のオートメーション **「求人サイトの問い合わせを Slack へ通知」** `wflaOu5LOuWTDwia1`
（https://airtable.com/appYkc36EvioYoL1A/wflaOu5LOuWTDwia1 ）が担当します。

`#notification_siteoubo` は元々「求人応募（サイト）」の通知先でしたが、
**応募導線を削除したためこのチャンネルは無音になります。**
求人サイト由来の反応をここに集約する形にしました。

通知は「ご希望の連絡方法」を先頭に出しています。**電話の折り返し希望は早く気づく必要がある**ためです。

> ⚠ **オートメーションは作成しただけでは動きません。** Airtable の画面で内容を確認して
> **オンにする**必要があります（API から作成したものは必ず下書き状態になります）。
>
> ⚠ 選択肢フィールド（ご希望の連絡方法・電話のご希望時間帯）は `…["fldXXX","name"]` のように
> **`name` まで指定しないと保存できません**。オブジェクトが返るためです。

### ⚠ プリフィルはフィールド名と一致していないと効かない

`template.html` の `inquiryUrl()` が `prefill_ご希望の連絡方法` / `prefill_対象求人` /
`prefill_企業名` / `prefill_求人レコードID` を送っています。
**Airtable 側のフィールド名を変えると、黙って効かなくなります。**

選択肢の名前も同様です。`WAY_TEL` / `WAY_MAIL` は Airtable の
「ご希望の連絡方法」の選択肢と**一字一句同じ**にしてください。

## 応募フォーム（転職支援サービスの申し込み）

求人カード・求人詳細の「応募する」→ `apply.html?job=<求人ID>`。

4ステップ（①お名前・生年月日 ②直近の経験職種・都道府県・現年収 ③メール・携帯 ④面談方法・転職時期・状況・同意）。
面談日時は聞かず、送信後の完了画面で Calendly を案内する。

送信先は **Supabase の `public.applications`**（匿名キーで INSERT のみ許可）。
**このテーブルを作るまでフォームは送信時にエラーになる。** 手順・SQL・通知の設定は `APPLY_SETUP.md`。

⚠ `applications` に SELECT ポリシーを足さないこと。匿名キーは `apply.html` に書いてあるので、
1つでも足すと応募者の氏名・生年月日・電話番号が誰からでも読める。

## 既知の前提・検討中の項目（「考えたい」メモ）
- 年収 min/max 未設定が 45 件（表示は「応相談」）。扱いを検討。
- 応募を Airtable の CRM 側にも流すかは未決（`APPLY_SETUP.md` 第5項）。
- `createdAt` が無いので「新着順」と NEW バッジが出せていない。jobs.json を作り直すときに足すか要検討。
- データは常時同期ではなくスナップショット。常時同期・独自ドメイン・一般公開が必要なら
  Next.js 等の「本格 Web アプリ版」へ移行する（Airtable API キー + Vercel 等のデプロイが必要）。
- 軽量サンプル（60件版）は scratchpad の `index_sample.html` に生成済み（必要なら再作成可）。
