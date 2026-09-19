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
>
> Host は、ホストが提供する Settings の `installSection` が利用できる場合はそれを使ってプラグイン固有の `dsh-thinking-effort` namespace を登録し、それ以外は旧版の `register` パスにフォールバックします。実行時に `@deepseek-ai/dsh-settings` に依存しないため、`autoInstallPeers: false` に設定した DSH profile でも Cordis ランタイムを二重に導入せずにクリーンにインストールできます。

## DSH バージョン互換性

| DSH 範囲 | ゲートウェイ互換設定 |
| --- | --- |
| `0.1.0-rc.7` | 非対応 |
| `0.1.0-rc.8` から `<0.1.2-alpha.1` | schema が公開する場合は対応。ただし `supportsFinishReason` と `supportsThinkingTokenBudget` はありません |
| `0.1.2-alpha.1` から `<0.1.7-0` | schema が公開する場合は 15 フィールドに対応。上限以降のリリースは未マップのまま、実行中のホストが報告する能力に従って動作を継続します |

DSH `0.1.0-rc.8` 以降の対応範囲では、フィールドの有無は実行時 schema の公開内容に従います。上表は各 DSH バージョンで利用できるフィールドの上限であり、ルートのプロトコルによってさらに絞り込まれます。

ゲートウェイ互換フィールドを設定できるのは、DSH のバージョン、実行時 schema、ルートの `api` プロトコルのすべてが対応している場合だけです。対応しないフィールドは UI に表示されず、Settings にも書き込まれません。この 15 フィールドでは `openai-completions` がすべてを提供し、`openai-responses`、`azure-openai-responses`、`openai-codex-responses` は `supportsDeveloperRole`、`supportsStrictMode`、`supportsLongCacheRetention` だけを提供します。`api` がない、または認識できない場合は、実行時 schema と DSH の検証を最終的な基準にします。
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
| OpenCode セッション Header | 正確なモデルだけで動的な `x-opencode-session` を有効化。既定では DSH セッションに結び付いた決定論的な `ses_` 値を生成（template / expression / script モードで上流の形式変更に対応）。固定 Header 値は保存しません |
| ゲートウェイ値のマッピング | DSH の `high` 選択時に `ultra` を送信可能 |
| 設定のバックアップとプロファイル | 現在の設定を JSON ファイルとして書き出して移行に利用。名前付きプロファイルを保存して切り替え。読み込み前に「マージ」または「置換」を選び、影響範囲をプレビュー |
| Subagent の既定値 | 明示値のないリクエストにだけ既定値を適用 |
| 多言語設定 | 中文、English、日本語、한국어の辞書を同梱。日本語/韓国語の切り替えは DSH の language-pack 対応を使用 |
| バージョン表示 | 設定ページ右下にインストール済みバージョンを表示 |

## インストール、更新、削除

profile の管理には公式 DSH CLI を使用してください。通常の `npm install` では DSH profile の bundle は登録されません。

```bash
# 最新版をインストール
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort

# 特定バージョンをインストール
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.3.1

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

7. モデル編集で、`x-opencode-session` が必要な正確なモデルだけに **OpenCode セッション Header** を有効にします。既定では無効で、現在の DSH セッションから決定論的な `ses_` 値を生成し、同じルートの他モデルや別 provider へ継承しません。トグルすると即保存され、別途保存ボタンはありません。上流の形式が変わったときは[生成器の章](#opencode-セッション-header-生成器)を参照してください。
8. Composer に戻り、設定したモデルを選択して推論セレクターを使用します。

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

### OpenCode セッション Header 生成器

モデル編集には独立した **OpenCode セッション Header** スイッチがあります。既定では無効で、`llm-pi-ai.compat` ではなくプラグイン固有の `dsh-thinking-effort` Settings namespace に保存されます。`x-opencode-session` が必要な正確な `provider/model` だけで有効にしてください。同じルートの別モデル（GPT モデルを含む）には継承されません。トグルすると即保存され、別途保存ボタンはありません。モデルを開き直すと永続化された値が表示されます。

有効時で `format` 未設定の場合、Host は `ses_` の正規形を持ち**現在の DSH セッションから決定論的に導出**した値を送信します。`ses_` + 12 桁の 16 進（セッションごとに 1 回鋳造する 48 ビットのミリ秒タイムスタンプ）+ 14 桁の Base62（正規化した DSH セッション ID の 80 ビット SHA-256 ダイジェスト）です。同じ DSH セッションは常に同じ値を送ります。値はセッション単位で保持され、サイズ上限付きキャッシュの淘汰はキャッシュした値だけを捨て、初回鋳造は決して捨てないため、淘汰されたセッションを再訪しても値は変わりません。16 進タイムスタンプが再鋳造されるのは DSH 再起動後の `firstUse` モードだけです（`time: hash` は完全にステートレス）。14 桁の接尾辞は導出値であって保存値ではないため、DSH 再起動後も安定しています。別のセッション（各 subagent 実行を含む）は別の値を導出します。

生成器は DSH 設定ドキュメントの `dsh-thinking-effort.opencodeSession.format` で設定でき、上流の形式変更にプラグインの再ビルドなしで対応できる 4 つのモードがあります。

- `ses-derive`（既定）— 上記の正規生成器。`time: firstUse` はセッションごとに hex 部を 1 回鋳造し、`time: hash` はセッションダイジェストから導出してどのマシンでも値が完全に一致します。
- `passthrough` — 旧動作：生の DSH セッション ID を送信します。
- `template` — `{hex12}`、`{tail62}`、`{sessionId}`、`{rawSessionId}`、`{sha256}`、`{now}`、`{provider}`、`{model}` のプレースホルダーを持つ文字列。
- `expression` — 同じコンテキストを使う制限付き加算式で、`sha256`、`slice`、`lower`、`upper` ヘルパーも利用できます。例：`'ses_' + hex12 + tail62`。
- `script` — `format(context)` をエクスポートする JS ファイルの絶対パス。ファイル変更時にホットリロードされ、読み込み・評価の失敗時は `ses-derive` にフォールバックします。

任意の `validate` 正規表現と `onInvalid: warn | drop | send` で、生成値が上流の最新要件を満たすか検証できます（既定は `warn`）。アダプターまたは呼び出し元が既に指定した `x-opencode-session` は保持され、上書きされません。この設定は `openai-completions`、`openai-responses`、`anthropic-messages` のプロトコルを選択または変更しません。完全な設定リファレンスは [INSTALL.ja.md](./docs/INSTALL.ja.md) を参照してください。

Sub2API、CPA、その他の転送ゲートウェイは `x-opencode-session` を保持して OpenCode 上流へ転送する必要があります。`llm-pi-ai.providers.<route>.headers.x-opencode-session` のような静的 route Header は代替になりません。全会話で同じ値を使うため、会話ごとのルーティングや prompt cache の親和性を提供できません。Host の変更後は DSH を再起動し、Settings または Client の変更後は Web ページを更新してください。

### 設定のバックアップとプロファイル

**設定のバックアップとプロファイル** カードは言語セレクターと **Subagent default effort** カードの下にあり、現在の設定の書き出し、名前付きプロファイルの保存と切り替え、以前に書き出したファイルの読み込みができます。

1. **現在の設定を書き出す** を押すと `dsh-config-<タイムスタンプ>.json` がダウンロードされます。ファイルには `llm-pi-ai` と `dsh-thinking-effort` のユーザーレイヤーがそのまま入ります。認証情報の値は書き出されません（provider が持つのは鍵を入れた環境変数の名前 `apiKeyEnv` だけです）が、ユーザーレイヤーの値はそのまま記録されるため、provider の `headers` に置いた平文トークンもそのまま残ります。保管に注意してください。
2. **プロファイル一覧** で名前を入力して **現在の設定を保存** を押すと、現在の設定が名前付きプロファイルとして保存されます。**書き出し** でファイルに保存し、**削除** で削除できます。保存できるのは最大 20 件です。**適用** は読み込みと同じプレビューを開くため、既定の **マージ** ではファイルにない provider が残ります。完全に戻すにはプレビューで **置換** を選びます。
3. **設定を読み込む** の **ファイルを選択…** を押すと、**読み込みプレビュー** に追加 / 上書き / 削除の件数が表示されます。確認するまで設定は書き換えられません。
4. 読み込みの既定は **マージ**（ファイルにない設定は保持）です。**置換** は明示的に選択する必要があり、ファイルにない provider を削除します。**読み込みを実行** はまず現在の設定を **読み込み前の自動バックアップ** として保存し、そのあとで変更を書き込みます。戻すときも同じプレビューを使います。

書き出しと読み込みは既存の Settings チャネルを再利用するため、新しい Remote Settings と旧来の `connection.api.settings` のどちらでも動作します。結果に再起動が必要な namespace が示された場合は、DSH を再起動すると反映されます。

スナップショットの読み込みでは、既定で capability 設定だけを移行します。provider の `baseURL`、`apiKeyEnv`、`headers` と `opencodeSession.format.script` はローカル環境の接続設定であり、プレビューで **Also import endpoints and credentials (advanced)** を明示的に選択した場合だけ反映されます。

### 設定ページの構成

ページ上部に言語セレクターがあります。その下の **Subagent default effort** カードは明示値のないリクエストの既定値を管理します。**Quick settings** は一括プリセットを適用します。プロバイダーとモデルの一覧は展開/折りたたみができ、各モデル行に入力能力、コンテキスト長、ゲートウェイ互換値の編集領域が表示されます。`models[]` の保存は配列インデックス path op ではなく、配列全体の set を使用します。

![日本語版 Model capabilities and effort 設定ページ](https://raw.githubusercontent.com/hytime/dsh-thinking-effort/main/docs/assets/screenshots/plugin-ja-settings-expanded.png)

中英韓日すべての画面は [`docs/SCREENSHOTS.md`](./docs/SCREENSHOTS.md) を参照してください。


## 仕組み

- **Host：** 起動時と設定変更時に `llm-pi-ai` の `models` と `modelOverrides` を確認し、`reasoningEfforts` がない場合だけ既定値を追加します。さらにモデル単位の OpenCode セッション設定を読み、一致する `llm/stream` リクエストにだけ `opencodeSession.format` に従って生成（既定 `ses-derive`）した `x-opencode-session` を注入します。
- **Client：** DSH Settings Remote（`ctx.remote.settings`）と locale service を使って設定ページを登録します。モデル編集では OpenCode セッション Header を専用 namespace に保存し、`llm-pi-ai.compat` とは分離します。辞書は `src/locales/ja.json` と `src/locales/ko.json` などで管理し、公開前にクライアント bundle へ生成します。
- **Subagent：** `llm-pi-ai` のユーザーレイヤーに `subagentEffort` を保存します。`agent/request` waterfall は明示値のないリクエストにだけ既定値を追加します。
- **既定値なし：** プラグインは `off`、`high`、`max` を自動選択しません。`reasoning` を省略し、ゲートウェイの既定動作に任せます。

## 制限事項

- `llm-pi-ai` は `off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max` の 7 レベルを提供します。
- `off` 以外のレベルにはゲートウェイ値が必要です。空の `off` はパラメーターを省略します。
- Subagent のレベルが対象モデルに対応していない場合、ゲートウェイが `UNSUPPORTED_REASONING_EFFORT` を返すことがあります。
- `off` と未設定の推論強度がどちらも `reasoning` を省略する場合、思考を無効にするかどうかはゲートウェイのプロトコルによります。
- Host の変更には DSH の再起動が必要です。設定と言語の変更はブラウザで適用されます。
- プロファイル一覧と読み込み前の自動バックアップはプラグイン固有の `dsh-thinking-effort` namespace に保存され、書き出しファイルには含まれません。名前付きプロファイルを別のマシンへ移すには、1 件ずつ書き出して移行先で読み込んでください。

## CI とリリースのメンテナンス

- Pull Request と `main` への push では、Node `22.19.0` と `24.x` の品質マトリックスを実行します。
- workflow は `npm ci` を使用するため、依存関係を変更した場合はメンテナーが `package-lock.json` をコミットしてください。
- 通常の CI workflow は npm に公開しません。`publish.yml` は `v<version>` tag によってのみ公開を開始します。
- リリース tag を作成する前に、メンテナーは `package.json` の version と各言語の `CHANGELOG` を更新してコミットし、一致する `v<version>` tag を作成します。tag の指す commit は `main` の履歴に含まれている必要があります。
- npm パッケージには GitHub Trusted Publisher を設定してください。リポジトリは `hytime/dsh-thinking-effort`、workflow は `publish.yml` です。公開は GitHub OIDC による provenance を含み、`NPM_TOKEN` は必要ありません。
- 公開前に workflow は rc7 → rc2 → alpha2 → latest の順で 4 つの公式 DSH capability representative を構築・テストします：`dsh-v0.1.0-rc.7`（`0.1.0-rc.7`）、`dsh-v0.1.1-rc.2`（`0.1.1-rc.2`）、`dsh-v0.1.3-alpha.2`（`0.1.3-alpha.2`）、`dsh-v0.1.6-alpha.1`（`0.1.6-alpha.1`）。公式の `dsh plugin` コマンドでインストールし、実際の互換性テストを実行します。最新の代表では実ブラウザ DOM プローブも実行します。
- workflow は version や `CHANGELOG` を自動変更しません。npm に同じ version が既にある場合も公開を停止します。

## ライセンス

[MIT](./LICENSE)
