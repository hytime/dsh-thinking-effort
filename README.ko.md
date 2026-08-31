# dsh-thinking-effort

[DSH (DeepSeek Harness)](https://github.com/deepseek-ai/deepseek-harness)의 `llm-pi-ai` 수동 선언 모델에 추론 강도를 추가하고 Subagent의 기본 추론 강도를 설정하는 플러그인입니다.

[![npm version](https://img.shields.io/npm/v/@hytime/dsh-thinking-effort)](https://www.npmjs.com/package/@hytime/dsh-thinking-effort)
[![npm downloads](https://img.shields.io/npm/dm/@hytime/dsh-thinking-effort)](https://www.npmjs.com/package/@hytime/dsh-thinking-effort)
[![GitHub license](https://img.shields.io/github/license/hytime/dsh-thinking-effort)](https://github.com/hytime/dsh-thinking-effort/blob/main/LICENSE)

- [English README](./README.md)
- [中文 README](./README.zh.md)
- [日本語 README](./README.ja.md)
- [한국어 README](./README.ko.md)
- [English installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [Changelog](./CHANGELOG.md) · [日本語](./CHANGELOG.ja.md) · [한국어](./CHANGELOG.ko.md)

> **호환성 안내:** DSH `0.1.2-alpha.1` 이상은 `LocaleRuntime`의 language-pack 확장을 지원합니다. 이 플러그인은 `ja`와 `ko`를 동적으로 등록하므로 DSH fork가 필요하지 않습니다. 고정된 내장 locale ID만 허용하는 이전 DSH에서는 `zh`와 `en`만 사용할 수 있습니다.
>
> 게시 패키지의 실행 진입점은 `lib/index.js`(Host)와 `lib/client.js`(Client)입니다. TypeScript 또는 locale 소스를 변경한 뒤 DSH를 실행하거나 패키지를 만들기 전에 `npm run build`를 실행하세요. 현재 DSH에는 공개된 semver metadata 계약이 없으므로 런타임 capability detection이 권위 있는 출처입니다. 선택적 버전은 명시적인 metadata 또는 테스트 입력이 있을 때만 사용하며, 알 수 없는 유효한 버전도 감지된 capability에 따라 계속 실행합니다. 최신 `remote.settings`와 이전 `connection.api.settings`를 모두 지원합니다.

## 왜 필요한가요?

`llm-pi-ai` 어댑터는 타사 모델을 수동으로 선언할 수 있지만, 모델에 `reasoningEfforts`가 없는 경우가 많습니다. 그러면 Composer에 추론 강도 선택기가 표시되지 않고, `ultra`와 같은 게이트웨이 전용 값을 DSH 표준 단계에 매핑할 수도 없습니다.

이 플러그인은 다음 설정 기능을 제공합니다.

- 설정이 없는 모델에 `off`, `high`, `max` 기본 항목을 추가합니다.
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
| 기본 단계 | 사용자 지정 값을 덮어쓰지 않고 `off`, `high`, `max` 추가 |
| 모델별 편집 | Settings에서 단계와 게이트웨이 값을 설정 |
| 게이트웨이 값 매핑 | DSH에서 `high`를 선택하면 `ultra` 전송 가능 |
| Subagent 기본값 | 명시적 값이 없는 요청에만 기본값 적용 |
| 다국어 설정 | 中文, English, 日本語, 한국어 사전 포함; 일본어/한국어 전환은 DSH language-pack 지원을 사용 |
| 버전 표시 | 설정 페이지 오른쪽 아래에 설치된 버전 표시 |

## 설치, 업데이트, 제거

profile은 공식 DSH CLI로 관리하세요. 일반 `npm install`은 DSH profile bundle을 등록하지 않습니다.

```bash
# 최신 버전 설치
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort

# 특정 버전 설치
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.11

# 업데이트
dsh plugin --profile <profile> update @hytime/dsh-thinking-effort

# 제거
dsh plugin --profile <profile> remove @hytime/dsh-thinking-effort
rm -f "${DSH_HOME:-$HOME/.dsh}/thinking-effort-loaded.json"
```

profile 확인, 마이그레이션, 검증 및 문제 해결은 [INSTALL.ko.md](./INSTALL.ko.md)를 참조하세요.

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

7. Composer로 돌아가 설정한 모델을 선택하고 추론 선택기를 사용합니다.

설정 페이지 오른쪽 아래에는 `v0.1.11`과 같은 작은 버전 표시가 나타납니다.

### 설정 페이지 구성

페이지 상단에는 언어 선택기가 있습니다. 그 아래의 **Subagent default effort** 카드는 명시적인 값이 없는 요청의 기본값을 관리합니다. **Quick settings**는 일괄 프리셋을 적용합니다. 제공자와 모델 목록은 펼치거나 접을 수 있으며, 각 모델 행의 입력 기능, 컨텍스트 길이 및 설정 버튼에서 추론 단계와 게이트웨이 값을 편집할 수 있습니다.

![영문 Model capabilities and effort 설정 페이지](https://raw.githubusercontent.com/hytime/dsh-thinking-effort/main/docs/assets/settings-model-capabilities-en.png)


## 작동 방식

- **Host:** 시작 및 설정 변경 시 `llm-pi-ai`의 `models`와 `modelOverrides`를 검사하고 `reasoningEfforts`가 없는 경우에만 기본값을 추가합니다.
- **Client:** DSH Settings Remote(`ctx.remote.settings`)와 locale service로 설정 페이지를 등록합니다. 사전은 `src/locales/ja.json`, `src/locales/ko.json` 등에서 관리하고 게시 전에 클라이언트 bundle로 생성합니다.
- **Subagent:** `llm-pi-ai` 사용자 레이어에 `subagentEffort`를 저장합니다. `agent/request` waterfall은 명시적 값이 없는 요청에만 기본값을 추가합니다.
- **기본값 없음:** 플러그인은 `off`, `high`, `max`를 자동으로 선택하지 않습니다. `reasoning`을 생략하고 게이트웨이 기본 동작을 따릅니다.

## 제한 사항

- `llm-pi-ai`는 `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`의 7단계를 제공합니다.
- `off`가 아닌 단계에는 게이트웨이 값이 필요합니다. 빈 `off` 값은 매개변수를 생략합니다.
- Subagent 단계가 대상 모델에서 지원되지 않으면 게이트웨이가 `UNSUPPORTED_REASONING_EFFORT`를 반환할 수 있습니다.
- `off`와 설정되지 않은 추론 강도가 모두 `reasoning`을 생략할 수 있으며, 실제로 사고를 비활성화하는지는 게이트웨이 프로토콜에 달려 있습니다.
- Host 변경에는 DSH 재시작이 필요합니다. 설정과 언어 변경은 브라우저에서 적용됩니다.

## CI 및 릴리스 유지 관리

- Pull Request와 `main` 푸시에서는 Node `22.19.0` 및 `24.x` 품질 매트릭스를 실행합니다.
- workflow는 `npm ci`를 사용하므로 의존성을 변경할 때 유지 관리자는 `package-lock.json`을 커밋해야 합니다.
- 일반 CI workflow는 npm에 게시하지 않습니다. `publish.yml`은 `v<version>` tag에서만 게시를 시작합니다.
- 릴리스 tag를 만들기 전에 유지 관리자는 `package.json` 버전과 각 언어의 `CHANGELOG`를 업데이트하여 커밋하고 일치하는 `v<version>` tag를 만듭니다. tag가 가리키는 커밋은 `main` 기록에 포함되어야 합니다.
- npm 패키지에 GitHub Trusted Publisher를 설정해야 합니다. 저장소는 `hytime/dsh-thinking-effort`, workflow는 `publish.yml`입니다. 게시에는 GitHub OIDC provenance가 포함되며 `NPM_TOKEN`이 필요하지 않습니다.
- 게시 전에 workflow는 공식 `dsh plugin` 명령으로 DSH `dsh-v0.1.2-alpha.1` (`0.1.2-alpha.1`), `dsh-v0.1.1-rc.2` (`0.1.1-rc.2`), `dsh-v0.1.0-rc.7` (`0.1.0-rc.7`)를 빌드하고 설치한 뒤 실제 호환성 테스트를 실행합니다.
- workflow는 버전이나 `CHANGELOG`를 자동으로 변경하지 않습니다. npm에 같은 버전이 이미 있으면 게시도 중단됩니다.

## 라이선스

[MIT](./LICENSE)
