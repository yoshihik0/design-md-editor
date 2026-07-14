# PREVIEW.md 簡易マニュアル

PREVIEW.mdは、DESIGN.mdで定義したトークンを文章やUIとして確認するためのプレビューファイルです。通常のMarkdownと、角括弧で囲んだプレビュー記法を組み合わせて使います。

## 基本

- DESIGN.mdと同じ作業フォルダに置きます。
- 通常の見出し、本文、強調などには`typography.markdown`の割り当てが適用されます。
- PREVIEW.mdだけを変更してもDESIGN.mdのトークンは変わりません。

## 主な記法

```text
[colors]                                      カラーをすべて表示
[colors:group]                                カラーをグループに分けて表示
[typography:"例文"]                           テキストスタイルを例文ですべて表示
[typography:group:"例文"]                     テキストスタイルを例文でグループに分けて表示
[markdown:"例文"]                             Markdown割り当てを例文で表示
[border:surface:ink]                          border:背景色:文字色
[rounded:surface:ink]                         rounded:背景色:文字色
[shadow:surface:ink]                          shadow:背景色:文字色
[spacing]                                     スペーシングを距離で表示
[buttons:semantic:on-primary:md:md:md]        buttons:背景色:文字色:border:rounded:shadow
[cards:surface:ink:ink:md:md:md]              cards:背景色:見出し文字色:本文文字色:border:rounded:shadow
[feedback:semantic-tint:semantic:body:md:md:md] feedback:背景色:見出し文字色:本文文字色:border:rounded:shadow
[form:surface:ink:md:md:md]                   form:背景色:項目名文字色:border:rounded:shadow
[form-input:surface:ink-muted:ink:sm:sm:none] form-input:背景色:枠色:入力文字色:border:rounded:shadow
[form-button:primary:on-primary:md:md:md]     form-button:背景色:文字色:border:rounded:shadow
[components]                                  登録済みコンポーネントを表示
[contrast:surface:semantic]                   前景色またはグループ:背景色またはグループ
```

色名にはDESIGN.mdのカラートークン名のほか、`#ffffff`や`rgba(...)`の直値も指定できます。記法の引数を省略した場合は、そのプレビューに適した既定値が使われます。

`semantic-tint`はsemanticグループの各色について、`primary-20`のようなtintがあれば背景に使います。該当するtintがなければ`surface`を使います。フォームのplaceholder色は`ink-muted`があれば自動的に使用し、なければ入力文字色を使用します。

カードは、背景色・見出し文字色・本文文字色が単一トークンなら1枚だけ表示します。いずれかに`semantic`などのカラーグループを指定すると、そのグループの色数だけ表示します。背景に`semantic-tint`を指定した場合は、各意味色に対応するtintを背景へ使い、tintがなければ`surface`へフォールバックします。同じPREVIEW.mdに`[cards:...]`を複数書いた場合は、指定ごとに独立したカードセットを表示します。

## Webフォント

Google以外のWebフォントをプレビューで読み込む場合は、PREVIEW.mdの末尾に非表示コメントとして記述します。

```html
<!-- webfont
family: Font Name
embed: <link rel="stylesheet" href="https://example.com/font.css">
-->
```

このコメントはプレビュー本文には表示されません。

## AIに編集を依頼する

Codex、Claude Code、Antigravityなどでプロジェクトフォルダを開きます。現在編集中のファイルは不可視の管理フォルダにある`.dmd/current.json`へ記録されるため、ファイル名を調べて伝える必要はありません。

```text
.dmd/current.jsonを確認して、現在編集中のDESIGN.mdの編集を一緒に進めましょう。ブランドカラーをもう少し落ち着いた印象にしたいです。
```

末尾の要望部分を、相談したい内容に置き換えて使います。PREVIEW.mdは確認用ファイルなので、プレビュー内容の変更が必要な場合だけAIが補助的に編集します。AIがファイルを保存すると、エディタは変更を検知してプレビューを更新します。
