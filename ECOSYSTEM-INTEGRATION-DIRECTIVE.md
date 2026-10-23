# 【小驴生态中枢统领指令】小驴闪卡 (siyuan-lv-cards) 专项排查与全方位升级执行手册

> **统领下发方**：小驴快门中枢（`siyuan-quickgate`）
> **执行接收方**：小驴闪卡（`siyuan-lv-cards`）开发 Agent
> **当前状态**：底座测试全绿 (1941项) · 规范评分 80% ➔ 目标 100%
> **核心原则**：零强依赖 · 勃艮第深酒红+钻石星光 Bento 美学 · 严禁私有存储穿透

---

## 一、 核心资产状态确认
1. **根目录 `icon.png`**：**已由中枢完成 256×256 殿堂级“深酒红底配翻转双卡与星光核”高清头像替换，请严格保留勿覆盖！**
2. **本地就绪 SDK**：`src/libs/ecosystem-bridge-kit.ts`（零外部依赖，直接 import 使用）。

---

## 二、 当前排查出的本插件专项缺陷与必修任务清单

### 【P0 级：集市获客与设置窗口升级】
1. **`plugin.json` 补齐品牌关键词（严重影响集市获客！）**：
   - 当前 `keywords` 完全没有“小驴”中文词，集市搜“小驴”搜不出闪卡！
   - **必修修改**：前置强制补齐 `["小驴", "小驴闪卡", "xiaolv", "lv", ...]`。
2. **开启独立桌面设置大窗（`settingsWindow: true`）**：
   - 在 `plugin.json` 根级增加 `"settingsWindow": true`，彻底打通思源 3.8.8+ 独立大窗口设置体验。

---

### 【P1 级：顶栏图标升级与样式防污染】
3. **顶栏单色矢量图标重大升级——彻底弃用空白双框 (`src/index.ts`)**：
   - 目前 `ICON_LV_CARDS_SVG` 只是两个无特征的空白方框加横线，完全缺失 FSRS 闪电灵魂！
   - 替换为与新版 Logo 1:1 映射的标准 32×32 SVG（8度倾角翻转双卡 + FSRS 闪电 ⚡ + 星光点）：
   ```xml
   <symbol id="iconLvCards" viewBox="0 0 32 32">
     <rect x="10.5" y="6" width="14" height="17" rx="3.5" transform="rotate(8 17.5 14.5)" fill="none" stroke="currentColor" stroke-width="1.8" stroke-opacity="0.4"/>
     <rect x="6" y="9" width="15" height="18" rx="3.5" fill="none" stroke="currentColor" stroke-width="2"/>
     <path d="m14.5 12-3.5 5h3l-1.5 5 4.5-5.5h-3z" fill="currentColor"/>
     <circle cx="22" cy="24" r="3" fill="currentColor"/>
   </symbol>
   ```
4. **【高危样式污染修复】消灭顶层裸类选择器 (`src/index.scss`)**：
   - 目前顶层裸写了 `.dialog-content {` 与 `.list, ul, ol {`，会直接污染思源原生弹窗与其他插件列表！
   - **必须将所有样式严格收敛在 `.lv-cards-*` 专有命名空间内！**

---

### 【P2 级：打卡联动与包体瘦身】
5. **复习完成自动联动小驴打卡**：
   - 完成屏（Done Panel）触发时调用 `logCheckinEventSafely`（`externalRef: "cards:${this.settings.checkinItemId}:${today}"`）。
6. **发行包 `package.zip` 体积瘦身**：
   - 当前发布包高达 1018KB（超 1MB），请检查生产构建配置，严禁打入 `inline sourcemap`，控制体积在 750KB 以内。

---

## 三、 验收指令
修改完成后，在根目录执行：
```bash
pnpm check && pnpm test
```
确保全量 1941+ 项单测与门禁 100% 全绿通过！
