# dsh-thinking-effort

[DSH（DeepSeek Harness）](https://github.com/deepseek-ai/deepseek-harness) の `llm-pi-ai` 手動定義モデルに推論強度を追加し、Subagent の既定の推論強度を設定できるプラグインです。

[![npm version](https://img.shields.io/npm/v/@hytime/dsh-thinking-effort)](https://www.npmjs.com/package/@hytime/dsh-thinking-effort)
[![npm downloads](https://img.shields.io/npm/dm/@hytime/dsh-thinking-effort)](https://www.npmjs.com/package/@hytime/dsh-thinking-effort)
[![GitHub license](https://img.shields.io/github/license/hytime/dsh-thinking-effort)](https://github.com/hytime/dsh-thinking-effort/blob/main/LICENSE)

- [English README](./README.md)
- [中文 README](./README.zh.md)
- [日本語 README](./README.ja.md)
- [한국어 README](./README.ko.md)
- [English installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [Changelog](./CHANGELOG.md) · [日本語](./CHANGELOG.ja.md) · [한국어](./CHANGELOG.ko.md)

> **互換性に関する注意：** `0.1.7` には日本語（`ja`）と韓国語（`ko`）の辞書および選択項目が含まれますが、現在の公式 DSH は `LocaleRuntime` で `zh` と `en` だけを公開しています。標準の DSH で `ja` または `ko` を選択すると、`locale "<id>" is not registered` となり切り替えに失敗します。公式 DSH が locale ID を追加するまで、これらの言語は使用できません。上級者は DSH を fork し、`packages/client/locale/src/locale-settings.ts` の `LOCALE_IDS` と `packages/client/locale/src/client/index.ts` の `LOCALES` ラベルを更新し、対応するコア辞書とテストを追加してから fork 版を再ビルドして実行してください。このプラグインだけを変更しても DSH 全体の locale リストは拡張できません。

## なぜ使うのか

`llm-pi-ai` アダプターではサードパーティモデルを手動で定義できますが、モデルに `reasoningEfforts` が設定されていないことがあります。その場合、Composer に推論強度セレクターが表示されず、ゲートウェイ固有の `ultra` のような値を DSH の標準レベルへ割り当てることもできません。

このプラグインは次の設定を提供します。

- `off`、`high`、`max` を、設定のないモデルの既定レベルとして追加する。
- DSH の設定ページでモデルごとに推論レベルを設定する。
- DSH の `high` をゲートウェイの `ultra` などの値へマッピングする。
- 明示的なリクエスト値を尊重しながら、Subagent の既定値を設定する。
- 既存のユーザー定義モデル設定を変更しない。

DSH 内蔵モデルだけを使用し、すでに推論コントロールが動作している場合、このプラグインは通常必要ありません。

## 識別子

| 識別子 | 用途 |
| --- | --- |
| `@hytime/dsh-thinking-effort` | npm パッケージ、ブラウザ bundle、loader ID、Host/Client のランタイム ID |
| `thinking-effort` | Cordis composition entry ID と設定 Slot ID |

## 機能

| 機能 | 説明 |
| --- | --- |
| 既定レベル | カスタム値を上書きせず `off`、`high`、`max` を追加 |
| モデルごとの編集 | Settings からレベルとゲートウェイ値を設定 |
| ゲートウェイ値のマッピング | DSH の `high` 選択時に `ultra` を送信可能 |
| Subagent の既定値 | 明示値のないリクエストにだけ既定値を適用 |
| 多言語設定 | 中文、English、日本語、한국어の辞書を同梱。日本語/韓国語の切り替えには DSH コアの locale 対応が必要 |
| バージョン表示 | 設定ページ右下にインストール済みバージョンを表示 |

## インストール、更新、削除

profile の管理には公式 DSH CLI を使用してください。通常の `npm install` では DSH profile の bundle は登録されません。

```bash
# 最新版をインストール
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort

# 特定バージョンをインストール
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.7

# 更新
dsh plugin --profile <profile> update @hytime/dsh-thinking-effort

# 削除
dsh plugin --profile <profile> remove @hytime/dsh-thinking-effort
 rm -f "${DSH_HOME:-$HOME/.dsh}/thinking-effort-loaded.json"
```

profile の確認、移行、検証、トラブルシューティングについては [INSTALL.ja.md](./INSTALL.ja.md) を参照してください。

## クイックスタート

1. DSH の **Settings → Reasoning effort** を開きます。
2. 標準の DSH では、上部の **Page language** で `中文` または `English` を選択します。`日本語` と `한국어` を使うには、上記の DSH コア locale 変更が必要です。DSH は保存済み locale、ブラウザ言語、中国語の順でフォールバックします。
3. **Subagent reasoning effort** カードで既定値を選択し、**Apply** をクリックします。
4. プリセットを全モデルに適用するか、モデルを展開して詳細設定を行います。
5. レベルを選択し、ゲートウェイへ送る値を入力します。

   | DSH レベル | ゲートウェイ値 |
   | --- | --- |
   | `off` | 空欄にしてパラメーターを省略 |
   | `high` | `ultra` |
   | `max` | `max` |

6. Composer に戻り、設定したモデルを選択して推論セレクターを使用します。

設定ページ右下には `v0.1.7` のような小さなバージョン表示が出ます。

## 仕組み

- **Host：** 起動時と設定変更時に `llm-pi-ai` の `models` と `modelOverrides` を確認し、`reasoningEfforts` がない場合だけ既定値を追加します。
- **Client：** DSH の標準 Settings API と locale service を使って設定ページを登録します。辞書は `src/locales/ja.json` と `src/locales/ko.json` などで管理し、公開前にクライアント bundle へ生成します。
- **Subagent：** `llm-pi-ai` のユーザーレイヤーに `subagentEffort` を保存します。`agent/request` waterfall は明示値のないリクエストにだけ既定値を追加します。
- **既定値なし：** プラグインは `off`、`high`、`max` を自動選択しません。`reasoning` を省略し、ゲートウェイの既定動作に任せます。

## 制限事項

- `llm-pi-ai` は `off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max` の 7 レベルを提供します。
- `off` 以外のレベルにはゲートウェイ値が必要です。空の `off` はパラメーターを省略します。
- Subagent のレベルが対象モデルに対応していない場合、ゲートウェイが `UNSUPPORTED_REASONING_EFFORT` を返すことがあります。
- `off` と未設定の推論強度がどちらも `reasoning` を省略する場合、思考を無効にするかどうかはゲートウェイのプロトコルによります。
- Host の変更には DSH の再起動が必要です。設定と言語の変更はブラウザで適用されます。

## ライセンス

[MIT](./LICENSE)
