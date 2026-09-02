# インストールガイド（公式 DSH CLI）

このガイドでは DSH 公式の `dsh plugin` コマンドだけを使用します。コマンドは対象 profile に依存関係を追加し、`dsh.profile.bundles` を同期します。通常の `npm install`、profile 内での直接 `pnpm add`、profile マニフェストの手動編集で置き換えないでください。

- [English installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [English README](../README.md)
- [中文 README](../README.zh.md)
- [日本語 README](../README.ja.md)
- [한국어 README](../README.ko.md)
- [Changelog](./CHANGELOG.md) · [日本語](./CHANGELOG.ja.md) · [한국어](./CHANGELOG.ko.md)

このガイドで使用するプレースホルダー：

- `<profile>`：変更対象の DSH profile。通常は `web`。
- `${DSH_HOME}`：DSH home。既定値は `$HOME/.dsh`。
- `@hytime/dsh-thinking-effort`：npm パッケージおよびランタイムプラグイン ID。
- `thinking-effort`：Cordis composition と設定 Slot の ID。

## 0. 前提条件と profile の確認

```bash
echo "DSH_HOME=${DSH_HOME:-$HOME/.dsh}"
dsh --version
ls "${DSH_HOME:-$HOME/.dsh}/profiles"
```

実行中の DSH プロセスが使用する profile を選択してください。`web` が一般的ですが、実際の `--profile` 引数が正式な指定です。

公開パッケージの Host 入口は `lib/index.js`、Client 入口は `lib/client.js` です。TypeScript または locale のソースから開発する場合は、DSH の起動やパッケージ作成の前に `npm run build` を実行してください。

現在の DSH には公開された semver metadata 契約がないため、実行時の capability detection を権威あるソースとします。任意のバージョンは明示的な metadata またはテスト入力がある場合だけ使用し、未知の有効なバージョンでも検出した能力に従って動作します。新しい `remote.settings` と旧来の `connection.api.settings` の両方に対応します。

### DSH Runtime と Gateway Protocol の互換境界

この 2 つは別の互換レイヤーです。

- **DSH Runtime：** Settings の transport は新しい DSH では `remote.settings`、古い DSH では `connection.api.settings` です。プラグインは実行時 capability を検出し、古い経路へのフォールバックをオプションとして扱います。
- **Gateway Protocol：** DSH の schema が提供する場合、公式の `llm-pi-ai.compat` フィールド `supportsDeveloperRole` と `maxTokensField` を使用します。オプションの `dsh-llm-openai-completions` transport をインストールして有効にすると、条件を満たすカスタム OpenAI 互換の思考プロバイダーを takeover できます。

version-map はゲートウェイ capability を次のように判定します。

| DSH 範囲 | Gateway compat フィールド | Takeover transport |
| --- | --- | --- |
| `0.1.0-rc.7` | `supportsDeveloperRole` と `maxTokensField` は非対応 | 非対応 |
| `0.1.0-rc.8` 以降の対応範囲 | DSH schema が公開する場合は両フィールドに対応 | オプション |

どちらのフィールドでも `Auto` はユーザーの上書きを unset し、公式プロトコルの既定値へ戻します。オプションの transport が未インストールまたは無効の場合、takeover は適用されません。

## ゲートウェイ互換設定

Settings の provider グローバル領域では、その provider 配下のすべてのモデルの `compat` 既定値を編集します。モデルを 1 つ展開すると単一モデル領域が開きます。カタログモデルでは `modelOverrides.<model>.compat`、カスタム YAML ルートではモデル項目の `models[].compat` を使用します。

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

モデルの `compat` は provider の既定値をフィールドごとに上書きします。モデル層にないフィールドは provider の値を継承します。`Auto` は現在の層のフィールドを削除し、provider からの継承へ戻します。同じモデルで `models[]` と `modelOverrides` は併用できません。公式 schema はこの無効な組み合わせを拒否し、プラグインは異常なデータに対して fail closed します。

現在の DSH Settings API は配列 path op に対応していません。そのため `models[]` の compat は YAML 専用です。設定ページでは `models[]` の compat コントロールを表示せず、編集も提供せず、配列 mutation も生成しません。実行時 schema が公開しないフィールドも編集不可です。古い DSH では既存の基本設定を引き続き利用できます。

これらの値はコントロールプレーンの設定だけを行います。このプラグインはゲートウェイの transport を実装または置き換えず、ネットワーク要求は外部 transport が担当します。

## 1. 公式インストール

最新版をインストールします。

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort
```

今回のリリースを明示してインストールします。

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.13
```

公式 CLI は profile の依存関係、lockfile、`dsh.profile.bundles` を自動的に更新します。YAML の行を手動で追加しないでください。

## 2. 更新

registry の最新版へ更新します。

```bash
dsh plugin --profile <profile> update @hytime/dsh-thinking-effort
```

特定バージョンへ更新する場合：

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.13
```

Host の変更には DSH を再起動し、Client の変更には Web ページを更新してください。

## 3. 旧パッケージからの移行

古いインストールには次の依存関係が残っていることがあります。

```text
dsh-thinking-effort
github:hytime/dsh-thinking-effort
```

古い依存関係が残っている場合は公式コマンドを使います。

```bash
dsh plugin --profile <profile> remove dsh-thinking-effort
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.13
```

依存関係は別のツールで削除済みですが、古い bundle が残っている場合は次で composition を確認します。

```bash
dsh --profile <profile> --dump-default-config
```

`name: dsh-thinking-effort` が残っている場合は profile lockfile から古い GitHub commit を確認し、公式 CLI で再調整します。

```bash
dsh plugin --profile <profile> add github:hytime/dsh-thinking-effort#<old-commit>
dsh plugin --profile <profile> remove dsh-thinking-effort
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.13
```

新しい bundle リストに旧パッケージ名を追加しないでください。

## 4. インストールの検証

依存関係とバージョンを確認します。

```bash
grep -n "@hytime/dsh-thinking-effort" \
  "${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/package.json"
node -p "require('${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/node_modules/@hytime/dsh-thinking-effort/package.json').version"
```

このリリースではバージョンが `0.1.13` である必要があります。

## 日本語と韓国語の対応状況

DSH `0.1.2-alpha.1` 以降は `LocaleRuntime` の language-pack 拡張をサポートします。このプラグインは `ja` と `ko` を動的に登録するため、DSH の fork は不要です。組み込み locale ID だけを受け付ける古い DSH では `zh` と `en` のみ使用できます。


公式 composition を確認します。

```bash
dsh --profile <profile> --dump-default-config
```

次の行が含まれている必要があります。

```yaml
- id: thinking-effort
  name: '@hytime/dsh-thinking-effort'
```

次の旧 bundle 行は含まれてはいけません。

```yaml
name: dsh-thinking-effort
```

## 5. 設定ページの確認

DSH を再起動し、Web ページを更新してから **Settings → Model capabilities and effort** を開きます。

1. DSH `0.1.2-alpha.1` 以降では、言語セレクターに `中文`、`English`、`日本語`、`한국어` が表示されます。組み込み locale ID だけを受け付ける古い DSH では `中文` と `English` のみ使用できます。
2. **Subagent default effort** カードに現在の既定値と **Apply** が表示されます。
3. **Quick settings** から公式 DeepSeek 形式または汎用プリセットを一括適用できます。
4. プロバイダー/モデル一覧では検索、展開/折りたたみ、入力能力、コンテキスト長、モデル設定ボタンを確認できます。
5. 右下のバージョン表示が `v0.1.13` になります。

Host のロードマーカーは次で確認できます。

```bash
cat "${DSH_HOME:-$HOME/.dsh}/thinking-effort-loaded.json"
```

## 6. トラブルシューティング

| 症状 | 対応 |
| --- | --- |
| `dsh` が見つからない | 公式 DSH CLI をインストールまたは有効化してください。npm や pnpm で profile インストールを代用しないでください。 |
| `dump-default-config` に旧パッケージが表示される | 旧 lockfile commit を復元し、公式 remove を実行してから scoped パッケージを追加します。 |
| Host プラグインがロードされない | DSH を再起動し、`thinking-effort-loaded.json` と起動ログを確認します。 |
| 設定ページが表示されない | DSH を再起動し、ページを更新して scoped bundle の composition を確認します。 |
| 言語選択が保存されない | DSH locale service が mount され、profile に設定を書き込めることを確認します。 |
| 推論強度の書き込みに失敗する | `off` 以外のすべてのレベルにゲートウェイ値が必要です。 |
| `UNSUPPORTED_REASONING_EFFORT` が返る | 対象モデルが対応するレベルを選ぶか、プロバイダーの既定値へ戻します。 |

## リリースのメンテナンス

メンテナーは `package.json` の version と該当する `CHANGELOG` を更新してコミットし、一致する `v<version>` tag を作成します。tag の指す commit は `main` の履歴に含まれている必要があります。`publish.yml` workflow は version や CHANGELOG を自動変更しません。

npm パッケージには GitHub Trusted Publishing を設定してください。リポジトリは `hytime/dsh-thinking-effort`、workflow は `publish.yml` です。公開は GitHub OIDC と provenance を使い、`npm publish --provenance --access public` を実行します。`NPM_TOKEN` や長期 token は使用しません。npm に同じ version が存在する場合、公開は停止します。

公開前に workflow は、各互換性範囲から 1 つずつ選んだ 2 つの一時的な公式 DSH checkout を作成し、公式 `dsh plugin` コマンドで現在の tarball をインストールしてから実際の互換性テストを実行します。

- `dsh-v0.1.2-alpha.3`（`0.1.2-alpha.3`）— modern 範囲
- `dsh-v0.1.1-rc.2`（`0.1.1-rc.2`）— legacy 範囲

通常の CI はテスト専用で、Pull Request と `main` への push で実行されます。`npm ci` を使うため、依存関係変更時は `package-lock.json` をコミットしてください。

## 7. 削除

公式コマンドを使用します。

```bash
dsh plugin --profile <profile> remove @hytime/dsh-thinking-effort
rm -f "${DSH_HOME:-$HOME/.dsh}/thinking-effort-loaded.json"
```

profile composition に scoped bundle が残っていないことを確認します。

```bash
dsh --profile <profile> --dump-default-config
```
