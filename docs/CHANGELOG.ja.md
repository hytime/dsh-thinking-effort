# 変更履歴

- [English / 中文](./CHANGELOG.md)
- [日本語](./CHANGELOG.ja.md)
- [한국어](./CHANGELOG.ko.md)

`@hytime/dsh-thinking-effort` の公開バージョンごとの機能、修正、ユーザーへの影響を記録します。

バージョン番号は [Semantic Versioning](https://semver.org/) に従います。

## [Unreleased]

### 変更

- 既定値の補完はユーザーレイヤーだけに書き込むようになりました。コンポジションのベースやスキーマ既定値だけが供給するモデルは補完されません（0.1.7 の entry-config 設定サービスでは解決済みサブツリーがそのままディスクに書かれるため、それらを補完すると `input`、`compat`、`headers`、`thinkingBudgets`、`defaultContextWindow` などのスキーマ既定値が設定ドキュメントに固定されます）。スキップした件数は Host ログに出力されます。

### 追加

- 設定ページに「セッション値ジェネレーター」カードを追加しました。UI から `opencodeSession.format` のすべてのフィールド（生成モード、タイムスタンプの取得元、テンプレート / 式 / スクリプトのパス、検証用正規表現、検証失敗時の動作）を読み書きできるため、設定ドキュメントを手で編集する必要はありません。カードは現在のモードで使うフィールドだけを表示し、書き込み前に検証します。不正な正規表現、空のテンプレート / 式 / スクリプト、相対スクリプトパス、解析できない式や存在しない名前を参照する式は、理由付きで拒否されます。これらの値はホスト側で黙ってフォールバックするため（正規表現は「検証なし」、それ以外は派生値）、UI で見えないままだと誤解を招きます。式の検証はホストと同じ解析コードを共有します。書き込みはフィールド単位で行われるため、同じ namespace の他の設定を上書きしません。

- DSH 0.1.7 の entry-config 設定モデルに対応しました。プラグインがルート `.volatile()` の `Config` を公開するようになり、このリリースで設定フォームが表示されるようになります（以前は 0.1.7 で `register is missing` により読み込みに失敗していました）。`0.1.7` 以降の設定セクションは Loader エントリ ID の `thinking-effort`、`0.1.0-rc.7` から `0.1.6` までは登録済み namespace の `dsh-thinking-effort` のままで、Client は実行中の Host が公開している方を解決します。`subagentEffort` は本プラグイン自身の設定セクションへ移り（0.1.7 の `llm-pi-ai` schema は `providers` しか宣言しないため、旧位置は書き込みも読み取りもできません）、Host は旧 `llm-pi-ai` の場所もフォールバックとして読みます。設定は `~/.dsh/settings.yaml` ではなく現在の profile の `cordis.patch.yml` に保存されます（`0.1.7` は旧ファイルを自動で移行またはリネームします）。

## [0.3.1] - 2026-09-19

### 追加

- 設定可能な OpenCode セッション Header 生成器（`opencodeSession.format`）を追加しました。スイッチを有効にして `format` 未設定の場合、Host は OpenCode Zen の正規形を持つ決定論的な `ses_` 値を送信します：`ses_` + 16 進 12 桁（セッションごとに 1 回鋳造する 48 ビットのミリ秒タイムスタンプ）+ Base62 14 桁（正規化した DSH セッション ID の 80 ビット SHA-256 ダイジェスト）。同じ DSH セッション内で値は一定で、別セッション（各 subagent 実行を含む）ごとに異なり、14 桁の接尾辞は DSH 再起動後も安定します。上流の形式変更に対応するため、`ses-derive` / `passthrough` / `template` / `expression` / `script` の 4 モード、`time: firstUse | hash` のタイムスタンプ由来、`validate` / `onInvalid` の検証を設定ドキュメントだけで変更でき、コード変更や再ビルドは不要です。
- provider/model 単位の `user-agent` 上書き（`opencodeSession.userAgent`）を追加しました。`llm-pi-ai` アダプターが帰属 `user-agent` を強制し、provider 設定値を削除するため、このプラグインは送信直前の最後のレイヤーでヘッダーを書き換えます。ルート単位の `enabled`、モデル単位のトグル、任意のルート別 `value`（マスター値より優先）に対応し、既定は無効で、一致しないリクエストは DSH の帰属ヘッダーのままです。

### 変更

- `x-opencode-session` の既定値が「生の DSH セッション ID」から「上流準拠の派生 `ses_` 値」に変わりました。旧動作が必要な場合は `format: { mode: passthrough }` を明示的に設定してください。

### セキュリティ

- 設定スナップショットの読み込みでは、provider の `baseURL`、`apiKeyEnv`、`headers` と `opencodeSession.format.script` を既定で適用しないようにしました。これらはローカル環境の接続設定であり、他人のファイルを読み込んでもリクエスト先を変更したり、Host が実行するローカルモジュールを指定したりできません。プレビューにはスキップした項目数が表示され、既定で無効かつ毎回リセットされる opt-in スイッチを提供します（issue #11）。

## [0.3.0] - 2026-09-16

### 追加

- 「設定のバックアップとプロファイル」を追加しました。`llm-pi-ai` と `dsh-thinking-effort` の 2 つの namespace のユーザーレイヤーを JSON ファイルとして書き出し、別のマシンや再インストール後に読み込んで復元できます。設定ページ内で名前付きプロファイルを複数保存して切り替えることもできます。読み込みは追加 / 上書き / 削除の件数プレビューを表示し、既定は「マージ」（ファイルにない provider は保持）で、プレビューで「置換」（ファイルの内容を優先）に切り替えられます。最初の書き込み前にはロールバック用の読み込み前スナップショットを自動保存し、再起動が必要な適用では対象の namespace を表示します。既存の Settings チャネルを再利用するため、新しい Remote Settings と旧来の `connection.api.settings` の両方で動作し、依存関係の追加はありません。

### 変更

- 互換層のバージョン上限を `<0.1.6-0` から `<0.1.7-0` へ引き上げました。公開済みの DSH `0.1.6-alpha.1` を項目ごとに確認したところ、既存の modern 能力範囲（modern Settings transport、`describe()` が返す `user` 生レイヤー、15 個のゲートウェイ互換フィールド、外部 language pack、任意の takeover）に収まるため、未マップ扱いではなくなりました。
- 公開前の互換マトリクスは最新の capability representative を `dsh-v0.1.5-rc.2` から `dsh-v0.1.6-alpha.1` へ更新し、`dsh-v0.1.0-rc.7`、`dsh-v0.1.1-rc.2`、`dsh-v0.1.3-alpha.2` とともにビルドして公式インストールと実互換チェックを実行します。実ブラウザ DOM プローブは `0.1.6-alpha.1` で実行されます。

## [0.2.4] - 2026-09-11

### 修正

- プロバイダーを折りたたんだときに「モデル能力と档位」ページのゲートウェイ互換性の詳細パネルと保存ボタンが残って表示される問題を修正しました。互換パネルもモデル行と同じ `providerOpen` ゲートに従い、プロバイダーを折りたたむとパネル全体が非表示になります。未保存の互換性ドラフトは再展開時に復元され、失われません（[#7](https://github.com/hytime/dsh-thinking-effort/issues/7)）。
- 互換層のバージョンマップが公開済みの DSH `0.1.5` をカバーするようになりました。`0.1.5-rc.1` / `0.1.5-rc.2` は既存の modern 能力範囲（modern Settings transport、15 個のゲートウェイ互換フィールド、外部 language pack、任意の takeover）に含まれ、未知のバージョンとして扱われなくなります。最新範囲より新しいリリースは未マップのままで、ホストが実際に公開する能力に従い、ランタイム能力検出へフォールバックするため、takeover が黙って無効化されることはありません。
- 公開前の互換マトリクスに 4 つ目の公式代表 `dsh-v0.1.5-rc.2` を追加し、`dsh-v0.1.0-rc.7`、`dsh-v0.1.1-rc.2`、`dsh-v0.1.3-alpha.2` とともにビルドして公式インストールと実互換チェックを実行します。実ブラウザ DOM プローブは最新の代表で実行し、新しいホストのオンボーディング（ワークスペースダイアログが表示されない場合がある）にも適応させました（[#9](https://github.com/hytime/dsh-thinking-effort/issues/9)）。

## [0.2.3] - 2026-09-09

### 変更

- OpenCode セッション Header スイッチはトグル時に即保存するようになりました。スイッチを切り替えるとすぐに `dsh-thinking-effort` Settings namespace へ書き込まれ、別途保存ボタンを押す必要はありません。保存ボタンと未保存マーカーは UI から削除され、モデルを開き直すと永続化された値が表示されます。

## [0.2.2] - 2026-09-09

### 追加

- モデル単位の OpenCode セッション Header スイッチを追加しました。既定では無効で、正確な `provider/model` だけに現在の DSH `sessionId` を `x-opencode-session` として動的に送信します。固定値は保存せず、同じルートの GPT など他モデルにも継承しません。既存の `x-opencode-session` は保持され、上書きされません。この設定は新しい Remote Settings と旧来の `connection.api.settings` の両方の Settings transport に対応します。
- Sub2API/CPA の転送、静的 route Header の制限、`api` プロトコルを変更しないこと、Host の再起動と Web ページ更新の要件を文書化しました。

### 修正

- 公開パッケージは実行時に `@deepseek-ai/dsh-settings` に依存しなくなりました。Host はホストが提供する Settings の `installSection` または旧版 `register` を直接使用します。これにより、`autoInstallPeers: false` の DSH profile で Cordis ランタイムが二重になり、peer 解決に失敗することを回避します。

## [0.2.1] - 2026-09-08

### 追加

- Web runtime が `modelDirectories` を提供する場合、Composer に任意の `seat` を登録し、現在の `provider/model` に対する Host 解決済み `reasoning.efforts` を離散的な推論強度として表示します。`defaultEffort` がないモデルでは「モデルの既定値に従う」を選択でき、Host の light/dark theme token に追従します。
- 中英韓日の Settings、Composer、モデルグループ折りたたみ、モデル検索画面のスクリーンショットギャラリーを追加しました。

### 互換性と UI

- 公式 DSH の最新互換性代表を `dsh-v0.1.3-alpha.2` に更新し、modern capability の範囲を `<0.1.4-0` まで拡張しました。
- Settings の switch、モデル編集行、light/dark theme、未選択の推論マーカー、既定値追従状態を改善しました。

## [0.2.0] - 2026-09-04

### 追加

- `supportsStore`、`thinkingFormat`、`supportsThinkingTokenBudget` など、一般的なスカラーのゲートウェイ互換フィールドを個別に設定して自動継承できるようにし、意味ごとにグループ化して既定で折りたたみました。

## [0.1.14] - ゲートウェイ capability mapping と optional takeover

### 公開互換性マトリックス

| 順序 | 公式 DSH representative | version |
| --- | --- | --- |
| 1 | `dsh-v0.1.0-rc.7` | `0.1.0-rc.7` |
| 2 | `dsh-v0.1.1-rc.2` | `0.1.1-rc.2` |
| 3 | `dsh-v0.1.2-alpha.3` | `0.1.2-alpha.3` |

### 変更

- `version-map.ts` で DSH Runtime の transport、Gateway compat フィールド、takeover transport の capability mapping を統一し、rc7 は `supportsDeveloperRole`/`maxTokensField` に非対応、rc8 以降は対応することを明記しました。
- rc7、rc2、alpha3 の 3 つの capability composition representative を個別にロードし、実際の互換性を検証するテストを追加しました。
- オプションの `dsh-llm-openai-completions` takeover に対応しました。Gateway compat に対応する runtime で、対象がカスタム OpenAI 互換の思考ゲートウェイであり、transport が有効な場合だけ適用されます。
- provider のグローバル `compat` 既定値と単一モデルの上書きを追加しました。カタログモデルは `modelOverrides.<model>.compat`、`models[]` エントリは `models[].compat` を使用します。モデル層は書かれたフィールドだけを provider に対して上書きし、`Auto` は現在の層のフィールドを削除して provider の継承へ戻します。同じルート（provider）に非空の `models[]` と非空の `modelOverrides` が同時に存在する場合は無効な設定です。公式 schema はこの無効な設定を拒否し、プラグインは異常なデータに対して fail closed します。カタログ/modelOverrides と `models[]` の両方で Settings の単一モデル編集に対応し、`models[]` の保存は配列インデックス path op ではなく、他のモデル、未知フィールド、他の compat フィールドを保持する `providers.<route>.models` 全体の 1 回の配列 set を使用します。
- これらの compat 値はコントロールプレーン設定だけを行い、外部 transport は実装しません。

## [0.1.13] - 互換性範囲による検証

### 変更

- 互換アダプターのバージョン診断をリリース単位の列挙から範囲判定へ変更し、公開前 workflow は各範囲から公式代表バージョンを 1 つだけ選ぶようにしました。

## [0.1.12] - 公式 alpha.3 互換性検証

### 変更

- 公式 DSH の互換性検証基準を `dsh-v0.1.2-alpha.3` に更新し、旧 rc7 tag を公式の `dsh-v0.1.0-rc.7` に修正しました。Host/Client の実行動作は変更ありません。

## [0.1.11] - TypeScript ビルド移行とバージョン互換性

### 変更

- Host と Client のランタイムコードを TypeScript に移行し、ビルド済みの `lib/index.js`、`lib/client.js` と宣言ファイルを公開します。動作と Settings データ形式は互換です。
- 互換アダプターは明示的なバージョン metadata またはテスト入力に対応しますが、現在の DSH には公開された semver metadata 契約がないため、実行時の capability detection を権威あるソースとします。未知の有効なバージョンは検出した能力に従って動作し、新旧の Settings API をサポートします。
- 未知のバージョンでも必要な capability があれば動作を継続します。能力が不足する場合は関連機能を利用不可のままにし、対応していない `ja/ko` locale も非表示にします。


### 修正

- クライアントのトップレベルではバージョン間で安定したサービス（`slots`、`connection`、`locale`）だけをハード注入し、新しい DSH では `ctx.get` と `internal/service` を使ってオプションの Remote Settings service を検出し、旧版では引き続き `connection.api.settings` にフォールバックします。
- Remote provider のない旧版でも、オプションの Remote 検出によって pending にはなりません。
- 外部 locale catalog を持たない古い DSH では、未登録エラーを避けるため設定ページで利用できない `ja/ko` を非表示にします。

## [0.1.9] - 新しい DSH Remote への互換対応

### 修正

- DSH `0.1.2-alpha.1` の `ctx.remote.settings` に対応し、旧版の `connection.api.settings` もフォールバックとして維持。
- 新しい直接 `ClientResult` と旧 RPC ラッパー応答の Settings 読み書きを統一。
- DSH の language-pack 動的登録に合わせ、日本語と韓国語の対応説明を更新。

## [0.1.8] - Subagent 推論強度の注入修正

### 修正

- `agent/request` をグローバルリスナーとして登録し、Subagent のリクエストを確実に処理するよう修正。
- `llm-pi-ai` 設定 namespace の遅延登録時に `subagentEffort` が古いキャッシュになる問題を修正し、リクエストごとに現在値を読み取るよう変更。
- グローバルイベント登録と設定のリアルタイム読み取りを検証する Host 回帰テストを追加。

## [0.1.7] - 日本語と韓国語のローカライズ

### 追加

- 設定ページに `日本語` と `한국어` を追加し、中文と English も継続してサポート。
- 4 つの locale 辞書をビルドスクリプトで検証し、クライアント bundle に生成。
- 日本語と韓国語の README、INSTALL、CHANGELOG を追加し、4 言語の相互リンクを提供。

### 互換性

- パッケージと設定ページのバージョン表示を `0.1.7` に更新。
- Host の動作、`thinking-effort` の Cordis composition と設定 Slot ID、ランタイム ID は変更なし。
- 日本語と韓国語の切り替えには DSH コアのグローバル locale ID が必要です。現在の標準 DSH ではこの 2 つの選択項目は使用できません。

## [0.1.6] - 英語ドキュメントを既定の入口に変更

- `README.md` と `INSTALL.md` を既定の英語ドキュメント入口に変更。
- 中国語ドキュメントを `README.zh.md` と `INSTALL.zh.md` に分離し、明示的なリンクで切り替え。
- npm パッケージのファイル一覧を新しいドキュメント名に更新。

## [0.1.5] - 設定ページのバージョン表示と中英 UI

### 追加

- 設定ページ右下に低コントラストのバージョン表示を追加。
- DSH の保存済み locale、ブラウザ言語、中国語フォールバックに対応した中文と English の設定ページを追加。
- locale 辞書を `src/locales/zh.json` と `src/locales/en.json` に分離し、公開前に bundle へ生成。

### 修正

- settings schema 検証に失敗する可能性があった配列インデックス形式のモデル設定書き込みを修正。
- ルート単位で `models` と `modelOverrides` を更新する際、未編集のモデルフィールドを保持。
- 複数ルートでの一括プリセットによる値の上書きを修正。
- 設定ページ更新後に Subagent のカスタム送信値が失われる問題を修正。
- カスタム値を対象モデルが対応する DSH 標準レベルへマッピング。

### 互換性

- npm、ブラウザ loader、Host、Client の ID を `@hytime/dsh-thinking-effort` に統一。
- Cordis composition と設定 Slot ID は `thinking-effort` のまま維持。

### ドキュメント

- 公式 DSH CLI によるインストール、更新、削除、旧パッケージ移行、検証手順を追加。

## [0.1.4] - ランタイム ID の統一と設定修正

- モデルレベル、プリセット、Subagent のカスタムマッピングを修正。
- scoped Client bundle と DSH loader の登録 ID の不一致を修正。
- 公式プラグインのライフサイクルと旧パッケージ移行を文書化。

## [0.1.3] - scoped ブラウザ bundle の登録修正

- `__ModuleLoader__.load` の登録 ID を `dsh-thinking-effort` から `@hytime/dsh-thinking-effort` へ変更。
- scoped npm パッケージのインストール後に Web ページがプラグインをロードできない問題を修正。
- ブラウザ bundle 登録 ID の回帰テストを追加。

## [0.1.2] - scoped npm パッケージへ移行

- npm パッケージ名を `@hytime/dsh-thinking-effort` に変更。
- `cordis.patch.yml` の bundle 名を scoped パッケージ名へ更新。
- README と INSTALL のインストール、mount、削除コマンドを更新。

## [0.1.1] - 初回公開準備

- repository、homepage、bugs、public access を含む npm メタデータを整備。
- 使用例、クイックスタート、制限、トラブルシューティングを含む README を更新。
- GitHub と npm のインストール手順を追加。

## [0.1.0] - 初回リリース

- `reasoningEfforts` がないサードパーティモデルへ `off`、`high`、`max` を追加。
- モデルごとにレベルとゲートウェイ送信値を編集できる設定ページを追加。
- `high` を `ultra` などのゲートウェイ固有値へマッピング。
- 一括推論強度プリセットを追加。
- Subagent の既定の推論強度を設定可能に。
