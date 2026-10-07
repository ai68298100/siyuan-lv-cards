## 变更内容 / What changed

<!-- 用 2–5 句说明问题、触发条件和最终行为。/ Describe the problem, trigger, and resulting behavior. -->

## 影响范围 / Scope

- [ ] UI / accessibility
- [ ] kernel API / data migration
- [ ] AI / network boundary
- [ ] release / build / GitHub workflow
- [ ] documentation only

## 验证 / Validation

```text
pnpm check
pnpm check:docs-facts
pnpm test -- --run
pnpm build
```

## 发布与兼容性 / Release and compatibility

- [ ] i18n keys are aligned (`node scripts/check-i18n.mjs`)
- [ ] Version files are aligned when applicable
- [ ] Real Android SiYuan validation is complete, or the unverified surfaces are listed below
- [ ] No user data or credentials are included in logs, screenshots, or fixtures

未验证范围 / Unverified surfaces:

<!-- 说明仍需在真实 Android 思源、特定内核版本或其他宿主验证的内容。 -->
