# dsh-thinking-effort

[DSH (DeepSeek Harness)](https://github.com/deepseek-ai/deepseek-harness)의 `llm-pi-ai` 수동 선언 모델에 추론 강도를 추가하고 Subagent의 기본 추론 강도를 설정하는 플러그인입니다.

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

> **호환성 경계:** DSH Runtime compatibility는 Settings transport만 담당합니다. 최신 DSH는 `remote.settings`를 제공하고 이전 DSH는 `connection.api.settings`를 제공합니다. 플러그인은 실제 런타임 capability를 감지하며, 이전 DSH에 Remote provider가 없어도 선택적인 Remote service를 필수로 요구하지 않습니다.
>
> Gateway Protocol compatibility는 별도 계층입니다. DSH schema가 제공하는 경우 15개의 일반적인 스칼라 `llm-pi-ai.compat` 필드를 지원합니다. 필드는 역할/추론, 형식/출력, 스트리밍/도구, 저장/캐시의 4개 그룹으로 나뉘며 기본으로 접혀 있습니다. boolean 필드는 `Auto`, 지원, 미지원으로 설정하고 enum 필드는 `Auto` 또는 구체적인 값으로 설정합니다. DSH `0.1.0-rc.7`에는 게이트웨이 호환 설정이 없습니다. `0.1.0-rc.8`부터 `<0.1.2-alpha.1`까지는 `supportsFinishReason`와 `supportsThinkingTokenBudget`가 없고, DSH `0.1.2-alpha.1` 이상은 schema가 지원하는 경우 15개 필드를 모두 제공합니다. 선택 사항인 `dsh-llm-openai-completions` transport를 설치하고 활성화하면 조건을 충족하는 사용자 지정 OpenAI 호환 사고 provider를 takeover할 수 있습니다. `Auto`는 현재 계층의 override를 unset하고 상속 체인의 다음 값을 복원합니다.
>
> DSH `0.1.2-alpha.1` 이상은 `LocaleRuntime`의 language-pack 확장을 지원합니다. 이 플러그인은 `ja`와 `ko`를 동적으로 등록하므로 DSH fork가 필요하지 않습니다. 고정된 내장 locale ID만 허용하는 이전 DSH에서는 `zh`와 `en`만 사용할 수 있습니다.
>
> 게시 패키지의 실행 진입점은 `lib/index.js`(Host)와 `lib/client.js`(Client)입니다. TypeScript 또는 locale 소스를 변경한 뒤 DSH를 실행하거나 패키지를 만들기 전에 `npm run build`를 실행하세요. 현재 DSH에는 공개된 semver metadata 계약이 없으므로 런타임 capability detection이 권위 있는 출처입니다. 선택적 버전은 명시적인 metadata 또는 테스트 입력이 있을 때만 사용하며, 알 수 없는 유효한 버전도 감지된 capability에 따라 계속 실행합니다. 최신 `remote.settings`와 이전 `connection.api.settings`를 모두 지원합니다.
>
> Host는 호스트가 제공하는 Settings `installSection`을 사용할 수 있으면 그것으로 플러그인 전용 `dsh-thinking-effort` namespace를 등록하고, 그렇지 않으면 이전 `register` 경로로 폴백합니다. `0.1.7` 이상의 entry-config 모델에서는 두 경로가 모두 존재하지 않으며, 설정 섹션은 내보낸 `Config`에서 제공됩니다. 런타임에 `@deepseek-ai/dsh-settings`에 의존하지 않으므로 `autoInstallPeers: false`로 설정된 DSH profile에서도 Cordis 런타임을 중복 도입하지 않고 깔끔하게 설치할 수 있습니다.

## DSH 버전 호환성

| DSH 범위 | 게이트웨이 호환 설정 |
| --- | --- |
| `0.1.0-rc.7` | 지원하지 않음 |
| `0.1.0-rc.8`부터 `<0.1.2-alpha.1`까지 | schema가 노출하는 경우 지원하지만 `supportsFinishReason` 및 `supportsThinkingTokenBudget`는 없음 |
| `0.1.2-alpha.1`부터 `<0.1.7-0`까지 | schema가 노출하는 경우 15개 필드 모두 지원. 상한 이상의 릴리스는 매핑되지 않으며, 플러그인은 계속 동작하면서 실행 중인 호스트가 보고하는 능력을 따릅니다 |

DSH `0.1.0-rc.8` 이후 지원 범위에서는 필드 사용 가능 여부가 런타임 schema 노출에 따라 결정됩니다. 위 표는 각 DSH 버전의 최대 필드 집합이며, 라우트의 프로토콜에 따라 더 줄어들 수 있습니다.

게이트웨이 호환 필드는 DSH 버전, 런타임 schema, 현재 라우트의 `api` 프로토콜이 모두 지원할 때만 설정할 수 있습니다. 지원하지 않는 필드는 UI에 표시되지 않으며 Settings에도 기록되지 않습니다. 이 15개 필드 중 `openai-completions`는 모두 제공하고, `openai-responses`, `azure-openai-responses`, `openai-codex-responses`는 `supportsDeveloperRole`, `supportsStrictMode`, `supportsLongCacheRetention`만 제공합니다. `api`가 없거나 인식되지 않으면 런타임 schema와 DSH 검증을 최종 기준으로 사용합니다.

DSH `0.1.7`부터는 각 Loader 항목 자체의 `Config` schema에서 설정 폼을 도출합니다(entry-config 모델). 이 schema를 내보내지 않는 플러그인에는 설정 폼이 나타나지 않습니다. 이 플러그인은 해당 schema를 내보내므로 `0.1.7` 이상에서 설정 섹션은 Loader 항목 ID인 `thinking-effort`가 됩니다. `0.1.0-rc.7`부터 `0.1.6`까지는 등록된 namespace `dsh-thinking-effort`를 그대로 사용하며, Client는 실행 중인 Host가 게시한 ID를 해석합니다. `subagentEffort`는 이 플러그인 자체 섹션에 저장되며, `0.1.7` 이상에서는 이전 `llm-pi-ai` 위치가 더 이상 폴백이 아닙니다. 그 섹션의 schema는 `providers`만 선언하므로 Host는 다른 경로 쓰기를 거부하고, 게시하는 사용자 계층에서 선언되지 않은 키를 제거합니다. 따라서 이전에 저장한 Subagent 기본값은 설정되지 않은 것으로 표시되며 플러그인 설정 카드에서 다시 선택해야 합니다. `0.1.7` 이전에 이 플러그인이 내보낸 스냅샷은 그 값을 여전히 `llm-pi-ai` 안에 담고 있고, 가져올 때 플러그인 자체 섹션으로 마이그레이션합니다. 같은 배치의 providers까지 함께 가져와지는 것도 이 마이그레이션 덕분입니다(volatile이 아닌 경로가 하나라도 있으면 Host는 배치 전체를 거부합니다). `0.1.7` 이상의 설정은 `~/.dsh/settings.yaml`이 아니라 현재 profile의 `cordis.patch.yml`에 저장됩니다(`0.1.7`은 이 파일을 더 이상 사용하지 않습니다).

## 왜 필요한가요?

`llm-pi-ai` 어댑터는 타사 모델을 수동으로 선언할 수 있지만, 모델에 `reasoningEfforts`가 없는 경우가 많습니다. 그러면 Composer에 추론 강도 선택기가 표시되지 않고, `ultra`와 같은 게이트웨이 전용 값을 DSH 표준 단계에 매핑할 수도 없습니다.

이 플러그인은 다음 설정 기능을 제공합니다.

- 직접 선언한 profile의 설정 없는 모델에 `off`, `high`, `max` 기본 항목을 추가합니다. 컴포지션 베이스나 스키마 기본값만 제공하는 모델은 보완하지 않고 건너뛴 개수를 Host 로그에 남깁니다.
- DSH 설정 페이지에서 모델별 추론 단계를 설정합니다.
- DSH의 `high`를 게이트웨이의 `ultra`와 같은 값으로 매핑합니다.
- 명시적인 요청 값을 유지하면서 Subagent 기본 추론 강도를 설정합니다.
- 기존 사용자 모델 설정을 변경하지 않습니다.

DSH 내장 모델만 사용하고 이미 추론 제어가 정상 작동한다면 이 플러그인은 보통 필요하지 않습니다.

## 식별자

| 식별자 | 용도 |
| --- | --- |
| `@hytime/dsh-thinking-effort` | npm 패키지, 브라우저 bundle, loader ID, Host/Client 런타임 ID |
| `thinking-effort` | Cordis composition entry ID 및 설정 Slot ID |

## 기능

| 기능 | 설명 |
| --- | --- |
| 기본 단계 | 사용자 레이어에서 선언한 모델에 한해 사용자 지정 값을 덮어쓰지 않고 `off`, `high`, `max` 추가. 베이스나 스키마 기본값만 제공하는 모델은 보완하지 않고 개수를 Host 로그에 기록 |
| 모델별 편집 | Settings에서 단계를 설정하고 catalog/modelOverrides와 `models[]` 항목의 게이트웨이 호환 값을 모두 편집 |
| 게이트웨이 호환 설정 | 15개의 일반적인 스칼라 필드를 provider 전체 또는 모델별로 설정하며, 역할/추론, 형식/출력, 스트리밍/도구, 저장/캐시로 나뉘고 기본으로 접혀 있음 |
| OpenCode 세션 Header | 정확한 모델에만 동적 `x-opencode-session`을 활성화합니다. 기본값은 DSH 세션에 묶인 결정적 `ses_` 값을 생성하며(template / expression / script 모드로 상류 형식 변경에 대응), 고정 Header 값을 저장하지 않습니다 |
| OpenCode user-agent 재정의 | provider/model(커스텀 route 포함) 단위로 `user-agent`를 다시 써서 상류 클라이언트를 흉내냅니다. route별 값도 설정 가능하며 기본값은 꺼져 있습니다 |
| 게이트웨이 값 매핑 | DSH에서 `high`를 선택하면 `ultra` 전송 가능 |
| 설정 백업 및 프로필 | 현재 설정을 JSON 파일로 내보내 이전에 활용하고, 이름 있는 프로필을 저장해 전환합니다. 가져오기 전에 병합 또는 교체를 선택하고 영향을 미리 확인합니다 |
| Subagent 기본값 | 명시적 값이 없는 요청에만 기본값 적용 |
| 다국어 설정 | 中文, English, 日本語, 한국어 사전 포함; 일본어/한국어 전환은 DSH language-pack 지원을 사용 |
| 버전 표시 | 설정 페이지 오른쪽 아래에 설치된 버전 표시 |

## 설치, 업데이트, 제거

profile은 공식 DSH CLI로 관리하세요. 일반 `npm install`은 DSH profile bundle을 등록하지 않습니다.

```bash
# 최신 버전 설치
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort

# 특정 버전 설치
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.3.2

# 업데이트
dsh plugin --profile <profile> update @hytime/dsh-thinking-effort

# 제거
dsh plugin --profile <profile> remove @hytime/dsh-thinking-effort
rm -f "${DSH_HOME:-$HOME/.dsh}/thinking-effort-loaded.json"
```

profile 확인, 마이그레이션, 검증 및 문제 해결은 [INSTALL.ko.md](./docs/INSTALL.ko.md)를 참조하세요.

## 빠른 사용

1. DSH에서 **Settings → Model capabilities and effort**를 엽니다.
2. 상단 **Page language** 선택기에서 `中文`, `English`, `日本語` 또는 `한국어`를 선택합니다. DSH는 저장된 locale, 브라우저 언어, English 순서로 fallback합니다.
3. **Subagent default effort** 카드에서 명시적인 값이 없는 요청에 사용할 기본값을 선택하고 **Apply**를 클릭합니다.
4. **Quick settings**에서 공식 DeepSeek 방식 또는 일반 프리셋을 모든 모델에 적용하거나, 제공자와 모델을 펼쳐 상세 설정을 엽니다.
5. 검색 필드에서 모델 이름 또는 ID로 필터링합니다. 모델 행에는 텍스트/이미지 입력 기능, 선언된 컨텍스트 길이 및 모델 설정 버튼이 표시됩니다.
6. 단계를 선택하고 게이트웨이에 보낼 값을 입력합니다.

   | DSH 단계 | 게이트웨이 값 |
   | --- | --- |
   | `off` | 비워 두어 매개변수 생략 |
   | `high` | `ultra` |
   | `max` | `max` |

7. 모델 편집기에서 `x-opencode-session`이 필요한 정확한 모델에만 **OpenCode 세션 Header**를 활성화합니다. 기본값은 꺼져 있으며 현재 DSH 세션에서 결정적 `ses_` 값을 생성하고 같은 route의 다른 모델이나 다른 provider에 상속하지 않습니다. 토글하면 즉시 저장되며 별도의 저장 버튼이 없습니다. 상류 형식이 바뀌면 [생성기 섹션](#opencode-세션-header-생성기)을 참고하세요.
8. Composer로 돌아가 설정한 모델을 선택하고 추론 선택기를 사용합니다.

설정 페이지 오른쪽 아래에는 `v0.1.14`과 같은 작은 버전 표시가 나타납니다.

### 게이트웨이 호환성 설정

provider의 `compat` 블록은 해당 provider 아래 모든 모델의 전역 기본값입니다. Settings 페이지에서는 15개 필드를 4개 그룹으로 나누고 기본으로 접어 둡니다. DSH 공식 YAML 형식으로 설정합니다.

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

필드별로 각 값은 model → provider → base/catalog → protocol 순서로 독립적으로 결정됩니다. URL/hostname은 compat 소스로 사용하지 않습니다. 모델 값은 해당 필드만 덮어씁니다. `Auto`는 현재 계층의 필드를 삭제해 provider 상속을 복원하고 상속 체인의 다음 값을 사용합니다. provider 기본값은 해당 라우트의 모든 모델에 적용되며 모델 편집은 현재 모델만 변경합니다. 같은 라우트(provider)에서는 비어 있지 않은 `models[]`와 비어 있지 않은 `modelOverrides`를 함께 사용할 수 없습니다. 공식 schema는 이 잘못된 구성을 거부하며 플러그인은 비정상 데이터에서 fail closed로 동작합니다.

Settings의 provider 전역 영역에서는 해당 provider 아래 모든 모델의 기본값을 수정합니다. catalog/modelOverrides 모델과 사용자 지정 YAML `models[]` 모델 모두 단일 모델 compat 편집기를 제공합니다. 전자는 `modelOverrides.<model>.compat`에서 대상 필드만 `set`/`unset`하고, 후자는 `providers.<route>.models` 전체를 하나의 배열 set으로 저장하며 다른 모델과 필드를 보존합니다. 모델 편집은 다른 모델에 영향을 주지 않습니다.

이 compat 값은 제어면 설정입니다. 게이트웨이 transport를 구현하거나 대체하지 않으며 네트워크 요청은 외부 transport가 담당합니다.

### OpenCode 세션 Header 생성기

모델 편집기에는 별도의 **OpenCode 세션 Header** 스위치가 있습니다. 기본값은 꺼져 있으며 `llm-pi-ai.compat`가 아니라 플러그인 전용 설정 섹션에 저장됩니다. `x-opencode-session`이 필요한 정확한 `provider/model`에만 활성화하세요. 같은 route의 다른 모델(GPT 모델 포함)에는 상속되지 않습니다. 토글하면 즉시 저장되며 별도의 저장 버튼이 없습니다. 모델을 다시 열면 저장된 값이 표시됩니다.

활성화했는데 `format`을 설정하지 않으면 Host는 `ses_` 정규 형태를 가지며 **현재 DSH 세션에서 결정적으로 파생된** 값을 보냅니다. `ses_` + 16진수 12자리(세션마다 한 번 주조되는 48비트 밀리초 타임스탬프) + Base62 14자리(정규화한 DSH 세션 ID의 80비트 SHA-256 다이제스트)입니다. 같은 DSH 세션은 항상 같은 값을 보냅니다. 값은 세션별로 유지되며, 크기가 제한된 값 캐시의 축출은 캐시 값만 버리고 첫 주조는 절대 버리지 않으므로 축출된 세션을 다시 방문해도 값이 바뀌지 않습니다. 16진수 타임스탬프가 다시 주조되는 것은 DSH 재시작 후의 `firstUse` 모드뿐입니다(`time: hash`는 완전히 무상태). 14자리 접미사는 저장 값이 아니라 파생 값이므로 DSH 재시작 후에도 안정적입니다. 다른 세션(각 subagent 실행 포함)은 서로 다른 값을 파생합니다.

생성기 매개변수는 설정 페이지의 **세션 값 생성기** 카드에서 조정하거나 설정 문서에 직접 작성할 수 있습니다. `0.1.7` 이상에서는 현재 profile의 `cordis.patch.yml`에 있는 `opencodeSession.format` 섹션(Loader 항목 ID `thinking-effort`로 지정)이고, `0.1.0-rc.7`부터 `0.1.6`까지는 `dsh-thinking-effort.opencodeSession.format`(예: `~/.dsh/settings.yaml`)입니다. 두 방식은 동일합니다. 상류 형식 변경에 플러그인 재빌드 없이 대응할 수 있는 4가지 모드를 제공합니다.

- `ses-derive`(기본값) — 위의 정규 생성기. `time: firstUse`는 세션마다 hex 부분을 한 번 주조하고, `time: hash`는 세션 다이제스트에서 파생해 어떤 머신에서도 값이 완전히 동일합니다.
- `passthrough` — 이전 동작: 원시 DSH 세션 ID를 보냅니다.
- `template` — `{hex12}`, `{tail62}`, `{sessionId}`, `{rawSessionId}`, `{sha256}`, `{now}`, `{provider}`, `{model}` 플레이스홀더가 있는 문자열.
- `expression` — 같은 컨텍스트를 쓰는 제한된 덧셈 표현식이며 `sha256`, `slice`, `lower`, `upper` 헬퍼도 제공합니다. 예: `'ses_' + hex12 + tail62`.
- `script` — `format(context)`를 내보내는 JS 파일의 절대 경로. 파일이 바뀌면 핫 리로드되며, 로드·평가 실패 시 `ses-derive`로 폴백합니다.

선택적인 `validate` 정규식과 `onInvalid: warn | drop | send`로 생성 값이 상류 최신 요구를 충족하는지 검증할 수 있습니다(기본값 `warn`). adapter 또는 호출자가 이미 제공한 `x-opencode-session`은 유지되며 덮어쓰지 않습니다. 이 설정은 `openai-completions`, `openai-responses` 또는 `anthropic-messages` 프로토콜을 선택하거나 변경하지 않습니다. 전체 설정 참조는 [INSTALL.ko.md](./docs/INSTALL.ko.md)를 참고하세요.

Sub2API, CPA 및 다른 forwarding gateway는 `x-opencode-session`을 보존하여 OpenCode upstream으로 전달해야 합니다. `llm-pi-ai.providers.<route>.headers.x-opencode-session`과 같은 정적 route Header는 대체 수단이 아닙니다. 모든 대화가 하나의 값을 공유하므로 대화별 라우팅과 prompt-cache affinity를 제공할 수 없습니다. Host를 변경한 뒤에는 DSH를 재시작하고 Settings 또는 Client를 변경한 뒤에는 Web 페이지를 새로 고치세요.

### OpenCode user-agent 재정의

일부 상류는 `user-agent` 헤더도 검사합니다. `llm-pi-ai` adapter는 모든 provider 요청에 attribution `user-agent`(`deepseek-harness/…`)를 강제하고 provider 설정의 같은 이름 헤더를 제거하므로 DSH를 통해서는 바꿀 수 없습니다. 이 플러그인은 전송 직전 마지막 레이어에서 다시 씁니다. provider/model 단위로 적용되며 기본값은 꺼져 있습니다. 아래 YAML은 `0.1.7` 이전 릴리스가 읽는 namespace 형태를 보여 줍니다.

```yaml
dsh-thinking-effort:
  opencodeSession:
    userAgent:
      value: "opencode/1.18.31 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14"
      providers:
        opencode-go:
          enabled: true              # route 전체
        sundrawnewapi-private:
          value: "opencode/1.18.31"  # 선택적인 route별 값
          models:
            mimo-v2.5-free: true     # 정확한 모델
```

- `value`가 주 스위치입니다. 비어 있거나 없으면 전체에서 꺼집니다.
- route의 `enabled`가 true(전체 모델)이거나 정확한 모델이 켜져 있으면 일치합니다. 커스텀 route는 provider 이름을 그대로 키로 씁니다.
- route 자체의 `value`가 주 `value`보다 우선합니다.
- 일치하지 않는 요청은 DSH attribution `user-agent`를 그대로 유지합니다.

위의 세션 Header와 같은 요청 계층에서 동작하므로 둘 다 켜면 상류 클라이언트를 완전히 흉내낼 수 있습니다. 전체 참조는 [INSTALL.ko.md](./docs/INSTALL.ko.md)를 확인하세요. Host 변경 후에는 DSH를 재시작해야 합니다.

### 설정 백업 및 프로필

**설정 백업 및 프로필** 카드는 언어 선택기와 **Subagent default effort** 카드 아래에 있으며, 현재 설정을 내보내고, 이름 있는 프로필을 저장해 전환하며, 이전에 내보낸 파일을 가져올 수 있습니다.

1. **현재 설정 내보내기**를 누르면 `dsh-config-<타임스탬프>.json` 파일이 다운로드됩니다. 파일에는 `llm-pi-ai` 사용자 레이어와 이 플러그인 자체 설정 섹션이 그대로 담깁니다(`0.1.0-rc.7`부터 `0.1.6`까지는 `dsh-thinking-effort`, `0.1.7` 이상에서는 Loader 항목 ID `thinking-effort`가 키입니다). 자격 증명 값은 내보내지 않습니다(provider가 보관하는 것은 키를 담은 환경 변수 이름 `apiKeyEnv`뿐입니다). 다만 이 섹션들의 값은 그대로 기록되므로 provider `headers`에 둔 평문 token도 그대로 남습니다. 파일을 안전하게 보관하세요.
2. **프로필 목록**에서 이름을 입력하고 **현재 설정 저장**을 누르면 현재 설정이 이름 있는 프로필로 저장됩니다. **내보내기**로 파일에 저장하며, **삭제**로 제거할 수 있습니다. 최대 20개까지 보관합니다. **적용**은 가져오기와 같은 미리보기를 열므로 기본값인 **병합**은 파일에 없는 provider를 남겨 둡니다. 완전히 되돌리려면 미리보기에서 **교체**를 선택합니다.
3. **설정 가져오기**의 **파일 선택…**을 누르면 **가져오기 미리보기**에 추가 / 덮어쓰기 / 삭제 건수가 표시됩니다. 확인하기 전에는 아무것도 기록되지 않습니다.
4. 가져오기의 기본값은 **병합**(파일에 없는 설정 유지)입니다. **교체**는 직접 선택해야 하며 파일에 없는 provider를 삭제합니다. **가져오기 실행**은 먼저 현재 설정을 **가져오기 전 자동 백업**으로 저장한 뒤 변경을 기록합니다. 되돌릴 때도 같은 미리보기를 사용합니다.

내보내기와 가져오기는 기존 Settings 채널을 그대로 사용하므로 최신 Remote Settings와 이전 `connection.api.settings`에서 모두 동작합니다. 결과에 재시작이 필요한 namespace가 표시되면 DSH를 재시작한 뒤 적용됩니다.

스냅샷을 가져올 때 기본적으로 capability 설정만 마이그레이션합니다. provider의 `baseURL`, `apiKeyEnv`, `headers` 및 `opencodeSession.format.script`는 로컬 배포 연결 설정이므로, 미리보기에서 **Also import endpoints and credentials (advanced)**를 명시적으로 선택한 경우에만 적용됩니다.

### 이전 설정 데이터 자동 마이그레이션

DSH 0.1.7은 `settings.yaml`의 이름을 바꾸고 한 번만 가져오는데, 그 이전 버전의 플러그인은 0.1.7에서 로드에 실패했기 때문에 이전에 설정한 사고 강도나 모델 스위치가 `settings.yaml.imported`에만 남아 있을 수 있습니다. 플러그인은 시작할 때 이 문서, 아직 이름이 바뀌지 않은 `settings.yaml`, 그리고 실행 중인 `llm-pi-ai` 사용자 레이어를 검사합니다. 이 플러그인이 소유한 값 중 사용자의 설정 섹션이 아직 선언하지 않은 것을 찾으면 설정 페이지 위에 확인 창을 띄웁니다. **마이그레이션**은 그 값들을 이 플러그인의 설정 섹션에 기록하고, **나중에**는 이 페이지 로드 동안만 질문을 미루며, **다시 묻지 않기**는 그 시점의 내용을 기록해 두고 이후 이전 데이터가 바뀔 때만 다시 묻습니다. **마이그레이션**을 선택하기 전에는 아무것도 기록되지 않으며, 마이그레이션은 아직 설정하지 않은 값만 채우므로 덮어쓰지 않습니다. 그 시점의 설정은 **설정 백업 및 프로필**의 롤백 슬롯(`autoBackup`, `sourceProfile: migration`)에 마이그레이션 값과 같은 쓰기 배치로 저장됩니다. 필요할 때 이전 데이터를 직접 확인하려면 **설정 백업 및 프로필** 카드의 **이전 데이터 다시 검사**를 사용하세요.

### 설정 페이지 구성

페이지 상단에는 언어 선택기가 있습니다. 그 아래의 **Subagent default effort** 카드는 명시적인 값이 없는 요청의 기본값을 관리합니다. **Quick settings**는 일괄 프리셋을 적용합니다. 제공자와 모델 목록은 펼치거나 접을 수 있으며, 각 모델 행에는 입력 기능, 컨텍스트 길이 및 게이트웨이 호환성 편집 영역이 표시됩니다. `models[]` 저장은 배열 인덱스 path op가 아니라 전체 배열 set을 사용합니다.

![한국어 Model capabilities and effort 설정 페이지](https://raw.githubusercontent.com/hytime/dsh-thinking-effort/main/docs/assets/screenshots/plugin-ko-settings-expanded.png)

전체 중영일한 화면은 [`docs/SCREENSHOTS.md`](./docs/SCREENSHOTS.md)에서 확인할 수 있습니다.


## 작동 방식

- **Host:** 시작 및 설정 변경 시 `llm-pi-ai`의 `models`와 `modelOverrides`를 검사하고 `reasoningEfforts`가 없는 경우에만 기본값을 추가합니다. 쓰기는 사용자 레이어에만 적용되므로, 직접 선언한 프로필의 모델만 보완됩니다. 컴포지션 베이스나 스키마 기본값만 제공하는 모델은 쓸 대상 항목이 없어 보완하지 않고, 건너뛴 개수를 Host 로그에 남깁니다. 또한 모델별 OpenCode 세션 설정을 읽고 일치하는 `llm/stream` 요청에만 `opencodeSession.format`에 따라 생성(기본값 `ses-derive`)한 `x-opencode-session`을 주입하며, `opencodeSession.userAgent`로 선택한 모델의 `user-agent`를 다시 씁니다(그 외에는 `llm-pi-ai` adapter의 attribution 헤더가 강제).
- **Client:** DSH Settings Remote(`ctx.remote.settings`)와 locale service로 설정 페이지를 등록합니다. 모델 편집기는 OpenCode 세션 Header를 전용 namespace에 저장하며 `llm-pi-ai.compat`와 분리합니다. 사전은 `src/locales/ja.json`, `src/locales/ko.json` 등에서 관리하고 게시 전에 클라이언트 bundle로 생성합니다.
- **Subagent:** `0.1.7` 이상에서는 이 플러그인 자체 설정 섹션에 `subagentEffort`를 저장합니다(`0.1.0-rc.7`부터 `0.1.6`까지는 `llm-pi-ai` 사용자 레이어). Host는 플러그인 자체 섹션을 먼저 읽고 `llm-pi-ai`로 폴백합니다. 후자에 값이 들어가는 것은 `0.1.7` 이전뿐입니다(entry-config의 `llm-pi-ai` 섹션은 `providers`만 선언하므로 그 사용자 레이어가 이 키를 담지 않습니다). `agent/request` waterfall은 명시적 값이 없는 요청에만 기본값을 추가합니다.
- **기본값 없음:** 플러그인은 `off`, `high`, `max`를 자동으로 선택하지 않습니다. `reasoning`을 생략하고 게이트웨이 기본 동작을 따릅니다.

## 제한 사항

- `llm-pi-ai`는 `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`의 7단계를 제공합니다.
- `off`가 아닌 단계에는 게이트웨이 값이 필요합니다. 빈 `off` 값은 매개변수를 생략합니다.
- Subagent 단계가 대상 모델에서 지원되지 않으면 게이트웨이가 `UNSUPPORTED_REASONING_EFFORT`를 반환할 수 있습니다.
- `off`와 설정되지 않은 추론 강도가 모두 `reasoning`을 생략할 수 있으며, 실제로 사고를 비활성화하는지는 게이트웨이 프로토콜에 달려 있습니다.
- Host 변경에는 DSH 재시작이 필요합니다. 설정과 언어 변경은 브라우저에서 적용됩니다.
- 프로필 목록과 가져오기 전 자동 백업은 플러그인 전용 설정 섹션에 저장되며 내보내기 파일에 포함되지 않습니다. 이름 있는 프로필을 다른 머신으로 옮기려면 하나씩 내보내 대상 머신에서 가져와야 합니다.

## CI 및 릴리스 유지 관리

- Pull Request와 `main` 푸시에서는 Node `22.19.0` 및 `24.x` 품질 매트릭스를 실행합니다.
- workflow는 `npm ci`를 사용하므로 의존성을 변경할 때 유지 관리자는 `package-lock.json`을 커밋해야 합니다.
- 일반 CI workflow는 npm에 게시하지 않습니다. `publish.yml`은 `v<version>` tag에서만 게시를 시작합니다.
- 릴리스 tag를 만들기 전에 유지 관리자는 `package.json` 버전과 각 언어의 `CHANGELOG`를 업데이트하여 커밋하고 일치하는 `v<version>` tag를 만듭니다. tag가 가리키는 커밋은 `main` 기록에 포함되어야 합니다.
- npm 패키지에 GitHub Trusted Publisher를 설정해야 합니다. 저장소는 `hytime/dsh-thinking-effort`, workflow는 `publish.yml`입니다. 게시에는 GitHub OIDC provenance가 포함되며 `NPM_TOKEN`이 필요하지 않습니다.
- 게시 전에 workflow는 rc7 → rc2 → alpha2 → namespace → entry 순서로 다섯 공식 DSH capability representative를 빌드하고 테스트합니다: `dsh-v0.1.0-rc.7` (`0.1.0-rc.7`), `dsh-v0.1.1-rc.2` (`0.1.1-rc.2`), `dsh-v0.1.3-alpha.2` (`0.1.3-alpha.2`), `dsh-v0.1.6-alpha.1` (`0.1.6-alpha.1`), `dsh-v0.1.7-alpha.1` (`0.1.7-alpha.1`). 공식 `dsh plugin` 명령으로 설치한 뒤 실제 호환성 테스트를 실행하며, 실제 브라우저 DOM 프로브는 `0.1.6-alpha.1`(namespace 모델)과 `0.1.7-alpha.1`(entry-config 모델) representative 모두에서 수행합니다.
- workflow는 버전이나 `CHANGELOG`를 자동으로 변경하지 않습니다. npm에 같은 버전이 이미 있으면 게시도 중단됩니다.

## 라이선스

[MIT](./LICENSE)
