# dsh-thinking-effort

[DSH（DeepSeek Harness）](https://github.com/deepseek-ai/deepseek-harness) の `llm-pi-ai` 手動定義モデルに推論強度を追加し、Subagent の既定の推論強度を設定できるプラグインです。

[![npm version](https://img.shields.io/npm/v/@hytime/dsh-thinking-effort)](https://www.npmjs.com/package/@hytime/dsh-thinking-effort)
[![npm downloads](https://img.shields.io/npm/dm/@hytime/dsh-thinking-effort)](https://www.npmjs.com/package/@hytime/dsh-thinking-effort)
[![GitHub license](https://img.shields.io/github/license/hytime/dsh-thinking-effort)](https://github.com/hytime/dsh-thinking-effort/blob/main/LICENSE)

- [English README](./README.md)
- [中文 README](./README.zh.md)
- [日本語 README](./README.ja.md)
- [한국어 README](./README.ko.md)
- [English installation guide](./docs/INSTALL.md)
- [中文安装指南](./docs/INSTALL.zh.md)
- [日本語インストールガイド](./docs/INSTALL.ja.md)
- [한국어 설치 안내](./docs/INSTALL.ko.md)
- [Changelog](./docs/CHANGELOG.md) · [日本語](./docs/CHANGELOG.ja.md) · [한국어](./docs/CHANGELOG.ko.md)

> **互換性の境界：** DSH Runtime compatibility は Settings の transport だけを扱います。新しい DSH は `remote.settings`、古い DSH は `connection.api.settings` を公開します。プラグインは実行時の capability を検出し、古い DSH で Remote provider がない場合も、オプションの Remote service を必須にしません。
>
> Gateway Protocol compatibility は別の層です。DSH の schema が提供する場合、公式の `llm-pi-ai.compat` フィールド `supportsDeveloperRole` と `maxTokensField` を読み取ります。DSH `0.1.0-rc.7` にはこの 2 つのフィールドがなく、DSH `0.1.0-rc.8` 以降の対応範囲にはあります。オプションの `dsh-llm-openai-completions` transport をインストールして有効にすると、条件を満たすカスタム OpenAI 互換の思考プロバイダーを takeover できます。どちらのゲートウェイフィールドでも `Auto` はユーザーの上書きを unset し、公式プロトコルの既定値へ戻します。
>
> DSH `0.1.2-alpha.1` 以降は `LocaleRuntime` の language-pack 拡張をサポートします。このプラグインは `ja` と `ko` を動的に登録するため、DSH の fork は不要です。組み込み locale ID だけを受け付ける古い DSH では `zh` と `en` のみ使用できます。
>
> 公開パッケージの実行入口は `lib/index.js`（Host）と `lib/client.js`（Client）です。TypeScript または locale のソースを変更した後は、DSH を起動またはパッケージを作成する前に `npm run build` を実行してください。現在の DSH には公開された semver metadata 契約がないため、実行時の capability detection を権威あるソースとします。任意のバージョンは明示的な metadata またはテスト入力がある場合だけ使用し、未知の有効なバージョンでも検出した能力に従って動作します。新しい `remote.settings` と旧来の `connection.api.settings` の両方に対応します。

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
| 多言語設定 | 中文、English、日本語、한국어の辞書を同梱。日本語/韓国語の切り替えは DSH の language-pack 対応を使用 |
| バージョン表示 | 設定ページ右下にインストール済みバージョンを表示 |

## インストール、更新、削除

profile の管理には公式 DSH CLI を使用してください。通常の `npm install` では DSH profile の bundle は登録されません。

```bash
# 最新版をインストール
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort

# 特定バージョンをインストール
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.13

# 更新
dsh plugin --profile <profile> update @hytime/dsh-thinking-effort

# 削除
dsh plugin --profile <profile> remove @hytime/dsh-thinking-effort
 rm -f "${DSH_HOME:-$HOME/.dsh}/thinking-effort-loaded.json"
```

profile の確認、移行、検証、トラブルシューティングについては [INSTALL.ja.md](./docs/INSTALL.ja.md) を参照してください。

## クイックスタート

1. DSH の **Settings → Model capabilities and effort** を開きます。
2. 上部の **Page language** で `中文`、`English`、`日本語`、`한국어` を選択します。DSH は保存済み locale、ブラウザ言語、English の順でフォールバックします。
3. **Subagent default effort** カードで、明示値のないリクエストに使う既定値を選択し、**Apply** をクリックします。
4. **Quick settings** で公式 DeepSeek 形式または汎用プリセットを全モデルに適用するか、プロバイダーとモデルを展開して詳細設定を行います。
5. 検索欄でモデル名または ID を絞り込みます。モデル行にはテキスト/画像入力能力、宣言済みのコンテキスト長、モデル設定を開くボタンが表示されます。
6. レベルを選択し、ゲートウェイへ送る値を入力します。

   | DSH レベル | ゲートウェイ値 |
   | --- | --- |
   | `off` | 空欄にしてパラメーターを省略 |
   | `high` | `ultra` |
   | `max` | `max` |

7. Composer に戻り、設定したモデルを選択して推論セレクターを使用します。

設定ページ右下には `v0.1.13` のような小さなバージョン表示が出ます。

### ゲートウェイ互換設定

provider の `compat` ブロックは、その provider 配下のすべてのモデルに対するグローバル既定値です。DSH 公式の YAML 形式で設定します。

```yaml
providers:
  qwen-gateway:
    compat:
      supportsDeveloperRole: false
      maxTokensField: max_tokens
    models:
      - id: qwen-plus
      - id: qwen-thinking
        compat:
          maxTokensField: max_completion_tokens
```

モデルの `compat` は provider の既定値をフィールドごとに上書きします。モデル層に書かれていないフィールドは provider から継承されます。`Auto` は現在の層のフィールドを削除し、provider からの継承へ戻します。モデルごとに設定元は 1 つだけにしてください。同じモデルで `models[]` と `modelOverrides` は併用できません。

Settings の provider グローバル領域では、その provider の全モデルの既定値を編集します。カタログモデルは展開して、単一モデル領域の `modelOverrides.<model>.compat` を編集します。カスタム YAML の `models[]` ルートではモデル項目の `models[].compat` を使用します。現在の DSH Settings API は配列 path op に対応していないため、`models[]` の compat は YAML 専用です。設定ページは読み取り専用で表示し、配列 mutation は生成しません。

これらの compat 値はコントロールプレーンの設定です。ゲートウェイの transport を実装または置き換えるものではなく、ネットワーク要求は外部 transport が担当します。

### 設定ページの構成

ページ上部に言語セレクターがあります。その下の **Subagent default effort** カードは明示値のないリクエストの既定値を管理します。**Quick settings** は一括プリセットを適用します。プロバイダーとモデルの一覧は展開/折りたたみができ、各モデル行の入力能力、コンテキスト長、設定ボタンから推論レベルとゲートウェイ値を編集できます。

![英語版 Model capabilities and effort 設定ページ](https://raw.githubusercontent.com/hytime/dsh-thinking-effort/main/docs/assets/settings-model-capabilities-en.png)


## 仕組み

- **Host：** 起動時と設定変更時に `llm-pi-ai` の `models` と `modelOverrides` を確認し、`reasoningEfforts` がない場合だけ既定値を追加します。
- **Client：** DSH Settings Remote（`ctx.remote.settings`）と locale service を使って設定ページを登録します。辞書は `src/locales/ja.json` と `src/locales/ko.json` などで管理し、公開前にクライアント bundle へ生成します。
- **Subagent：** `llm-pi-ai` のユーザーレイヤーに `subagentEffort` を保存します。`agent/request` waterfall は明示値のないリクエストにだけ既定値を追加します。
- **既定値なし：** プラグインは `off`、`high`、`max` を自動選択しません。`reasoning` を省略し、ゲートウェイの既定動作に任せます。

## 制限事項

- `llm-pi-ai` は `off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max` の 7 レベルを提供します。
- `off` 以外のレベルにはゲートウェイ値が必要です。空の `off` はパラメーターを省略します。
- Subagent のレベルが対象モデルに対応していない場合、ゲートウェイが `UNSUPPORTED_REASONING_EFFORT` を返すことがあります。
- `off` と未設定の推論強度がどちらも `reasoning` を省略する場合、思考を無効にするかどうかはゲートウェイのプロトコルによります。
- Host の変更には DSH の再起動が必要です。設定と言語の変更はブラウザで適用されます。

## CI とリリースのメンテナンス

- Pull Request と `main` への push では、Node `22.19.0` と `24.x` の品質マトリックスを実行します。
- workflow は `npm ci` を使用するため、依存関係を変更した場合はメンテナーが `package-lock.json` をコミットしてください。
- 通常の CI workflow は npm に公開しません。`publish.yml` は `v<version>` tag によってのみ公開を開始します。
- リリース tag を作成する前に、メンテナーは `package.json` の version と各言語の `CHANGELOG` を更新してコミットし、一致する `v<version>` tag を作成します。tag の指す commit は `main` の履歴に含まれている必要があります。
- npm パッケージには GitHub Trusted Publisher を設定してください。リポジトリは `hytime/dsh-thinking-effort`、workflow は `publish.yml` です。公開は GitHub OIDC による provenance を含み、`NPM_TOKEN` は必要ありません。
- 公開前に workflow は、対応する各 DSH 互換性範囲から 1 つずつ代表バージョンを選びます。modern は `dsh-v0.1.2-alpha.3`（`0.1.2-alpha.3`）、legacy は `dsh-v0.1.1-rc.2`（`0.1.1-rc.2`）を公式の `dsh plugin` コマンドで構築・インストールし、実際の互換性テストを実行します。
- workflow は version や `CHANGELOG` を自動変更しません。npm に同じ version が既にある場合も公開を停止します。

## ライセンス

[MIT](./LICENSE)
