# 변경 로그

- [English / 中文](./CHANGELOG.md)
- [日本語](./CHANGELOG.ja.md)
- [한국어](./CHANGELOG.ko.md)

`@hytime/dsh-thinking-effort`의 각 공개 버전에 포함된 기능, 수정 사항 및 사용자 영향을 기록합니다.

버전 번호는 [Semantic Versioning](https://semver.org/)을 따릅니다.

## [Unreleased] - 게이트웨이 capability mapping 및 optional takeover

### 변경

- `version-map.ts`에서 DSH Runtime transport, Gateway compat 필드 및 takeover transport의 capability mapping을 통일하고, rc7은 `supportsDeveloperRole`/`maxTokensField`를 지원하지 않으며 rc8+는 지원함을 명시했습니다.
- rc7, rc2 및 alpha3 세 capability composition representative를 각각 로드하고 실제 호환성을 검증하는 테스트를 추가했습니다.
- 선택 사항인 `dsh-llm-openai-completions` takeover를 지원합니다. Gateway compat을 지원하는 runtime에서 대상이 사용자 지정 OpenAI 호환 사고 게이트웨이이고 transport가 활성화된 경우에만 적용됩니다.

## [0.1.13] - 호환성 범위 기반 검증

### 변경

- 호환성 어댑터의 버전 진단을 릴리스별 열거에서 범위 판정으로 변경하고, 게시 전 workflow가 각 범위에서 공식 대표 버전 하나만 선택하도록 했습니다.

## [0.1.12] - 공식 alpha.3 호환성 검증

### 변경

- 공식 DSH 호환성 검증 기준을 `dsh-v0.1.2-alpha.3`로 업데이트하고 이전 rc7 tag를 공식 `dsh-v0.1.0-rc.7`로 수정했습니다. Host/Client 런타임 동작은 변경되지 않았습니다.

## [0.1.11] - TypeScript 빌드 마이그레이션 및 버전 호환성

### 변경

- Host와 Client 런타임 코드를 TypeScript로 마이그레이션하고 빌드된 `lib/index.js`, `lib/client.js` 및 선언 파일을 게시합니다. 동작과 Settings 데이터 형식은 호환됩니다.
- 호환성 어댑터는 명시적인 버전 metadata 또는 테스트 입력을 지원하지만, 현재 DSH에는 공개된 semver metadata 계약이 없으므로 런타임 capability detection이 권위 있는 출처입니다. 알 수 없는 유효한 버전은 감지된 capability에 따라 실행하며 최신 및 이전 Settings API를 지원합니다.
- 알 수 없는 버전도 필요한 capability가 있으면 계속 실행합니다. capability가 부족하면 관련 기능을 사용할 수 없는 상태로 두며 지원되지 않는 `ja/ko` locale 항목도 숨깁니다.


### 수정

- 클라이언트 최상위에는 버전 간 안정적인 서비스(`slots`, `connection`, `locale`)만 하드 주입하고, 새 DSH에서는 `ctx.get`과 `internal/service`를 사용해 선택적인 Remote Settings service를 검색하며, 이전 버전에서는 계속 `connection.api.settings`로 fallback합니다.
- Remote provider가 없는 이전 버전도 선택적인 Remote 검색 때문에 pending 상태에 들어가지 않습니다.
- 외부 locale catalog가 없는 이전 DSH에서는 미등록 오류를 피하기 위해 설정 페이지에서 사용할 수 없는 `ja/ko` 항목을 숨깁니다.

## [0.1.9] - 새 DSH Remote 호환성 대응

### 수정

- DSH `0.1.2-alpha.1`의 `ctx.remote.settings`에 대응하고 이전 `connection.api.settings`도 fallback으로 유지합니다.
- 새 직접 `ClientResult`와 이전 RPC 래퍼 응답의 Settings 읽기 및 쓰기를 통합합니다.
- DSH language-pack 동적 등록에 맞춰 일본어 및 한국어 지원 설명을 갱신합니다.

## [0.1.8] - Subagent 추론 강도 주입 수정

### 수정

- `agent/request`를 전역 리스너로 등록하여 Subagent 요청을 확실히 처리하도록 수정했습니다.
- `llm-pi-ai` 설정 namespace가 늦게 등록될 때 `subagentEffort`가 오래된 캐시로 남는 문제를 수정하고 요청마다 현재 값을 읽도록 변경했습니다.
- 전역 이벤트 등록과 설정 실시간 읽기를 검증하는 Host 회귀 테스트를 추가했습니다.

## [0.1.7] - 일본어 및 한국어 현지화

### 추가

- 설정 페이지에 `日本語`와 `한국어`를 추가하고 中文과 English도 계속 지원합니다.
- 4개 locale 사전을 빌드 스크립트로 검증하고 클라이언트 bundle로 생성합니다.
- 일본어와 한국어 README, INSTALL, CHANGELOG를 추가하고 4개 언어 간 상호 링크를 제공합니다.

### 호환성

- 패키지 및 설정 페이지 버전을 `0.1.7`로 업데이트했습니다.
- Host 동작, `thinking-effort` Cordis composition 및 설정 Slot ID, 런타임 ID는 변경하지 않았습니다.
- 일본어와 한국어 전환에는 DSH 코어의 전역 locale ID가 필요합니다. 현재 기본 DSH에서는 이 두 선택 항목을 사용할 수 없습니다.

## [0.1.6] - English 문서를 기본 입구로 변경

- `README.md`와 `INSTALL.md`를 기본 English 문서 입구로 변경했습니다.
- 중국어 문서를 `README.zh.md`와 `INSTALL.zh.md`로 분리하고 명시적인 링크로 전환합니다.
- npm 패키지 파일 목록을 새 문서 이름에 맞게 업데이트했습니다.

## [0.1.5] - 설정 페이지 버전 표시 및 중영 UI

### 추가

- 설정 페이지 오른쪽 아래에 낮은 대비의 버전 표시를 추가했습니다.
- 저장된 DSH locale, 브라우저 언어 및 중국어 fallback을 사용하는 中文과 English 설정 페이지를 추가했습니다.
- locale 사전을 `src/locales/zh.json`과 `src/locales/en.json`으로 분리하고 게시 전에 bundle로 생성합니다.

### 수정

- settings schema 검증에 실패할 수 있던 배열 인덱스 모델 설정 쓰기를 수정했습니다.
- 라우트별로 `models`와 `modelOverrides`를 업데이트할 때 편집하지 않은 모델 필드를 보존합니다.
- 여러 라우트에서 일괄 프리셋이 값을 덮어쓰던 문제를 수정했습니다.
- 설정 페이지 새로 고침 후 Subagent 사용자 지정 전송 값이 사라지는 문제를 수정했습니다.
- 사용자 지정 값을 대상 모델이 지원하는 DSH 표준 단계로 매핑합니다.

### 호환성

- npm, 브라우저 loader, Host 및 Client ID를 `@hytime/dsh-thinking-effort`로 통일했습니다.
- Cordis composition 및 설정 Slot ID는 `thinking-effort`로 유지합니다.

### 문서

- 공식 DSH CLI 설치, 업데이트, 제거, 이전 패키지 마이그레이션 및 검증 절차를 추가했습니다.

## [0.1.4] - 런타임 ID 통일 및 설정 수정

- 모델 단계 쓰기, 프리셋 및 Subagent 사용자 지정 매핑 문제를 수정했습니다.
- scoped Client bundle과 DSH loader 등록 ID 불일치를 수정했습니다.
- 공식 플러그인 수명 주기와 이전 패키지 마이그레이션을 문서화했습니다.

## [0.1.3] - scoped 브라우저 bundle 등록 수정

- `__ModuleLoader__.load` 등록 ID를 `dsh-thinking-effort`에서 `@hytime/dsh-thinking-effort`로 변경했습니다.
- scoped npm 패키지 설치 후 Web 페이지가 플러그인을 로드하지 못하던 문제를 수정했습니다.
- 브라우저 bundle 등록 ID 회귀 테스트를 추가했습니다.

## [0.1.2] - scoped npm 패키지로 전환

- npm 패키지 이름을 `@hytime/dsh-thinking-effort`로 변경했습니다.
- `cordis.patch.yml`의 bundle 이름을 scoped 패키지 이름으로 업데이트했습니다.
- README와 INSTALL의 설치, mount 및 제거 명령을 업데이트했습니다.

## [0.1.1] - 첫 공개 릴리스 준비

- repository, homepage, bugs 및 public access를 포함한 npm 메타데이터를 정리했습니다.
- 사용 사례, 빠른 시작, 제한 사항 및 문제 해결을 포함하도록 README를 개선했습니다.
- GitHub와 npm 설치 경로를 추가했습니다.

## [0.1.0] - 최초 릴리스

- `reasoningEfforts`가 없는 타사 모델에 `off`, `high`, `max`를 추가했습니다.
- 모델별 단계와 게이트웨이 전송 값을 편집하는 설정 페이지를 추가했습니다.
- `high`를 `ultra`와 같은 게이트웨이 전용 값으로 매핑합니다.
- 일괄 추론 강도 프리셋을 추가했습니다.
- Subagent 기본 추론 강도를 설정할 수 있습니다.
