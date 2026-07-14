---
title: Standard Web System
version: 4.0.0
author: Web Standards Team
description: 業務システムやコーポレートサイトで迷わず使える、アクセシブルで実務的な標準Webデザインシステム。
colors:
  # brand
  primary: '#2f5fd6'
  on-primary: '#ffffff'
  secondary: '#5c6b7a'
  emphasis: '#a6390f'
  # surface
  canvas: '#ffffff'
  surface: '#f4f6f8'
  # text
  ink: '#1c2530'
  ink-muted: '#5b6b7c'
  link: '#2554b8'
  link-hover: '#173a80'
  hairline: '#d7dde3'
  # semantic
  success: '#1f7a4d'
  success-10: 'rgba(31,122,77,0.10)'
  error: '#c1352f'
  error-10: 'rgba(193,53,47,0.10)'
  warning: '#9c5700'
  warning-10: 'rgba(156,87,0,0.10)'
  info: '#0f6e8c'
  info-10: 'rgba(15,110,140,0.10)'
  # mode-dark
  canvas-dark: '#0f1620'
  surface-dark: '#1a2431'
  ink-dark: '#eef2f6'
  ink-muted-dark: '#a9b6c4'
  hairline-dark: '#324153'
  link-dark: '#8fb4ff'
  link-hover-dark: '#c3d7ff'
typography:
  # display
  display-lg: { font: Inter, source: google, size: 40, weight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', color: ink }
  # heading
  heading-lg: { font: Inter, source: google, size: 32, weight: 700, lineHeight: 1.3, color: ink }
  heading-md: { font: Inter, source: google, size: 25, weight: 600, lineHeight: 1.4, color: ink }
  heading-sm: { font: Inter, source: google, size: 20, weight: 600, lineHeight: 1.4, color: ink }
  # body
  body-md: { font: Noto Sans JP, source: google, size: 16, weight: 400, lineHeight: 1.7, color: ink }
  body-sm: { font: Noto Sans JP, source: google, size: 14, weight: 400, lineHeight: 1.6, color: ink-muted }
  body-strong: { font: Noto Sans JP, source: google, size: 16, weight: 700, lineHeight: 1.7, color: ink }
  # caption
  caption: { font: Noto Sans JP, source: google, size: 12, weight: 400, lineHeight: 1.5, color: ink-muted }
  # button
  button-md: { font: Noto Sans JP, source: google, size: 14, weight: 700, lineHeight: 1.4 }
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
    sm: 0 1px 2px rgba(15,23,42,0.06)
    md: 0 4px 12px rgba(15,23,42,0.10)
    lg: 0 12px 32px rgba(15,23,42,0.16)
spacing:
  none: 0
  xs: 4
  sm: 8
  md: 16
  lg: 24
  xl: 40
  section: 96
components:
  # buttons
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    typography: '{typography.button-md}'
    border: '{border.none}'
    shadow: '{elevation.shadows.none}'
    rounded: '{rounded.md}'
    padding: 10px 18px
    height: 40px
  button-secondary:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.primary}'
    typography: '{typography.button-md}'
    border: '{border.sm}'
    borderColor: '{colors.primary}'
    shadow: '{elevation.shadows.none}'
    rounded: '{rounded.md}'
    padding: 10px 18px
    height: 40px
  # content
  card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.body-md}'
    border: '{border.sm}'
    borderColor: '{colors.hairline}'
    shadow: '{elevation.shadows.sm}'
    rounded: '{rounded.lg}'
    padding: 24px
  # forms
  input:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.ink}'
    typography: '{typography.body-md}'
    border: '{border.sm}'
    borderColor: '{colors.hairline}'
    shadow: '{elevation.shadows.none}'
    rounded: '{rounded.sm}'
    padding: 10px 12px
    height: 40px
  # feedback
  alert-info:
    backgroundColor: '{colors.info-10}'
    textColor: '{colors.ink}'
    typography: '{typography.body-md}'
    border: '{border.sm}'
    borderColor: '{colors.info}'
    shadow: '{elevation.shadows.none}'
    rounded: '{rounded.md}'
    padding: 16px
---

# Standard Web System

## Overview

幅広いWeb制作で最初の判断に迷わないための基準テンプレート。YAMLは機械可読な選択肢、本文は値を選ぶ理由と禁止事項を伝える知識層として扱う。トークンにない中間値を都度作らず、まず既存の段階から選ぶ。

## Colors

`primary`は主要操作、`secondary`は補助操作、`emphasis`は本文中の限定的な強調に使う。本文は`ink`、補助情報は`ink-muted`とする。意味色は状態以外に流用せず、アラート背景には10%のRGBAティント、アイコンや枠線には元の意味色を使う。

`# mode-dark`以下は既定色との差分だけを`<色名>-dark`で定義する。新しいモードも全色を複製せず、上書きが必要な色だけ追加する。

## Typography

英数字の見出しはInter、和文を含む本文とUIはNoto Sans JP。見出しは600〜700、本文は400を基本にする。`typography.markdown`は記事要素の割当であり、スタイル定義とは分離して維持する。

## Layout

余白は4/8/16/24/40pxを基本とし、セクション間だけ96pxを許容する。`spacing.none`は余白を明示的に使わない選択肢。密度を上げる場合も文字と操作対象の可読性を優先する。

## Elevation & Depth

通常の面は`shadows.none`、カードは`sm`、ドロップダウンや浮遊パネルは`md`、モーダルのみ`lg`。階層を影だけで伝えず、surface、枠線、余白も組み合わせる。

## Shapes

`border.none`は枠線なし、`border.sm`は通常境界、`border.md`はフォーカスや強い強調用。入力は`rounded.sm`、ボタンは`md`、カードは`lg`、バッジは`full`を基準とする。

## Components

`components`はトークンの代表的な組合せで、実装時の開始点になる。Primary button、Secondary button、Card、Input、Info alertが、背景・文字・書体・枠線・影・角丸の参照方法を示す。状態差分が必要なら`button-primary-disabled`のように別エントリを追加する。

## Do's and Don'ts

- Do: 意味色は意味に沿って使い、本文とのコントラストを確認する
- Do: `none`も正式な設計判断として選択する
- Don't: 未定義の色、角丸、影をコンポーネント内に直接増やさない
- Don't: 色だけで状態を伝えない

## Responsive Behavior

狭い画面では複数カラムを1カラムにし、セクション余白を`section`から`xl`または`lg`へ縮小する。本文サイズと44px前後の操作領域は安易に縮めない。

## Iteration Guide

トークン変更時は参照しているコンポーネントと本文の使用ルールを同時に確認する。新しい値を追加する前に、既存の段階では表現できない理由を本文へ残す。

## Known Gaps

フォーカス、hover、disabledなどの状態別コンポーネントと、複雑なデータテーブル、ナビゲーションの詳細は未定義。必要になった時点で代表例を追加する。
