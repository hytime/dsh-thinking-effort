# 변경 로그

- [English / 中文](./CHANGELOG.md)
- [日本語](./CHANGELOG.ja.md)
- [한국어](./CHANGELOG.ko.md)

`@hytime/dsh-thinking-effort`의 각 공개 버전에 포함된 기능, 수정 사항 및 사용자 영향을 기록합니다.

버전 번호는 [Semantic Versioning](https://semver.org/)을 따릅니다.

## [Unreleased]

### 수정

- 이전 버전에서 도입한 저장 재시도가 동시 변경을 버리는 문제를 수정했습니다. issue #16을 위해 추가한 "충돌 후 재시도"는 쓰기 작업을 그대로 재전송했지만, 모델 추론 강도·능력 쓰기는 패널을 열 때의 스냅샷에서 재구성한 `models` 배열 전체를 담습니다. 충돌 중 다른 쓰기가 같은 배열을 변경한 경우(호스트의 기본 강도 채우기가 모델을 추가했거나, 다른 창이 같은 라우트의 형제 모델을 편집한 경우), 재시도는 오래된 배열로 문서를 덮어써 상대의 결과를 조용히 삭제하거나 되돌렸습니다——원래의 "쓰기 거부"보다 나쁜 결과입니다. 이제 재시도는 단일 경로 쓰기(provider / 모델 compat 단일 필드, OpenCode 세션 스위치, `subagentEffort`)만 그대로 재전송하고, 컨테이너 전체를 담는 쓰기는 재시도 시 다시 읽은 섹션에서 재구성해야 합니다. 재구성 후 대상 모델이 없으면 성공한 척하지 않고 충돌로 보고합니다.

### 수정

- 설정 페이지 저장이 오래된 revision 때문에 영구히 막히는 문제를 수정했습니다(issue #16). 패널은 마운트할 때 revision을 한 번만 읽고 자신의 쓰기가 성공했을 때만 갱신했습니다. 외부 쓰기(기본 모델 전환, 호스트의 기본 강도 채우기, 다른 창)는 동기화되지 않으므로, 패널을 연 뒤 어디선가 한 번 쓰기가 발생하면 이후의 모든 "변경 사항 저장"이 `dsh-settings`에 의해 버전 충돌로 거부되었고 패널은 다시 읽지 않았습니다. 사용자에게는 "설정을 다시는 저장할 수 없다"로 보입니다. 충돌로 판정된 쓰기는 해당 섹션을 다시 읽고 한 번만 재시도하도록 했습니다. 단일 경로 쓰기(provider / 모델 compat 단일 필드, OpenCode 세션 스위치, `subagentEffort`)는 그대로 재전송하고, `models` 배열 전체를 담는 쓰기는 재시도 시 다시 읽은 섹션에서 재구성하므로 동시 변경이 덮어써지지 않습니다. 두 번째도 충돌하면 그대로 보고하여 충돌이 계속될 때 무한히 재시도하지 않습니다.
- 추론 강도를 `off`만 선택했을 때 "변경 사항 저장"을 눌러도 아무 반응이 없는 문제를 수정했습니다(issue #15). 이 구성은 `validateLevels()`가 거부하며(호스트도 `off`만 선언한 모델을 거부합니다), 거부는 페이지 제목 바로 아래, 즉 페이지 맨 위에만 배너를 그려서 아래 모델 카드에서 작업하는 사용자에게는 보이지 않았습니다. 버튼 상태도 바뀌지 않고 진행 표시도 없으며 요청도 전송되지 않아 "버튼이 작동하지 않는다"고 판단할 수밖에 없었습니다. 저장 버튼은 검증에 실패하면 비활성화되고, 이유("추론 강도를 하나 이상 선택하세요" 등)를 버튼 바로 아래에 표시합니다. 쓰기 경로와 버튼 표시 여부는 동일한 검증 함수를 공유하므로 "저장 가능 여부"에 대해 서로 어긋나지 않습니다.
- 중국어 UI에서 모델 메뉴의 공급자 제목이 영어로 표시되는 문제를 수정했습니다(issue #17). 제목은 공급자가 등록한 `displayName`을 그대로 렌더링했고, `deepseek-account`는 영어 `DeepSeek Account`를 등록하므로 플러그인이 DSH 대신 영어화하고 있었습니다. 로그인한 계정 경로는 공급자 id로 현지화 이름에 대응시킵니다(zh `DeepSeek 账号`, en `DeepSeek Account`, ja `DeepSeek アカウント`, ko `DeepSeek 계정`). DSH 기본 모델 메뉴와 같은 규칙입니다. 그 밖의 공급자(사용자가 선언한 게이트웨이 포함)는 등록된 이름을 그대로 유지합니다.
- 모델 좌석 패널과 모델 메뉴가 반투명하여 뒤의 텍스트가 그대로 비치는 문제를 수정했습니다(issue #14). 둘 다 `--dsw-specific-menu`를 사용했지만, 이 토큰은 DSH 코어의 58% 반투명 메뉴 재질이며 코어는 항상 `--dsw-menu-backdrop-filter`와 함께 사용합니다. 단독으로 쓰면 배경이 없어 패널 뒤의 강도 라벨이 그대로 비쳐 보였습니다. 불투명하고 테마를 따르는 표면 토큰 `--dsw-alias-bg-layer-1`(패널)과 `--dsw-alias-bg-layer-2`(그 위에 뜨는 메뉴)로 변경했습니다. 두 토큰 모두 지원되는 모든 DSH 릴리스(0.1.0-rc.7 이상)에서 `body`에 선언되므로 흐림 효과나 코어 내부 속성에 의존하지 않습니다.
- 추론 등급 눈금자가 슬라이더와 일치하지 않고 슬라이더가 양 끝까지 도달하지 못하는 문제를 수정했습니다. 눈금자 행은 flex로 균등 분배되었고 점(pip)은 `i/(n-1)` 기준으로 배치되어, 첫눈과 마지막 눈금자가 각각 반 칸 안쪽으로 어긋나 있었습니다. 이제 두 행이 같은 분수를 읽고 절대 위치로 배치됩니다. 더 근본적으로, 네이티브 range의 thumb는 트랙 안에 통째로 있어야 하므로 중심이 thumb 절반 폭에서 전체 폭을 뺀 thumb 절반 폭 사이에서만 움직일 수 있고, 따라서 양 끝에 도달하지 못했습니다(실측 중심 오차 −3.5~−21.5px). 이제 트랙, 채움, 눈금자 행을 모두 thumb의 절반만큼 안쪽으로 물려 오차가 1px 이내가 되었습니다. 안쪽으로 물리는 것은 padding이 아니라 margin입니다. 절대 위치 자식의 `left: N%` 기준은 포함 블록의 padding box이므로 부모의 padding으로는 전혀 움직이지 않으며, padding을 쓰면 각 눈금자가 여전히 자기 점에서 2~3px 어긋나 있었습니다. 양 끝 눈금자는 각자 바깥쪽 변으로 자신이 속한 점의 바깥쪽 경계에 붙이고 텍스트는 안쪽으로 펼칩니다. 끝의 점은 9px(18px thumb의 절반, 브라우저의 하한)만 안쪽에 있는데 "Max"의 반폭은 12.2px라서 가운데 정렬하면 콘텐츠 영역을 3.2px 넘고, 패널의 여백은 이 비교에서 상쇄되며 글자를 줄여도 9.6px가 필요해 호스트가 정의한 최소 단계보다 작아집니다.
- 모델 메뉴의 그룹 제목이 붙어 있을 때 반투명해지고 그룹을 펼칠 때 행 끝 셰브론이 어긋나는 문제를 수정했습니다. 제목은 애초에 붙어 있지 않아 긴 목록을 스크롤하면 프로바이더 이름이 사라졌고, `background` 단축 속성이 불투명한 배경을 흰색 8% 토큰(`#ffffff14`)으로 대체해 아래 옵션이 비쳐 있었습니다. 이제 제목은 메뉴 자체 여백만큼 오프셋해 붙습니다(`top: 0`은 스크롤포트, 즉 메뉴의 padding box에 고정되므로 메뉴 자신의 여백이 덮이지 않은 채 남습니다), hover 색은 배경을 대체하지 않고 `background-image`로 그 위에 얹습니다. 그룹을 펼치면 목록이 길어지고 Windows의 클래식 스크롤바가 레이아웃 폭을 차지해 콘텐츠 박스가 좁아지며 모든 행의 끝 셰브론이 왼쪽으로 어긋났지만, `scrollbar-gutter: stable`로 폭을 고정했습니다. 메뉴는 호스트의 스크롤바 토큰도 채택해 스크롤바가 페이지가 아니라 메뉴의 일부로 읽히게 했습니다.
- 컴포저 좌석 패널과 모델 메뉴를 DSH 전체 디자인에 맞춥니다. 패널 여백은 공식 컴포저 부동면과 같은 12px가 되고, 두 부동면 모두 `--dsw-radius-lg`로 둥글게 만듭니다(이전에 8px와 6px였고 6px는 호스트의 모서리 단계에 없습니다). 메뉴와 패널은 같은 여백 토큰을 읽습니다. 절대 위치 자식의 inset은 부모의 padding box 기준으로 해석되므로, 하드코딩된 16px는 메뉴를 콘텐츠 가장자리보다 4px 안쪽에 가두었습니다. 패널은 호스트의 콘텐츠 스케일(`dsh-client-ui-theme`이 `body`에 선언)에서 글자 크기를 읽으므로 설정의 글자 크기 설정을 따릅니다. 메뉴 셀은 34px 가운데 정렬 행, 그룹 제목은 16px 행 높이에 11px·굵기 500으로 공식 모델 메뉴에 맞춥니다. 모델 행의 포커스 테두리는 `:focus-within`에서 버튼 자체의 `:focus-visible`로 좁혔습니다(전자는 마우스 입력에서도 발생해 행 전체에 테두리가 생겨 입력창처럼 보였습니다). 모델 행의 셰브론은 두 번째 단계 메뉴가 열려 있는 동안 위로 뒤집힙니다.

## [0.3.3] - 2026-09-23

### 수정

- 새 기능의 버튼 스타일을 수정했습니다. 시작 시 확인 창의 버튼 세 개와 설정 페이지의 「이전 데이터 다시 검사」가 테마가 적용되지 않은 기본 버튼으로 렌더링되어 옆의 동등한 버튼과 뚜렷이 달랐습니다. 이제 이 플러그인 자체의 버튼 프리미티브(높이 28px, 모서리 반경 8px, 중요도에 따른 구분: 마이그레이션이 채워진 기본 동작, 「다시 묻지 않기」가 일반, 「나중에」가 테두리 없음)를 사용하며, 확인 창은 DSH 자체의 대화 상자 표현(반경 24px, 흐림 마스크, 동일한 제목 위계)에 맞추고 후보 행은 고정폭 글꼴로 출처 라벨을 함께 표시합니다.

## [0.3.2] - 2026-09-23

### 변경

- 게시 전 호환성 매트릭스에 `dsh-v0.1.7-alpha.1`(entry-config 설정 모델)을 다섯 번째 공식 capability representative로 추가했습니다. 0.1.7 루트에서는 플러그인이 실제로 로드되는지, 설정 섹션이 게시되는지, 그리고 호스트의 세 가지 동작(`llm-pi-ai`의 `providers`가 volatile로 유지되는지, 경로 쓰기가 사용자 원본 레이어에서 파생되는지, 기본값 보완 자체의 쓰기가 디스크에 반영되는지)을 검증합니다.
- 0.1.7에서 기본값 보완이 다시 쓸 수 없던 문제를 수정했습니다. 이 릴리스는 설정 변경 이벤트를 쓰기 트랜잭션 내부에서 발생시키므로 리스너에서 쓰기를 시작하면 Host가 `HMR transactions cannot be nested`로 거부하고, 그 트랜잭션 컨텍스트는 `AsyncLocalStorage`를 통해 지연 실행으로도 전파됩니다. 이제 보완은 플러그인 적용 시점에 만든 실행 컨텍스트에서 쓰기를 시작하므로, 모델을 추가해도 재시작 없이 기본 추론 강도가 채워집니다.
- 기본값 보완은 이제 사용자 레이어에만 씁니다. 컴포지션 베이스나 스키마 기본값만 제공하는 모델은 보완하지 않습니다(0.1.7의 entry-config 설정 서비스는 해석된 하위 트리를 그대로 디스크에 기록하므로, 그런 모델을 보완하면 `input`, `compat`, `headers`, `thinkingBudgets`, `defaultContextWindow` 같은 스키마 기본값이 설정 문서에 고정됩니다). 건너뛴 개수는 Host 로그에 남습니다.

### 추가

- 설정 페이지에 「세션 값 생성기」 카드를 추가했습니다. UI에서 `opencodeSession.format`의 모든 필드(생성 모드, 타임스탬프 원본, 템플릿 / 표현식 / 스크립트 경로, 검증 정규식, 검증 실패 시 동작)를 읽고 쓸 수 있으므로 설정 문서를 직접 편집할 필요가 없습니다. 카드는 현재 모드에서 쓰는 필드만 표시하고 쓰기 전에 검증합니다. 잘못된 정규식, 빈 템플릿 / 표현식 / 스크립트, 상대 스크립트 경로, 해석할 수 없거나 존재하지 않는 이름을 참조하는 표현식은 이유와 함께 거부됩니다. 이런 값은 호스트 쪽에서 조용히 폴백하므로(정규식은 '검증 없음', 나머지는 파생 값) UI에서 보이지 않으면 오해를 부릅니다. 표현식 검증은 호스트와 같은 파서를 공유합니다. 쓰기는 필드 단위로 이루어지므로 같은 namespace의 다른 설정을 덮어쓰지 않습니다.

- DSH 0.1.7의 entry-config 설정 모델을 지원합니다. 플러그인이 루트 `.volatile()` `Config`를 내보내면서 해당 릴리스에서 설정 폼이 표시됩니다(이전에는 0.1.7에서 `register is missing`으로 로드에 실패했습니다). `0.1.7` 이상의 설정 섹션은 Loader 항목 ID `thinking-effort`이고, `0.1.0-rc.7`부터 `0.1.6`까지는 등록된 namespace `dsh-thinking-effort`를 그대로 사용하며, Client는 실행 중인 Host가 게시한 쪽을 해석합니다. `subagentEffort`는 이 플러그인 자체 설정 섹션으로 옮겨졌습니다. 0.1.7에서는 이전 `llm-pi-ai` 위치를 읽을 수도 쓸 수도 없습니다(그 schema는 `providers`만 선언하므로 다른 경로 쓰기는 배치 전체가 거부되고, 사용자 계층에서도 선언되지 않은 키가 제거됩니다). 따라서 업그레이드 전에 저장한 기본값은 설정되지 않은 것으로 표시되며 플러그인 설정 카드에서 다시 선택해야 합니다. 이전 스냅샷을 가져오면 이 키가 `llm-pi-ai`에서 플러그인 자체 섹션으로 마이그레이션되어, 같은 배치의 providers까지 함께 가져올 수 있습니다. 설정은 `~/.dsh/settings.yaml`이 아니라 현재 profile의 `cordis.patch.yml`에 저장됩니다(`0.1.7`은 이전 파일의 이름을 바꾸고 가져오기를 시도하지만, 이 섹션에서는 그 가져오기가 경고만 남기고 거부되어 값은 `settings.yaml.imported`에만 남습니다).

- 이전 데이터 자동 감지 및 마이그레이션을 추가했습니다. DSH 0.1.7은 `settings.yaml`의 이름을 바꾸고 한 번만 가져오는데, 이전 버전의 플러그인은 그 릴리스에서 로드에 실패했기 때문에 그동안 설정한 사고 강도와 모델 스위치는 `settings.yaml.imported`에만 남아 있습니다. 이제 플러그인은 시작할 때 이 파일(아직 이름이 바뀌지 않은 `settings.yaml`과 실행 중인 `llm-pi-ai` 사용자 레이어 포함)을 검사하고, 마이그레이션할 항목을 찾으면 설정 페이지 위에서 확인을 요청하며, 사용자가 승인한 뒤에만 이전 데이터 값을 플러그인 자체 설정 섹션에 기록합니다. 마이그레이션은 아직 설정하지 않은 값만 채우고 절대 덮어쓰지 않습니다. 기록하기 전에 그 시점의 설정을 「설정 백업 및 프로필」의 롤백 슬롯(`autoBackup`, `sourceProfile: migration`)에 저장하며, 스냅샷과 마이그레이션 값은 같은 쓰기 배치로 기록되므로 '스냅샷만 있고 마이그레이션은 없는' 중간 상태가 생기지 않습니다. 「다시 묻지 않기」를 선택한 뒤에는 이전 데이터가 바뀔 때만 다시 묻습니다.

### 수정

- 실제 호스트에서만 드러나는 두 가지 문제를 수정했습니다. 마이그레이션 성공 후 확인 창이 닫히지 않는 문제(호스트가 반영하기 전의 읽기가 확인을 다시 열었고, 다시 열린 뒤에는 폴링하지 않아 오래된 후보와 활성 버튼이 화면에 남았습니다), 그리고 재시작 시 이미 마이그레이션된 값을 다시 제안하는 문제(플러그인 자체 섹션이 게시되기 전에 검사하여 `declared()`가 보는 사용자 레이어가 비어 있었고, 전체가 미이행으로 간주되었습니다).
## [0.3.1] - 2026-09-19

### 추가

- 설정 가능한 OpenCode 세션 Header 생성기(`opencodeSession.format`)를 추가했습니다. 스위치를 켜고 `format`을 설정하지 않으면 Host는 OpenCode Zen 정규 형태의 결정적 `ses_` 값을 보냅니다: `ses_` + 16진수 12자리(세션마다 한 번 주조되는 48비트 밀리초 타임스탬프) + Base62 14자리(정규화한 DSH 세션 ID의 80비트 SHA-256 다이제스트). 같은 DSH 세션 내에서 값이 일정하고, 다른 세션(각 subagent 실행 포함)마다 다르며, 14자리 접미사는 DSH 재시작 후에도 안정적입니다. 상류 형식 변경에 대응하기 위해 `ses-derive` / `passthrough` / `template` / `expression` / `script` 4가지 모드, `time: firstUse | hash` 타임스탬프 출처, `validate` / `onInvalid` 검증을 설정 문서만으로 변경할 수 있으며 코드 수정이나 재빌드가 필요 없습니다.
- provider/model 단위 `user-agent` 재정의(`opencodeSession.userAgent`)를 추가했습니다. `llm-pi-ai` adapter가 attribution `user-agent`를 강제하고 provider 설정 값을 제거하므로, 이 플러그인은 전송 직전 마지막 레이어에서 헤더를 다시 씁니다. route 단위 `enabled`, 모델 단위 토글, 선택적 route별 `value`(마스터 값보다 우선)를 지원하며 기본값은 꺼져 있고 일치하지 않는 요청은 DSH attribution 헤더를 유지합니다.

### 변경

- `x-opencode-session`의 기본값이 「원시 DSH 세션 ID」에서 「상류 준수 파생 `ses_` 값」으로 바뀌었습니다. 이전 동작이 필요하면 `format: { mode: passthrough }`를 명시적으로 설정하세요.

### 보안

- 설정 스냅샷을 가져올 때 provider의 `baseURL`, `apiKeyEnv`, `headers` 및 `opencodeSession.format.script`를 기본으로 적용하지 않도록 변경했습니다. 이 값들은 로컬 배포 연결 설정이므로 다른 사람이 만든 파일을 가져와도 요청 목적지를 바꾸거나 Host가 실행할 로컬 모듈을 지정할 수 없습니다. 미리보기에는 건너뛴 항목 수가 표시되며, 기본적으로 꺼져 있고 가져올 때마다 초기화되는 opt-in 스위치를 제공합니다(issue #11).

## [0.3.0] - 2026-09-16

### 추가

- 「설정 백업 및 프로필」을 추가했습니다. `llm-pi-ai`와 `dsh-thinking-effort` 두 namespace의 사용자 레이어를 JSON 파일로 내보내 다른 머신이나 재설치 후 가져와 복원할 수 있습니다. 설정 페이지에서 이름 있는 프로필을 여러 개 저장하고 전환할 수도 있습니다. 가져오기는 추가 / 덮어쓰기 / 삭제 건수 미리보기를 표시하며, 기본값은 「병합」(파일에 없는 provider 유지)이고 미리보기에서 「교체」(파일 내용 기준)로 바꿀 수 있습니다. 첫 쓰기 전에는 롤백용 가져오기 전 스냅샷을 자동으로 저장하고, 재시작이 필요한 적용은 대상 namespace를 표시합니다. 기존 Settings 채널을 재사용하므로 최신 Remote Settings와 이전 `connection.api.settings`에서 모두 동작하며 새로운 의존성이 없습니다.

### 변경

- 호환 계층의 버전 상한을 `<0.1.6-0`에서 `<0.1.7-0`으로 올렸습니다. 공개된 DSH `0.1.6-alpha.1`을 항목별로 확인한 결과 기존 modern 능력 범위(modern Settings transport, `describe()`가 반환하는 `user` 원본 레이어, 15개 게이트웨이 호환 필드, 외부 language pack, 선택적 takeover)에 속하므로 더 이상 매핑되지 않은 버전으로 취급되지 않습니다.
- 게시 전 호환 매트릭스는 최신 capability representative를 `dsh-v0.1.5-rc.2`에서 `dsh-v0.1.6-alpha.1`로 올리고, `dsh-v0.1.0-rc.7`, `dsh-v0.1.1-rc.2`, `dsh-v0.1.3-alpha.2`와 함께 빌드하여 공식 설치와 실제 호환성 검사를 수행합니다. 실제 브라우저 DOM 프로브는 이제 `0.1.6-alpha.1`에서 실행됩니다.

## [0.2.4] - 2026-09-11

### 수정

- 공급자를 접었을 때 「모델 능력 및 단계」 페이지에서 해당 공급자의 게이트웨이 호환성 세부 패널과 저장 버튼이 계속 표시되던 문제를 수정했습니다. 호환 패널도 모델 행과 동일한 `providerOpen` 게이트를 따르므로 공급자를 접으면 패널 전체가 숨겨집니다. 저장되지 않은 호환성 초안은 다시 펼치면 복원되며 손실되지 않습니다 ([#7](https://github.com/hytime/dsh-thinking-effort/issues/7)).
- 호환 계층의 버전 매핑이 공개된 DSH `0.1.5`를 포함합니다. `0.1.5-rc.1` / `0.1.5-rc.2`는 기존 modern 능력 범위(modern Settings transport, 15개 게이트웨이 호환 필드, 외부 language pack, 선택적 takeover)에 속하며 더 이상 알 수 없는 버전으로 취급되지 않습니다. 최신 범위보다 새로운 릴리스는 매핑되지 않은 상태로 유지되어 호스트가 실제로 노출하는 능력을 따르고 런타임 능력 감지로 폴백하므로 takeover가 조용히 비활성화되지 않습니다.
- 게시 전 호환 매트릭스에 네 번째 공식 representative `dsh-v0.1.5-rc.2`를 추가하여 `dsh-v0.1.0-rc.7`, `dsh-v0.1.1-rc.2`, `dsh-v0.1.3-alpha.2`와 함께 빌드하고 공식 설치와 실제 호환성 검사를 수행합니다. 실제 브라우저 DOM 프로브는 최신 representative에서 실행하며, 새 호스트의 온보딩(작업 공간 대화상자가 나타나지 않을 수 있음)에도 적응시켰습니다 ([#9](https://github.com/hytime/dsh-thinking-effort/issues/9)).

## [0.2.3] - 2026-09-09

### 변경

- OpenCode 세션 Header 스위치가 토글 즉시 저장되도록 변경했습니다. 스위치를 켜거나 끄면 바로 `dsh-thinking-effort` Settings namespace에 기록되며 별도의 저장 버튼이 필요 없습니다. 저장 버튼과 저장되지 않음 표시는 UI에서 제거되었고, 모델을 다시 열면 저장된 값이 표시됩니다.

## [0.2.2] - 2026-09-09

### 추가

- 모델별 OpenCode 세션 Header 스위치를 추가했습니다. 기본값은 꺼져 있으며 정확한 `provider/model`에만 현재 DSH `sessionId`를 `x-opencode-session`으로 동적으로 전송합니다. 고정 값은 저장하지 않고 같은 route의 GPT 등 다른 모델에도 상속하지 않습니다. 기존 `x-opencode-session`은 유지하며 덮어쓰지 않습니다. 이 설정은 최신 Remote Settings와 이전 `connection.api.settings` Settings transport를 모두 지원합니다.
- Sub2API/CPA 전달, 정적 route Header의 제한, `api` 프로토콜을 변경하지 않는 동작, Host 재시작 및 Web 새로 고침 요구 사항을 문서화했습니다.

### 수정

- 배포 패키지는 런타임에 `@deepseek-ai/dsh-settings`에 의존하지 않습니다. Host는 호스트가 제공하는 Settings `installSection` 또는 이전 `register`를 직접 사용합니다. 이로써 `autoInstallPeers: false` DSH profile에서 Cordis 런타임이 중복 설치되고 peer 해석에 실패하는 문제를 방지합니다.

## [0.2.1] - 2026-09-08

### 추가

- Web runtime이 `modelDirectories`를 제공하면 Composer에 선택적 `seat`를 등록하고 현재 `provider/model`의 Host 해석 `reasoning.efforts`를 이산 추론 강도로 표시합니다. `defaultEffort`가 없는 모델은 「모델 기본값 따르기」를 선택할 수 있으며 Host light/dark theme token을 따릅니다.
- 중국어, 영어, 일본어, 한국어 Settings, Composer, 모델 그룹 접기, 모델 검색 화면의 스크린샷 갤러리를 추가했습니다.

### 호환성 및 UI

- 공식 DSH 최신 호환성 대표를 `dsh-v0.1.3-alpha.2`로 업데이트하고 modern capability 범위를 `<0.1.4-0`까지 확장했습니다.
- Settings switch, 모델 편집 행, light/dark theme, 선택되지 않은 추론 마커와 기본값 따르기 상태를 개선했습니다.

## [0.2.0] - 2026-09-04

### 추가

- `supportsStore`, `thinkingFormat`, `supportsThinkingTokenBudget` 등 일반적인 스칼라 게이트웨이 호환 필드를 개별적으로 설정하고 자동 상속할 수 있으며, 의미별로 그룹화하고 기본으로 접어 둡니다.

## [0.1.14] - 게이트웨이 capability mapping 및 optional takeover

### 게시 호환성 매트릭스

| 순서 | 공식 DSH representative | 버전 |
| --- | --- | --- |
| 1 | `dsh-v0.1.0-rc.7` | `0.1.0-rc.7` |
| 2 | `dsh-v0.1.1-rc.2` | `0.1.1-rc.2` |
| 3 | `dsh-v0.1.2-alpha.3` | `0.1.2-alpha.3` |

### 변경

- `version-map.ts`에서 DSH Runtime transport, Gateway compat 필드 및 takeover transport의 capability mapping을 통일하고, rc7은 `supportsDeveloperRole`/`maxTokensField`를 지원하지 않으며 rc8+는 지원함을 명시했습니다.
- rc7, rc2 및 alpha3 세 capability composition representative를 각각 로드하고 실제 호환성을 검증하는 테스트를 추가했습니다.
- 선택 사항인 `dsh-llm-openai-completions` takeover를 지원합니다. Gateway compat을 지원하는 runtime에서 대상이 사용자 지정 OpenAI 호환 사고 게이트웨이이고 transport가 활성화된 경우에만 적용됩니다.
- provider 전역 `compat` 기본값과 단일 모델 override를 추가했습니다. catalog 모델은 `modelOverrides.<model>.compat`, `models[]` 항목은 `models[].compat`을 사용합니다. 모델 수준은 작성된 필드만 provider 기본값에 대해 덮어쓰며 `Auto`는 현재 계층의 필드를 삭제하고 provider 상속으로 복원합니다. 같은 라우트(provider)에 비어 있지 않은 `models[]`와 비어 있지 않은 `modelOverrides`가 동시에 존재하면 잘못된 구성입니다. 공식 schema는 이 잘못된 구성을 거부하며 플러그인은 비정상 데이터에서 fail closed로 동작합니다. catalog/modelOverrides와 `models[]` 두 모델 형식 모두 Settings의 단일 모델 편집을 지원하며, `models[]` 저장은 배열 인덱스 path op 대신 다른 모델, 알 수 없는 필드 및 다른 compat 필드를 보존하는 `providers.<route>.models` 전체 배열 set 하나를 사용합니다.
- 이 compat 값은 제어면 설정만 담당하며 외부 transport를 구현하지 않습니다.

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
