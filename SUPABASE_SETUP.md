# マイページに「会員登録・ログイン」を追加する手順

> ## ✅ 設定済みです（2026-08-15）
>
> | 項目 | 値 |
> |---|---|
> | プロジェクト | `jobsite-tokyo` |
> | プロジェクトID | `jvdnabtpxcyfnogdulea` |
> | リージョン | **Northeast Asia (Tokyo)** ap-northeast-1 |
> | ダッシュボード | https://supabase.com/dashboard/project/jvdnabtpxcyfnogdulea |
>
> テーブル作成・RLS・ログインURL設定・鍵の反映はすべて完了しています。
> **以下は、作り直すときのための記録です。**
>
> ⚠ 最初にSingaporeリージョンで作ってしまい、作り直しました。
> **Regionの「Asia-Pacific」を選ぶとSingaporeになります。**
> 「SPECIFIC REGIONS」から **Northeast Asia (Tokyo)** を選んでください。ここは後から変更できません。

いまの状態でも**お気に入り（★）は動きます**。ただし保存先はそのブラウザの中だけで、
別の端末からは見えません。

この手順を行うと、メールアドレスでログインできるようになり、
**どの端末からでも同じお気に入りを見られる**ようになります。

- 費用: **無料**（月5万人までのログインが無料枠に含まれます）
- 作業時間: 20〜30分
- 必要なもの: メールアドレスひとつ

---

## 手順1. Supabase のアカウントを作る

1. https://supabase.com を開き、右上の「Start your project」
2. GitHubアカウントまたはメールアドレスでサインアップ
3. クレジットカードの登録は不要です

> ここは松岡さんご自身で行ってください（アカウント作成・パスワード入力の作業のため）。

---

## 手順2. プロジェクトを作る

「New project」を押して、次のように入力します。

| 項目 | 入れる値 |
|---|---|
| Name | `jobsite`（何でも構いません） |
| Database Password | 自動生成されたものをそのまま使い、**パスワード管理ツールに保存** |
| Region | **Northeast Asia (Tokyo)** ← 必ず東京を選ぶ |
| Plan | Free |

> リージョンを東京にする理由: 求職者の個人情報を日本国内に保管するためです。
> あとから変更できないので、ここだけ注意してください。

作成完了まで2分ほどかかります。

---

## 手順3. データの入れ物を作る（SQLを1回貼るだけ）

左メニューの **SQL Editor** →「New query」を開き、
下のSQLを**まるごとコピーして貼り付け**、右下の「Run」を押します。

```sql
-- お気に入り（誰がどの求人を★したか）
create table if not exists public.favorites (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  job_id     text        not null,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

-- 会員プロフィール（お名前・ご希望条件／すべて任意入力）
create table if not exists public.profiles (
  id               uuid        primary key references auth.users(id) on delete cascade,
  full_name        text,        -- お名前
  desired_salary   int,         -- 希望年収の下限（万円）
  desired_jobs     text[],      -- 希望職種（営業／エンジニア など・複数）
  current_industry text,        -- 現在のお仕事の業種
  timing           text,        -- 転職を考えている時期
  created_at       timestamptz  not null default now(),
  updated_at       timestamptz  not null default now()
);

-- （すでに古い形で作ってしまった場合の追加。初めての方は何も起きません）
alter table public.profiles add column if not exists desired_salary   int;
alter table public.profiles add column if not exists desired_jobs     text[];
alter table public.profiles add column if not exists current_industry text;
alter table public.profiles add column if not exists timing           text;
alter table public.profiles add column if not exists updated_at       timestamptz not null default now();

-- 【重要】本人以外は読めない・書けないようにする設定
alter table public.favorites enable row level security;
alter table public.profiles  enable row level security;

create policy "本人のお気に入りのみ" on public.favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "本人のプロフィールのみ" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
```

### 追加：履歴書・職務経歴書の保管（2026-08-15）

同じ SQL Editor で、下のSQLも実行します。

```sql
-- プロフィールに書類の情報を持たせる
alter table public.profiles add column if not exists resume_path text;
alter table public.profiles add column if not exists resume_name text;
alter table public.profiles add column if not exists resume_at   timestamptz;
alter table public.profiles add column if not exists cv_path     text;
alter table public.profiles add column if not exists cv_name     text;
alter table public.profiles add column if not exists cv_at       timestamptz;

-- 書類の入れ物（非公開バケット・10MBまで・PDF/Word/Excelのみ）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents','documents', false, 10485760, array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 【重要】自分のフォルダ（= 自分のユーザーID）以外は読めない・書けない
create policy "本人の書類のみ参照" on storage.objects for select
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "本人の書類のみ登録" on storage.objects for insert
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "本人の書類のみ更新" on storage.objects for update
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "本人の書類のみ削除" on storage.objects for delete
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
```

> バケットを **public にしない**ことと、この4つの policy が
> 「他人の履歴書を見られない」を担保しています。**消さないでください。**

### 追加：プロフィール項目の拡張（2026-08-15）

年齢・経験職種・希望勤務地・希望年収（理想）を追加しました。同じ SQL Editor で実行します。

```sql
alter table public.profiles add column if not exists age                  int;    -- 年齢
alter table public.profiles add column if not exists experience_jobs      text[]; -- 経験のある職種（複数）
alter table public.profiles add column if not exists desired_areas        text[]; -- 希望勤務地（地域ブロック・複数）
alter table public.profiles add column if not exists desired_salary_ideal int;    -- 希望年収の理想（万円）
```

> `desired_salary` は「最低ライン」、`desired_salary_ideal` は「理想」です。画面上もそう表示しています。
> `desired_areas` に入るのは都道府県ではなく **地域ブロック名**（関東／東海／関西 …）です。
> ブロックの定義は `template.html` の `AREA_BLOCKS` にあります。

**担当者が中身を見るには**、左メニューの **Storage** → `documents` を開きます。
フォルダ名は会員のユーザーIDです。誰のものかは **Table Editor** の `profiles` と突き合わせて確認します。

---

> 最後の `enable row level security` と `policy` が**最も大事な部分**です。
> これがあるおかげで、Aさんのお気に入りをBさんが見ることはできません。
> 消したり書き換えたりしないでください。

「Success. No rows returned」と出れば成功です。

---

## 手順4. ログインリンクの戻り先を登録する

左メニューの **Authentication** → **URL Configuration** を開きます。

| 項目 | 入れる値 |
|---|---|
| Site URL | `https://jobs.agent-best.net` |
| Redirect URLs | `https://jobs.agent-best.net/**` |

「Save」を押します。

> これを設定しないと、メールのリンクを踏んでもログインできません。

---

## 手順5. 鍵を2つコピーして貼る

左メニューの **Project Settings**（歯車）→ **API Keys** を開きます。

1. **Project URL** … `https://<プロジェクトID>.supabase.co` の形
2. **Publishable key** … `sb_publishable_` で始まる文字列

> Supabaseは鍵の仕組みを新しくしました。以前の **anon public** キー（`eyJ...`）は
> 「Legacy anon, service_role API keys」タブに残っていますが、**新しく作るなら Publishable key** を使います。
> supabase-js v2 はどちらでも動きます。変数名 `SUPABASE_ANON_KEY` は当時の名残です。

この2つを、`template.html` の以下の場所に貼り付けます。

```javascript
const SUPABASE_URL = "";        // ← ここに Project URL
const SUPABASE_ANON_KEY = "";   // ← ここに Publishable key
```

貼り付けるとこうなります（実際の値は設定済み）。

```javascript
const SUPABASE_URL = "https://jvdnabtpxcyfnogdulea.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_...";
```

### この鍵は公開して大丈夫？

**大丈夫です。** Supabaseの画面にも「Publishable keys can be safely shared publicly」と書かれています。
手順3で設定した「本人しか読み書きできない」ルールがデータベース側で守っているので、
鍵を知っていても他人のデータは取れません。

**⚠ 絶対に貼ってはいけない鍵**: 同じ画面にある **Secret keys**（`sb_secret_...`）と
**`service_role`** キーは、すべての制限を無視できる管理者鍵です。これはサイトに貼らないでください。

---

## 手順6. 反映する

```
cd C:\Users\user\jobsite
node rebuild.js
```

これで `index.html` が作り直されます。GitHubにpushすれば公開反映されます。

---

## 動作確認

1. サイトを開いて「マイページ」→ メールアドレスを入れて「ログインリンクを送る」
2. 届いたメールのリンクを開く
3. サイトに戻り、「ログイン中: ○○@○○」と表示されればOK
4. **別の端末**で同じメールでログインし、お気に入りが出れば成功

---

## お金の話

| 状況 | 料金 |
|---|---|
| いま〜登録者5万人まで | **無料** |
| バックアップが欲しくなったら | 月 $25（約3,800円） |

**実際の求職者データが入ったら Pro（$25）に上げることを推奨します。**
無料プランには自動バックアップが無く、消えたときに戻せないためです。
Supabaseの画面からボタン1つで切り替えられ、作り直しは不要です。

なお無料プランは**1週間まったくアクセスが無いと一時停止**しますが、
公開中の求人サイトなら毎日アクセスがあるので通常は起きません。

---

## 個人情報について（運用メモ）

このマイページで預かるのは以下だけです。

- メールアドレス（ログインに使うので必須）
- お名前（任意）
- 年齢（任意）
- 現在のお仕事の業種（任意）
- 経験のある職種（任意）
- 希望職種（任意）
- 希望勤務地（任意）
- 希望年収の最低ライン・理想（任意）
- 転職を考えている時期（任意）
- 履歴書・職務経歴書（任意・アップロードした場合のみ）
- ★を付けた求人のID

公開前に、プライバシーポリシー（`privacy.html`）へ上記を取得する旨の追記が必要です。

### 登録された会員を見るには

Supabaseの左メニュー **Table Editor** → `profiles` / `favorites` を開けば一覧できます。
`favorites` の `job_id` は求人サイト側の求人IDです。
