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

## OpenCode 세션 Header

OpenCode 세션 Header는 모델 편집기의 모델별 설정이며 provider 전체 설정이 아닙니다. 기본값은 꺼져 있습니다. 정확한 `provider/model`을 펼치고 대상 서비스가 `x-opencode-session`을 요구할 때만 **OpenCode 세션 Header**를 활성화하세요. 토글하면 즉시 저장되며 별도의 저장 버튼이 없습니다.

### 기본적으로 보내는 값

스위치를 켜고 `format`을 설정하지 않으면 Host는 OpenCode Zen의 정규 형태를 가지며 **현재 DSH 세션 ID에서 결정적으로 파생된** `x-opencode-session`을 보냅니다.

| 세그먼트 | 길이 | 출처 |
| --- | --- | --- |
| `ses_` | 4 | 고정 접두사 |
| 16진 타임스탬프 | 12 | 48비트 밀리초 타임스탬프. DSH 세션마다 한 번 주조(`time: firstUse`) |
| Base62 접미사 | 14 | 세션 ID를 정규화(`session-` 접두사 제거, 소문자화, 하이픈 제거)한 80비트 SHA-256 다이제스트 |

이로 얻는 보장:

- **세션 내에서 일정** — 같은 DSH 세션은 항상 같은 값을 보냅니다(세션별 스티키 캐시). 캐시 축출 시에도 첫 주조는 유지되므로, 축출된 세션을 다시 방문해도 같은 값을 얻습니다. 재개한 세션은 같은 14자리 접미사를 유지하며, `firstUse` 모드에서는 DSH 재시작 후 16진 타임스탬프만 다시 주조됩니다.
- **세션 간에 다름** — 각 subagent 실행이 독립적인 값을 파생하므로 여러 대화가 하나의 upstream 세션으로 뭉개지지 않습니다.
- **DSH 세션 ID에 바인딩** — 같은 세션 ID는 어떤 머신에서도 같은 접미사를 파생하며 저장된 값이 필요 없습니다.
- **형식 준수** — 결과가 `^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$`(총 30자)에 일치합니다.

### 생성기 설정

생성기는 DSH 설정 문서(예: `~/.dsh/settings.yaml` 또는 현재 profile의 설정)의 `dsh-thinking-effort.opencodeSession.format`에서 설정합니다.

```yaml
dsh-thinking-effort:
  opencodeSession:
    providers:
      opencode-go:
        models:
          deepseek-v4-flash: true
    format:
      mode: ses-derive
      time: firstUse
```

필드:

| 필드 | 값 | 기본값 | 의미 |
| --- | --- | --- | --- |
| `mode` | `ses-derive` / `passthrough` / `template` / `expression` / `script` | `ses-derive` | 스위치가 켜졌을 때 사용하는 생성기. 알 수 없는 값은 `ses-derive`로 폴백합니다. |
| `time` | `firstUse` / `hash` | `firstUse` | 12자리 16진 블록의 출처. `hash`는 세션 다이제스트에서 파생하여 캐시 없이 어떤 머신에서도 값이 완전히 같습니다. |
| `template` | 문자열 | `''` | `template` 모드: `{hex12}`, `{tail62}`, `{sessionId}`, `{rawSessionId}`, `{sha256}`, `{now}`, `{provider}`, `{model}` 플레이스홀더. |
| `expression` | 문자열 | `''` | `expression` 모드: 같은 컨텍스트를 쓰는 제한된 덧셈 표현식이며 `sha256`, `slice`, `lower`, `upper`도 제공합니다. 예: `'ses_' + hex12 + tail62`. |
| `script` | 절대 경로 | `''` | `script` 모드: `format(context)`를 내보내 header 값을 문자열로 반환하는 JS 파일(`.mjs` / `.cjs`). 파일이 바뀌면 핫 리로드(초당 최대 1회 확인). 로드·평가 실패 시 `ses-derive`로 폴백합니다. |
| `validate` | 정규식 소스 | `''` | 선택 검증. 비어 있으면 검사하지 않습니다. 내장 기본 형태는 `^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$`입니다. |
| `onInvalid` | `warn` / `drop` / `send` | `warn` | `validate`에 실패했을 때: 로그를 남기고 전송 / header 생략 / 조용히 전송. |

예시:

```yaml
# 명시적 정규 생성기(기본값과 동일)
format: { mode: ses-derive, time: firstUse }

# 어떤 머신에서도 완전히 결정적(hex 부분도 다이제스트 출처)
format: { mode: ses-derive, time: hash }

# 이전 동작: 원시 DSH 세션 ID
format: { mode: passthrough }

# 상류 개편 후의 템플릿
format: { mode: template, template: '{hex12}-{tail62}' }

# 상류가 '접두사 + 파생부'를 요구하는 경우의 표현식
format: { mode: expression, expression: "'ses_' + hex12 + tail62" }

# 임의의 향후 형식에 대한 외부 스크립트
format: { mode: script, script: '/절대/경로/session.mjs' }
```

`script` 파일은 같은 컨텍스트 객체를 받는 함수를 내보냅니다.

```js
// /절대/경로/session.mjs
export function format(ctx) {
  // ctx.hex12, ctx.tail62, ctx.sessionId, ctx.rawSessionId, ctx.now, ctx.provider, ctx.model
  return 'ses_' + ctx.hex12 + ctx.tail62
}
```

`format` 설정을 바꾸면 세션의 다음 요청에서 새 설정에 따라 다시 파생됩니다(세션별 캐시는 설정 지문을 키로 사용). Host 또는 플러그인 패키지를 변경한 뒤에는 DSH를 재시작하고 Settings 또는 Client를 변경한 뒤에는 Web 페이지를 새로 고친 다음 모델 요청을 확인하세요.

### 동작 참고

- adapter 또는 호출자가 이미 제공한 `x-opencode-session`은 유지되며 덮어쓰지 않습니다.
- 이 설정은 최신 Remote Settings transport와 이전 `connection.api.settings` transport를 모두 지원하며 route의 `api` 프로토콜은 변경하지 않습니다.
- 요청이 Sub2API, CPA 또는 다른 forwarding gateway를 통과한다면 `x-opencode-session`을 보존하여 OpenCode upstream으로 전달하는지 확인하세요. `llm-pi-ai.providers.<route>.headers.x-opencode-session`과 같은 정적 route 설정은 모든 대화가 같은 고정 값을 공유하므로 대체할 수 없습니다.

## OpenCode user-agent 재정의

`llm-pi-ai` adapter는 모든 provider 요청에 자체 attribution `user-agent`(`deepseek-harness/<버전> (+https://github.com/deepseek-ai/deepseek-harness)`)를 강제하고 같은 이름의 provider 설정 값을 제거합니다. 따라서 `llm-pi-ai.providers.<route>.headers.user-agent`는 효과가 없습니다. 이 플러그인은 일치하는 `llm/stream` 요청에서 전송 직전의 마지막 레이어에서 헤더를 다시 씁니다. 이것이 유일하게 살아남는 재정의 지점입니다.

`dsh-thinking-effort.opencodeSession.userAgent`에서 설정하며 기본값은 꺼져 있습니다.

```yaml
dsh-thinking-effort:
  opencodeSession:
    userAgent:
      value: "opencode/1.18.31 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14"
      providers:
        opencode-go:
          enabled: true              # 이 route의 모든 모델
        sundrawnewapi-private:
          value: "opencode/1.18.31"  # 선택적인 route별 값
          models:
            mimo-v2.5-free: true     # 정확한 모델 토글
```

| 필드 | 의미 |
| --- | --- |
| `userAgent.value` | 마스터 값이자 활성화 스위치. 비어 있거나 없으면 전체에서 꺼집니다. |
| `userAgent.providers.<route>.enabled` | `true`면 해당 route의 모든 모델에 적용됩니다. |
| `userAgent.providers.<route>.models.<model>` | `true`면 해당 정확한 모델에만 적용됩니다. |
| `userAgent.providers.<route>.value` | 선택적인 route별 값. 비어 있지 않으면 마스터 값보다 우선합니다. |

요청 하나의 해석 순서: route가 `enabled` 또는 정확한 모델 토글로 일치해야 하며, 다음으로 비어 있지 않은 route별 `value`, 없으면 마스터 `value`를 사용합니다. 일치하지 않는 요청은 DSH attribution `user-agent`를 유지하므로 명시적으로 선택한 route만 영향받습니다. 커스텀 provider는 설정한 route 이름을 그대로 키로 쓰면 되며 추가 등록이 필요 없습니다. 이 재정의는 같은 요청의 세션 Header와 함께 쓸 수 있고, 호출자가 명시적으로 지정한 `user-agent`도 덮어씁니다(adapter를 우회하는 것이 목적이므로).

Host 또는 플러그인 패키지를 변경한 뒤에는 DSH를 재시작하세요. 설정 자체는 설정 변경 시 다시 읽힙니다.

## 게이트웨이 호환성 설정

Settings의 provider 전역 영역에서는 해당 provider 아래 모든 모델의 `compat` 기본값을 수정합니다. 모델 하나를 펼치면 단일 모델 영역이 열립니다. 4개 그룹은 기본으로 접혀 있습니다.

| 그룹 | boolean 필드 (`Auto` / 지원 / 미지원) | enum 필드 (`Auto` / 구체적인 값) |
| --- | --- | --- |
| 역할 및 추론 | `supportsDeveloperRole`, `supportsReasoningEffort`, `supportsThinkingTokenBudget` | — |
| 형식 및 출력 | `requiresThinkingAsText`, `requiresReasoningContentOnAssistantMessages` | `thinkingFormat`: `openai`, `openrouter`, `deepseek`, `together`, `baseten`, `zai`, `qwen`, `chat-template`, `qwen-chat-template`, `string-thinking`, `ant-ling`; `maxTokensField`: `max_tokens`, `max_completion_tokens` |
| 스트리밍 및 도구 | `supportsUsageInStreaming`, `supportsFinishReason`, `requiresToolResultName`, `requiresAssistantAfterToolResult`, `supportsStrictMode` | — |
| 저장 및 캐시 | `supportsStore`, `supportsLongCacheRetention` | `cacheControlFormat`: `anthropic` |

프로토콜 지원 범위는 DSH 버전과 런타임 schema가 정한 최대 범위에 추가로 적용됩니다.

| 라우트 `api` | 이 플러그인의 15개 스칼라 필드 중 지원되는 필드 |
| --- | --- |
| `openai-completions` | 15개 필드 모두 |
| `openai-responses`, `azure-openai-responses`, `openai-codex-responses` | `supportsDeveloperRole`, `supportsStrictMode`, `supportsLongCacheRetention` |
| `anthropic-messages` | `supportsLongCacheRetention` |
| `bedrock-converse-stream` | `supportsStrictMode` |

알려진 프로토콜에서는 목록에 없는 필드를 UI에 표시하지 않으며 기록하지도 않습니다. 라우트에 인식 가능한 `api`가 없으면 런타임 schema와 DSH 검증을 최종 기준으로 사용합니다.

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

### 스냅샷 가져오기 신뢰 모델

스냅샷에는 추론 강도, 호환성 스위치, 세션 Header를 활성화하는 모델 등 **capability 설정**이 포함되며 머신 간에 안전하게 이동할 수 있습니다. 내보낸 파일에는 **배포 연결 설정**도 그대로 담깁니다. provider의 `baseURL`, `apiKeyEnv`, `headers`와 `opencodeSession.format.script`가 여기에 해당합니다. 가져올 때는 이 필드들이 기본적으로 보류되므로 다른 사람이 만든 파일이 요청을 다른 곳으로 보내거나, 상대방의 자격 증명 이름을 연결하거나, 원시 Header를 주입하거나, Host가 가져와 실행할 로컬 모듈을 지정할 수 없습니다. 다만 내보낸 파일은 `headers`에 둔 평문 token을 포함해 모든 값을 그대로 보관합니다. 공유하기 전에 반드시 내용을 확인하세요.

파일이 연결 설정을 변경하려고 하면 미리보기에 건너뛴 항목 수가 표시되고 **Also import endpoints and credentials (advanced)** 옵션이 제공됩니다. 이 옵션은 매번 꺼진 상태로 시작하며 이전 선택을 기억하지 않습니다. 경고에는 영향을 받는 각 route의 대상 엔드포인트가 표시되므로 동의하기 전에 요청 목적지를 확인할 수 있습니다.

롤백 복사본을 복원하거나 저장된 프로필을 적용할 때도 같은 규칙이 적용됩니다. 이전에 opt-in으로 연결 설정을 가져왔고 오래된 endpoint를 복원해야 한다면 해당 미리보기에서 다시 선택하세요.

## 1. 공식 설치

최신 버전을 설치합니다.

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort
```

현재 릴리스 버전을 명시하여 설치합니다.

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.3.1
```

공식 CLI가 profile 의존성, lockfile 및 `dsh.profile.bundles`를 자동으로 업데이트합니다. YAML 행을 수동으로 추가하지 마세요.

## 2. 업데이트

registry의 최신 버전으로 업데이트합니다.

```bash
dsh plugin --profile <profile> update @hytime/dsh-thinking-effort
```

특정 버전으로 업데이트하려면 다음을 사용합니다.

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.3.1
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
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.3.1
```

다른 도구로 의존성을 제거했지만 이전 bundle이 남아 있으면 composition을 확인합니다.

```bash
dsh --profile <profile> --dump-default-config
```

`name: dsh-thinking-effort`가 여전히 있으면 profile lockfile에서 이전 GitHub commit을 확인하고 공식 CLI로 다시 조정합니다.

```bash
dsh plugin --profile <profile> add github:hytime/dsh-thinking-effort#<old-commit>
dsh plugin --profile <profile> remove dsh-thinking-effort
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.3.1
```

새 bundle 목록에 이전 패키지 이름을 추가하지 마세요.

## 4. 설치 검증

의존성과 버전을 확인합니다.

```bash
grep -n "@hytime/dsh-thinking-effort" \
  "${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/package.json"
node -p "require('${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/node_modules/@hytime/dsh-thinking-effort/package.json').version"
```

이 릴리스의 버전은 `0.3.1`이어야 합니다.

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
5. 오른쪽 아래 버전 표시에 설치된 플러그인 버전이 표시됩니다.

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

게시 전에 workflow는 rc7 → rc2 → alpha2 → latest 순서로 네 개의 임시 공식 DSH capability representative checkout을 만들고, 공식 `dsh plugin` 명령으로 현재 tarball을 설치한 뒤 실제 호환성 테스트를 실행합니다.

- `dsh-v0.1.0-rc.7` (`0.1.0-rc.7`) — rc7 capability representative
- `dsh-v0.1.1-rc.2` (`0.1.1-rc.2`) — rc2 capability representative
- `dsh-v0.1.3-alpha.2` (`0.1.3-alpha.2`) — alpha2 capability representative
- `dsh-v0.1.6-alpha.1` (`0.1.6-alpha.1`) — 최신 capability representative(실제 브라우저 DOM 프로브도 실행)

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
