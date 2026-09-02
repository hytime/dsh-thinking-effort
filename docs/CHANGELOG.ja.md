# 変更履歴

- [English / 中文](./CHANGELOG.md)
- [日本語](./CHANGELOG.ja.md)
- [한국어](./CHANGELOG.ko.md)

`@hytime/dsh-thinking-effort` の公開バージョンごとの機能、修正、ユーザーへの影響を記録します。

バージョン番号は [Semantic Versioning](https://semver.org/) に従います。

## [Unreleased] - ゲートウェイ capability mapping と optional takeover

### 変更

- `version-map.ts` で DSH Runtime の transport、Gateway compat フィールド、takeover transport の capability mapping を統一し、rc7 は `supportsDeveloperRole`/`maxTokensField` に非対応、rc8 以降は対応することを明記しました。
- rc7、rc2、alpha3 の 3 つの capability composition representative を個別にロードし、実際の互換性を検証するテストを追加しました。
- オプションの `dsh-llm-openai-completions` takeover に対応しました。Gateway compat に対応する runtime で、対象がカスタム OpenAI 互換の思考ゲートウェイであり、transport が有効な場合だけ適用されます。
- provider のグローバル `compat` 既定値と単一モデルの上書きを追加しました。カタログモデルは `modelOverrides.<model>.compat`、カスタム YAML モデルは `models[].compat` を使用します。モデル層は書かれたフィールドだけを provider に対して上書きし、`Auto` は現在の層のフィールドを削除して provider の継承へ戻します。同じモデルで `models[]` と `modelOverrides` は併用できません。
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
