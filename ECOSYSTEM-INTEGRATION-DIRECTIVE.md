# 【小驴生态中枢统领指令】小驴闪卡跨插件协同接入执行手册

> **下发方**：小驴快门中枢（`siyuan-quickgate`）
> **接收方**：小驴闪卡（`siyuan-lv-cards`）开发 Agent
> **生态标准**：Epoch 6 纪元联邦标准 · 零强依赖优雅降级 · 严禁私有存储穿透

---

## 一、 你的角色与核心职责
你在小驴生态中定位为**【终极记忆固化平台（Long-Term FSRS Platform）】**。
原生 FSRS 科学排期、全生命周期卡片学习、复习遗忘统计与实战答题勋章。

---

## 二、 三大铁律（严格遵守）
1. **零强依赖**：无其他任何小驴插件时，小驴闪卡自身制卡、练习、FSRS 排期必须 100% 独立可用。
2. **只读安全优先**：对外公开桥只暴露只读统计与安全导航，严禁向外暴露批量清库或破坏性删卡方法。
3. **安全四别名挂载**：挂载 `window.xiaolvCards`（兼顾 `lvCards` / `LvCards` / `siyuanCards`）。

---

## 三、 本地已就绪的联邦 SDK
快门中枢已为你将零外部依赖的生态 SDK 放置于：
`src/libs/ecosystem-bridge-kit.ts`

你在代码中可直接引用：
```ts
import { 
    callBridge, 
    logCheckinEventSafely, 
    registerRaikiriModuleSafely, 
    ECOSYSTEM_EVENTS 
} from "./libs/ecosystem-bridge-kit";
```

---

## 四、 具体落地执行任务清单

### 任务 1：复习轮次完成自动联动小驴打卡
- **修改文件**：`src/ui/review.svelte` 或复习完成屏（Done Panel）控制层
- **改动要求**：
  当用户完成一组卡片复习并显示完成屏时：
  ```ts
  if (this.settings.checkinItemId && reviewedCount > 0) {
      await logCheckinEventSafely({
          itemId: this.settings.checkinItemId,
          value: reviewedCount,
          unit: "张",
          externalRef: `cards:${this.settings.checkinItemId}:${today}`,
          note: `完成闪卡复习 ${reviewedCount} 张（命中率 ${accuracy}%）`,
      });
  }
  ```
  *(注：打卡未安装时安静返回 false，主流程不受任何影响)*

### 任务 2：对外挂载点对齐四别名
- **修改文件**：`src/index.ts` 与 `src/api/external-bridge.ts`
- **改动要求**：
  在 `onload` 挂载 `CardsBridgeApi` 时，同时兼顾四个别名：`xiaolvCards`、`lvCards`、`LvCards`、`siyuanCards`，并在 `onunload` 阶段核验身份后安全清理。

### 任务 3：向小驴雷切注册“待复习闪卡”小组件
- **修改文件**：`src/index.ts`
- **改动要求**：
  ```ts
  registerRaikiriModuleSafely({
      moduleId: "cards-due-summary",
      title: "待复习闪卡",
      category: "plugin",
      read: async () => {
          const due = await this.getDueSummary();
          return {
              title: "复习提醒",
              items: [
                  { label: "待复习", value: `${due.unreviewedCount} 张` },
                  { label: "新卡", value: `${due.unreviewedNewCardCount} 张` }
              ]
          };
      },
      open: () => this.openReview(),
  });
  ```

---

## 五、 验收指令
完成修改后，请在 `小驴闪卡` 根目录下运行：
```bash
pnpm test
```
确保全量 1941 项单测保持 100% 全绿。
