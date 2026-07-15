# D.md

> **DESIGN.mdを、見ながら育てる。**

D.mdは、デザイントークンとデザインルールを記述した`DESIGN.md`を、ブラウザで編集・確認するローカルWebアプリです。

色、タイポグラフィ、ボーダー、角丸、シャドウ、スペーシング、コンポーネントをフォームで編集すると、YAMLとプレビューへ即座に反映されます。Codex、Claude Code、Antigravityなどと同じローカルファイルを共有し、人とAIでデザインシステムを育てられます。

## できること

- **トークンを視覚的に編集** — 色、文字、形状、奥行き、余白、コンポーネントを一つのUIで管理
- **使われ方までプレビュー** — ボタン、カード、フォーム、フィードバック、記事本文を実際の見た目で確認
- **既存仕様を読み解く** — DESIGN.mdの意図、トークン同士の関係、未定義や矛盾を視覚的に確認
- **DESIGN.mdと常に同期** — フォーム編集とYAML編集を双方向に反映し、変更を自動保存
- **AIとローカルで共創** — AIがファイルを編集すると、ブラウザのプレビューが自動更新
- **テンプレートから開始** — Standard Web、Modern SaaS、Minimal Mono、Warm Editorial、Cyberpunk Neonを収録
- **ダークモードを確認** — 差分色だけで定義したカラーモードをプレビューで切り替え
- **実装形式へエクスポート** — Tailwind CSS、CSS Variables、コンポーネントCSS、Design Tokens JSON、プレビューHTMLに対応

エクスポートファイルはDESIGN.mdの`title`を接頭辞にし、`standard-web-system.preview.html`、`standard-web-system.tailwind.css`のような名前で保存されます。

## はじめる

### AIに起動してもらう

このフォルダをCodex、Claude Code、Antigravityなどで開き、次のように依頼します。

```text
D.mdを起動して。
```

AIは利用できる環境を確認し、Node.jsまたはPythonでローカルサーバーを起動します。

### 自分で起動する

| 環境 | 起動方法 |
|---|---|
| macOS | `start.command`をダブルクリック |
| Windows | `start.bat`をダブルクリック |
| ターミナル | `./start.sh` |

Node.jsがあれば`server.mjs`、なければPython 3の`server.py`が自動的に選ばれます。パッケージのインストールやビルドは不要です。

起動後に次のURLを開きます。

```text
http://localhost:3000/
```

終了するときは、起動したターミナルで`Ctrl+C`を押します。

## 基本ワークフロー

1. テンプレートを選ぶか、既存の`DESIGN.md`を開く
2. 左側のフォームまたは右側のYAMLでトークンを編集する
3. 中央のプレビューで文字、配色、コンポーネントを確認する
4. 必要に応じてPREVIEW.mdで確認項目を組み替える
5. AIと相談しながらDESIGN.mdの値とルールを調整する
6. 実装に必要な形式へエクスポートする

編集結果はローカルファイルへ自動保存されます。外部変更も監視されるため、AIによる編集は約1秒でブラウザへ反映されます。

## DESIGN.md

DESIGN.mdは、機械が読めるデザイントークンと、人やAIが判断に使うデザインルールを一つにまとめたMarkdownファイルです。

```yaml
---
title: Standard Web System
version: 4.0.0
author: Web Standards Team
description: アクセシブルで実務的な標準Webデザインシステム。

colors:
  # brand
  primary: '#2f5fd6'
  on-primary: '#ffffff'
  # surface
  canvas: '#ffffff'
  surface: '#f4f6f8'
  # text
  ink: '#1c2530'

typography:
  # heading
  heading-lg:
    font: Inter
    source: google
    size: 32
    weight: 700
    lineHeight: 1.3
    color: ink
  markdown:
    h2: heading-lg

border:
  none: none
  sm: 1px solid

rounded:
  none: 0
  md: 8

elevation:
  shadows:
    none: none
    sm: 0 1px 2px rgba(0,0,0,0.06)

spacing:
  none: 0
  base: 8
  md: 16
---

## Overview

このデザインシステムが目指す体験と、トークンを選ぶときの判断基準を記述します。
```

YAMLには選択肢を、本文には「なぜその値か」「どこで使うか」「何を避けるか」を記述します。

## DESIGN.mdとPREVIEW.md

作業データはフォルダ単位で管理します。

```text
design/Modern-SaaS-001/
├── DESIGN.md
└── PREVIEW.md
```

- `DESIGN.md` — デザイントークンと仕様書本文
- `PREVIEW.md` — トークンとコンポーネントの確認方法を指定するプレビュー定義

PREVIEW.mdでは通常のMarkdownに加えて、次のようなプレビュー記法を使えます。

```text
[colors:group]
[typography:group:"DESIGN System 2026 — 一貫性でつくる素敵なユーザー体験"]
[markdown:"見出しと本文のサンプル"]
[buttons:semantic:on-primary:md:md:md]
[cards:surface:semantic:ink:sm:md:none]
[feedback:semantic-tint:semantic:body:sm:md:none]
[form:surface:ink:sm:md:none]
[components]
[contrast:surface:semantic]
```

詳細は[`docs/PREVIEW-MANUAL.md`](docs/PREVIEW-MANUAL.md)または画面上部の`preview.help`で確認できます。

## AIと共創する

D.mdは、ブラウザとAIが同じローカルファイルを編集することを前提にしています。現在編集中のファイルは`.dmd/current.json`に記録されます。

AIには次のように依頼できます。

```text
.dmd/current.jsonを確認して、現在編集中のDESIGN.mdの編集を一緒に進めましょう。
ブランドカラーをもう少し落ち着いた印象にしたいです。
```

ほかにも、次のような進め方ができます。

- 雰囲気や対象プロダクトを伝え、DESIGN.mdの原案を作る
- 既存のDESIGN.mdを読み、足りないトークンやルールを相談する
- 配色のコントラストやタイポグラフィの階層を調整する
- コンポーネントを追加し、トークン参照を整理する
- 既存サイトの特徴を分析し、デザインルールとして言語化する

### 既存のDESIGN.mdを理解する

既存のDESIGN.mdは、開くだけで確認を始められます。内容をさらに深く理解したい場合は、AIに次のように依頼できます。

```text
このDESIGN.mdの意図を理解できるPREVIEW.mdを作ってください。
DESIGN.mdは変更せず、実在するトークンだけを使い、目で確認すべきポイントを日本語で短く添えてください。
```

AIは仕様を読み、配色の関係、文字階層、ライト／ダーク面、形状、余白、コンポーネントの使い分けなど、重要な関係を視覚的な問いへ変換します。定義されているのに使い道が不明なトークン、本文と数値の食い違い、フォントの欠落、成立しない配色なども、PREVIEW.mdを通して発見できます。

DESIGN.mdがデザインの知識を記録するファイルなら、PREVIEW.mdはその知識を理解・検証するための視点です。新規作成だけでなく、既存デザインシステムの監査、引き継ぎ、学習にも利用できます。

## 外部のDESIGN.mdを試す

「DESIGN.mdを開く」から「その他のファイルを選択…」を選ぶか、ファイルを画面へドラッグ＆ドロップします。

外部ファイルは元データへ自動保存せず、`defaults/PREVIEW.md`の標準プレビューと組み合わせて開きます。編集を続ける場合は「別名で保存」を使うと、DESIGN.mdとPREVIEW.mdのペアが新しい作業フォルダへ保存されます。

## ローカルファースト

D.mdはローカル環境で動作します。

- DESIGN.mdとPREVIEW.mdは手元のファイルとして管理
- ブラウザとAIの変更をローカルで共有
- アカウント登録やクラウドへのアップロードは不要
- GitでDESIGN.mdの変更履歴を管理可能

## 主なファイル

| ファイル | 役割 |
|---|---|
| `index.html` / `app.js` / `styles.css` | エディタ本体 |
| `design/templates/` | DESIGN.md／PREVIEW.mdのペアテンプレート |
| `defaults/PREVIEW.md` | 外部DESIGN.md用の標準プレビュー |
| `docs/PREVIEW-MANUAL.md` | PREVIEW.md記法の簡易マニュアル |
| `AGENTS.md` | AIエージェント向け作業ガイド |
| `.dmd/current.json` | 現在編集中の作業フォルダ情報 |
| `start.sh` | Node.js／Pythonを自動選択する起動スクリプト |
| `server.mjs` / `server.py` | ローカル保存と外部変更監視に対応するサーバー |

## 動作環境

- Node.jsまたはPython 3
- JavaScriptが有効なモダンブラウザ
- フォルダ接続にはChrome／EdgeなどFile System Access API対応ブラウザを推奨

macOSで`start.command`の実行確認が表示された場合は、ファイルを右クリックして「開く」を選択してください。

---

**D.md — DESIGN.mdを、見ながら育てる。**
