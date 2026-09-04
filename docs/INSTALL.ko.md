# 설치 안내 (공식 DSH CLI)

이 안내는 DSH 공식 `dsh plugin` 명령만 사용합니다. 이 명령은 대상 profile에 의존성을 설치하고 `dsh.profile.bundles`를 동기화합니다. 일반 `npm install`, profile 내부의 직접 `pnpm add`, profile manifest 수동 편집으로 대체하지 마세요.

- [English installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [English README](../README.md)
- [中文 README](../README.zh.md)
- [日本語 README](../README.ja.md)
- [한국어 README](../README.ko.md)
- [Changelog](./CHANGELOG.md) · [日本語](./CHANGELOG.ja.md) · [한국어](./CHANGELOG.ko.md)

이 안내에서 사용하는 placeholder:

- `<profile>`: 변경할 DSH profile. 일반적으로 `web`입니다.
- `${DSH_HOME}`: DSH home. 기본값은 `$HOME/.dsh`입니다.
- `@hytime/dsh-thinking-effort`: npm 패키지 및 런타임 플러그인 ID입니다.
- `thinking-effort`: Cordis composition 및 설정 Slot ID입니다.

## 0. 사전 조건 및 profile 확인

```bash
echo "DSH_HOME=${DSH_HOME:-$HOME/.dsh}"
dsh --version
ls "${DSH_HOME:-$HOME/.dsh}/profiles"
```

실행 중인 DSH 프로세스가 사용하는 profile을 선택하세요. `web`이 일반적이지만 실제 `--profile` 인자가 기준입니다.

게시 패키지의 Host 진입점은 `lib/index.js`, Client 진입점은 `lib/client.js`입니다. TypeScript 또는 locale 소스에서 개발할 때는 DSH를 실행하거나 패키지를 만들기 전에 `npm run build`를 실행하세요.

현재 DSH에는 공개된 semver metadata 계약이 없으므로 런타임 capability detection이 권위 있는 출처입니다. 선택적 버전은 명시적인 metadata 또는 테스트 입력이 있을 때만 사용하며, 알 수 없는 유효한 버전도 감지된 capability에 따라 계속 실행합니다. 최신 `remote.settings`와 이전 `connection.api.settings`를 모두 지원합니다.

### DSH Runtime 및 Gateway Protocol 호환 경계

두 호환성 계층은 서로 별개입니다.

- **DSH Runtime:** Settings transport는 최신 DSH에서 `remote.settings`, 이전 DSH에서 `connection.api.settings`입니다. 플러그인은 실제 런타임 capability를 감지하고 이전 경로 fallback을 선택 사항으로 유지합니다.
- **Gateway Protocol:** DSH schema가 제공하는 경우 공식 `llm-pi-ai.compat` 필드를 사용합니다. 선택 사항인 `dsh-llm-openai-completions` transport를 설치하고 활성화하면 조건을 충족하는 사용자 지정 OpenAI 호환 사고 provider를 takeover할 수 있습니다.

version-map은 다음 규칙으로 게이트웨이 capability를 판정합니다.

| DSH 범위 | Gateway compat 필드 | Takeover transport |
| --- | --- | --- |
| `0.1.0-rc.7` | 지원하지 않음 | 지원하지 않음 |
| `0.1.0-rc.8`부터 `<0.1.2-alpha.1`까지 | schema가 노출하는 경우 지원하지만 `supportsFinishReason` 및 `supportsThinkingTokenBudget`는 없음 | 선택 사항 |
| `0.1.2-alpha.1` 이상 지원 범위 | schema가 노출하는 경우 15개 필드 모두 지원 | 선택 사항 |

DSH `0.1.0-rc.8` 이후 지원 범위에서는 필드 사용 가능 여부가 런타임 schema 노출에 따라 결정됩니다.
런타임 schema가 노출하지 않는 필드는 UI에 표시되지 않습니다. 선택 사항인 transport가 설치되지 않았거나 비활성화된 경우 takeover를 적용하지 않습니다.

## 게이트웨이 호환성 설정

Settings의 provider 전역 영역에서는 해당 provider 아래 모든 모델의 `compat` 기본값을 수정합니다. 모델 하나를 펼치면 단일 모델 영역이 열립니다. 4개 그룹은 기본으로 접혀 있습니다.

| 그룹 | boolean 필드 (`Auto` / 지원 / 미지원) | enum 필드 (`Auto` / 구체적인 값) |
| --- | --- | --- |
| 역할 및 추론 | `supportsDeveloperRole`, `supportsReasoningEffort`, `supportsThinkingTokenBudget` | — |
| 형식 및 출력 | `requiresThinkingAsText`, `requiresReasoningContentOnAssistantMessages` | `thinkingFormat`: `openai`, `openrouter`, `deepseek`, `together`, `baseten`, `zai`, `qwen`, `chat-template`, `qwen-chat-template`, `string-thinking`, `ant-ling`; `maxTokensField`: `max_tokens`, `max_completion_tokens` |
| 스트리밍 및 도구 | `supportsUsageInStreaming`, `supportsFinishReason`, `requiresToolResultName`, `requiresAssistantAfterToolResult`, `supportsStrictMode` | — |
| 저장 및 캐시 | `supportsStore`, `supportsLongCacheRetention` | `cacheControlFormat`: `anthropic` |

catalog 모델과 `models[]` 항목 모두 compat 편집을 지원합니다. 전자는 `modelOverrides.<model>.compat`, 후자는 `models[].compat`을 사용합니다.

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

필드별로 각 값은 model → provider → base/catalog → protocol 순서로 독립적으로 결정됩니다. URL/hostname은 compat 소스로 사용하지 않습니다. 모델 값은 해당 필드만 덮어씁니다. `Auto`는 현재 계층의 값을 삭제해 provider 상속을 복원하고 상속 체인의 다음 값을 사용합니다. provider 기본값은 해당 라우트의 모든 모델에 적용되며 모델 편집은 현재 모델만 변경합니다. 같은 라우트(provider)에서는 비어 있지 않은 `models[]`와 비어 있지 않은 `modelOverrides`를 함께 사용할 수 없습니다. 공식 schema는 이 잘못된 구성을 거부하며 플러그인은 비정상 데이터에서 fail closed로 동작합니다.

현재 DSH Settings API는 배열 인덱스 path op를 지원하지 않습니다. 따라서 `modelOverrides` 편집은 필드 단위 `set`/`unset`을 사용해 선택한 필드만 변경합니다. `models[]` 저장은 `providers.<route>.models` 전체를 하나의 배열 set으로 기록하며 다른 모델 항목, 알 수 없는 필드 및 다른 compat 필드를 보존합니다. 런타임 schema가 노출하지 않는 필드는 표시되지 않습니다. 이 값은 제어면 설정만 담당하며 네트워크 요청은 외부 transport가 처리합니다.

## 1. 공식 설치

최신 버전을 설치합니다.

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort
```

현재 릴리스 버전을 명시하여 설치합니다.

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.2.0
```

공식 CLI가 profile 의존성, lockfile 및 `dsh.profile.bundles`를 자동으로 업데이트합니다. YAML 행을 수동으로 추가하지 마세요.

## 2. 업데이트

registry의 최신 버전으로 업데이트합니다.

```bash
dsh plugin --profile <profile> update @hytime/dsh-thinking-effort
```

특정 버전으로 업데이트하려면 다음을 사용합니다.

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.2.0
```

Host 변경에는 DSH를 재시작하고 Client 변경에는 Web 페이지를 새로 고치세요.

## 3. 이전 패키지에서 마이그레이션

이전 설치에는 다음 의존성이 남아 있을 수 있습니다.

```text
dsh-thinking-effort
github:hytime/dsh-thinking-effort
```

이전 의존성이 남아 있으면 공식 명령을 사용하세요.

```bash
dsh plugin --profile <profile> remove dsh-thinking-effort
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.2.0
```

다른 도구로 의존성을 제거했지만 이전 bundle이 남아 있으면 composition을 확인합니다.

```bash
dsh --profile <profile> --dump-default-config
```

`name: dsh-thinking-effort`가 여전히 있으면 profile lockfile에서 이전 GitHub commit을 확인하고 공식 CLI로 다시 조정합니다.

```bash
dsh plugin --profile <profile> add github:hytime/dsh-thinking-effort#<old-commit>
dsh plugin --profile <profile> remove dsh-thinking-effort
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.2.0
```

새 bundle 목록에 이전 패키지 이름을 추가하지 마세요.

## 4. 설치 검증

의존성과 버전을 확인합니다.

```bash
grep -n "@hytime/dsh-thinking-effort" \
  "${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/package.json"
node -p "require('${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/node_modules/@hytime/dsh-thinking-effort/package.json').version"
```

이 릴리스의 버전은 `0.2.0`이어야 합니다.

## 일본어 및 한국어 지원 상태

DSH `0.1.2-alpha.1` 이상은 `LocaleRuntime`의 language-pack 확장을 지원합니다. 이 플러그인은 `ja`와 `ko`를 동적으로 등록하므로 DSH fork가 필요하지 않습니다. 고정된 내장 locale ID만 허용하는 이전 DSH에서는 `zh`와 `en`만 사용할 수 있습니다.


공식 composition을 확인합니다.

```bash
dsh --profile <profile> --dump-default-config
```

다음 항목이 포함되어야 합니다.

```yaml
- id: thinking-effort
  name: '@hytime/dsh-thinking-effort'
```

다음 이전 bundle 항목은 포함되지 않아야 합니다.

```yaml
name: dsh-thinking-effort
```

## 5. 설정 페이지 확인

DSH를 재시작하고 Web 페이지를 새로 고친 다음 **Settings → Model capabilities and effort**를 엽니다.

1. DSH `0.1.2-alpha.1` 이상에서는 언어 선택기에 `中文`, `English`, `日本語`, `한국어`가 표시됩니다. 고정된 내장 locale ID만 허용하는 이전 DSH에서는 `中文`과 `English`만 사용할 수 있습니다.
2. **Subagent default effort** 카드에 현재 기본값과 **Apply**가 표시됩니다.
3. **Quick settings**에서 공식 DeepSeek 방식 또는 일반 프리셋을 일괄 적용할 수 있습니다.
4. 제공자/모델 목록에서 검색, 펼치기/접기, 입력 기능, 컨텍스트 길이 및 모델 설정 버튼을 확인할 수 있습니다.
5. 오른쪽 아래 버전 표시가 `v0.1.14`로 표시됩니다.

Host 로드 마커는 다음 명령으로 확인할 수 있습니다.

```bash
cat "${DSH_HOME:-$HOME/.dsh}/thinking-effort-loaded.json"
```

## 6. 문제 해결

| 증상 | 조치 |
| --- | --- |
| `dsh`를 찾을 수 없음 | 공식 DSH CLI를 설치하거나 활성화하세요. 일반 npm 또는 pnpm 명령으로 profile 설치를 대신하지 마세요. |
| `dump-default-config`에 이전 패키지가 표시됨 | 이전 lockfile commit을 복원하고 공식 remove를 실행한 뒤 scoped 패키지를 추가하세요. |
| Host 플러그인이 로드되지 않음 | DSH를 재시작하고 `thinking-effort-loaded.json` 및 시작 로그를 확인하세요. |
| 설정 페이지가 표시되지 않음 | DSH를 재시작하고 페이지를 새로 고친 뒤 scoped bundle composition을 확인하세요. |
| 언어 선택이 저장되지 않음 | DSH locale service가 mount되어 있고 profile에 설정을 쓸 수 있는지 확인하세요. |
| 추론 강도 쓰기 실패 | `off`가 아닌 모든 단계에는 게이트웨이 값이 필요합니다. |
| `UNSUPPORTED_REASONING_EFFORT` 반환 | 대상 모델이 지원하는 강도를 선택하거나 제공자 기본값으로 복원하세요. |

## 릴리스 유지 관리

유지 관리자는 `package.json` 버전과 해당하는 모든 `CHANGELOG`를 업데이트하여 커밋한 뒤 일치하는 `v<version>` tag를 만듭니다. tag가 가리키는 커밋은 `main` 기록에 포함되어야 합니다. `publish.yml` workflow는 버전이나 CHANGELOG를 자동으로 변경하지 않습니다.

npm 패키지에 GitHub Trusted Publishing을 설정하세요. 저장소는 `hytime/dsh-thinking-effort`, workflow는 `publish.yml`입니다. 게시에는 GitHub OIDC와 provenance를 사용하고 `npm publish --provenance --access public`을 실행합니다. `NPM_TOKEN`이나 장기 token은 사용하지 않습니다. npm에 같은 버전이 이미 있으면 게시가 중단됩니다.

게시 전에 workflow는 rc7 → rc2 → alpha3 순서로 세 개의 임시 공식 DSH capability representative checkout을 만들고, 공식 `dsh plugin` 명령으로 현재 tarball을 설치한 뒤 실제 호환성 테스트를 실행합니다.

- `dsh-v0.1.0-rc.7` (`0.1.0-rc.7`) — rc7 capability representative
- `dsh-v0.1.1-rc.2` (`0.1.1-rc.2`) — rc2 capability representative
- `dsh-v0.1.2-alpha.3` (`0.1.2-alpha.3`) — alpha3 capability representative

일반 CI는 테스트 전용이며 Pull Request와 `main` 푸시에서 실행됩니다. `npm ci`를 사용하므로 의존성 변경 시 `package-lock.json`을 커밋하세요.

## 7. 제거

공식 명령을 사용합니다.

```bash
dsh plugin --profile <profile> remove @hytime/dsh-thinking-effort
rm -f "${DSH_HOME:-$HOME/.dsh}/thinking-effort-loaded.json"
```

profile composition에 scoped bundle이 더 이상 없는지 확인합니다.

```bash
dsh --profile <profile> --dump-default-config
```
