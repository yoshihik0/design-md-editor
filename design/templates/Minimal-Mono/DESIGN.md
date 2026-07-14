---
title: Minimal Mono
version: "4.0.0"
author: Studio Design
description: 色相と影を抑え、タイポグラフィ、余白、明快な輪郭だけで階層を作るポートフォリオ向けデザインシステム。
colors:
  # foundation
  canvas: "#ffffff"
  surface: "#f5f5f5"
  ink: "#171717"
  ink-muted: "#666666"
  hairline: "#d4d4d4"
  # action
  primary: "#000000"
  on-primary: "#ffffff"
  link: "#171717"
  # semantic
  success: "#166534"
  warning: "#854d0e"
  error: "#991b1b"
  info: "#075985"
typography:
  # display
  display-lg:
    font: system-ui
    source: system
    size: 48
    weight: 700
    lineHeight: 1.1
    letterSpacing: "-0.03em"
    color: ink
  # heading
  heading-lg:
    font: system-ui
    source: system
    size: 32
    weight: 700
    lineHeight: 1.2
    color: ink
  heading-md:
    font: system-ui
    source: system
    size: 22
    weight: 600
    lineHeight: 1.3
    color: ink
  heading-sm:
    font: system-ui
    source: system
    size: 17
    weight: 600
    lineHeight: 1.4
    color: ink
  # body
  body-md:
    font: system-ui
    source: system
    size: 16
    weight: 400
    lineHeight: 1.65
    color: ink
  body-sm:
    font: system-ui
    source: system
    size: 14
    weight: 400
    lineHeight: 1.55
    color: ink-muted
  strong:
    font: system-ui
    source: system
    weight: 700
    color: ink
  # utility
  caption:
    font: system-ui
    source: system
    size: 12
    weight: 500
    lineHeight: 1.4
    letterSpacing: "0.04em"
    color: ink-muted
  button-md:
    font: system-ui
    source: system
    size: 14
    weight: 600
    lineHeight: 1
    color: on-primary
  markdown:
    h1: display-lg
    h2: heading-lg
    h3: heading-md
    h4: heading-sm
    body: body-md
    small: body-sm
    caption: caption
    strong: strong
border:
  none: none
  sm: 1px solid
  md: 2px solid
rounded:
  none: 0
  sm: 8
  md: 16
  lg: 24
  full: 9999
elevation:
  shadows:
    none: none
spacing:
  none: 0
  xs: 4
  sm: 8
  md: 16
  lg: 24
  xl: 40
  section: 96
components:
  # button
  button-solid:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.md}"
    border: "{border.none}"
    shadow: "{elevation.shadows.none}"
    padding: 12px 20px
    height: 44px
  button-outline:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.md}"
    border: "{border.md}"
    borderColor: "{colors.primary}"
    shadow: "{elevation.shadows.none}"
    padding: 10px 18px
    height: 44px
  # card
  feature-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    border: "{border.md}"
    borderColor: "{colors.primary}"
    shadow: "{elevation.shadows.none}"
    padding: 24px
  # form
  text-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    border: "{border.sm}"
    borderColor: "{colors.hairline}"
    shadow: "{elevation.shadows.none}"
    padding: 10px 12px
    height: 44px
---

# Minimal Mono

## Overview

色を増やさず、文字の大きさ、余白、黒い輪郭の強弱で情報を整理するシステムです。建築、ファッション、写真、個人ポートフォリオのように、作品そのものを主役にしたいプロダクトを対象にします。装飾を減らすことが目的ではなく、少数の判断を一貫して反復することで緊張感を作ります。

## Colors

`canvas` はページ、`surface` はカードや入力領域、`ink` は主要テキストに使います。主要操作だけを `primary` と `on-primary` の反転で示し、リンクは下線やウェイトも併用して識別します。意味色は成功・警告・エラー・情報の伝達に限り、ブランド装飾には使いません。新しいグレーを場当たり的に追加せず、面の差が不足する場合は先に `hairline` を検討します。

## Typography

`display-lg` はページに一つ、`heading-lg/md/sm` は章・カード・局所見出し、`body-md/sm` は本文と補助情報に使います。`caption` はメタ情報、`button-md` は操作ラベル専用です。色相が少ないため、サイズ差とウェイト差を同時に増やしすぎず、本文は16px・行間1.65を読みやすさの基準として維持します。

## Layout

本文コンテナは読み物なら720px前後、作品一覧なら1200px前後を上限の目安とします。基本グリッドは8pxで、カード内は `md`〜`lg`、セクション間は `xl`〜`section` を使います。情報を詰めて境界線を増やすより、余白でグループを分けることを優先します。

## Elevation & Depth

影は `none` が原則です。奥行きは `canvas` と `surface` の階調、1pxまたは2pxのボーダー、前後の余白で表現します。ボーダーとsurface差を同時に強くしないでください。モーダルなど本当に前面化が必要な要素は、背景オーバーレイを先に検討します。

## Shapes

入力欄は `rounded.sm`、ボタンは `rounded.md`、大きなカードは `rounded.lg` を使います。`rounded.none` は画像、表、画面端に接する領域で明示的に直角を選ぶための値です。同じ階層のカードで複数の角丸を混在させません。

## Components

`button-solid` は画面の主目的に一つだけ置き、`button-outline` は副操作に使います。`feature-card` は2pxの輪郭を持つため、同一画面で大量に並べず重要な作品や機能の強調に限定します。`text-input` は通常時1px、フォーカス時2px相当のアウトラインへ変化させます。hover、focus、disabledは色だけに依存せず、輪郭・下線・不透明度を組み合わせて示します。

## Do's and Don'ts

- Do: 余白と文字階層を先に決め、必要な場所だけ輪郭を足す。
- Do: `none` を明示し、未設定による実装差を避ける。
- Don't: 区別のためだけに新しい色や影を追加する。
- Don't: すべてのカードへ太いボーダーを付け、画面を格子状にする。

## Responsive Behavior

狭い画面では列数を一列へ落とし、外側余白とセクション間隔を縮めます。本文サイズ、操作高さ44px、主要／副次の優先順位は維持します。大きなdisplayだけを段階的に縮小し、本文まで小さくしません。

## Iteration Guide

追加前に既存の色、文字、余白、形状で表現できない理由を確認します。新しいトークンは `none` を含む既存スケールの命名に合わせ、コンポーネントでは直値より参照を使います。追加後は通常・hover・focus・disabledと狭い画面を確認し、この本文へ用途と禁止事項を追記します。

## Known Gaps

ナビゲーション、モーダル、データ表、画像比率、モーション時間は未定義です。必要になるまで推測でトークンを増やさず、対象画面の要件とアクセシビリティ基準を確認してから追加してください。
