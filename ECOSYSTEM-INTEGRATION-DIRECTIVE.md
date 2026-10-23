# 【小驴生态中枢统领指令】小驴闪卡 (siyuan-lv-cards) 全方位升级与跨插件协同执行手册

> **统领下发方**：小驴快门中枢（`siyuan-quickgate`）
> **执行接收方**：小驴闪卡（`siyuan-lv-cards`）开发 Agent
> **架构基线**：Epoch 6 联邦规范 · 零强依赖优雅降级 · 勃艮第深酒红+钻石星光美学 · 历史排雷防线

---

## 一、 核心定位与视觉资产状态
- **生态角色**：**【终极记忆固化平台（Long-Term FSRS Platform）】**——基于原生 FSRS 科学排期的全生命周期闪卡学习平台。
- **专属主题色**：**勃艮第深酒红（`#E11D48` ➔ `#9F1239`）＋ 白金钻石星光记忆核（`#FEF08A`）**。
- **根目录 `icon.png`**：**已由快门中枢完成 256×256 殿堂级“深酒红底配翻转闪卡与白金星光核”高反差头像替换，请勿覆盖回退！**
- **本地已就绪 SDK**：`src/libs/ecosystem-bridge-kit.ts`（零外部依赖，可直接 `import`）。

---

## 二、 必做任务 1：跨插件联邦联动（Epoch 6 标准）

### 1. 四别名挂载与安全注销 (`src/index.ts` & `src/api/external-bridge.ts`)
- 在 `onload` 挂载 `CardsBridgeApi` 时，同时兼顾四别名：`window.xiaolvCards`、`window.lvCards`、`window.LvCards`、`window.siyuanCards`（First-Instance-Wins）；
- 在 `onunload` 阶段核验身份后安全删除（`if (w[alias] === this.bridge) delete w[alias]`）；
- 补齐 `hasCapability(name)` 与 `getOverview()`，使快门中枢可将闪卡成熟度由 `design` 正式提升为 `stable`！

### 2. 复习完成自动联动小驴打卡 (`src/ui/review.svelte`)
- 当用户完成复习轮次进入完成屏（Done Panel）时，若设置了打卡项，调用 `src/libs/ecosystem-bridge-kit.ts` 的 `logCheckinEventSafely`：
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
  *(未安装小驴打卡时自动静默返回 false，0 报错)*

### 3. 向小驴雷切注册“待复习闪卡”小组件 (`src/index.ts`)
- 调用 `registerRaikiriModuleSafely` 注册 `cards-due-summary` 小组件，实时展示待复习与新卡数量。

---

## 三、 必做任务 2：顶栏图标重大升级——弃用空白双框 (`src/index.ts`)

- **问题定位**：目前 `src/index.ts` L336 的 `ICON_LV_CARDS_SVG` 只是两个简陋的空白方框加横线，完全缺失了 FSRS 记忆闪电特征！
- **修复要求**：将 `ICON_LV_CARDS_SVG` 替换为与新版 Logo 1:1 映射的 32×32 单色矢量图标（8度倾斜翻转双卡 + FSRS 记忆闪电 ⚡ + 星光点）：
  ```xml
  <symbol id="iconLvCards" viewBox="0 0 32 32">
    <rect x="10.5" y="6" width="14" height="17" rx="3.5" transform="rotate(8 17.5 14.5)" fill="none" stroke="currentColor" stroke-width="1.8" stroke-opacity="0.4"/>
    <rect x="6" y="9" width="15" height="18" rx="3.5" fill="none" stroke="currentColor" stroke-width="2"/>
    <path d="m14.5 12-3.5 5h3l-1.5 5 4.5-5.5h-3z" fill="currentColor"/>
    <circle cx="22" cy="24" r="3" fill="currentColor"/>
  </symbol>
  ```

---

## 四、 必做任务 3：UI 轻量统一与 CSS 全局污染治理 (`src/index.scss`)

1. **【高危样式污染修复】消灭顶层裸类选择器 (`src/index.scss`)**：
   - 经中枢审计，`src/index.scss` 中存在顶层 `.dialog-content {` 以及 `.list, ul, ol {` 等裸类选择器，会直接污染思源原生弹窗与其他插件列表！
   - **必须将所有样式严格收敛在 `.lv-cards-*` 专有命名空间内！**
2. **注入专属品牌色与参考图战报 Bento 美学**：
   ```scss
   --lv-brand: #E11D48; /* 勃艮第心智红 */
   --lv-brand-soft: color-mix(in srgb, var(--lv-brand) 12%, transparent);
   --lv-accent-gold: #FACC15; /* 星光金 */
   ```
   - 完成屏吸收最初参考图的 Bento 双拼数据块与成就药丸胶囊；按钮挂载 `:active` 下沉微触感；Dialog 标题栏统一采用 `.lv-dialog-title-wrap`。

---

## 五、 必做任务 4：深层工程规范与包体瘦身加固

1. **`plugin.json` 关键对齐**：
   - 新增 `"settingsWindow": true`（开启独立桌面设置大窗）；
   - `minAppVersion` 统一由 `"3.8.0"` 提升至 `"3.8.4"`；
   - `keywords` 确保前置包含 `["小驴", "小驴闪卡", "xiaolv", "lv", ...]`。
2. **发行包 `package.zip` 体积优化**：
   - 当前 `package.zip` 达 1018KB（超 1MB），请检查生产构建配置，确保未将 `inline sourcemap` 或测试冗余资源打入生产 zip，将体积控制在 750KB 以内。
3. **日志与 i18n 规范**：
   - 控制台日志前缀统一为 `[LvCards]`；Toast 提示前缀统一为 `[小驴闪卡]`；
   - 确保构建产出包含下划线格式的 `dist/i18n/zh_CN.json`。

---

## 六、 验收标准
执行完毕后，在根目录运行：
```bash
pnpm check && pnpm test
```
确保全量 1941+ 项单测与门禁 100% 全绿通过！
