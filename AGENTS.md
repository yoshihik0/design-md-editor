# AGENTS.md — AIエージェント向け作業ガイド

この「D.md」（DESIGN.mdエディタ）というプロジェクトは、AIと人間が対話しながらデザイントークンとそのプレビューの仕方を編集し、デザインシステムを作り上げていく作業場である。

## 基本ワークフロー

- AIがDESIGN.mdやPREVIEW.mdを編集するためだけにローカルサーバーを起動しない。作業開始時に`.dmd/current.json`を読み、対象ファイルを直接編集する。
- ユーザーがD.mdを「開いて」「起動して」と依頼した場合は、方式の指定がなくても`./start.sh`を実行してローカルサーバー版を開く。Node.jsがあれば`server.mjs`、なければ`server.py`が自動選択される。
- ユーザーが「直接起動」「サーバーなしで開く」と明示した場合は`index.html`を直接開く。直接起動ではユーザーが「フォルダを接続」からプロジェクトルートを選ぶ。
- `start.command`はmacOSでローカルサーバー版をダブルクリック起動するためのもの。Windowsでは`start.bat`を使う。
- 直接起動版とローカルサーバー版は同じ`index.html`、DESIGN.md、PREVIEW.mdを使用する。
- エディタは外部変更を1秒間隔で監視する。AIがファイルを保存すればプレビューへ自動反映される。
- ブラウザも1秒デバウンスで自動保存するため、編集直前に必ず最新内容を読み直し、古い内容で全文上書きしない。
- 対象の作業フォルダが不明な場合は確認する。更新時刻だけで推測しない。
- `.dmd/current.json`の`editorMode`はブラウザの接続方式を示す情報であり、`folder`の場合はサーバーを起動しない。`editorMode`の有無にかかわらず、AIによるファイル編集自体にサーバーは不要。
- ユーザーが参考、比較、既存サイト、既存デザインへ言及した場合は`references/`を確認し、明示された資料または依頼に関係する資料を判断材料として使う。無関係な作業で全資料を読み込まず、ユーザーの明示がない限り`references/`内は変更しない。

## ファイル構成

- `design/<作業名>/DESIGN.md` — デザイントークンと仕様書本文
- `design/<作業名>/PREVIEW.md` — DESIGN.mdを視覚確認するプレビュー定義
- `design/templates/<テンプレート名>/DESIGN.md` / `PREVIEW.md` — ペアテンプレート。直接編集しない
- `defaults/PREVIEW.md` — PREVIEW.mdを伴わない外部DESIGN.md用の標準プレビュー。テンプレート一覧には表示しない
- `docs/PREVIEW-MANUAL.md` — PREVIEW.md記法の簡易マニュアル
- `docs/USER-GUIDE.md` — 人向けガイドの原本。`README.md`と内蔵ガイドはここから生成する
- `README.md` — `docs/USER-GUIDE.md`と同一内容の生成コピー。直接編集しない
- `references/` — 既存サイトなどのDESIGN.mdを置く参考資料フォルダ。ユーザーが明示しない限り内容を変更しない
- `index.html` / `app.js` / `styles.css` — エディタ本体
- `embedded-resources.js` — 直接起動用に標準プレビュー、マニュアル、テンプレートを内蔵した生成ファイル
- `scripts/build-embedded-resources.mjs` — READMEと内蔵リソースの再生成スクリプト
- `start.sh` / `start.command` / `start.bat` — Node/Pythonを自動選択する起動スクリプト
- `server.mjs` / `server.py` — 同等機能を持つNode/Pythonローカルサーバー
- `history/` — 旧仕様・作業履歴。現行仕様として参照しない
- `info/` — 調査資料。ユーザーの指示なしに変更・公開しない
- `.dmd/current.json` — エディタが現在開いている作業フォルダ、DESIGN.md、PREVIEW.mdのパス

テンプレートは開いただけでは複製されない。最初の編集時に`design/Modern-SaaS-001/`のような番号付き作業フォルダが作られ、DESIGN.mdとPREVIEW.mdがセットで保存される。

「その他のファイルを選択」やドラッグ＆ドロップで開いたDESIGN.mdは、元ファイルを変更しない外部インポートとして扱う。PREVIEW.mdには`defaults/PREVIEW.md`を適用し、編集結果は「別名で保存」で`design/<作業名>/`へDESIGN.mdとPREVIEW.mdのペアとして保存する。

## DESIGN.mdスキーマ（現行v3.0）

```yaml
---
title: システム名
version: "1.0.0"
author: 作成者
description: 説明
colors:
  # brand
  primary: "#2563eb"
  on-primary: "#ffffff"
  # surface
  canvas: "#ffffff"
  surface: "#f8fafc"
  ink: "#0f172a"
  ink-muted: "#64748b"
  # semantic
  success: "#15803d"
  success-tint: "rgba(21,128,61,0.10)"
  # mode-dark
  canvas-dark: "#0f172a"
  surface-dark: "#1e293b"
  ink-dark: "#f1f5f9"
typography:
  # display
  display-lg:
    font: Outfit
    source: google
    size: 40
    weight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
    color: ink
  # body
  body:
    font: Noto Sans JP
    source: google
    size: 16
    weight: 400
    lineHeight: 1.7
    color: ink
  markdown:
    h1: display-lg
    h2: heading-lg
    h3: heading-md
    h4: heading-sm
    body: body
    small: small
    caption: caption
    strong: strong
border:
  none: none
  sm: 1px solid
  md: 2px solid
rounded:
  none: 0
  sm: 4
  md: 8
  lg: 16
  full: 9999
elevation:
  shadows:
    none: none
    sm: 0 1px 2px rgba(0,0,0,0.06)
    md: 0 4px 12px rgba(0,0,0,0.10)
spacing:
  none: 0
  base: 8
  sm: 8
  md: 16
components:
  # button
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    border: "{border.none}"
    rounded: "{rounded.md}"
    shadow: "{elevation.shadows.none}"
    padding: 8px 16px
---

（以下、仕様書本文）
```

### スキーマ上の注意

- 文書名は`title`を使う。旧データの`name`は読み込み互換のみとし、書き込み時は`title`へ正規化する。
- グループは`colors`、`typography`、`components`内の全行コメントで表現する。`colorGroups`や`typography.styles`は作らない。
- モードは`# mode-dark`グループ内に`canvas-dark`のような`<色名>-<モード名>`で差分だけを書く。トップレベルの`modes`は作らない。
- `font`には実際のfont-family名を書く。`source`は`google`、`system`、`other`などを使う。
- `lineHeight`、`letterSpacing`などのプロパティ名は現行UIのcamelCaseに合わせる。未設定の任意項目は出力しない。
- `border.none: none`、`rounded.none: 0`、`elevation.shadows.none: none`、`spacing.none: 0`を明示的な選択肢として維持する。
- コンポーネント参照は`"{colors.primary}"`のような中括弧形式を使う。

## PREVIEW.md

PREVIEW.mdは通常のMarkdownとプレビューショートコードで構成する。詳細は`docs/PREVIEW-MANUAL.md`を参照する。

主な記法：

```text
[definition:overview]
[colors]
[colors:group]
[typography:"例文"]
[typography:group:"例文"]
[markdown:"例文"]
[border:surface:ink]
[rounded:surface:ink]
[shadow:surface:ink]
[spacing]
[buttons:primary:on-primary:md:md:md]
[buttons:semantic:on-primary:md:md:md]
[feedback:semantic-tint:semantic:body:md:md:md]
[cards:surface:ink:ink:md:md:md]
[form:surface:ink:md:md:md]
[form-input:surface:ink-muted:ink:sm:sm:none]
[form-button:primary:on-primary:md:md:md]
[components]
[contrast:surface:semantic]
```

- `[buttons]`は登録済みbuttonコンポーネントを表示する。
- `[buttons:primary:...]`は指定色の単一ボタンを表示する。
- `[buttons:semantic:...]`はsemanticグループの色を並べる。
- 色指定にはトークン名と`#ffffff`などの直値を使える。
- Google以外のWebフォント埋め込み情報はPREVIEW.md末尾の`<!-- webfont ... -->`コメントに保存する。

## 作業ルール

1. 書き込み前に対象ファイルを読み直し、最小差分で編集する。
2. YAMLを壊さない。編集後にパースまたはエディタ表示を確認する。
3. 色を変更したらWCAG相対輝度で本文4.5:1以上を基本として確認する。
4. アルファ色は実際の背景へ合成してからコントラストを計算する。
5. `mode-*`がある場合は既定色と各モードの双方を検証する。
6. 本文の全文再生成を避け、該当箇所だけを修正する。
7. `<!-- keep -->`〜`<!-- /keep -->`は、値の事実修正以外で変更しない。
8. トークン変更後、仕様書本文の説明と食い違いがないか確認する。
9. DESIGN.mdとPREVIEW.mdはセットで扱い、PREVIEW.mdだけを別案件へ流用しない。
10. 編集後は変更箇所と検証結果を簡潔に報告する。
