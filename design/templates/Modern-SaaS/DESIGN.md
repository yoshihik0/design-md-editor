---
title: Modern SaaS System
version: 4.0.0
author: SaaS Design Team
description: ダッシュボード、課金、状態通知を明快に扱う、クリーンで信頼感のあるSaaS向けデザインシステム。
colors:
  # brand
  primary: '#2563eb'
  on-primary: '#ffffff'
  secondary: '#475569'
  accent: '#be185d'
  # surface
  canvas: '#ffffff'
  surface: '#f8fafc'
  surface-raised: '#ffffff'
  # text
  ink: '#0f172a'
  ink-muted: '#64748b'
  hairline: '#d8e1ec'
  # product
  product: '#2563eb'
  product-10: 'rgba(37,99,235,0.10)'
  product-strong: '#1d4ed8'
  # billing
  billing: '#15803d'
  billing-10: 'rgba(21,128,61,0.10)'
  billing-strong: '#166534'
  # alerts
  alerts: '#dc2626'
  alerts-10: 'rgba(220,38,38,0.10)'
  alerts-strong: '#b91c1c'
typography:
  # display
  display-lg: { font: Inter, source: google, size: 40, weight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', color: ink }
  # heading
  heading-lg: { font: Inter, source: google, size: 32, weight: 700, lineHeight: 1.3, color: ink }
  heading-md: { font: Inter, source: google, size: 24, weight: 600, lineHeight: 1.35, color: ink }
  heading-sm: { font: Inter, source: google, size: 18, weight: 600, lineHeight: 1.4, color: ink }
  # body
  body-md: { font: Inter, source: google, size: 16, weight: 400, lineHeight: 1.6, color: ink }
  body-sm: { font: Inter, source: google, size: 14, weight: 400, lineHeight: 1.5, color: ink-muted }
  body-strong: { font: Inter, source: google, size: 16, weight: 700, lineHeight: 1.6, color: ink }
  # data
  metric-lg: { font: Inter, source: google, size: 32, weight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', color: ink, fontFeature: '"tnum" 1' }
  caption: { font: Inter, source: google, size: 12, weight: 500, lineHeight: 1.4, color: ink-muted }
  # button
  button-md: { font: Inter, source: google, size: 14, weight: 600, lineHeight: 1.4 }
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
  lg: 12
  xl: 16
  full: 9999
elevation:
  shadows:
    none: none
    sm: 0 1px 2px rgba(15,23,42,0.06)
    md: 0 4px 12px rgba(15,23,42,0.10)
    lg: 0 16px 36px rgba(15,23,42,0.14)
spacing:
  none: 0
  xs: 4
  sm: 8
  md: 16
  lg: 24
  xl: 32
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
    padding: 10px 16px
    height: 40px
  button-billing:
    backgroundColor: '{colors.billing}'
    textColor: '{colors.on-primary}'
    typography: '{typography.button-md}'
    border: '{border.none}'
    shadow: '{elevation.shadows.none}'
    rounded: '{rounded.md}'
    padding: 10px 16px
    height: 40px
  # dashboard
  metric-card:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.ink}'
    typography: '{typography.metric-lg}'
    border: '{border.sm}'
    borderColor: '{colors.hairline}'
    shadow: '{elevation.shadows.sm}'
    rounded: '{rounded.lg}'
    padding: 24px
  status-badge:
    backgroundColor: '{colors.product-10}'
    textColor: '{colors.product-strong}'
    typography: '{typography.caption}'
    border: '{border.none}'
    shadow: '{elevation.shadows.none}'
    rounded: '{rounded.full}'
    padding: 4px 8px
  # billing
  plan-card:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.ink}'
    typography: '{typography.body-md}'
    border: '{border.md}'
    borderColor: '{colors.billing}'
    shadow: '{elevation.shadows.md}'
    rounded: '{rounded.xl}'
    padding: 32px
  # feedback
  alert-error:
    backgroundColor: '{colors.alerts-10}'
    textColor: '{colors.alerts-strong}'
    typography: '{typography.body-md}'
    border: '{border.sm}'
    borderColor: '{colors.alerts}'
    shadow: '{elevation.shadows.none}'
    rounded: '{rounded.md}'
    padding: 16px
---

# Modern SaaS System

## Overview

管理画面、プロダクト利用状況、プラン選択、請求状態を一貫して表現するSaaS向けテンプレート。装飾よりも情報の走査性、状態の意味、操作の優先順位を重視する。

## Colors

`product`は通常機能と選択状態、`billing`は支払い・契約に関する肯定的な操作、`alerts`は失敗や要対応状態に限定する。それぞれの10%ティントは背景、strongはティント上の文字、元色はアイコンと枠線に使う。`accent`はアップグレード訴求など限定的な場面だけに使う。

## Typography

Interで統一し、ウェイトとサイズで階層を作る。ダッシュボードの数値には`metric-lg`を使い、等幅数字機能で桁を比較しやすくする。本文やボタンへ大きなdisplayスタイルを流用しない。

## Layout

8pxを中心とした余白段階を使う。カード内部は`lg`、カード間は`md`または`lg`、ページセクション間は`section`を基準にする。表やフォームの密度を上げる場合もラベルと値の対応を崩さない。

## Elevation & Depth

通常カードは枠線と`sm`、選択中のプランやポップオーバーは`md`、モーダルのみ`lg`。ボタンとバッジは原則`none`とし、クリック可能性を影へ依存させない。

## Shapes

操作部品は`rounded.md`、ダッシュボードカードは`lg`、重要なプランカードは`xl`、ステータスは`full`。`border.md`は選択中のプランなど、明確な強調が必要な場合だけ使う。

## Components

Primary buttonは一般操作、Billing buttonは購入やプラン確定に使う。Metric cardは主要数値、Status badgeは短い状態、Plan cardは比較と選択、Error alertは復旧が必要な問題を表す。別状態は既存定義へ値を埋め込まず、`plan-card-selected`など独立した名前で追加する。

## Do's and Don'ts

- Do: 色グループを機能領域の意味に合わせる
- Do: 数値、単位、比較期間を近接して表示する
- Don't: billingの緑を一般的なsuccess表示へ流用しない
- Don't: すべてのカードへ影を付けて階層差を失わせない

## Responsive Behavior

指標カードは広い画面で複数列、狭い画面で1列にする。料金プランは横並びから縦並びへ切り替え、主要CTAを各カード内に残す。大きな表は列を無理に圧縮せず、優先列の表示または横スクロールを選ぶ。

## Iteration Guide

新しい機能領域が既存のproduct/billing/alertsに属さない場合だけ、新しい色グループを追加する。コンポーネント追加時は既存トークンを参照し、直値はpadding、height、widthなど用途固有の寸法に限定する。

## Known Gaps

チャート系列色、テーブルの選択・ソート状態、フォームのfocus/error/disabled、サイドナビゲーションの状態定義は未収録。実際のプロダクト要件が固まってから追加する。
