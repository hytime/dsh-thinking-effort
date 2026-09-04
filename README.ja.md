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
> Gateway Protocol compatibility は別の層です。DSH の schema が提供する場合、15 個の一般的なスカラー `llm-pi-ai.compat` フィールドに対応します。フィールドはロールと推論、形式と出力、ストリーミングとツール、保存とキャッシュの 4 グループに分かれ、既定では折りたたまれています。boolean は `Auto`、対応、非対応、enum は `Auto` と具体的な値を選べます。DSH `0.1.0-rc.7` にはゲートウェイ互換設定がなく、`0.1.0-rc.8` から `<0.1.2-alpha.1` では `supportsFinishReason` と `supportsThinkingTokenBudget` がありません。DSH `0.1.2-alpha.1` 以降は schema が対応する場合に 15 フィールドを提供します。オプションの `dsh-llm-openai-completions` transport をインストールして有効にすると、条件を満たすカスタム OpenAI 互換の思考プロバイダーを takeover できます。`Auto` は現在の層の上書きを unset し、継承チェーンの次の値へ戻します。
>
> DSH `0.1.2-alpha.1` 以降は `LocaleRuntime` の language-pack 拡張をサポートします。このプラグインは `ja` と `ko` を動的に登録するため、DSH の fork は不要です。組み込み locale ID だけを受け付ける古い DSH では `zh` と `en` のみ使用できます。
>
> 公開パッケージの実行入口は `lib/index.js`（Host）と `lib/client.js`（Client）です。TypeScript または locale のソースを変更した後は、DSH を起動またはパッケージを作成する前に `npm run build` を実行してください。現在の DSH には公開された semver metadata 契約がないため、実行時の capability detection を権威あるソースとします。任意のバージョンは明示的な metadata またはテスト入力がある場合だけ使用し、未知の有効なバージョンでも検出した能力に従って動作します。新しい `remote.settings` と旧来の `connection.api.settings` の両方に対応します。

## DSH バージョン互換性

| DSH 範囲 | ゲートウェイ互換設定 |
| --- | --- |
| `0.1.0-rc.7` | 非対応 |
| `0.1.0-rc.8` から `<0.1.2-alpha.1` | schema が公開する場合は対応。ただし `supportsFinishReason` と `supportsThinkingTokenBudget` はありません |
| `0.1.2-alpha.1` から `<0.1.3-0` | schema が公開する場合は 15 フィールドに対応 |

DSH `0.1.0-rc.8` 以降の対応範囲では、フィールドの有無は実行時 schema の公開内容に従います。
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
| モデルごとの編集 | Settings からレベルとゲートウェイ値を設定し、カタログ/modelOverrides と `models[]` エントリの両方で compat を編集 |
| ゲートウェイ互換設定 | 15 個の一般的なスカラーを provider 全体またはモデルごとに設定。ロールと推論、形式と出力、ストリーミングとツール、保存とキャッシュの 4 グループで既定は折りたたみ |
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
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.2.0

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

設定ページ右下には `v0.1.14` のような小さなバージョン表示が出ます。

### ゲートウェイ互換設定

provider の `compat` ブロックは、その provider 配下のすべてのモデルに対するグローバル既定値です。設定ページでは 15 フィールドを 4 グループに分け、既定で折りたたみます。DSH 公式の YAML 形式で設定します。

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

フィールドごとに独立して、model → provider → base/catalog → protocol の順で解決されます。URL/hostname は compat のソースとして使用しません。モデルの値はそのフィールドだけを上書きします。`Auto` は現在の層のフィールドを削除して provider の継承を復元し、チェーンの次の値を有効にします。provider の既定値はそのルートの全モデルに適用され、モデルの変更は現在のモデルだけに反映されます。同じルート（provider）では、非空の `models[]` と非空の `modelOverrides` は併用できません。公式 schema はこの無効な設定を拒否し、プラグインは異常なデータに対して fail closed します。

Settings の provider グローバル領域では、その provider の全モデルの既定値を編集します。カタログ/modelOverrides とカスタム YAML `models[]` の両方で単一モデルの compat を編集できます。前者は `modelOverrides.<model>.compat` の対象フィールドだけを `set`/`unset` し、後者は `providers.<route>.models` 全体を 1 回の配列 set で書き戻して他のモデルとフィールドを保持します。モデルの変更は他のモデルに影響しません。

これらの compat 値はコントロールプレーンの設定です。ゲートウェイの transport を実装または置き換えるものではなく、ネットワーク要求は外部 transport が担当します。

### 設定ページの構成

ページ上部に言語セレクターがあります。その下の **Subagent default effort** カードは明示値のないリクエストの既定値を管理します。**Quick settings** は一括プリセットを適用します。プロバイダーとモデルの一覧は展開/折りたたみができ、各モデル行に入力能力、コンテキスト長、ゲートウェイ互換値の編集領域が表示されます。`models[]` の保存は配列インデックス path op ではなく、配列全体の set を使用します。

![日本語版 Model capabilities and effort 設定ページ](https://raw.githubusercontent.com/hytime/dsh-thinking-effort/main/docs/assets/settings-gateway-compat-ja.png)


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
- 公開前に workflow は rc7 → rc2 → alpha3 の順で 3 つの公式 DSH capability representative を構築・テストします：`dsh-v0.1.0-rc.7`（`0.1.0-rc.7`）、`dsh-v0.1.1-rc.2`（`0.1.1-rc.2`）、`dsh-v0.1.2-alpha.3`（`0.1.2-alpha.3`）。公式の `dsh plugin` コマンドでインストールし、実際の互換性テストを実行します。
- workflow は version や `CHANGELOG` を自動変更しません。npm に同じ version が既にある場合も公開を停止します。

## ライセンス

[MIT](./LICENSE)
