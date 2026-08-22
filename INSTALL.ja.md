# インストールガイド（公式 DSH CLI）

このガイドでは DSH 公式の `dsh plugin` コマンドだけを使用します。コマンドは対象 profile に依存関係を追加し、`dsh.profile.bundles` を同期します。通常の `npm install`、profile 内での直接 `pnpm add`、profile マニフェストの手動編集で置き換えないでください。

- [English installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [English README](./README.md)
- [中文 README](./README.zh.md)
- [日本語 README](./README.ja.md)
- [한국어 README](./README.ko.md)
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

## 1. 公式インストール

最新版をインストールします。

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort
```

今回のリリースを明示してインストールします。

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.7
```

公式 CLI は profile の依存関係、lockfile、`dsh.profile.bundles` を自動的に更新します。YAML の行を手動で追加しないでください。

## 2. 更新

registry の最新版へ更新します。

```bash
dsh plugin --profile <profile> update @hytime/dsh-thinking-effort
```

特定バージョンへ更新する場合：

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.7
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
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.7
```

依存関係は別のツールで削除済みですが、古い bundle が残っている場合は次で composition を確認します。

```bash
dsh --profile <profile> --dump-default-config
```

`name: dsh-thinking-effort` が残っている場合は profile lockfile から古い GitHub commit を確認し、公式 CLI で再調整します。

```bash
dsh plugin --profile <profile> add github:hytime/dsh-thinking-effort#<old-commit>
dsh plugin --profile <profile> remove dsh-thinking-effort
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.7
```

新しい bundle リストに旧パッケージ名を追加しないでください。

## 4. インストールの検証

依存関係とバージョンを確認します。

```bash
grep -n "@hytime/dsh-thinking-effort" \
  "${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/package.json"
node -p "require('${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/node_modules/@hytime/dsh-thinking-effort/package.json').version"
```

このリリースではバージョンが `0.1.7` である必要があります。

## 日本語と韓国語の対応状況

プラグインには `ja` と `ko` の辞書が含まれますが、現在の公式 DSH の `LocaleRuntime` が公開しているのは `zh` と `en` だけです。標準の DSH で日本語または韓国語を選択すると、`locale "<id>" is not registered` となります。

公式対応前に使用する場合は、DSH を fork して次を更新してください。

- `packages/client/locale/src/locale-settings.ts`：`LOCALE_IDS` に `ja` と `ko` を追加します。Host preference schema はこの一覧から生成されます。
- `packages/client/locale/src/client/index.ts`：`LOCALES` に `{ id: 'ja', label: '日本語' }` と `{ id: 'ko', label: '한국어' }` を追加します。
- 対応するコア辞書とテストを追加し、fork 版 DSH を再ビルドして実行します。

このプラグインだけを変更しても DSH 全体の locale リストは拡張できません。fork 版のビルド手順に従い、profile の操作には公式コマンドを使用してください。profile manifest を手動編集しないでください。

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

DSH を再起動し、Web ページを更新してから **Settings → Reasoning effort** を開きます。

1. 標準の DSH では、言語セレクターに `中文` と `English` が表示されます。`日本語` と `한국어` を使うには、上記の DSH コア locale 変更が必要です。
2. 既定値は保存済み DSH locale、ブラウザ言語、最後に中国語の順で決まる。
3. 言語選択はページ更新と DSH 再起動後も維持される。
4. 右下のバージョン表示が `v0.1.7` になる。
5. モデルの推論強度編集と Subagent 設定が使用できる。

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
