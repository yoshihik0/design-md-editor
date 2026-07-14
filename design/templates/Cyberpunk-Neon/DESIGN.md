---
title: Cyberpunk Neon
version: 4.0.0
author: Neo Tokyo Dev
description: 漆黒の画面、ネオンの構造線、鋭いタイポグラフィでキャンペーンやゲーム体験を演出するダークデザインシステム。
colors:
  # brand
  primary: '#ec4899'
  primary-hover: '#f472b6'
  on-primary: '#09090b'
  secondary: '#22d3ee'
  accent: '#facc15'
  # surface
  canvas: '#09090b'
  surface: '#18181b'
  surface-raised: '#27272a'
  hairline: '#3f3f46'
  # text
  ink: '#fafafa'
  ink-muted: '#a1a1aa'
  # semantic
  success: '#4ade80'
  warning: '#facc15'
  danger: '#fb7185'
  info: '#22d3ee'
  # effects
  neon-pink-soft: 'rgba(236,72,153,0.14)'
  neon-cyan-soft: 'rgba(34,211,238,0.12)'
typography:
  # display
  display-lg:
    font: Orbitron
    source: google
    size: 48
    weight: 900
    lineHeight: 1.08
    letterSpacing: '0.02em'
    color: primary
  display-md:
    font: Orbitron
    source: google
    size: 36
    weight: 700
    lineHeight: 1.16
    letterSpacing: '0.015em'
    color: ink
  # heading
  heading-lg:
    font: Orbitron
    source: google
    size: 28
    weight: 700
    lineHeight: 1.25
    color: ink
  heading-md:
    font: Orbitron
    source: google
    size: 21
    weight: 600
    lineHeight: 1.35
    color: ink
  # body
  body-md:
    font: Share Tech Mono
    source: google
    size: 16
    weight: 400
    lineHeight: 1.7
    color: ink
  body-sm:
    font: Share Tech Mono
    source: google
    size: 13
    weight: 400
    lineHeight: 1.6
    color: ink-muted
  body-strong:
    font: Share Tech Mono
    source: google
    size: 16
    weight: 400
    lineHeight: 1.7
    color: accent
  # utility
  eyebrow:
    font: Orbitron
    source: google
    size: 11
    weight: 700
    lineHeight: 1.3
    letterSpacing: '0.14em'
    color: secondary
    textTransform: uppercase
    fontFeature: '"liga" 0, "kern" 1'
  caption:
    font: Share Tech Mono
    source: google
    size: 11
    weight: 400
    lineHeight: 1.5
    color: secondary
  button-md:
    font: Orbitron
    source: google
    size: 13
    weight: 700
    lineHeight: 1.2
    letterSpacing: '0.06em'
    color: on-primary
    textTransform: uppercase
  markdown:
    h1: display-lg
    h2: display-md
    h3: heading-lg
    h4: heading-md
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
  sm: 2
  full: 9999
elevation:
  shadows:
    none: none
    sm: 0 0 8px rgba(236,72,153,0.35)
    md: 0 0 20px rgba(236,72,153,0.45)
    lg: 0 0 36px rgba(34,211,238,0.38)
spacing:
  none: 0
  xs: 4
  sm: 8
  md: 12
  lg: 16
  xl: 24
  xxl: 36
  section: 72
components:
  # actions
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    typography: '{typography.button-md}'
    border: '{border.sm}'
    borderColor: '{colors.primary-hover}'
    shadow: '{elevation.shadows.sm}'
    rounded: '{rounded.none}'
    padding: 12px 20px
    height: 44px
  button-secondary:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.secondary}'
    typography: '{typography.button-md}'
    border: '{border.sm}'
    borderColor: '{colors.secondary}'
    shadow: '{elevation.shadows.none}'
    rounded: '{rounded.none}'
    padding: 12px 20px
    height: 44px
  # campaign
  hero-panel:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.ink}'
    typography: '{typography.display-lg}'
    border: '{border.md}'
    borderColor: '{colors.primary}'
    shadow: '{elevation.shadows.md}'
    rounded: '{rounded.none}'
    padding: 36px
  mission-card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.body-md}'
    border: '{border.sm}'
    borderColor: '{colors.hairline}'
    shadow: '{elevation.shadows.none}'
    rounded: '{rounded.none}'
    padding: 16px
  # game-ui
  status-chip:
    backgroundColor: '{colors.neon-cyan-soft}'
    textColor: '{colors.secondary}'
    typography: '{typography.eyebrow}'
    border: '{border.sm}'
    borderColor: '{colors.secondary}'
    shadow: '{elevation.shadows.none}'
    rounded: '{rounded.full}'
    padding: 4px 10px
  warning-banner:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.warning}'
    typography: '{typography.body-strong}'
    border: '{border.sm}'
    borderColor: '{colors.warning}'
    shadow: '{elevation.shadows.none}'
    rounded: '{rounded.none}'
    padding: 12px 16px
  terminal-input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.body-md}'
    border: '{border.sm}'
    borderColor: '{colors.secondary}'
    shadow: '{elevation.shadows.none}'
    rounded: '{rounded.none}'
    padding: 10px 12px
    height: 44px
---

# Cyberpunk Neon

## Overview

Cyberpunk Neonは、ゲームのローンチページ、音楽イベント、期間限定キャンペーン、ゲーム内ミッションUIのための高密度なダークデザインシステムである。漆黒の背景を都市の夜、ピンクとシアンの線を発光するインフラとして扱い、Orbitronの幾何学的な見出しとShare Tech Monoの本文で世界観を作る。

これは一般的な業務アプリの標準テーマではない。長時間の事務作業より、短いメッセージ、強いビジュアル、明確な操作を印象づける場面に向く。

- ピンクは主要CTA、シアンは情報と構造線、黄色は警告に限定する
- 本文は白に近い`ink`で読みやすさを守り、ネオン色を長文へ使わない
- 四角い輪郭を基本とし、ピル形状はステータスだけに使う
- グローは意味のある焦点へ限定し、すべての要素を発光させない

## Colors

`canvas`をページの基底、`surface`を通常パネル、`surface-raised`を選択中や前面のパネルに使う。暗い面同士の境界は`hairline`と1pxボーダーで作り、面の差が足りないという理由だけでグローを加えない。

`primary`は購入、参加、開始など最重要のアクション、`secondary`はリンク、フォーカス、情報表示、`accent`と`warning`は警告や希少報酬に使う。`success`、`danger`、`info`は状態の意味を変えない。`neon-*-soft`は淡いパネル背景であり、本文色として使わない。

## Typography

Orbitronはヒーロー、章見出し、ボタン、短いラベルに限定する。Share Tech Monoは説明、ステータス、入力、ログ表示を担う。`display-lg`はキャンペーンの一番強いコピー、`display-md`はセクション見出し、`body-md`は通常本文に使う。

`eyebrow`はミッション種別やシステム状態を示す短い英数字ラベルである。uppercaseと広い字間を持ち、合字を切ることでコード状の輪郭を保つ。日本語の長文、固有名詞、ユーザー入力へuppercaseを適用しない。`button-md`も短いCTA専用とする。

## Layout

12px前後の密度を中心に、パネル内部は`lg` 16px、主要カードは`xl` 24px、キャンペーンセクション間は`section` 72pxを目安にする。デスクトップでは非対称グリッドや重なりを許容するが、本文と操作の読み順はDOM順でも成立させる。

世界観を出す余白と、ゲーム情報を読む密度を分ける。ヒーロー周辺には広い暗部を残し、ステータス一覧やミッションカードは規則的なグリッドへ収める。

## Elevation & Depth

通常面は`shadows.none`で、`border.sm`とsurface差によって階層化する。`shadows.sm`は主要ボタンの現在位置、`shadows.md`はキャンペーンヒーロー、`shadows.lg`は一時的なイベント演出に限定する。グローはクリック可能性や優先度を補助するもので、本文の可読性を犠牲にする装飾ではない。

## Shapes

基本形状は`rounded.none`で、フォーム、ボタン、カードも直角に揃える。`rounded.sm`は2pxのエッジ補正が必要な小型面だけに使用し、`rounded.full`はオンライン状態、レアリティ、短いカテゴリチップだけに使う。大きなカードをピル形状にしない。

## Components

`button-primary`は「PLAY」「ENTER」「BUY」のような主要CTA、`button-secondary`は詳細表示や戻る操作に使う。主要CTAのグローは1画面に1〜2個までを目安とする。

`hero-panel`はゲームやイベントのキービジュアルと短いコピー、`mission-card`は目標、報酬、期限を表示する。`status-chip`はオンライン状態やカテゴリ、`warning-banner`は時間切れや危険状態、`terminal-input`はコード、検索、コマンド風の入力に使う。各コンポーネントは色だけで状態を伝えず、ラベルやアイコンを併用する。

## Do's and Don'ts

**Do**

- ネオン色を暗い背景上の焦点として使う
- 主要操作、警告、情報で色の役割を固定する
- 1pxの構造線とsurface差を基本の階層にする
- 動きや点滅には停止手段とreduced-motion対応を用意する

**Don't**

- すべての文字、枠、カードへグローを付けない
- ピンク、シアン、黄色を同じ強さで競合させない
- 等幅書体で長い日本語本文を詰め込まない
- 実務ダッシュボードへ世界観だけを理由に適用しない

## Responsive Behavior

狭い画面では重なり表現を解除し、ヒーロー、説明、CTAの順に1カラムへ並べる。`display-lg`は34〜38px相当まで縮小してよい。ミッションカードは1カラム、ステータスチップは折り返し、主要ボタンは44px以上の高さを保つ。背景動画や大きなグローは低性能端末で静止画または単純な影へ置き換える。

## Iteration Guide

新しい色を追加する前に、primary・secondary・semanticのどの役割にも当てはまらない理由を記録する。グローを増やす場合は対応する通常状態とフォーカス状態を同時に定義する。コンポーネントは既存のborder、shadow、roundedを参照し、独自の中間値を増やさない。キャンペーン固有の演出は基礎トークンではなく、本文の運用ルールまたは専用コンポーネントとして追加する。

## Known Gaps

背景映像、ノイズテクスチャ、スキャンライン、音、トランジション時間、フォーカスリングのアニメーション、ゲームパッド操作は未定義である。実装時には光過敏への配慮、点滅頻度、モーション軽減、暗色面でのコントラスト、Google Fonts読み込み失敗時のフォールバックを検証すること。
