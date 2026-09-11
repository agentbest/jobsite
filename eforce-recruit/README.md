# イー・フォース株式会社 採用ページ（Entrance Book）

Notion の「Entrance Book」を素の HTML / CSS / JS に置き換えたものです。フレームワーク・ビルド工程なし。
フォルダごとどこに置いても動きます（GitHub Pages・S3・既存 WordPress のサブディレクトリなど）。

| ファイル | 役割 |
|---|---|
| `index.html` | 入口。Entrance Book 本体（はじめに／会社紹介資料／事業領域／開発事例／扱う技術／カルチャー／メンバー／働く環境／新卒・中途への振り分け） |
| `shinsotsu.html` | 新卒採用（2027年卒）。組み込みエンジニア／IoTエンジニア |
| `career.html` | 中途採用。組み込みエンジニア／プリセールス |
| `assets/style.css` | 共通スタイル（3ページで1本） |
| `assets/main.js` | ナビ・出現アニメ・数字カウント・事例タブ・ヒーローの canvas（依存なし） |
| `assets/img/` | Notion から取り込んだ写真・図、公式ロゴ |

## 情報の出どころ

- 本文・写真: Notion「Entrance Book」（2026年2月更新）と、その子ページ「一緒に働く仲間」
- 会社概要・沿革・導入実績・カルチャー・トップインタビュー: www.eforce.co.jp
- 募集要項（給与・要件・勤務地・休日・福利厚生）: HERP の求人票4件（新卒2・中途2）
- 社員インタビュー: Wantedly の記事へリンク（本文は転載していない）

**数字はすべて出典どおり**（創業2006年・導入1,000製品以上・500社超・対応CPU16社・従業員32名・年間休日130日）。
「1年目のイメージ」など創作の部分は、ページ内で「イメージです」と明記しています。

## 直すときの目安

- 募集要項が変わったら `shinsotsu.html` / `career.html` の **職種カード**（`.role`）と **要項の表**（`.spec`）の2か所を直す
- エントリー先は HERP の各求人URL（`herp.careers/v1/eforce/...`）。求人を出し直すとURLが変わるので確認する
- 会社紹介資料は Speaker Deck の埋め込み。差し替えは `index.html` の `<iframe src=...>`
- 外部依存は Google Fonts（Inter / JetBrains Mono / Noto Sans JP）だけ。落ちてもシステムフォントで成立する
- 動きを止めたい場合は OS の「視差効果を減らす」で全部止まる（`prefers-reduced-motion` 対応済み）

## ローカル確認

```
python -m http.server 8000
# → http://localhost:8000/index.html
```
