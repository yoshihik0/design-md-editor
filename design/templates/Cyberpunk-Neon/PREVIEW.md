# デザイン適用サンプル

このキャンバスは、DESIGN.mdのトークンとコンポーネントが実際の文章やUIでどう見えるかを確認するためのものです。

## Overview

[definition:overview]

## Colors

[definition:colors]

[colors:group]

<!-- [colors] または [colors:default] に変更すると、グループ分けせずに全色を表示できます。 -->

## Typography

[definition:typography]

[typography:group:"DESIGN System 2026 — 一貫性でつくる素敵なユーザー体験"]

<!-- [typography] または [typography:default] に変更すると、グループ分けせずに表示できます。 -->

### Markdown

[markdown:"DESIGN System 2026 — 一貫性でつくる素敵なユーザー体験"]

## Border

[definition:shapes]

[border:surface:on-primary]

## Rounded

[rounded:surface:on-primary]

## Shadow

[definition:elevation]

[shadow:surface:on-primary]

## Spacing

[spacing]

## Components

[definition:components]

### buttons

[buttons:semantic:on-primary:md:md:md]

### cards & containers

[cards:surface:semantic:ink:sm:md:none]

### inputs & forms

[form:surface:ink:sm:md:none]

[form-input:surface:ink-muted:ink:sm:sm:none]

[form-button:primary:on-primary:md:md:md]

### messages & feedback

[feedback:semantic-tint:semantic:body:sm:md:none]

### original component

[components]

コンポーネント名またはグループ名が整理されている場合は、`[components:button]` のように種類を絞り込めます。

## Layout

[definition:layout]

コンポーネント一覧の列数、gap、内部paddingから情報密度を確認します。狭い画面では自動的に一列へ変化します。

## Do's and Don'ts

[definition:dos-and-donts]

## Responsive Behavior

[definition:responsive]

## Iteration Guide

[definition:iteration]

## Known Gaps

[definition:known-gaps]

---

## 記事本文での確認用サンプル

プロダクトの改善は、目立つ機能を追加することだけではありません。利用する人が迷わず内容を理解し、次に取るべき行動を自然に選べることも重要です。この文章では、本文の文字サイズ、行間、一行の長さを実際の読み物に近い流れで確認します。

## 情報を理解しやすい順序に整える(h2)

最初に伝えるべきことを見出しで示し、その理由や背景を本文で補足します。見出しだけが強くなりすぎず、本文との間に十分な階層差があることを確認してください。複数行になったときも、行間と段落間の余白が読み進めるリズムを妨げないことが大切です。

### 操作の前に必要な情報を示す(h3)

ユーザーへ判断を求める場合は、選択によって何が変わるのかを先に説明します。本文中の**強調テキスト**は重要な語句に限定し、段落全体を太字にしません。リンクや補足情報が加わっても、本文の流れが分断されないことを確認します。

#### 補足情報は主内容と区別する(h4)

注意事項や条件は、主要な説明より一段低い見出しと本文で示します。ただし文字を小さくしすぎず、色だけに頼らずに階層を作ります。この段落まで続けて読むことで、h2、h3、h4と本文のサイズ差、前後の余白、長文時の読みやすさをまとめて確認できます。

<p class="ts-caption">更新日や出典など、本文を補助する情報はcaptionで表示します。</p>

## 配色コントラスト

[contrast:surface:semantic]
