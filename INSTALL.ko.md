# 설치 안내 (공식 DSH CLI)

이 안내는 DSH 공식 `dsh plugin` 명령만 사용합니다. 이 명령은 대상 profile에 의존성을 설치하고 `dsh.profile.bundles`를 동기화합니다. 일반 `npm install`, profile 내부의 직접 `pnpm add`, profile manifest 수동 편집으로 대체하지 마세요.

- [English installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [English README](./README.md)
- [中文 README](./README.zh.md)
- [日本語 README](./README.ja.md)
- [한국어 README](./README.ko.md)
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

## 1. 공식 설치

최신 버전을 설치합니다.

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort
```

현재 릴리스 버전을 명시하여 설치합니다.

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.10
```

공식 CLI가 profile 의존성, lockfile 및 `dsh.profile.bundles`를 자동으로 업데이트합니다. YAML 행을 수동으로 추가하지 마세요.

## 2. 업데이트

registry의 최신 버전으로 업데이트합니다.

```bash
dsh plugin --profile <profile> update @hytime/dsh-thinking-effort
```

특정 버전으로 업데이트하려면 다음을 사용합니다.

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.10
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
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.10
```

다른 도구로 의존성을 제거했지만 이전 bundle이 남아 있으면 composition을 확인합니다.

```bash
dsh --profile <profile> --dump-default-config
```

`name: dsh-thinking-effort`가 여전히 있으면 profile lockfile에서 이전 GitHub commit을 확인하고 공식 CLI로 다시 조정합니다.

```bash
dsh plugin --profile <profile> add github:hytime/dsh-thinking-effort#<old-commit>
dsh plugin --profile <profile> remove dsh-thinking-effort
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.10
```

새 bundle 목록에 이전 패키지 이름을 추가하지 마세요.

## 4. 설치 검증

의존성과 버전을 확인합니다.

```bash
grep -n "@hytime/dsh-thinking-effort" \
  "${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/package.json"
node -p "require('${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/node_modules/@hytime/dsh-thinking-effort/package.json').version"
```

이 릴리스의 버전은 `0.1.10`이어야 합니다.

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
5. 오른쪽 아래 버전 표시가 `v0.1.10`로 표시됩니다.

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
