# マイページに「会員登録・ログイン」を追加する手順

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

左メニューの **Project Settings**（歯車）→ **API** を開きます。

1. **Project URL**（`https://xxxxx.supabase.co` の形）
2. **anon public** キー（`eyJ...` で始まる長い文字列）

この2つを、`template.html` の以下の場所に貼り付けます。

```javascript
const SUPABASE_URL = "";        // ← ここに Project URL
const SUPABASE_ANON_KEY = "";   // ← ここに anon public キー
```

貼り付けるとこうなります。

```javascript
const SUPABASE_URL = "https://xxxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
```

### anon キーは公開して大丈夫？

**大丈夫です。** このキーは公開されることを前提に作られています。
手順3で設定した「本人しか読み書きできない」ルールがデータベース側で守っているので、
キーを知っていても他人のデータは取れません。

**⚠ 絶対に貼ってはいけないキー**: 同じ画面にある **`service_role`** キーは
すべての制限を無視できる管理者キーです。これはサイトに貼らないでください。

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
- 希望年収の下限（任意）
- 希望職種（任意）
- 現在のお仕事の業種（任意）
- 転職を考えている時期（任意）
- ★を付けた求人のID

公開前に、プライバシーポリシー（`privacy.html`）へ上記を取得する旨の追記が必要です。

### 登録された会員を見るには

Supabaseの左メニュー **Table Editor** → `profiles` / `favorites` を開けば一覧できます。
`favorites` の `job_id` は求人サイト側の求人IDです。
