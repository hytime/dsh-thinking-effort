<!--
  提交前请阅读 CONTRIBUTING.md。本仓库用 dev 作为集成分支：
  外部 PR 一律以 dev 为 base，测试通过后由维护者合入 main，main 是唯一发布源。
-->

## Summary

<!-- 用一两句说明改了什么、为什么。用户可见的行为变更请写清差异。 -->

## Related

<!-- Closes #NN / Related #NN；纯内部改动可留空。 -->

## Type

- [ ] `fix` — 修复缺陷
- [ ] `feat` — 新增能力
- [ ] `docs` — 仅文档
- [ ] `refactor` / `perf` — 不改变外部行为
- [ ] `ci` / `chore` — 构建、工作流、仓库维护

## Verification

<!-- 每种测试方法一个条目；贴出实际跑过的命令与结果。没跑就别勾。 -->

- [ ] `pnpm run build`
- [ ] `pnpm test`
- [ ] `pnpm run typecheck && pnpm run typecheck:test`

```text
<!-- 命令与输出 -->
```

## Checklist

- [ ] base 是 `dev`，且已 rebase 到最新 `dev`（不要以 `main` 为 base）
- [ ] 没有改 `package.json` 的 `version`（发版是维护者动作）
- [ ] 只改了 `src/`，没有提交 `lib/` 下的构建产物（`lib/` 由 `pnpm run build` 生成且被 gitignore）
- [ ] CHANGELOG 条目只加在 `[Unreleased]` 段，没有改动已发布版本的段落
- [ ] 涉及用户可见行为或配置时，已同步四语言文档（`README.{md,zh,ja,ko}.md` / `docs/INSTALL.{md,zh,ja,ko}.md`）
- [ ] 只暂存了显式路径，没有用 `git add .` / `git add -A`
