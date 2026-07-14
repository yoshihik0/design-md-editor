---
title: Warm Editorial
version: 4.0.0
author: Editorial Studio
description: 紙の質感を思わせる暖色とセリフ体で、読みやすさと品格を両立する長文メディア向けデザインシステム。
colors:
  # brand
  primary: '#9a3412'
  primary-hover: '#7c2d12'
  on-primary: '#ffffff'
  accent: '#b45309'
  # surface
  canvas: '#fdf8f3'
  surface: '#fffdf9'
  surface-muted: '#f4ebe3'
  hairline: '#d8c8bb'
  # text
  ink: '#292524'
  ink-muted: '#62554d'
  ink-subtle: '#786960'
  # editorial
  news: '#0e7490'
  news-soft: 'rgba(14,116,144,0.10)'
  culture: '#9a3412'
  culture-soft: 'rgba(154,52,18,0.10)'
  opinion: '#6d28d9'
  opinion-soft: 'rgba(109,40,217,0.09)'
typography:
  # display
  display-lg:
    font: Lora
    source: google
    size: 44
    weight: 700
    lineHeight: 1.18
    letterSpacing: '-0.02em'
    color: ink
  # heading
  heading-lg:
    font: Lora
    source: google
    size: 32
    weight: 700
    lineHeight: 1.28
    letterSpacing: '-0.01em'
    color: ink
  heading-md:
    font: Lora
    source: google
    size: 24
    weight: 600
    lineHeight: 1.4
    color: ink
  heading-sm:
    font: Lora
    source: google
    size: 19
    weight: 600
    lineHeight: 1.45
    color: ink
  # body
  body-md:
    font: Noto Serif JP
    source: google
    size: 17
    weight: 400
    lineHeight: 1.9
    color: ink
  body-sm:
    font: Noto Serif JP
    source: google
    size: 14
    weight: 400
    lineHeight: 1.7
    color: ink-muted
  body-strong:
    font: Noto Serif JP
    source: google
    size: 17
    weight: 700
    lineHeight: 1.9
    color: ink
  pull-quote:
    font: Lora
    source: google
    size: 22
    weight: 600
    lineHeight: 1.55
    color: primary
    fontStyle: italic
  # utility
  caption:
    font: Noto Serif JP
    source: google
    size: 12
    weight: 400
    lineHeight: 1.6
    color: ink-muted
  button-md:
    font: Noto Serif JP
    source: google
    size: 14
    weight: 700
    lineHeight: 1.2
    letterSpacing: '0.02em'
    color: on-primary
  markdown:
    h1: display-lg
    h2: heading-lg
    h3: heading-md
    h4: heading-sm
    body: body-md
    small: body-sm
    caption: caption
    strong: body-strong
border:
  none: none
  sm: 1px solid
rounded:
  none: 0
  sm: 2
  md: 4
  lg: 8
  full: 9999
elevation:
  shadows:
    none: none
    sm: 0 1px 2px rgba(41,37,36,0.05)
    md: 0 8px 24px rgba(41,37,36,0.09)
spacing:
  none: 0
  xs: 4
  sm: 8
  md: 16
  lg: 24
  xl: 32
  xxl: 48
  section: 80
components:
  # buttons
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    typography: '{typography.button-md}'
    border: '{border.none}'
    shadow: '{elevation.shadows.none}'
    rounded: '{rounded.md}'
    padding: 12px 20px
    height: 44px
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.primary}'
    typography: '{typography.button-md}'
    border: '{border.sm}'
    borderColor: '{colors.primary}'
    shadow: '{elevation.shadows.none}'
    rounded: '{rounded.md}'
    padding: 12px 20px
    height: 44px
  # editorial
  article-card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.body-md}'
    border: '{border.sm}'
    borderColor: '{colors.hairline}'
    shadow: '{elevation.shadows.none}'
    rounded: '{rounded.lg}'
    padding: 24px
  featured-story:
    backgroundColor: '{colors.surface-muted}'
    textColor: '{colors.ink}'
    typography: '{typography.heading-md}'
    border: '{border.none}'
    shadow: '{elevation.shadows.none}'
    rounded: '{rounded.none}'
    padding: 32px
  pull-quote-block:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.primary}'
    typography: '{typography.pull-quote}'
    border: '{border.sm}'
    borderColor: '{colors.primary}'
    shadow: '{elevation.shadows.none}'
    rounded: '{rounded.none}'
    padding: 16px 24px
  # forms
  text-input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.body-sm}'
    border: '{border.sm}'
    borderColor: '{colors.hairline}'
    shadow: '{elevation.shadows.none}'
    rounded: '{rounded.md}'
    padding: 10px 12px
    height: 44px
  # labels
  category-label:
    backgroundColor: '{colors.culture-soft}'
    textColor: '{colors.culture}'
    typography: '{typography.caption}'
    border: '{border.none}'
    shadow: '{elevation.shadows.none}'
    rounded: '{rounded.full}'
    padding: 4px 10px
---

# Warm Editorial

## Overview

Warm Editorialは、特集記事、インタビュー、文化批評、ブランドストーリーのような長文を静かに読ませるためのデザインシステムである。アイボリーの紙面、墨色に近い本文、テラコッタのアクセントを組み合わせ、ウェブ上でも印刷物の温度と編集者の意図が感じられることを目指す。

主役は装飾ではなく文章である。見出しはLora、本文はNoto Serif JPを使い、和文と欧文が混ざる記事でも品格を保つ。カードや影を多用せず、余白、罫線、文字サイズの差で情報階層を作る。

- 長文本文は17px、行高1.9を基準にする
- ブランド色はCTAと編集上の焦点に限定する
- カテゴリ色は記事の所属を示すために使い、本文の意味色には転用しない
- 紙面の階層は余白と細い罫線を優先し、影は補助に留める

## Colors

`canvas`は紙そのもの、`surface`はカードやフォームのわずかに明るい面、`surface-muted`は特集枠や引用周辺の帯として扱う。`ink`は本文と見出し、`ink-muted`は署名や公開日、`ink-subtle`は補助情報に使う。淡い文字色を長文本文へ使わない。

`primary`は主要CTA、リンクの強調、引用罫線に使う。広い背景へ全面的に敷く場合は、白文字とのコントラストを再確認する。`news`、`culture`、`opinion`は編集カテゴリであり、各`*-soft`はカテゴリ帯やラベル背景に使う。1つの記事面で複数カテゴリ色を競合させない。

## Typography

見出しはLora、本文はNoto Serif JPで統一する。`display-lg`は記事タイトル、`heading-lg`は大見出し、`heading-md`と`heading-sm`は本文内の段階に対応する。本文は`body-md`、関連記事やメタ情報は`body-sm`、画像説明は`caption`を使う。

`pull-quote`のitalicはインタビューや論考から一節を引く場合だけに使う。通常本文を斜体にしない。記事タイトルを短く見せるために文字サイズを過度に上げず、1行35〜45字程度の本文幅と十分な行間を優先する。

## Layout

基本の余白は8pxの倍数を中心にし、本文内部では`md` 16px、カード内部では`lg` 24px、大きな記事セクション間では`section` 80pxを目安にする。本文カラムは読みやすさを優先して約680〜760pxに抑え、画像や特集帯だけを広いグリッドへ展開する。

デスクトップでは本文と補助情報の2カラムを許容するが、視線の中心は常に本文カラムに置く。空白は未使用領域ではなく、段落、写真、引用の呼吸を区切る編集要素として扱う。

## Elevation & Depth

通常は`shadows.none`を選ぶ。記事カードは`border.sm`と`hairline`で分離し、背景差だけで十分な場合はボーダーも省略する。`shadows.sm`は固定ヘッダーや小さなポップオーバー、`shadows.md`はモーダルなど明確に前面へ出る面だけに限定する。

## Shapes

角丸は控えめにする。本文内の引用や特集帯は`rounded.none`、ボタンと入力欄は`rounded.md`、記事カードは`rounded.lg`、カテゴリラベルだけは`rounded.full`を使う。写真は被写体を尊重し、装飾目的で一律に大きく丸めない。

## Components

`button-primary`は購読、購入、続きを読むなどページ内の主要行動に1つだけ使う。`button-secondary`は保存や戻るなど補助行動に使う。両者の高さを44pxに揃え、本文用書体とは異なる密度の`button-md`を適用する。

`article-card`は関連記事一覧、`featured-story`は編集部が選ぶ特集導線、`pull-quote-block`は本文から抜き出した引用に使う。カード全体をクリック可能にする場合も、見出しのリンク状態とフォーカス表示を明確にする。`text-input`はニュースレター登録や検索に使い、ラベルをプレースホルダーだけに依存させない。

## Do's and Don'ts

**Do**

- 文章量に応じて本文幅と行間を先に決める
- 色ではなく見出し、余白、罫線でも階層を伝える
- カテゴリ色をラベルや章扉へ限定し、一貫して使う
- 引用、写真、キャプションの出典を明示する

**Don't**

- 1画面に複数の強いアクセント色を並べない
- 長文カードすべてへ影を付けない
- 本文を小さくして情報量を詰め込まない
- `pull-quote`を単なる装飾見出しとして使わない

## Responsive Behavior

狭い画面では補助カラムを本文の後へ移し、本文幅を左右20px以上の余白で確保する。`display-lg`は必要に応じて32〜36px相当まで縮小してよいが、本文は原則16px未満にしない。カード一覧は1カラムへ落とし、カテゴリラベルと公開日は折り返しても本文タイトルを圧迫しない配置にする。

## Iteration Guide

新しいカテゴリを加える場合は、`colors`に基調色と10%前後の淡い背景色を対で追加し、本文に用途と禁止用途を記録する。新しいタイポグラフィを加える前に既存の階層で表現できない理由を確認する。コンポーネントは背景、文字、書体、ボーダー、影、角丸を既存トークンから参照し、似た値の直接指定を増やさない。

## Known Gaps

ダークモード、縦書き、ルビ、脚注、長いデータ表、アクセシビリティ用の文字サイズ切り替えは未定義である。実案件では日本語フォントの読み込み量、Loraとの字面差、カテゴリ色と背景のコントラストを実機で検証すること。
