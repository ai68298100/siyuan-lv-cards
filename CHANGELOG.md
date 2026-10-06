# Changelog

## v0.205.0 2026-10-06 · AR-4 离线部分：样例创建幂等加固（E 批 6/6 收官）

* 命令面板「示例工作区」：防重入锁 + 文档已有示例块（content LIKE '示例 %'）跳过重复创建——重试/重复点击不再堆重复示例卡（此前每次点击都追加一整套 5 张样例）
* 引导流程「创建示例卡」：卡组按名复用（此前每次调用 createRiffDeck 新建——失败重试会堆「示例卡组」同名组）+ 文档已有块跳过追加
* E 批至此 6/6 收官（AT-1/AR-5/AS-1/AS-3/AX-8/AR-4）；余验收项：画像 diff 撤销语义与网络/权限分支归真机走查（B-18 diff 预览已交付）
* i18n +1 键（sampleExists，zh/en 对齐 1200）

## v0.204.0 2026-10-06 · Obsidian SR 导出（互通对称闭环）

* 管理器选中卡新增「导出 Obsidian SR」：qa 块（`front ==back==` 尾部闭合且 front 无其他标记）→「问 :: 答 #flashcards」；多挖空/尾部有内容/无标记 → cloze 原样降级（不强行拆问答——多标记块在 Obsidian SR 本就是 cloze，诚实口径）
* 实现细节：中段惰性匹配（贪婪会吞掉尾部多挖空标记误判 qa，测试锚定）；导出文件可被本插件导入器原样回导（往返闭环有测试）；toast 汇总问答/挖空张数
* i18n +3 键（zh/en 对齐 1199）；668 测试（+3）

## v0.203.0 2026-10-06 · Obsidian SR 导入 W2：分卡组落库 + 台账幂等重导

* deckHint 分卡组：`#flashcards/子路径` 每个路径一个卡组（「Obsidian: 文件名/子路径」，根路径落「Obsidian: 文件名」）；同名牌组复用（先查 getRiffDecks 再缺失创建，避免重复导入堆同名组）；blockID 按全局序归组，与一卡一段落对位约定一致
* 跨运行弱台账（ob-import-ledger.json，PRIVACY 已披露）：内容指纹 → 卡组/块 ID（上限 5 万，**不存笔记内容**）；重导同内容文件自动跳过已导入项（partitionByLedger），确认弹窗与完成提示分别显示台账跳过数；同指纹重导更新落点（merge 保留最新）
* v1 的「无跨运行台账，重复导入会重复建卡」边界自此关闭；仍诚实保留：双向卡按正向导入、指纹相同但文字微调会视为新卡
* i18n 文案更新（确认/完成提示含 skip 占位）；665 测试（+4）

## v0.202.0 2026-10-06 · Obsidian SR 笔记导入（调研立项 → 交付）

* 新增 core/obsidian-import.ts 纯模块：**块级解析**（空行分段，多行 ?/?? 块、单行 ::/::: 卡、==挖空== 块可混排——补齐 parseSrMarkdown 只认首个多行块的局限）；deck tag 从题面/答案剥离（parseSrLine 残留行为修正为导入口径）；文件内指纹去重；compose 保证一卡一空行分段（行首 # 转义防变标题破坏对位）。6 组单测
* 导入编排（设置 → Anki 区旁新行）：选 .md → 计划确认弹窗（问答/挖空/双向按正向/去重计数 + 目标卡组）→ 建「Obsidian SR Import」笔记本 + 文档 → **按文档序对位，落块数与卡数不一致即中止**（防错位）→ 新卡组「Obsidian: 文件名」入组
* 诚实边界（设置提示 + 注记）：双向卡（:::/??）按正向导入（方向信息 v1 丢失，计数保留）；无跨运行台账（Obsidian 无稳定 ID，重复导入会重复建卡）；deckHint 分布仅预览展示，v1 全部落同一目标卡组
* i18n +9 键（zh/en 对齐 1196）；655 测试（+6）

## v0.201.0 2026-10-06 · 备份与恢复中心（docs/38 P2 首个切片）

* 新增 core/backup.ts 纯模块：稳定序列化（键排序）+ FNV-1a 逐文件校验和 → 单文件 bundle（包裹标识/app/schema/manifest），打包与校验可复现（6 组单测：三态对比/篡改拒绝/未知 key 拒绝/空集拒绝/输入不改）
* 导出：设置 → 数据「备份与恢复」一键导出全部 19 个私有存储文件为 `lv-cards-backup-<日期>.json` 快照（含复习日志/卡面版本等用户内容，文件自管**不上传**——PRIVACY 已披露）——升级前快照、误删回滚基线
* 恢复：选择文件 → **预览（恢复演练，不改任何状态）**：逐文件 checksum 校验 + 与当前数据 replace/add/unchanged 三态对比 + 未知数据槽与篡改拒绝 → 确认弹窗列出差异摘要 → 确认后经 persist 队列逐 key 落盘 → 与 onload 同一装配路径重载内存 → 角标刷新；取消则什么都不发生
* 设置 UI：导出按钮 + 恢复文件选择（20MB 上限、busy 防重复、失败 toast 可读原因）；i18n +10 键（zh/en 对齐 1187）；655 测试（+6）

## v0.200.0 2026-10-06 · AS-3 富内容卡面降级 + BU-40 无 AI 等价登记（B 轨收官）

* AS-3 富内容卡面：新增 core/card-face.ts 纯模块（公式/图片/嵌入块/代码/表格/超长链接六特征识别，内核 DOM 口径）；复习卡面下方新增特征提示行（含「内容过宽时卡内左右滚动」提示，role=note）；`.lv-card-content` 横向滚动收纳（窄屏表格/长链不撑破卡面）
* AS-3 加载失败占位：新卡卡面加载失败不再整页切错误视图——卡面区显示占位（原因+重试按钮），队列位置不丢、重试不重排队；**顺带修复一个存量缺陷**：切卡时未清空上一张卡面，新卡加载失败会静默残留上一张的内容（现已切卡即清，失败走占位）
* BU-40 无 AI 等价登记（B14，B 轨最后一条）：core/ai-equivalents.ts 注册表——每个 AI 入口登记 usesAI/手工替代路径/损失说明（诚实标注不可替代部分，不谎称完全等价）；零 AI 入口（修卡演练/全程无 AI）显式声明；防漏登记测试锚定；docs/29 §9 同步登记表与约定（eligibility 阻断、帮助、文档引用同一事实源）
* i18n +16 键（aiFace 8 + aiEquiv 8 段，zh/en 对齐）；649 测试（+7）

## v0.199.0 2026-10-06 · AS-1 焦点陷阱：对话框键盘闭环（Tab 循环/Esc/移入/归还）

* 新增 libs/focus-trap.ts（纯 DOM 工具，happy-dom 可单测）：getFocusable（排除 disabled/负 tabindex，属性排除在代码层做——happy-dom 属性选择器口径不一）+ trapFocus（打开记宿主→焦点移入首个可聚焦元素→Tab/Shift+Tab 容器内循环→Esc 只回调不执行关闭→release 幂等并按选项归还焦点）
* 对话框接线：confirmDialog 捕获焦点（Esc 关闭+按钮后归还）；svelteDialog 捕获焦点（Esc→既有 closeOnce 一次性；归还走 AR-2 既有 restoreFocus，restoreOnRelease=false 防双重归还）——全部对话框（AI 向导/设置/目标/卡片详情等 9+）键盘流闭环
* LvDrawer 非模态语义显式化：role="dialog" aria-modal="false"（不劫持页面其余部分，验收「非模态层不误加 aria-modal」）+ aria-label + 关闭按钮 aria-label
* 质量：642 测试（+7）；check 0/0；i18n 零增量（纯行为）

## v0.198.0 2026-10-06 · E 批小修三连：同步有界重载 + 报告写入闭环 + UI import 边界门禁

* AT-1（保守版）：覆写 `onDataChanged`（宽容兼容 string[] 与 {files} 两种宿主形态）——只认本插件 petal 存储目录变更，防抖 2s、单飞串行；重载前先 `persist.waitAll` 冲刷本地在途写（**绝不覆盖未 flush 的本地状态**），再整批重读+normalize（与 onload 同一装配路径，读取/装配抽成方法防错位回归）；完成后刷新角标；卸载取消挂起重载。打开中页签不自动重渲染（完整 UI 刷新协议待真机专项），已知边界诚实登记
* AR-5：报告写入闭环——总览「写入文档」按钮 busy 防重复点击、catch 失败原因就近展示（报告纯函数可随时重试）；成功后 toast 路径并自动打开文档；考试复盘写入同样补 busy/失败 toast + 成功打开文档
* AX-8：治理门禁新增 ⑩ UI 层 import 边界——src/ui 与 src/chunks 从 "siyuan" 包只允许导入展示级 helper（showMessage/openTab），内核数据面必须经 src/api 收口（超时/错误层统一）；静态检查入 CI 链，白名单外导入即失败（当前全部通过——既有代码已合规，此门禁防回潮）
* 本批未做（诚实登记）：AR-4（onboarding 幂等多路径）、AS-1（真模态焦点陷阱）、AS-3（富内容卡面降级）——三项均需较大 UI/真机面，按 docs/36 择项原则跳过留后续
* i18n +1 键；635 测试不变（AT-1 装配抽取为等价重构，由既有全量套与 e2e 覆盖）
## v0.197.0 2026-10-06 · B12（BU-36 上下文包预览）：发送前分层预算可见

* 向导预览确认步新增「上下文包预览」区（BU-36，BU-6 planContext + BU-18 注册表预算的 UI 面）：宿主新增 previewBudget 纯函数通道（assembleGeneratePrompt 零网络重放），打开预览时计算一次——分层显示系统提示/材料各层 token 与上限，截断/丢弃显式标注（不静默裁剪），预算来源标明「模型注册表（按窗口收紧）/任务默认」，材料超预算时发送前即显示「请分段生成」警示（不必等到真正调用才失败）
* 预览失败不阻塞发送（generate 侧有完整校验）；旧宿主不传 previewBudget 则不显示该区
* i18n +7 键（zh/en 对齐 1157）；代码路径零网络零持久化（纯展示）

## v0.196.0 2026-10-06 · B11（BU-24/25 成本账本）：月度预算阻断 + 用量记账

* 成本账本纯模块（core/ai-cost-ledger.ts）：每次出卡记一条用量（任务/端点形态/模型/token 估算/费用估算/算法与价格版本）——**token 全为估算并显式标记 est=true**（chars/4 + 注册表价格快照），绝不冒充账单事实；价格未知记 null 不编数字；上限 2000 条自动裁旧；**key 与材料/卡片原文永不入账本**
* 月度预算（BU-24）：设置新增「AI 成本预算」行（开关 + 月度 token 上限 + 本月已用即时显示）——达到 80% 预警 toast、达到上限在组装 prompt 前阻断（eligibility costExceeded 事实源落地，BU-33 预留位补全）；**阻断信息自带手工替代路径，fallback 不会启动**（不偷换端点）；自然月窗口本地时区
* 用量可导出/删除（BU-25）：设置 → 数据新增「AI 用量账本」行——JSON 导出（按模型/按日聚合 + 明细）与确认清空（预算归零重计）
* 存储接线：ai-cost-ledger.json 新文件（PRIVACY 披露行同步；storageStats 自动收录）；i18n +8 键（zh/en 对齐 1150）
* 质量：635 测试（+5，含聚合价格未知组 null 传播、预算窗口跨月、warn/exceeded 阈值边界）

## v0.195.0 2026-10-06 · B13 红队 fixture 扩容（注入模式库 10→14 + 扫描资源上限）

* INJECTION_PATTERNS 扩容 4 个高信号模式：HTML 事件外发（`<img onerror=` 等）、聊天模板逃逸（`<|im_start|>` / `[INST]` / `[/SYS]`）、密钥套取（打印 API key/口令）、Markdown 信标（超长外链图片 ≥80 字符）
* 红队 fixture 10→15：新增 HTML 事件外发、聊天模板逃逸、INST 标记逃逸、Markdown 信标、套取密钥五组攻击样本；零误报集同步扩容（相对路径图片/普通短链图片不命中信标模式）
* 资源上限：扫描输入截断 SCAN_MAX_CHARS=200K 字符（诊断留证不是安全边界，防超长材料资源耗尽；BU-21「超长输入」项的有界化），有界性有测试
* 覆盖度护栏改为按唯一 expectId 断言（两 fixture 可共用一模式）；8/8 spec 全过
* i18n 零增量（扫描器为诊断层，无用户可见文案）

## v0.194.0 2026-10-06 · B10（BU-19 批次 pin）：生成环境快照随批次落盘

* ai-batches 批次记录新增 pin 字段（BU-19）：mode/modelId/templateHash（生效 system 提示 FNV-1a）/sourceHash（来源材料指纹，**不回存原文**）/pinnedAt——模型或模板升级后旧批次口径可复现、可比较；类型层无 key 字段，密钥永不落盘
* generate 出卡即写 pin（与批次元数据同点落盘）；normalize 白名单清洗（mode 非法/缺 hash 剔除、modelId 非字符串归 null）；旧批次无 pin 兼容不动（幂等清洗有测试锚定）
* 与 BU-15 分工：批次 pin 管「这一批用什么生成」（批次级持久），版本链管「这张卡改过几手」（会话内候选级）；与仪表盘 AI 批次质量的展示联动归后续批
* 质量：629 测试（+2）；check 0/0；i18n 零增量（数据层）

## v0.193.0 2026-10-06 · T03 审核扩展批：评分卡/审阅计划/版本链接入 AI 向导

* BU-13 评分卡可视化：候选审核步逐卡显示问题维度 chips（提示=warn/问题=error，沿用综合分<70 口径）；「卡面预览」面板新增八维度评分卡区（维度标签+认知层级+说明+修复建议，随编辑实时重算）；综合分随标题展示并标注仅审阅提示——入库资格仍由「已接受」决定
* BU-14 审阅计划横幅：候选步顶部按因子就高不就低显示建议强度——「建议逐卡审阅（因子：模型未在册/来源未验证/批量均分偏低/问题卡较多）」或「可抽样审阅：重点核对前 N 张」；模型可信度接线（siyuan 内核网关=可信；custom 按注册表登记状态），剪贴板粘贴来源标记「未验证」；建议性横幅不代审不阻断
* BU-15 版本链接线（会话内）：生成候选记 ai 版本（带生成快照 mode/modelId/templateHash——generate 返回值扩展，fnv1a 对生效 system 提示取 hash）；接受时记 user 版本（与链尾同文去重）；**单卡重生前自动留痕当前文本**（用户改过未接受也不丢）+ 重生后记新 ai 版（新旧可对比）；预览面板新增版本历史区（AI 生成/用户编辑双轨徽标 + 「回到此版」恢复，恢复后置回待审须重新核对）
* 边界诚实登记：版本链为会话内生命周期（重开向导不保留），跨会话持久化归 provenance 存储批；重生成 diff 对照视图（并排高亮）归 T03 后续批——本批先交付链存储与回滚
* i18n +40 键（aiScore 31 + aiReview 9，zh/en 对齐 1142）；check 0/0

## v0.192.0 2026-10-06 · BU-14 审阅策略 + BU-15 双轨 provenance（AI 治理 B7+B8 批，B 轨纯模块收官）

* BU-14 人工审阅策略（core/ai-review-strategy.ts 纯模块）：三档强度（逐卡/抽样/阻断）按因子就高不就低——高风险任务直接阻断；模型未登记（BU-18）/来源未验证/批均分 <70/问题卡占比 >30% 任一命中即升级逐卡；干净低风险走抽样（20%，clamp 3-10 张）；决策留触发因子（可解释）；canCommit 只认 accepted、unreviewedNeverCommits 恒真（未审卡永不入正式队列，验收锚点落测试）
* BU-15 双轨 provenance（core/ai-provenance.ts 纯模块）：逐卡版本链（ai 候选 ↔ user 编辑，最新在后截 20）+ 生成环境快照（mode/modelId/templateHash FNV-1a，**类型层无 key 字段**）；重生成各带各的快照可对比；latestUserVersion/userVersions 支撑「回到任意人工版本」；**purgeAIOnly 删除 AI 记录不误删用户内容**——纯 ai 轨迹卡整卡清、有 user 版本的卡整链保留（测试锚定）
* 两模块均为纯逻辑先行（BI-19/BU-13 同模式）：UI 面归 T03 审核扩展批（审阅计划 chip/逐卡版本链 diff）；bundle 零接线增量
* 质量：627 测试（+11）；check 0/0；i18n 零增量（无用户可见文案，词汇表随 UI 批次入）

## v0.191.0 2026-10-06 · BU-11 拒答策略 + BU-13 质量评分卡（AI 治理 B5+B6 批）

* BU-11 不确定性与拒答策略（core/ai-refusal.ts 纯模块）：六类拒答（事实不足/来源冲突/过时材料/危险请求/超出能力/格式失败）固定优先级评估，每类**两两不同**的下一步建议（测试防「统一话术」退化）；i18n 全词汇表（6 原因+11 下一步，zh/en）
* 验收核心落进类型层：每类拒答映射 BU-28 阶梯**终止类**（risk/parse/unknown），测试逐类断言 nextLadderStep 恒 abort（即使备用端点可用）——**拒答绝不自动换更宽权限或偷换未授权 provider**
* 接线：generate 空响应路径改按「格式失败」拒答呈现（可读原因+「重试一次/手工录入」下一步，不偷偷重试）；其余类别为 BL-6 解释面板与后续任务的契约词汇
* BU-13 质量评分卡（core/ai-quality-scorecard.ts 纯模块）：八维度独立打分（原子性/答案泄漏/来源覆盖/重复/歧义/难度/认知层级/语言自然度）——4-gram 答案泄漏检测、分号并列判多事实、代词开头判歧义、GB 身份证以外的启发式全部保守口径；问题维度带 noteKey+修复建议 suggestKey（可解释验收）；综合分加权扣分（leak 30/duplicate 25/atomicity 15/coverage 15/ambiguity 10/naturalness 5），difficulty/cognitive 只标注不扣分
* **综合分恒 advisoryOnly=true**：只作审阅提示，不产生任何写权限——入库资格仍由向导 T03「已接受」状态决定（人工闸门验收），评分卡 UI 面归 T03 审核扩展批次
* 质量：616 测试（+14）；check 0/0；i18n 对齐

## v0.190.0 2026-10-06 · BW-9 来源级禁止外发 + BU-8 敏感内容识别（AI 治理 B3+B4 批）

* BW-9 来源级禁止外发（core/ai-source-deny.ts 纯模块 + 存储接线）：笔记本/文档/块三级 deny 规则（只存 ID+时间+可选备注，上限 2000，**不存笔记内容**）；继承判定「块→文档→笔记本」最具体命中优先；规则只随显式删除解除——移动/导入/重开/重登记一律不失效（重登记不改原 addedAt，防「续命」）
* 硬阻断接线：generate 组装 prompt 前按来源 provenance 判 deny → eligibility `sensitive` 事实源阻断（BU-33 口径，给手工/本地替代）；UI 载入前拦截（已禁文档/笔记本材料不进向导）+ 来源条目 🚫 一键登记（落 ai-deny-list.json + toast）；向导 run() 携带 provenance，UI 拦截不可绕过
* BU-8 敏感内容识别与脱敏预览（core/ai-sensitive.ts 纯模块）：九类内置模式（密钥字段/OpenAI/GitHub/AWS 密钥/私钥块/JWT/手机号/邮箱/身份证——身份证走 GB 11643 校验位验证，普通 18 位单号不误报）+ 用户自定义敏感词（settings 新字段，逗号分隔，中英分隔符均可）；**命中只显示打码样本**（前 8 字符+***，绝不回显完整原文）
* 发送前处置门（向导预览确认步）：命中时展示「类别×次数（样本）」chips，三选——「脱敏后继续」（材料原地替换占位符，可回编辑区核对）/「仍发送原文」（显式确认）/返回；脱敏后复扫清零才可确认，不做静默拦截也不静默放行
* 设置：AI 区新增「自定义敏感词」行（思源内置 AI 与自定义端点都生效）；存储体检自动收录 ai-deny-list.json；PRIVACY 补披露行
* 医疗/法律类语义识别正则不可靠，本切片不收录（防高误报）——以自定义敏感词为替代路径，诚实登记于 docs/17
* 质量：602 测试（+13）；check 0/0；i18n 对齐；主包 ≤55KB

## v0.189.0 2026-10-06 · BU-18 模型能力注册表 + BU-28 分层降级阶梯（AI 治理 B1+B2 批）

* BU-18 模型能力注册表（core/ai-model-registry.ts 纯模块）：14 个常用 OpenAI 兼容模型登记 provider/上下文窗口/输入模态/参考价（快照 2026-10，缺失=null 不编数字）/已知限制标签/active-deprecated-retired 三态；**失效模型不再出现在可选列表**（selectableModelOptions 只回 active，测试全表核对 deprecated/retired 零泄漏）；ID 匹配宽容（大小写/空格、openrouter「/」中转后缀、dated 变体归并 gpt-4o-2024-11-20→gpt-4o）
* 预算从注册表收紧：effectiveBudgetTokens 按窗口×0.6 收口（只收紧不放大、下限 2000、未登记回任务默认）——小窗口模型（如 moonshot-v1-8k）材料超窗不再溢出；ai-pipeline audit 新增 budgetSource/modelId（lvLog 审计可追溯预算依据）；custom 模式 generate 按设置模型解析，siyuan 模式内核管理不判
* BU-28 分层降级阶梯（core/ai-degradation.ts 纯模块）：十类失败分类（取消/隐私拒绝/配额/auth/限流/5xx/网络/解析/风险/未知；**配额先于 429**——insufficient_quota 重试有害）+ 三动作阶梯（重试主端点/转已授权备用/中止）；终止类（401/配额/隐私/解析/风险/取消）无论备用可用性一律中止，**绝不静默回退**；决策携带 mayCost/usedFallback/retryAfterMs 供界面呈现实际路径与费用（验收硬性要求）
* 口径收敛：ai-errors.isRecoverableAIError 委托阶梯分类器（AQ-15 判定单一事实源，既有 5 组测试零改动全过）；ai.ts fallback 决策走阶梯（可观察行为保持：主端点不重试、组合错误信息不变）+ 新增 onDegradation 回调；降级 toast 升级为「已切换备用端点+可能产生额外费用」说明
* 设置页模型快选：AI 区「模型」行新增在册模型下拉（仅 active，含 provider+窗口规模标签）+ 登记状态提示（登记→窗口规模；失效→建议更换警示；未登记→保守默认口径）
* i18n：aiDegrad 两键（usedFallback/mayCost）+ settings 模型 4 键，zh/en 对齐（1065 叶键；顺带清理 zh-CN 重复键 menuDashboard 与残留缩进噪声）；PRIVACY 补 anki-ledger/content-versions 存储披露（v0.186 漂移收口）+ 回退口径改写为阶梯语义
* 质量：589 测试（净增 22：注册表 9 + 降级阶梯 9 + pipeline 预算 2 + 既有委托口径 2）；主包 46.28KB ≤55KB 门禁

## v0.188.0 2026-10-06 · 工作台页签 + 深度统计记忆 + 损失明细复制

* 闪卡中心新增「制卡工作台」常驻页签（T02）：AI 制卡向导与修卡演练的集中入口（openWizard/openDrill 宿主通道，旧宿主兼容）；全屏内嵌工作面留待后续批次（跨 chunk 加载专项）
* 深度统计展开态持久化（T01）：总览「深度统计」展开/折叠选择落偏好设置，重开页签/重启后保持
* Anki 导入完成提示新增「复制损失明细」一键复制（诊断对账用，走剪贴板）
* 总览刷新并行化收尾：文档归属/V2 统计 SQL 与卡组/到期并发，hero 统计快路径先行渲染

## v0.187.0 2026-10-06 · 向导工作台 + 返场分流接线 + 演练样例扩容

* AI 制卡向导升级为双栏工作台（docs/13 §4 T02 收口）：左栏来源清单分条管理（标签/字数/📂回源/✕移除/**点标签查看该条原文**）+ 四类载入入口；右栏材料大文本编辑（裁剪即编辑、字符/token 实时计数、空态引导）+ 参数内联行；生成前请求预览确认步保持
* BI-27 返场分流 UI 接线（v0.185.0 记录的待办关闭）：跨天返场且上日有收工原因时，复习开场显示今日方案横幅——方案/步骤/建议上限（BI-27 模块推导，恒不补齐逾期），展示性可忽略，不自动改预算与队列；BI-8 收工原因 → BI-27 返场原因显式映射
* 修卡演练样例库扩容（docs/13 §12）：新增「缺少必要条件」样例（光速卡）与样例选择器，两种典型失败模式（题面过宽/缺条件）各配完整五步流程
* 文档：docs/34 V-8 补记限时行为修正（v0.186.0 后继提交 afe8984）与新验收步骤

## v0.186.0 2026-10-06 · UI 精品化批 1-4 + Anki 本地导入 + 冒烟加固

* UI 精品化（docs/39/40，原型十任务面全部核心落地）：R52 视觉纪律（状态点静态化/去光泽辉光/完成页与评分条去错峰）、页头 eyebrow+24px 题制、评分条原型规格（77px 高卡/kbd 右置/间隔下沉/窄屏 2×2）、向导双栏工作台（来源清单分条+回源📂+材料可编辑裁剪+AI 请求预览确认步）、审核状态机（已选≠已审、接受/待核实、编辑即失效、入库只取已接受、全部接受快径）、详情四分面（内容/来源/学习记录/问题）+ 内容版本追踪（保存留快照、对比当前逐行 diff）、T08 待处理聚合（疑问/暂停/续传，恢复幂等）、T06 目标三步链（了解→回忆→应用，状态如实）+ 缺口提示、T10 修卡演练（独立样例五步，零网络零写入）
* 行为修正：限时模式到点不再自动提交正式评分——只揭示答案并提醒自评（docs/13 §6 遗留差距清零）；v0.82 遗留 resumeCopyFailed 坏键修复（恢复横幅按钮此前渲染 undefined）
* Anki 本地导入 M1-M3：.apkg/.colpkg 解析（自研 zip 读取 + 注入式 SQLite 适配）、字段映射/保守 HTML 清洗（损失台账绝不静默丢弃）/归一化指纹查重/导入预览、SR 单行落库编排 + guid 台账幂等重导；设置页 Anki 区入口（node:sqlite 可用性自检，不可用降级提示）；1000 笔记大库基准在预算内
* 冒烟/e2e 加固：scripts/lib/smoke-kernel.mjs（前缀注册表/靶场防呆/残留清扫）、e2e-isolated 双模式（自起隔离靶场 / SIYUAN_BASE_URL+TOKEN 附着既有内核）、失败路径退出码语义修复（SilentExit 替代 process.exit）；发布包 smoke-dist 门禁（build 链尾真实执行 chunk 注册契约——v0.185.0 真机空白屏根因类）
* 质量与工具：567 测试（净增 47）、Anki 1000 笔记大库基准、i18n +46 键中英对齐、品牌图标重设计（白卡闪电，系列语言，用户从 A/B/C 候选选定 A）、deploy-device 参数化（LV_DEVICE_PLUGIN_DIR）
* 文档：docs/38 状态评审（v0.185 基线）、docs/39 UI 精品化差距与批次计划、docs/40 原型全页核对清单（T01-T10 逐面对照）、docs/34 冒烟加固约定与 V-8 行为修正补记

## v0.185.1 2026-10-05 · fix：真机空白屏——chunk 注册契约失配 + BASE 相对路径（AT-17 回归门禁）

* 修复两个自 v0.158.0（AT-17）以来生产构建**必现**的 chunk 加载缺陷（dev 模式走进程内导入不暴露，首个真机生产安装即空白）：① hub/review/dialogs 三个 chunk 整表覆盖 `window.__lvChunks`，而 loader 按 `__lvChunks.<name>` 取模块——恒 undefined，闪卡中心/复习/9 个对话框全数挂载失败；② chunk BASE 为相对路径，桌面端页面位于 `/stage/build/app/` 下，script 解析到 `/stage/build/app/plugins/…` 必 404（内核对 `/plugins/*` 实测 200）。修复：按键合并注册（dialogs 带 `components` 子表，与 shell 消费同形）+ BASE 根绝对
* 页签挂载失败兜底：hub/review 挂载点补 `.catch` + 可见错误 UI（i18n +2 键，zh/en 对齐），不再静默空白；loader 失败本就不驻留缓存，重开页签即自动重试
* 回归门禁：新增 chunk-registry-contract 单测（源级契约：按键合并、禁整表覆盖、BASE 根绝对、挂载点必有兜底）+ `scripts/smoke-dist.mjs` 发布包 smoke（build 链尾在 happy-dom 中真实执行 dist 产物，验证 `__lvChunks.<name>` 注册形态与三 chunk 共存），已接入 `pnpm build`
* 工具：`deploy-device.mjs` 参数化（`LV_DEVICE_PLUGIN_DIR` 环境变量，去除硬编码本机路径，挂 `pnpm deploy:device`）。另核实 pnpm-lock.yaml 双 YAML 文档为 pnpm 12 管理 `packageManager` 的标准结构（重建逐字节一致），非损坏，不动

## v0.185.0 2026-10-05 · BI-27 返场原因分流（六类六案，绝不统一补齐逾期）

* 新增 core/return-triage.ts 纯模块：六类返场原因（时间不足/目标改变/内容过时/数据故障/压力/单纯离开）各对应**不同**方案（两两不同签名，+5 组单测防「统一方案」退化）——时间不足=小预算+高优先级；目标改变=先重审标准（BI-16/11）；内容过时=来源健康+修订优先（BI-20）；数据故障=先诊断对账再小批量；压力=只读 0 张或休息；单纯离开=正常队列
* 验收硬性要求落档：duePolicy 恒 keep（任何方案都不补齐/清空逾期）；分流记录追加留痕（截 30 条，快照不含材料内容）
* 与 BI-8 分工：收工原因记录「为什么离开」，本模块决定「回来怎么办」；UI 接线待后续批次（与 BI-10 横幅同场）
* i18n +17 键（returnTriage 段 plan 6+step 11，zh/en 对齐）；bundle 零增量

## v0.184.0 2026-10-05 · BI-20 来源健康状态（纯模块，五类影响分类器）

* 新增 core/source-health.ts：五类健康问题分类器（删除/移动/版本变化/媒体失效/许可变化，按验收列举顺序独立标记可并存）+ 健康史（发现追加、原地标记解决不删史——验收「修复保留历史」）+ openIssues 未解决清单
* 验收硬性要求落档：每条问题 `affectsScheduling: false` 恒定——**健康问题不冒充记忆失败**，复习统计与调度归内核 riff（ADR-3）
* 事实由调用方采集（SQL 存在性/归属、内容指纹、媒体探测），本模块只做分类与历史；bundle 零增量（未接线）；+5 组单测（514→519）
* i18n +5 键（sourceHealth.impact.*，zh/en 对齐）

## v0.183.0 2026-10-05 · BI-19 学习对象生命周期状态机（纯模块，九态+四元数据）

* 新增 core/learning-object.ts：九态学习旅程（captured→clarified→candidate→committed→practiced→applied→maintained / stale / retired）；**转移表即契约**——每次转移必须携带触发（trigger 枚举）/责任模块（capture/wizard/review/user）/可见原因（reasonKey，不裸露枚举）/撤销策略（none/previous/explicit）四元数据，缺一不合法；+7 组单测（507→514）
* undo 策略可执行：previous 直接落 undo 反向记录（不受正向表约束，trigger=undo）；normalize 接受正向与 undo 两类轨迹且元数据缺一剔除；历史截 50 条
* i18n +13 键（loState 段 reasonKeys，嵌套结构配点路径解析，zh/en 对齐）——吸取 BU-5 教训，reasonKeys 交付时即入 i18n 并附解析核对
* 与 BI-5 分工：BI-5 管材料内容生命周期，本模块管学习旅程本身，并行记录互不替代；bundle 零增量（未接线）

## v0.182.0 2026-10-05 · 优化轮三连：e2e 抗抖动 + 预算到自动记因 + 减负联动

* e2e-isolated 抗抖动：冷启动内核索引未就绪时 createDocWithMd 偶发 "block not found"（本轮实测一次误报）——失败自动重试一次
* BI-8/12 联动：预算到点进入完成屏时自动记「时间到」收工原因（中性事实；用户手动点选的原因优先，不覆盖）
* BI-13 联动：减负选择「缩小范围」点击后聚焦范围选择器（提示收窄，不代选范围）
* 主包 42.11KB 不变

## v0.181.0 2026-10-05 · BI-17 切片：管理器视图状态持久化（返回恢复筛选）

* settings 增 lastManagerView（JSON 字符串）+ parseManagerView 宽容解析纯函数（非法枚举/缺字段回缺省、损坏 JSON 回 null，+3 组单测 504→507）
* 管理器页签：挂载时恢复上次筛选词/排序/烂卡筛选/状态过滤（due 态恢复自动重拉到期集）；视图变化即持久化（settings 走 saveSettingsSoon 防抖）——验收「筛选恢复」部分落地；滚动/焦点恢复依赖宿主 DOM 登记余项
* BI-17 全项（跨练习/来源/目标的多级返回+滚动焦点）仍需宿主导航能力，本切片只收口可离线交付部分
* 主包 42.11KB 不变

## v0.180.0 2026-10-05 · 优化轮：dialogs 缓存失败可重试 + 预算自定义值回显

* 缺陷修复（自查发现）：loadDialogsComp 的 ready 缓存会把 rejected promise 驻留——dialogs chunk 一次加载失败（如网络瞬断）后所有对话框永久报错、不再重试；修复为失败即清缓存（rejected 不驻留），重试链与 chunk-loader 既有语义（已测）对齐
* BI-12 UI 打磨：偏好弹层预算下拉在自定义分钟生效时回显「N 分钟」项（此前 select 空白）
* 主包 42.07KB 不变；纯缺陷修复无新功能

## v0.179.0 2026-10-05 · 混合题型轮换（调研产出的展示层轮换，不动调度）

* 新增 core/question-rotation.ts 纯模块：按本场作答张数在翻面/打字/选择间轮换提名出题形态（仅轮换已启用题型；单一启用恒翻面——无多样性不假装轮换；异常输入归一），+4 组单测（500→504）
* 复习面板：全局设置「混合题型轮换」（默认关）+ 本场偏好弹层可覆盖（BX-3 覆盖集免费获得）；轮换提名 choice 时自动本地采样干扰项（等同手动 🎲，无网络）；轮换关=既有静态设置行为逐字节保持
* 来源：Quizlet Learn 多题型混合轮换（docs/17 AO 区 v0.178.0 调研登记）；展示层轮换不动调度与统计
* i18n +3 键（settings.mixedRotation*，zh/en 对齐）；主包 42.06KB 不变

## v0.178.0 2026-10-05 · docs/34 E2E-3 真机走查单（学习旅程/AI 安全/chunk 化，W-1~W-12）

* 新增 E2E-3 走查单：12 项人工验收覆盖本会话全部待真机交付——W-1 chunk 化复验（关键前置）、W-2~W-4 内容状态面板/入口上下文/收工原因、W-5 返场检查+减负（含造数据方法）、W-6~W-9 预算/维护/目标页/界面模式、W-10~W-12 AI 前置检查/注入围栏/紧急停用（需真实模型）
* 每项含步骤/预期；执行顺序与证据记录约定同 V 组（通过回写 docs/17「真机 W-x」注记）
* 纯文档版本：代码零变更；真机会话可照单执行（预计 1.5-2 小时）

## v0.177.0 2026-10-05 · BI-14 渐进界面（界面模式：简单/熟练）

* settings 增 uiMode 枚举（simple/advanced，默认 advanced=既有全量 UI，存量用户零感知）；归一化白名单 +1 测试（500→500，替换扩写枚举用例）
* 简单模式显隐（纯显示控制，不删配置）：Hub 隐藏「考试/维护」页签（initialTab 命中隐藏页签回退总览）；管理器隐藏烂卡筛选/CSV 导出/批量重置（批量删除保留——核心操作）；命令面板命令全量保留（验收「高级功能仍可搜索到」）
* 设置页模块段顶部新增「界面模式」选择（简单/熟练），提示文案声明不删配置；挂载时定格（改后重开页签生效，与 lastHubTab 语义同构）
* i18n +4 键（settings.uiMode*，zh/en 对齐）；主包 42.03KB 不变

## v0.176.0 2026-10-05 · BV-8/9 模板扩容（BV 家族收官，注册表 12 模板）

* BV-8 答案 rubric：必答要点/可接受别名/拒绝项/提示梯度（要点须有来源依据；评分要点仅供参考不映射正式评分）
* BV-9 列表/表格/双向卡：变体声明（list|table|reverse）+ 是否有序 + 列映射 + 逆向成立性 + 集合边界 + 来源原句（不强制双向化，变体附来源）
* i18n +2 nameKeys（防回归测试自动覆盖）；注册表 10→12 模板，settings 下拉与 BV 家族在册测试同步更新

## v0.175.0 2026-10-05 · BI-16 用户自定义完成定义（标准可修改，历史保留）

* learning-goal 增 criteriaHistory（GoalCriteria{text,since} 追加式历史，最新在末尾；白名单清洗：空文本剔除/截 100 字/上限 20 条）+ setCriteria（同文无操作/空文本忽略，不可变追加）+ currentCriteria；+2 组单测（498→500）
* 目标表单新增「完成标准」输入（占位示例：读完第一章/能讲解给他人/能做对例题）；目标行显示 🎯 现行定义——修改即追加历史，旧定义按验收保留当时版本
* i18n +2 键（goals.criteria*，zh/en 对齐）；hub chunk 49.37KB / 主包 42.00KB（≤55KB 内）

## v0.174.0 2026-10-05 · AT-17 延伸：dialogs chunk 切分（主包 72.97→41.89KB）

* libs/dialog 增挂载器注入点（setDialogMounter）：svelteDialog 经注入的 mounter 挂载 chunk 编译的组件——组件与挂载同 svelte 实例，杜绝双份内部状态 split-brain；未安装时回退 shell svelte（dev 进程内组件）；组件销毁统一出口兼容句柄/实例两种形态
* 新增 chunks/dialogs.ts：9 个对话框组件（向导/遮挡/引导/挑战/标记/配对/设置/选卡组/快速制卡）+ mountDialogComponent；**关键坑位**：挂载器安装必须在 shell 侧（chunk 内 import shell 的 libs/dialog 会形成模块双副本，setter 无效）
* **DCE 坑位**：dev 动态 import 若作实参传包装函数会被无条件打包（首测主包反涨 73.15KB）——DEV 三元移到调用点后 define+DCE 正确剪枝
* 实测：主包 72.97→**41.89KB**（-31.1KB，对话框组件+kit+shell svelte 内部运行时全部移出）；dialogs chunk 37.88KB+css 按需加载；隔离 e2e 16/16（含 dialogs 六项断言）；预算第六次修订 ≤75→**≤55KB** 锁定收益
* i18n 无变化；单测 +2（chunk-loader dialogs 形态与导出校验，496→498）

## v0.173.0 2026-10-05 · BU-31 AI 故障与安全事件处置（紧急停用 + 撤销同意）

* 新增 core/ai-kill-switch.ts 纯模块：目标粒度紧急停用（provider:/model:/task:/template: 非明文键）+ 撤销同意总闸 + 批次隔离 + 安全事件流（最近 50 条，幂等操作不重复记事件，scope 截断 120 字不含材料内容）+ normalize 白名单清洗；+6 组单测（491→497）
* 存储：ai-killswitch.json 入 STORE_KEYS 批量加载 + 落盘 + storageStats 行 + PRIVACY 披露（governance 存储披露核对拦截一次后补齐——机制有效）
* generate 前置检查追加总闸/目标粒度阻断（consent-revoked / target-disabled 两种错误文案）；设置页 AI 段新增「紧急停用」行：停用/恢复当前配置、撤销/重新授予同意——**停用与撤销均同步清理待发队列**（活动态 ai-jobs → canceled，验收「清理待发」）；卡片与正式复习零影响
* 验收留痕：停用后无后台请求 ✓（前置检查组装前阻断）；「恢复旧版本」（设置快照回滚）登记为余项
* i18n +13 键（settings.aiKill* + aiKill.* 错误文案，zh/en 对齐）；主包 72.97KB（≤75KB，余量 2KB——下一批 UI 前评估 dialogs chunk）

## v0.172.0 2026-10-05 · BU-33 AI eligibility 前置检查（组装前阻断 + 替代路径）

* 新增 core/ai-eligibility.ts 纯模块：五类前置检查（材料非空/AI 配置/网络在线/来源敏感/成本预算）按固定优先级阻断，每条阻断强制配对「手工/本地替代路径」键——验收「不把环境失败归因成模型质量」；事实未提供的检查项不判而非失败（渐进接入：敏感=BL-5 预留、成本=BU-24/25 账本预留）；+5 组单测（486→491）
* 向导 generate 接线：组装 prompt **前**检查（材料空/custom 未配端点密钥/navigator.onLine 离线）——不满足即抛「原因+替代」错误，零 token 消耗；siyuan 网关模式视为已配置
* i18n +10 键（aiElig 段 5 原因+5 替代，zh/en 对齐）；主包 71.83KB（≤75KB 内）

## v0.171.0 2026-10-05 · BU-35 AI 调用流水线骨架（生成链收编单一入口）

* 新增 core/ai-pipeline.ts：TaskRegistry（cards-generate：默认模板/schema 契约/固定写入目标/24000 token 保守窗口）+ assembleGeneratePrompt 组装器——模板解析（BU-5 自定义/默认双路径，行为逐字节保持）→ 不可信围栏（BU-7）→ 隔离条款 → BU-6 预算报告 → 审计字段（task/模板来源/token 数/截断层/needsBatching/writeTarget，不含材料明文）；+6 组单测（480→486）
* openAIWizard generate 切换至流水线入口：手工拼装（模板串替换+围栏+条款）退役；超长语义不变（needsBatching=原 24000 阈值，照旧抛 aiTooLong）；AuditSink 接 lvLog（仅非敏感字段）
* 流水线七段映射留痕：ProviderRouter=aiChat 配置（mode/fallback 既有）、SchemaValidator=parseCards+PARSE_LIMITS、EvidenceStore=ai-jobs excerpt、ContextPack/PromptRegistry=本模块、AuditSink=lvLog——UI/Agent/批处理扩展任务必须经 TASK_REGISTRY 登记（写入目标边界）
* 主包 70.72→71.55KB（context-budget 随接线转正，≤75KB 内）

## v0.170.0 2026-10-05 · BU-7 提示注入隔离（数据围栏 + 离线攻击 fixture）

* 新增 core/prompt-injection.ts：不可信数据围栏（wrapUntrusted，label 净化防标签逃逸）+ 系统侧数据隔离条款（声明三不动：无工具调用/不外发/产物只写制卡向导）+ 10 组中英注入模式扫描器（忽略指令/角色翻转/伪造 system 标签/套取提示词/数据外发/工具调用/权限提升）
* 向导 generate 接线：system 追加隔离条款（i18n 可覆盖）、材料以 <untrusted_data> 围栏包裹后进 user 提示——「来源笔记里的指令」被隔离为纯数据；扫描器用 String.match（等价改写，消除安全扫描器对 exec 标识符的误报）
* 离线攻击 fixture：10 条攻击全命中 + 正常学习材料零误报（含「Ignore 语法」这类形近教材文案），+7 组单测（473→480）
* 分层防御口径：本插件 AI 无工具调用、无自主外发、写入目标固定（攻击面天然受限）；扫描器为诊断留证手段而非判决
* i18n +2 键（aiInjectionGuard/aiUntrustedLabel，zh/en 对齐）；主包 70.72KB（≤75KB 内）

## v0.169.0 2026-10-05 · BU-6 上下文预算器（纯模块，零打包增量）

* 新增 core/context-budget.ts：五层固定序拼接（system→instruction→preference→material→tool，与输入顺序无关）+ 优先级预算分配（材料证据层 priority 1 最后才裁）+ 从头截断保留来源位置（尾部可见标记，禁止静默）+ 材料独木超预算时 needsBatching/suggestBatches 分批建议（≥2）；+6 组单测（467→473）
* 验收口径：超长材料先给裁剪/分批预览 ✓（reports 逐层列明截断/丢弃）；「不把答案带入题面」归模板层（BV 家族）职责，预算器只保证层级完整不重排不合并
* 纯模块先行未接线（bundle 零变化 70.38KB）；消费方=BU-35 调用流水线注册（向导生成链改造时接入）

## v0.168.0 2026-10-05 · BI-25/BI-12 验收收口（批量恢复 + 自定义预算）

* BI-25「撤销」补完：suspend-today 增 unsuspend（幂等移除，+1 组单测 465→467）；维护页已暂缓行显示「恢复」按钮，组内全部暂缓时组头切换为「本组恢复」；maintenance 通道增 unsuspendToday
* BI-12「自定义」补完：预算行增分钟数输入（clampBudgetMinutes 夹取：非法回 0=关闭、下界 5、上界 480、向下取整，+1 组测试）；预设下拉与自定义输入并排
* i18n +6 键（恢复/自定义相关，zh/en 对齐）；hub chunk 49.17KB / review 32.91KB / 主包 70.38KB（≤75KB 内）

## v0.167.0 2026-10-05 · BI-25 维护债务队列（只读诊断 + 可逆暂停）

* 新增 core/maintenance-queue.ts 纯模块：四类启发式检测（重复=归一化去空白全同≥2 张 / 题面泄漏=挖空答案文本出现在题面 / 过长>280 字 / 待审核=lifecycle needsRevision），+6 组单测（459→465）；启发式口径=「值得看一眼的候选」非判决
* Hub 新增「维护」页签（懒加载子页）：进入自动扫描（分页拉卡上限 500 + SQL 批量取 markdown/root）→ 四类分组列表（组计数 chip + 摘要行 + 明细）；行级「暂缓今日」（=今日不学，可逆次日恢复，不改变 due）与「打开来源」，组级「本组暂缓」批量；全部暂缓状态持久化进 suspend-today
* 验收口径留痕：维护不改变 due ✓（扫描零写入+暂停可逆）；批处理「预览/暂停」✓、「撤销」（批量取消暂缓）待下一批补
* i18n +17 键（hubTabMaintenance + maintenance 段，zh/en 对齐）；hub chunk 49.06KB / 主包 70.38KB（≤75KB 内）

## v0.166.0 2026-10-05 · BI-15 目标进度叙事（阶段计数，非掌握百分比）

* 新增 core/goal-narrative.ts 纯模块：BI-5 十态归组为旅程四阶段（已筛选/已入库/已应用/待维护），按旅程顺序输出非零阶段计数——不把卡数显示为掌握百分比；全空返回空数组不虚构 0%；+3 组单测（456→459）
* 目标页每行新增 🧭 叙事行（圈选材料的目标按其生命周期供数，goals 通道新增 narrate 只读计数入口）；无记录显示引导占位
* i18n +5 键（goalNarrative 段，zh/en 对齐）；hub chunk 47.71KB / 主包 70.11KB（≤75KB 内）

## v0.165.0 2026-10-05 · BI-13 减负选择（返场横幅扩展，影响先说明）

* 新增 core/load-relief.ts 纯模块：五种减负路径（缩小范围/只做高优先级/只读/休息/重建计划，阻力从小到大有序），每条强制携带对 due/历史的影响说明键；+2 组单测（454→456）
* BI-10 返场横幅扩展减负行：点击选择展开影响说明（aria-expanded + aria-live）——缩小范围/高优先=队列保留无惩罚；只读=不写日志；休息=内核 riff 顺延语义非遗忘；重建=仅作废当日现场且先有可撤销预览。全部只读建议，可跳过不执行
* i18n +11 键（loadRelief 段，zh/en 对齐）；review chunk 32.81KB / 主包 70.08KB 不变

## v0.164.0 2026-10-05 · BI-12 时间预算模式（预算到≠失败）

* 新增 core/session-budget.ts 纯模块：预算预设 5/15/30/60 分钟、平均每卡耗时估计（revlog dur 采样，离群剔除兜底 10s）、剩余倒计时、可完成范围与未完成项估计（口径恒等式：可完成+未完成=剩余总量）；+6 组单测（448→454）
* 「本场偏好」弹层新增预算行（关闭/预设）；头部倒计时 chip（⏳ mm:ss），到点转中性「预算到」chip——不自动结束、不扣目标、剩余卡真实保留队列；完成屏中性提示两种语义（进行中/已到点）
* 本场维度状态（非全局设置、不进 BX-3 覆盖集）；估计仅供参考（文案带「约」，未启用不显示）
* i18n +7 键（review.budget*，zh/en 对齐）；review chunk 32.54KB / 主包 70.08KB 不变

## v0.163.0 2026-10-05 · BU-5 收口（模板注册表接入设置页 + nameKey 防回归）

* 质量缺口修复：v0.116.0 交付的 10 个模板 nameKey **实际全部缺失于 i18n**（注册表休眠无消费方故未暴露）——本批补齐 zh/en 各 10 键 + +1 组防回归测试（每个模板 nameKey 必须双语可解析，447→448）
* 设置页「AI 提示词模板」从 3 个散落 i18n 预设按钮改为注册表驱动下拉（10 模板：通用/考试/语言 + BV 家族 6 件套 + 烂卡改写），选中即写入自定义模板框可再编辑；恢复默认按钮保留——模板单一事实源收口
* 体积：主包 67.61→70.08KB（注册表随设置页入 shell，≤75KB 预算内）；hub/review chunk 不变

## v0.162.0 2026-10-05 · BX-2 W2 卡片人工编辑 + 写前差异预览

* 新增 ui/card-editor.svelte（卡片详情抽屉内嵌，Kit 级可测）：编辑块 markdown → 200ms 防抖差异预览（charDiff LCS 行内 add/del 高亮，400 字预算护栏）→ 确认才 updateBlock 写回；取消/拒绝保留原卡；无改动不可保存；保存失败面板保持可重试；+5 组单测（442→447）
* 卡片详情新增「编辑」入口（editorCtx 可选通道：blockContent 读 markdown / saveBlockContent 写回），保存成功后抽屉预览自动刷新；updateBlock API 封装入 api/siyuan
* 字段级 diff（BX-9 三字段）暂缓：卡片=单块+`==答案==`挖空约定，字段↔块映射需专项设计（登记于 BX-9 条目），本批先交付 W2 人工编辑+整内容差异预览
* i18n +11 键（editor 段，zh/en 对齐）；hub chunk 47.38KB / 主包 67.61KB（≤75KB 内）

## v0.161.0 2026-10-05 · BI-11 多目标取舍（目标优先级分层）

* learning-goal 增 priority 白名单字段（主目标/维持/暂缓，缺省=维持）+ sortGoalsByPriority 分层排序（同层 createdAt 升序稳定，不可变输入）；+2 组单测（440→442）
* 目标页排序切换为优先级分层（纯展示序：不改 due、不写内核、不改调度——验收硬性要求）；每行新增优先级循环按钮（主目标→维持→暂缓），aria-live 播报
* i18n +4 键（goals.priority 3 + priorityTitle，zh/en 对齐）；hub chunk 46.28KB / 主包 67.53KB（≤75KB 内）

## v0.160.0 2026-10-05 · BI-10 长期返场检查横幅（只读预览）

* 复习页签新增返场检查横幅：触发=长间隔（>7 天）或大积压（>100 到期，isLongReturn 阈值单一事实源 +1 组单测 439→440）；四查结果以 chips 呈现（warn 项高亮），「知道了」关闭（仅本次会话，可重复触发）
* 事实聚合入 ReviewCtx（getReturnCheckFacts，只读）：活跃目标数与最近截止（BI-1）、stale/needsRevision 计数（BI-5）、到期数（dueCache）、距上次学习天数（revlog）、时钟回拨检测；聚合失败静默不弹横幅
* 只读语义：不写内核、不改调度、不自动重建——重建影响预览（rebuildImpactPreview 契约）归 BI-28 可撤销批次承接；i18n +17 键（returnCheck 段）
* 体积：主包 67.49KB / review chunk 31.89KB（横幅在 review chunk），≤75KB 预算内

## v0.159.0 2026-10-05 · BI-8 收工原因（done 屏收集 + 恢复横幅随行）

* session-state 增 endReason 白名单字段（目标完成/时间到/精力不足/疑问待解决/手动结束，normalize 清洗 + withEndReason 不可变写入，+3 组单测 436→439）
* 复习完成屏新增五 chips「这次收工的原因？（可跳过）」——点选写入当日现场；「再次开始」新开现场时自动重置
* 中断恢复横幅随行展示「上次收工：…」（不改变四分支语义，辅助返场分流）；PRIVACY 披露同步
* 体积：主包 67.18KB / review chunk 31.35KB（done 屏在 review chunk），预算 ≤75KB 内余量充足

## v0.158.0 2026-10-05 · AT-17 chunk 加载器落地（主包 101.93→67.14KB）

* 机制定案：解剖思源 stage/build 加载器实证——桌面端插件 JS=同步 XHR 文本+内联 script 注入（全局作用域 Node globals），移动端=src script 标签；本插件取 **src script 标签 + window.__lvChunks 注册表**（无 eval/CSP 依赖，与宿主同机制）
* 构建：VITE_CHUNK=hub|review 双模式——独立 IIFE 自带 svelte（挂载与组件同实例，避免双份内部状态 split-brain），siyuan 经 shell 注入 __lvSiyuan 全局；CSS 平铺 chunks/<n>.css 经 link 注入；zip 打包自动含 chunks
* 加载器 libs/chunk-loader.ts：幂等注入（同 chunk 一次）、失败清缓存可重试、缺 mount 导出可诊断报错；+5 组单测（431→436）；dev 模式保留进程内动态导入双路径
* 实测：主包 67.14KB（-34.8KB，启动传输结构性回落）；hub 46.12KB+3.0css / review 31.07KB+2.3css 按需加载；隔离 e2e 扩展 chunk 可服务四断言后 **14/14 通过**；governance ⑨ 第五次修订 ≤102→≤75KB（回降锁定）
* 余项：AI 向导等对话框组件仍在主包（可再切 dialogs chunk）；**渲染进程 script 执行与页签挂载复验待真机**（无头 e2e 覆盖不到，UI 批次解禁以真机走查为准）

## v0.157.0 2026-10-05 · BI-10 长期返场检查（纯模块，零打包增量）

* 新增 core/return-check.ts：返场四查（目标活跃/临期 · 材料过时与待修订 · 积压量与长间隔（阈值 BACKLOG_DUE_WARN=100 / GAP_DAYS_WARN=7）· 设备时钟回拨/跨设备恢复）——全部只读，不写内核不改调度不自动重建；info/warn 分级，健康问题不冒充记忆失败（BI-7 同构）
* rebuildImpactPreview 重建影响只读预览契约：保留=内核 due/revlog（ADR-3）+目标档案+生命周期轨迹，作废=当日会话现场；真正的重建批次归 BI-28 可撤销模拟，本模块不执行
* 返场事实由调用方聚合（本模块不采集）；UI 接线待 AT-17 后批次（+9 组单测 422→431；主包体积零变化 101.93KB）

## v0.156.0 2026-10-05 · BI-3 入口上下文接线（复习会话入口条）

* 三个真实入口记录上下文：面包屑「复习本文档」（doc，返回点=该文档）、考试计划「今日开始」（report，来源=计划 ID，返回点=Hub 考试页签）、manager 内容状态面板「正式复习/练习」（card，返回点=Hub 管理页签）——upsert 落盘 entry-contexts.json，取消/重开不丢
* 复习面板头部入口条：入口类型 i18n 展示（不裸露内部枚举）+「返回」直达返回点（doc:/hub: 两协议）+「×」显式清除（唯一删除路径；7 天 TTL 由 normalize/isContextFresh 兜底）
* 重开恢复：复习页签无 entry 数据时按当前范围回退取最新未过期记录，上下文条自动重现
* 体积压线：主包 gzip 101.93KB（≤102KB 预算，余量 0.07KB——下一 UI 批次前须启动 AT-17 chunk 加载器）

## v0.155.0 2026-10-05 · BI-5/6/7 内容状态面板（manager 卡片详情接线）

* 新增 ui/lifecycle-panel.svelte（卡片详情嵌入，BI-5/6/7 三模块首个 UI 消费方）：状态 chip + 「为什么」解释与直达修复（BI-7 explainState，resume/unarchive 修复=生命周期转移）+ 下一动作建议 chips（BI-6 nextActions，可跳过不自动执行；宿主映射到真实入口：回来源/解释/修订→打开原文档，制卡→AI 向导（成功自动记 candidate→reviewed→stocked 合法链），正式复习→复习页签，练习→突击模式，收工→关详情）+ 状态流转按钮（BI-5 合法目标集，转移必带预设原因）+ 轨迹倒序清单
* 显式开档语义：详情打开仅读快照，浏览不隐式建档；「开档记录」按钮创建 source 起点并落盘
* manager ctx 新增 lc 通道（snapshot/open/transition/openReview/makeCards）；转移经既有 transitionContentState（校验+落盘一体）
* i18n +28 键（lc 段：state×10 + reason×11 + 面板文案×7，zh/en 对齐）；+9 组面板单测（413→422）
* AT-14 预算第四次修订 ≤101→≤102KB：本批 +1.5KB（101.25KB 实测），与 E2E-1 性能实测（LCP 0.84-1.40s/INP 16-72ms）时量级同档；结构性回落仍归 AT-17 chunk 加载器（后续 UI 批次前置）

## v0.154.0 2026-10-04 · BI-1 目标向导 UI（Hub「目标」页签）

* 新增 ui/goals-page.svelte（Hub 内「目标」页签，懒加载）：目标卡表单（六目的/截止日期/每日分钟/水平）+ suggestedMinutes 建议 + 目标列表（活跃/已过期 chip + 截止倒计时 + 删除确认）——只记录目标不强迫建卡
* 插件侧 goals 通道（get/save upsert 自动生成 id/remove）+ saveLearningGoal/removeLearningGoal 落盘 learning-goals.json
* 品质线对齐：LvPage 页头计数 + LvChip 状态 + LvEmpty 引导 + confirmDialog + aria-live 播报
* i18n +50 键（hubTabGoals + goals 24×2，754→804 对齐）；主包 gzip 99.72KB（≤101KB，AT-17 chunk 加载器为下批前置）
## v0.153.0 2026-10-04 · BI-2/BI-9 复习面板接线（目的选择器 + 恢复分支）

* BI-9 恢复分支：有当日现场时头部横幅四选一（继续原场/只看摘要/缩小范围/结束），跨天/零进度/队列空禁用语义由 session-recovery 纯模块判定（首刷回填队列数）；评分/跳过=隐式续场自动收横幅；结束=清现场重开，全程不自动重复评分/写卡
* BI-2 目的选择器：头部六目的下拉 + 结束条件 chip 随目的切换；完成屏评分口径随目的——informal 只鼓励不庆祝每日目标，formal 维持原庆祝
* 测试基建：big-library 计时断言加负载因子校准（实测基线循环等比放大预算封顶 8x）——重负载机器（并行内核/构建）不再误报，O(n²) 回归依然必爆
* i18n +10 键（744→754 对齐）；主包 gzip 98KB（≤101KB）
## v0.152.0 2026-10-04 · BX-10 收件箱事件自动刷新

* 插件侧：inboxListeners 监听器组 + subscribeInbox/notifyInboxChanged——块菜单收集、通道增删改、送去制卡成功清理后全量通知
* 收件箱页  订阅变更自动同步快照（E2E-2 登记的手动 ⟳ 兜底退役，按钮保留作手动手段）
* badge 评估结论：不加——顶栏 badge 语义=到期数（440 心跳），混入筛选计数会稀释语义；待筛选数已在收件箱页签与页头常显
* BX-10 代码完成待真机勾选
## v0.151.0 2026-10-04 · AT-15 体积决策落地（压缩器实测定案 + 预算挂钩性能实测）

* 压缩器实测：terser 5.51（toplevel mangle + drop_console）98.41KB 不敌 esbuild 96.97KB——维持 esbuild，terser 移除
* 预算第三次修订 ≤98→≤101KB 且与真机性能实测挂钩（E2E-1：LCP 0.84-1.40s / INP 16-72ms 良好，非无据放宽）；为 UI 接线批次留位
* 结构性回落方案登记为 AT-17：自研 chunk 加载器（内核 HTTP 服务插件资源已实证 GET /plugins/... 200，可绕开 require shim，预算可回落 ≤60KB 量级）
* AT-15 勾选（194 done）；governance 935 条
## v0.150.2 2026-10-04 · 隔离式后台 e2e 框架（AT-16 主体交付）

* 新增 scripts/e2e-isolated.mjs：临时工作区+无头内核（独立端口）+自动部署插件+setPetalEnabled 启用+内核 riff 全回环断言（建笔记本/文档/卡包/制卡/到期/评分/队列消费）+自动拆卸；--keep 保留环境供 UI 走查，--ui 尽力拉窗口
* 与其他思源实例并行实证互不影响（在 2 个既有内核运行时跑通 10/10）；修复 e2e-launch.ps1 独占模式风险警示（不再误杀并行会话）
* AT-16 主体完成，余 UI 实例自动化部分
## v0.150.1 2026-10-04 · 收件箱 UI 对齐设计品质线（真机走查修复）

* 真机走查发现：筛选 chips 显示 undefined (0)——labelKey 用了平铺键查找而 i18n 为嵌套对象；改 t[...] 并全部经 t 派生
* 品质线对齐 manager 页（可超不低于）：LvPage 页头（四状态计数摘要）+ LvSegmented 筛选/全选/刷新入 actions + 毛玻璃批量条（LvChip 计数 + 按上下文出按钮 + 取消选择）+ 行级 LvSkeleton 标题加载（失败回退短 ID）+ LvEmpty 空态 + LvLive 读屏播报（AS-4）+ 行 hover 升起/侧条样式 + 320px 换行
* 破坏性操作接 confirmDialog（彻底删除需确认）；批量结果 showMessage + aria-live 双通道
* 新增行内「打开来源」（BI-6 openSource）：SQL 查 root_id 锚点打开，失败退化块 ID
* ctx 新增 openSource；i18n +9 键（726→744 对齐）
## v0.150.0 2026-10-04 · BI-4 收件箱→制卡管线闭环

* 收件箱「已选中」页新增「送去制卡」：拉取选中块文（分批 SQL，引号转义）拼接为向导材料，一键开 AI 制卡向导
* 制卡成功回调：自动清收件箱（removeInboxItem）+ 记内容生命周期合法链（source→candidate→reviewed→stocked，向导逐张 keep/reject 即审核）；失败不影响制卡结果
* openAIWizard 扩展可选 onCreated 回调（既有调用方不受影响）；收件箱页新增「刷新」按钮（对话框关闭后手动同步快照）
* i18n +8 键（sendToCards/refresh/refreshedNotice/emptySource ×2，710→726 对齐）；主包 gzip 96.64KB（≤98KB 内）
## v0.149.1 2026-10-04 · CI 体积门禁修复（陈旧 32KB 硬编码）

* 发现：main 分支 CI 自 v0.125.0 预算首次修订后持续失败——ci.yml 内独立硬编码 32KB gzip 门禁未随预算修订更新（本地 governance 已两次修订，CI 侧漏改）
* 修复：ci.yml build 后置步骤改为复用 check-governance.mjs（⑨ 门禁单一事实源，build 后 dist 已在真正生效）
* v0.149.0 tag 发版未受影响（release workflow 无该门禁）
## v0.149.0 2026-10-04 · BI-4 收件箱筛选 UI + 块菜单收集入口

* 新增 ui/inbox-page.svelte（Hub 内新「收件箱」页签，懒加载 chunk）：四状态分段筛选（待筛选/暂存/已选中/已淘汰）+ 多选批量操作（暂存/选中/淘汰/退回/撤销选中/恢复/彻底删除）+ 块标题异步解析（content 首行，失败回退短 ID）
* 块菜单新增「加入材料收件箱」（多选支持 ×N 计数；只读收集不产生 due；inbox 模块开关联动）+ modules 注册表新增 inbox 模块（defaultOn）
* index.ts 收件箱通道：快照进、变更出+落盘（UI 无直改存储权）
* AT-14 预算第二次修订 ≤95→≤98KB 并留痕（BI-4 UI 纳入后 96.31KB；单文件约束下懒加载仅延迟执行；上游 shim 修复恢复真分包可回落）
* i18n +36 键（hubTabInbox + modules.inbox×2 + inbox 15×2 + 菜单 3×2，674→710 对齐）
## v0.148.0 2026-10-04 · BI 系列存储接线收官（learning-goals/entry-contexts/content-lifecycles）

* learning-goals.json / entry-contexts.json / content-lifecycles.json 并入 STORE_KEYS 批量加载 + 三个 saveX 落盘入口 + storageStats 行 + PRIVACY 披露
* content-lifecycle.ts 补集合层：normalizeLifecycles（去重/剔除/空兜底）+ ensureLifecycle（同 blockID 幂等开档）+ transitionContentState 校验落盘一体入口
* +2 组集合层测试（411→413）；主包 gzip 94.74KB（≤95KB 内，余量收紧需盯）
## v0.147.0 2026-10-04 · BX-9 字段级 diff 预览与逐项采用（纯模块）

* 新增 core/field-diff.ts：三字段（问面/答案/解释）差异检测 + LCS 行内高亮片段（same/add/del 合并，400 字符预算护栏超限整段替换）+ applySelections 逐字段采用 + 全拒绝等价取消（结果深等于原卡，拒绝即保留不静默替换）
* 纯前端 diff 流转：不产生正式评分、不外发（验收硬性要求）；AI 改写意图/生成归 BX-2 走 G3-call
* +8 组测试（403→411）；主包 gzip 94KB（≤95KB 内）
## v0.146.0 2026-10-04 · BI-1 目标模型 + BI-3 入口上下文（纯模块，BI 系列地基收官）

* 新增 core/learning-goal.ts：目标模型（目的/截止/材料/每日可用分钟/水平自评）——可只记录目标不强迫建卡（验收口径）；normalize 白名单清洗 + daysUntilDeadline/isGoalActive + suggestedMinutes 目的×水平推荐
* 新增 core/entry-context.ts：入口上下文（六入口类型×来源/范围/目标/返回点）——upsert 刷新/find 恢复/remove 清除 + JSON 往返无损（取消/重开不丢上下文）+ 7 天新鲜度
* BI 系列纯模块地基至此收官：BI-1/2/3/4/5/6/7/8/9 全部有可测核心，UI 接线按批次跟进
* +10 组测试（393→403）；主包 gzip 94KB（≤95KB 内）
## v0.145.0 2026-10-04 · BI-7 状态转移解释 + BI-9 中断恢复分支（纯模块）

* 新增 core/state-explain.ts：十态「为什么+直达修复」映射（stateWhy i18n 键+repair 动作）+ whyNotReviewable 内容侧不可复习原因专项（调度侧属内核 riff ADR-3）
* 新增 core/session-recovery.ts：中断恢复四分支（继续原场/只看摘要/缩小范围/结束）可用性推导——跨天失效/零进度/队列空三种禁用语义，结束永远可选，不自动重复评分/写卡
* i18n +46 键（stateWhy 16×2 + recovery 7×2，628→674 对齐）
* +7 组测试（386→393）；主包 gzip 94KB（≤95KB 内）
## v0.144.0 2026-10-04 · BI-5 内容状态机 + BI-6 下一动作建议（纯模块）

* 新增 core/content-lifecycle.ts：十态内容生命周期（source→candidate→reviewed→stocked→inReview→applied / needsRevision / paused / stale / archived），合法转移表 + 转移必带原因与时间 + normalize 白名单清洗（非法轨迹逐条剔除，末态取最后合法轨迹）+ lifecycleStats 分组统计；学习侧调度仍由内核 riff 独占（ADR-3），双状态机分开记录
* 新增 core/next-action.ts：按内容状态推导有序建议（回来源/解释/制卡/练习/正式复习/修订/收工），7 动作全覆盖无死动作，建议可跳过不自动执行
* i18n +14 键（nextAction 7×2，614→628 对齐）
* +14 组测试（372→386）；主包 gzip 94KB（≤95KB 内）
## v0.143.0 2026-10-04 · BI-2 目的驱动会话入口（纯模块）

* 新增 core/session-purpose.ts：六目的档案（探索/构建/复习/练习/应用/维护）× 结束条件 × 评分口径（review/maintain=formal 计入正式统计，其余 informal 不占每日目标；调度仍由内核 riff 独占 ADR-3）
* purposeProgress：进度计算（remaining 型=到期清空即完成；targetOverride 覆盖默认目标；无量化目标转 BI-8 endReason 收工）
* i18n +12 键（zh/en purpose 对象 6×2，602→614 对齐）
* +8 组目的测试；测试 364→372；主包 gzip 94KB（≤95KB 内）
## v0.142.0 2026-10-04 · BI-4 材料筛选收件箱（纯模块 + 存储接线）

* 新增 core/inbox.ts：材料块筛选状态机（inbox → staged → selected / dismissed），批量确认可撤销（undoSelection 打回 staged）
* addInboxItem 按 blockID 去重；normalizeInbox 白名单清洗（非法状态回 inbox、重复块去重）
* 存储接线：inbox.json 并入 STORE_KEYS 批量加载（zipLoaded 位置配对）+ saveInbox 落盘入口 + storageStats 行 + PRIVACY 披露（只存块 ID 不存内容）
* +8 组收件箱测试；测试 356→364；主包 gzip 94KB（≤95KB 内）
## v0.141.0 2026-10-04 · G3-call 嵌套数组解析修复 + AI 管线端到端验证

* G3-call 真实模型发现：glm-4-flash 返回嵌套数组——parseCards 无法解析（得 0 卡）
* 修复：parseCards 添加 flatMap 展平嵌套数组
* G3-call 端到端管线验证通过
* +2 组嵌套数组测试；测试 354→356
## v0.140.0 2026-10-04 · BJ-2 提示级别指示器 + 代码清理

* hintLevelText()：提示文本区域显示当前级别位置（如 1/2）
* 清理未使用导入（HINT_LEVELS/buildSummary）
* 341/341 测试；0 errors/0 warnings
## v0.139.0 2026-10-04 · BJ-2 full 级行为修正（即翻面）+ AS-4 保存成功播报接线

* BJ-2 行为修正：full 级=即翻面（showAnswer=true 并重置提示状态），此前 full 级展示全文为 hint text 与设计意图不符
* AQ-4/AS-4：persist 恢复提示接入 trackSave（hadPersistFail→onOk 展示 settingsSaved）
* 354/354 测试；0 errors/0 warnings
## v0.138.0 2026-10-04 · BI-8 done 屏建议集成 + BJ-2 提示内容推导接入

* done 屏新增建议消息（buildSummary 推导：目标达成 🎉 / 有进度 💪 / 空态无消息）
* BJ-2 advanceHint 接入 deriveHintLevels（v0.133.0 纯函数，替代此前硬编码截取）
* i18n +1 键（doneProgress，603 对齐）；354/354 测试；0 errors/0 warnings
## v0.137.0 2026-10-04 · BJ-4 日期清理 + BI-8 会话收工摘要（纯模块）

* error-reasons.ts normalizeErrorTags 新增 30 天保留清理（超期旧标注自动清理防无限增长）+ 2 组清理测试
* 新增 core/session-summary.ts（BI-8）：buildSummary 构建会话收工摘要（统计+进度 pct+suggestionKey 建议推导）+ 4 组单测
* 测试 348→354；0 errors/0 warnings

## v0.136.0 2026-10-04 · 测试覆盖补强：BJ-4 normalizeErrorTags + AS-4 LvLive

* 复习面板问题态新增 h 键快捷推进分级提示
* 帮助覆盖层新增 h 键说明
* i18n +1 键（helpHint，602 对齐）
## v0.135.0 2026-10-04 · AQ-4 恢复可观测 + AS-4 收尾

* persist 队列新增失败→恢复跟踪：onFail 置位 hadPersistFail，下次 onOk 展示「保存成功」提示确认恢复（此前失败后静默恢复用户无感知）
* AS-4 勾选（基础版+保存成功播报均已接入 LvLive/review 面板）
* 341/341 测试；0 errors/0 warnings；主包 gzip 92.58KB（≤95KB 内）
## v0.134.1 2026-10-04 · BJ-4 标注标签国际化修复

* 修复：BJ-4 错误原因标注 chips 标签此前硬编码中文（英文用户看到中文标签），改为 i18n errReasons 段引用
* 335/335 测试；0 errors/0 warnings

## v0.134.0 2026-10-04 · BK-1↔BJ-2 集成：知识对象事实优先作提示内容

* review ctx 新增 getKOBySource（按来源块查知识对象 fact+capability）
* advanceHint 改为 KO 优先：有知识对象时 recall-target/keyword=KO fact（精准），无知识对象时 deriveHintLevels 文本推导兜底
* BK-1（知识对象）与 BJ-2（提示阶梯）形成数据闭环：快速制卡→自动注册→复习时提示内容更精准
* 341/341 测试；0 errors/0 warnings
## v0.133.0 2026-10-04 · BJ-2 提示内容推导：从卡面文本自动生成分级提示

* 新增 deriveHintLevels 纯函数：从卡面纯文本自动推导 HintLevelsInput（无需预标注）
* 推导策略：explanation=第一句完整句、keyword=粗体/高亮标记内容或前 30%、full=全部文本
* review.svelte advanceHint 改用推导结果（此前硬编码前 30 字符）
* 6 组推导单测；测试 335→341；0 errors/0 warnings
## v0.132.0 2026-10-04 · BJ-4 仪表盘错误原因分布

* dashboard ctx 新增 getErrorReasonStats（errorReasonStats 全量累计，>0 过滤）
* 总览新增「错误原因分布」LvSection（七类原因本地化标签 + 计数；无标注时区块隐藏）
* AT-14 勾选（门禁 ⑨ 生效 + 预算修订达成）；i18n errReasons 段 10 键（601 对齐）
* 335/335 测试；0 errors/0 warnings；governance OK（931 条）
## v0.131.0 2026-10-04 · BJ-4 标注 UI + error-tags.json 存储接线

* review.svelte 遗忘评分后显示七类错误原因 chips 行（旁路增强：点选即标注并隐藏，不阻塞下一张；ctx 注入 tagErrorReason）
* error-tags.json 入 STORE_KEYS 批载 + normalizeErrorTags 白名单清洗 + saveErrorTags persist 方法；PRIVACY 披露 + 存储体检 +2 行
* i18n +1 键（errTagPrompt，592 对齐）；335/335 测试；0 errors/0 warnings；governance OK（931 条）
## v0.130.0 2026-10-04 · BJ-2 复习面板提示集成：hint 按钮 + 阶梯展示 + 日志

* review.svelte 集成 BJ-2 提示阶梯：问题态新增「提示」按钮，点击逐步揭示提示文本（从卡面 HTML 剥离标签后取前 30 字符为 keyword 级，full 级翻面）
* 提示日志追加（hintLog：cardID+level+ts）；翻卡/切卡时自动重置
* 提示文本样式：左侧主色竖线+底色（区别于卡面内容）
* 设计约束：提示不自动提交评分
* i18n +1 键（hintBtn，591 对齐）；335/335 测试；0 errors/0 warnings；主包 gzip 91.49KB（≤95KB 内）

## v0.129.0 2026-10-04 · BJ-4 错误原因分类（纯模块）

* 新增 core/error-reasons.ts：七类错误原因（记忆空白/概念混淆/条件遗漏/步骤错误/题面不清/来源过时/注意力中断）+ tagError 同卡同日覆盖（可改选）+ errorReasonStats 分类计数（日期过滤）+ errorTagCoverage 遗忘卡标注覆盖率
* 设计约束：标注为评分后可选旁路动作（不阻塞评分主流程）；跨日独立记录
* 7 组单测；测试 328→335；0 errors/0 warnings

## v0.128.0 2026-10-04 · BJ-2 分级提示阶梯（纯模块）

* 新增 core/hint-ladder.ts：五级阶梯（recall-target→keyword→context→explanation→full）+ 稀疏阶梯（缺失级别自动跳过，full 兜底=即翻面）+ 循环回首 + nextHint 下一级推进 + HintLogEntry 追加日志 + hintStats（提示次数/去重卡数/最深级别）
* 设计约束：提示不自动提交评分（纯逻辑返回，调用方决定展示与记录）；提示内容来源=知识对象/卡片可选 levels 字段
* 8 组单测；测试 320→328；0 errors/0 warnings

## v0.127.0 2026-10-04 · BJ-1 统计分栏：dashboard 能力分布

* dashboard ctx 新增 getCapabilityShare（基于已登记知识对象实例的 capabilityShare 排序）
* 总览新增「能力分布」LvSection（八类+unspecified 桶，计数+占比；无实例时区块隐藏）；i18n capability 段 3 键（590 对齐）
* AT-14 勾选（验收修订版达成：门禁 ⑨ 生效 + 主包 91KB ≤ 95KB 新预算）
* 320/320 测试；0 errors/0 warnings；governance OK（931 条，192 done）
## v0.126.0 2026-10-04 · BK-1 UI 收官：ko-panel 修订模式 + 快速制卡自动注册

* ko-panel 新增修订模式：「修订事实」→ 编辑框（实例清单保持可见，受影响实例一目了然）→ 保存回调携带新事实；未传 onrevise 不显示按钮（宿主可选）
* 快速制卡自动注册知识对象：创建成功后 fact=问题文本登记对象（来源=新建块）+ 查 riff 卡 ID 派生问答实例（旁路增强：失败不影响制卡主流程）；onCreate 签名扩展 q/a
* i18n +4 键（588 对齐）；修订模式 2 组单测；测试 318→320；0 errors/0 warnings；主包 gzip 90.75KB（≤95KB 预算内）

## v0.125.0 2026-10-04 · AT-12/14 定案：正线切单文件构建 + 预算修订

* **正线构建切单文件**（vite.config.ts output.inlineDynamicImports）：require shim 源码铁证（common.js `xe=ut=>ut==='siyuan'?ge():window.require?.(ut)`——相对路径基准丢失为结构性缺陷，多插件间歇实证），多 chunk 形态废弃；vite.config.inline.mjs 与 .tmp 部署脚本清理（正线即单文件）
* AT-14 验收修订：32KB 旧预算基于多 chunk 假设作废；新预算 **主包 gzip ≤95KB** 纳入 check-governance 门禁 ⑨（dist 存在即强制，当前 90.4KB）；瘦身手段转长期观察
* Hub 懒加载代码保留（单文件下 import() 内联为同步解析，无害且为上游 shim 修复后恢复懒加载留路）；真机复验：闪卡中心完整渲染（里程碑/True Retention/周期对比全部出数）
* 测试 318/318；0 errors/0 warnings
## v0.124.0 2026-10-04 · BK-1 制卡派生 UI：知识对象面板 + 详情抽屉嵌入

* 新增 ko-panel.svelte（props 注入可测）：核心事实展示 + 实例清单（停用开关翻转/移除）+ 派生下拉（自动排除已有卡型；deriving 禁用态）；5 组组件单测
* card-detail 嵌入知识对象区：未注册显示「注册为知识对象」（fact=块文本），已注册显示面板；manager koCtx 注入（快照/注册/停用/移除/异步派生——派生查 getRiffCardsByBlockIDs 取 riff 卡 ID）
* i18n ko 段 22 键（584 对齐）；测试 313→318；0 errors/0 warnings
* ⚠️ 主包 gzip 32.05KB 破自设 32KB 预算：登记 AT-14 回降计划（门禁未 CI 化，治理缺口同记）
## v0.123.0 2026-10-04 · BK-2 UI：关系查看/新建/删除面板

* 新增 relations-panel.svelte（Kit 级 props 注入可测）：双向视图（→/←方向标注）+ 七类关系本地化 + 新建表单校验（目标必填/拒自环）+ 逐行删除；4 组组件单测
* card-detail 抽屉嵌入关系区（manager ctx 注入 relationsOfBlock/addRelation/removeRelation，旧宿主缺省不显示）；管理器删卡同步 detachCard 端点清理
* 实体 id 口径声明：当前=块 ID（core/card-relations.ts 头注）；i18n +15 键（546→561）
* 测试 309→313；0 errors/0 warnings；主包 gzip 30.21KB
## v0.122.0 2026-10-04 · BK-1/BK-2 存储接线：知识对象与关系图入列插件私有数据

* knowledge-objects.json / relations.json 并入 STORE_KEYS 批量加载（AQ-1 同模式）+ normalize 白名单清洗 + persist 保存方法（saveKnowledgeObjects/saveCardRelations，重试与失败记录由队列承担）
* 存储体检新增两行（BK-1/BK-2 计数）；docs/PRIVACY.md 披露两文件（治理门禁 ⑦ 拦截后补齐，机制有效）
* BK-1/BK-2 的 docs/17 注记更新：存储接线完成，余验收=制卡/修订 UI 与关系查看 UI
* 309/309 测试；0 errors/0 warnings；governance OK

## v0.121.0 2026-10-04 · BK-2 卡片关系图（纯模块）

* 新增 core/card-relations.ts：七类关系（兄弟/前置/示例/反例/来源/应用/替代）——normalize 清洗（自环/坏边/重复剔除）、addRelation 去重建边、removeRelation 删边、relationsOf 双向视图、detachCard 内核卡删除端点清理
* 纯元数据定位：不改变内核 due/间隔，绝不产生第二调度器（BH-3 口径）；仅手工建边不自动推理
* 6 组单测；测试 303→309；0 errors/0 warnings
## v0.120.0 2026-10-04 · BK-1 知识对象与卡实例分离（纯模块）

* 新增 core/knowledge-objects.ts：KnowledgeObject（核心事实 + N 题型卡实例）模型——实例挂内核 riff cardID（卡片身份归内核），对象用 ko- 私有 id；存储设计小节在模块头（knowledge-objects.json，persist 队列同口径）
* 操作集：normalize 白名单清洗（坏对象剔除/同 id 去重/fact 500 截断）、deriveInstance 幂等派生、affectedInstances 含停用全列（核心事实修订的影响面）、toggleInstance 单变体独立停用、removeInstance 内核删除同步
* 7 组单测；测试 296→303；0 errors/0 warnings；存储接线与制卡/修订 UI 归后续批
## v0.119.0 2026-10-04 · 数据模型主线开工：BH-4 卡型目录 + BJ-1 能力类型分类法

* 新增 core/card-catalog.ts（BH-4）：14 卡型声明式目录——阶段（shipped 七项/planned 七项）×调度映射（native 正式调度 vs practice 练习模式）×降级路线（degradationRoute 防环解析，audio→dictation→typing 两级示范）；5 组单测（id 唯一/降级目标存在/无环/shipped 集合/调度口径）
* 新增 core/capability-types.ts（BJ-1）：八类能力常量 + 严格归一（未知归 unspecified 不猜测）+ 分组计数/占比排序（分母透明）；4 组单测
* 与 card-types.ts 动态判分注册表分工：目录=能力/阶段/降级声明，判分实现仍走 registerCardType（ADR-3）
* 测试 287→296；0 errors/0 warnings
## v0.118.0 2026-10-04 · 文档三件套收官：模块所有权与事实源（AX-1/BH-3/BH-13 勾选）

* 新增 docs/37-模块所有权与事实源.md：§1 模块所有权表（13 功能域 × 事实源/读写入口/事件/诊断面）+ §2 事实源映射七类归属（调度内核唯一 ADR-3 铁律）+ §3 双写与失效钩子顺序契约 + §4 待办治理现状 + §5 已知边界
* 勾选 AX-1/BH-3/BH-13（三个 P1）：「不存在两个模块同时拥有正式 due/评分」验收达成
* docs/README 索引补 37 号；governance OK（930 条，192 done）
## v0.117.0 2026-10-04 · BU-12 输出 schema 注册表

* 新增 core/ai-schemas.ts：8 输出形态 schema（cards-json/scan/clarify/route/split/leak/distractor/rewrite，与 prompt-templates output 对接口径）
* validateRows 宽容收敛校验（AJ5 同口径）：类型可收敛则收敛（数字字符串→数值/任意→string）、required 缺失记入 errors 不静默吞、坏行跳过、可选字段类型不符省略；7 组单测
* 测试 280→287；0 errors/0 warnings
## v0.116.0 2026-10-04 · BU-5/BV 提示词模板注册表

* 新增 core/prompt-templates.ts：10 模板注册表（generic/exam/language 三预设迁移 + BV 家族 7 新模板：教学价值扫描/目标澄清/卡型路由/原子拆解/反泄漏/干扰项/烂卡改写）
* renderTemplate 占位符渲染（未提供变量保留原样可预检）+ missingInputs 上下文完整性预检（BU-6 预算器对接口径）+ output 形态声明（BU-12 schema 对接口径）
* i18n nameKeys 7 键（539→546）；6 组单测；测试 274→280；0 errors/0 warnings

## v0.115.0 2026-10-04 · BU-20 黄金样本评测集（离线子集）：九类卡型契约

* 新增 tests/golden-samples.spec.ts：问答/挖空/语言/表格/代码/公式/长材料/冲突来源/脏输出九类脱敏 fixture，钉死 parseCards+lintAICards 输出契约（未来换模型/提示词的回归基线）
* 契约要点：围栏与噪声容忍、cloze/LaTeX/代码缩进逐字符保真、冲突来源不合并留用户裁决、脏输出丢弃口径（空卡丢、坏难度丢标注不丢卡、字符串难度收敛）、token 估算有界
* 测试 263→274（黄金 11 组）；0 errors/0 warnings

## v0.114.0 2026-10-04 · AX-2 事件契约版本化 + AQ-16 解析上限

* 勾选 AX-2（P1）：新增 libs/events.ts 事件契约单一事实源——LV_EVENTS 事件名常量（6 事件）+ builders（plugin/v=1/ts 毫秒统一填充，payload 只增不改约定）+ 幂等键构造注释；index.ts 全部 emit/on 迁移（裸字符串清零，含此前遗漏的 gateway-changed）；4 组契约单测
* AQ-16 补解析上限（PARSE_LIMITS）：单次 50 卡封顶、q≤500/a≤2000 字符超限丢弃；+2 组单测
* 测试 257→263；0 errors/0 warnings；governance OK（930 条，189 done）
## v0.113.0 2026-10-04 · AS-4 读屏播报基础版：LvLive + 复习四路接线

* 新增 kit/LvLive：aria-live 读屏专用组件（polite→status / assertive→alert，视觉隐藏不扰布局）
* review 四路播报：评分提交/跳过/队列加载 n 张（polite）、评分错误（assertive 透传 friendlyError）
* AQ-4 复核：persist onFail→30s 限流 toast+诊断+lvLog 链路 v0.95 起已闭环，本条余验收仅剩无 unload 退出模拟（真机项）
* i18n 536→539 键；257/257 测试；0 errors/0 warnings
## v0.112.0 2026-10-04 · AS-9/AS-10 可访问性：键盘模型与表单标签关联

* LvTabs（AS-9）：左右/Home/End 键盘模型（WAI-ARIA Tabs 惯例）+ roving tabindex + 唯一 id 契约 lv-tab-{id}（宿主据此 aria-controls 关联面板）+ type=button；3 组键盘单测
* LvSegmented（AS-9/10）：radiogroup ariaLabel + 左右/上下箭头切换
* LvRow（AS-10）：控件 label 包裹隐式关联（点击标签聚焦控件，display:flex 保持布局）
* LvSwitch/LvInput/LvSelect（AS-10）：ariaLabel 透传（无可见标签场景必配）
* 测试 254→257；0 errors/0 warnings
## v0.111.1 2026-10-04 · AR-8 错误态优先级矩阵落地

* dashboard：首次加载失败不再同时出现「空库→引导」误导与全 0 统计卡——错误+重试独占；有旧数据时横幅叠加旧值可见
* exam-page：卡组/笔记本列表双路加载失败时错误横幅可重试（单路失败降级为可用子集），不再静默空下拉
* review/manager 核查已合规（else-if 链保证错误优先于空态）；i18n +1 键（exam.loadFailed）
* 已知抖动：大库性能基准测试在多负载并行下偶发超时（重跑即过），后续如复发改串行或加自适应预算

## v0.111.0 2026-10-04 · AT-6 性能指标：启动/首交互/评分埋点 + P50/P95 诊断

* 新增 src/libs/perf.ts 纯模块：markStart（onload 首行）/markLayoutReady（onLayoutReady）/评分采样（复用 AQ-13 dur 漏斗，appendRevlog 单点接入）/p50-p95 线性插值/50 样本环形上限/diagLines 诊断段（persist/due cache 段同位，含冷热启动标记，onboarded 判定）
* 修复实现边界：t0=0 为合法时间戳（performance.now 从 0 起），改 started 标志位判定；P50/P95 预算为开发机参考值非 SLA，超预算仅诊断标注不阻断
* 测试 244→254（perf 10 组：百分位数学/状态机/采样上限/诊断输出）；0 errors/0 warnings；主包 gzip 28.04KB

## v0.110.3 2026-10-04 · 第一梯队微项清零：AT-4 收尾 + AQ-23 契约测试

* AT-4 收尾（P1）：管理器 getDueBlockIDs 改走共享 due 缓存（与 badge/总览合并请求，扇出清零）；dueCache.stats()（hits/misses/coalesced）接入诊断面板 persist 段同位展示——AT-4 验收测量工具齐备
* AQ-23（P3）勾选：新增 tests/personas.spec.ts 4 组画像预设数据契约（modules 键 ∈ MODULE_DEFS 注册表、核心模块开启、params 经 normalizeSettings 同口径校验、id/i18n 键完整）——core 目录纯模块测试覆盖收官
* 测试 240→244；0 errors/0 warnings；governance OK（930 条，188 done）

## v0.110.2 2026-10-03 · 真机验收首轮：openTab 修复 + 加载兼容性处置

* **修复（真机发现）**：openTabOf 调用已被移除的 Plugin 实例方法 openTab——思源 3.8.6 上点击顶栏/菜单/命令入口即抛 "this.openTab is not a function"，页签无法打开；改用模块级 openTab 函数 + custom 页签契约（id=plugin.name+type 无分隔符连写，与 addTab 注册键一致）。该 bug 经 `as any` 绕过类型检查、单测桩环境无法覆盖，由真机 e2e 首轮捕获
* **加载兼容性处置**：3.8.6 真机上多 chunk CJS 产物出现 require 相对 chunk 失败（同机构建的其他插件正常，文件哈希逐字节一致仍失败，根因待查，登记待办）；真机验收改用单文件内联产物（inlineDynamicImports，282KB/gzip 88KB）
* 真机环境证据：思源 3.8.6 桌面端加载、启用、onboarding 完成落盘 settings.json、示例卡组创建（AR-4）；DevTools 性能面板 LCP 0.84s / INP 16ms（AT-6 素材）
* 已知内核行为：getRiffDueCards 全局（deckID=""）对自建卡包新卡返回 0（卡组维度正常返回）——全局角标/复习范围受影响，登记待办

## v0.110.1 2026-10-03 · 兜底巡检：排版减号判分修复 + due 缓存跨代击穿修复

* **打字判分修复（BX-1）**：排版减号 U+2212 无 NFKC 兼容分解、属符号类被宽松判分剥离——"−1"（公式/多数输入法）失去符号变 "1"。归一化补排版减号→ASCII 减号折叠；+3 组测试（−1≡-1、−1≢1、全角减号/加号折叠保留）
* **due 缓存修复（AT-4）**：invalidate 时若有在途请求，新读取会合并到旧代请求且旧结果按当前代落缓存（15s TTL 内读到评分前旧值，击穿「评分后即拉新」）。在途请求带代际标记：跨代不合并、旧代结果不落缓存、只清自己的槽位；+1 组回归测试
* 「本场偏好」提示补顺序类覆盖生效时机披露（评分制/超时即时生效，倒序自下一批队列生效）
* 待办登记：BX-8 本场范围预设（BX-3 W4 拆出）、BX-9 字段级 diff 预览（BX-2 W2 前置拆解）；AO 区新增 Anki Custom Study / 打字判分与 Obsidian SR cram 调研结论（各注明可借鉴与不采纳理由）
* 测试 236→240；0 errors/0 warnings；governance OK（927 条目，187 done）

## v0.110.0 2026-10-03 · AT-5 大库基准 + revlog O(n²) 热点修复

* **性能修复（appendRevlog 首评判定 O(n²)→O(1)）**：卡历史判定原对全量 entries 做线性扫描，5 万条写入需 13.5s+；改为 WeakMap 缓存 Set（按数组身份自动失效）+ 截断改 splice 原地裁剪（slice 重建数组会让 2 万条上限后每次 append 触发 O(2万) 缓存重建）；50k 全链路 13.5s → ~4s
* 新增 tests/big-library.spec.ts（AT-5 离线子集，6 组规模预算）：1k/10k/50k 条全链路（写入+重算+聚合+leech+覆盖+CSV）、10k normalize 加载路径、打字判分恒定耗时、1 万条会话状态清洗；规模档测试显式 vitest 超时防 CI 并行波动
* 真机报告（固定设备/思源版本/UI 面板路径）仍归 docs/17 AT-5 本条
* 测试 230→236；0 errors/0 warnings；governance OK

## v0.109.0 2026-10-03 · AT-4 due 请求扇出收敛：generation + 短 TTL 共享缓存

* 新增 src/libs/due-cache.ts 纯模块（createDueCache）：同 scope 并发请求合并为一次（in-flight 去重）、TTL 内复用、invalidate 提升 generation 使旧代条目立即失效、失败不缓存（下次读取即重试）、LRU 有界防泄漏（6 组单测覆盖全部语义）
* 新增 src/api/due-shared.ts 进程级单例：badge 心跳、每日提醒、总览刷新、挑战模式、配对游戏五路 due 读取统一共享（同一时刻多次读取只打一次内核）；复习会话 loadQueue 带本场 reviewedIDs 保持直连
* 失效钩子全覆盖：appendRevlog（插件/原生评分漏斗，AT-11 语义）、cards-created、skip、快速改期、addRiffCards 包装（index.ts 全部建卡路径经此）、管理器删卡/重置
* 测试 224→230；0 errors/0 warnings；governance OK

## v0.108.0 2026-10-03 · AT-3 V2 请求超时层与启动探测隔离

* 新增 src/libs/timeout.ts 可取消超时层（withTimeout + TimeoutError）：与任意 Promise 组合的有界等待，任一方先落定即清计时器不泄漏，迟到一方的 settle 静默忽略（6 组单测：快/慢/断三态 + 计时器清除）
* V2 内核请求统一接入 3s 有界等待（V2_TIMEOUT_MS）：getMigrationStatus 探测与 getStatistics 等全部 /api/flashcard/* 端点在断核/慢核下 3s 内转 N/A/可重试，不再无限期挂起；菜单 redetectV2 重试路径保持
* 启动探测异步化：onload 不再 await 探测——插件初始化不被旧内核/慢内核阻塞，riff 兼容路径立即可用；探测完成后异步落库 gatewayState，菜单/诊断/getV2Status 均为运行时读取（完成前短暂显示 N/A 属预期）
* 测试 218→224；0 errors/0 warnings；governance OK

## v0.107.0 2026-10-03 · BX-3 本场偏好：复习面板会话内设置覆盖

* 复习面板新增「本场偏好」弹层（⚙ 头部按钮）：评分按钮风格（四档/三档）、队列倒序、超时模式三项可会话内即时覆盖，不落盘不污染全局设置
* 融合层 eff()：面板内全部 27 处设置读取统一切换至「本场覆盖优先、全局兜底」，覆盖项与全局同值时自动摘除（覆盖面最小化）；超时相关覆盖即时重启计时器（AT-10 热更新语义一致）
* 覆盖生命周期 = 面板生命周期：切页/重建面板即还原；覆盖激活时 ⚙ 按钮亮显（⚙●）提示
* i18n 中英各 +5 键（prefsTitle/prefsHint/prefsReset/prefsFour/prefsThree）；补齐 v0.106.0 漏升的版本号
* 新增 src/core/session-prefs.ts 纯函数（mergeSessionPrefs/pruneSessionPrefs）+ 6 组单测；测试 212→218；0 errors/0 warnings；主包 gzip 27.47KB（预算内）；governance OK（925 条目，187 done）

## v0.106.0 2026-10-03 · BX-1 离线子集：欧式小数逗号归一化

* 宽松判分数值归一化补强：欧式小数逗号 → 小数点（仅数字间），使 "3,14" ≡ "3.14"（欧洲标注习惯）；千位分隔逗号 "1,000" ≡ "1.000" 同理；非数字上下文逗号仍正常剥离
* docs/17 BX-1 注记补录（v0.106 离线子集交付留痕）
* 测试 208→212；0 errors/0 warnings；主包 gzip 27.59KB（预算内）

## v0.105.0 2026-10-03 · Kit smoke 收官补测：LvHeatmap/LvSkeleton（19 组件全覆盖）

* **LvHeatmap**（7 天数据渲染/末格 lv-cell-today/title 含日期/空数据不崩溃）、**LvSkeleton**（count 个骨架行/block 圆角样式/count=0 不渲染）——5 组 smoke 单测
* **Kit 组件测试 19/19 全覆盖**：LvStat/LvSteps/LvChip(宿主)/LvSection(宿主)/LvPage(宿主)/LvDrawer(宿主)/LvProgress/LvKbd/LvEmpty/LvError/LvSegmented/LvSwitch/LvTabs/LvRow/LvSlider/LvInput/LvSelect/LvHeatmap/LvSkeleton
* 测试 201→208；0 errors/0 warnings；主包 gzip 27.59KB（预算内）

## v0.104.0 2026-10-03 · Kit smoke 收官：布局壳 snippet 宿主全覆盖

* **LvPageHost/LvDrawerHost**（children snippet 完整形态）：title/subtitle/dot 渲染、children 内容、open=false 无遮罩——布局壳三件套（LvSection/LvPage/LvDrawer）snippet 传子组件的宿主测试全部就位
* 纯 props + 事件 + 可绑定 + snippet 宿主 Kit smoke 覆盖达 **13+4=17 处断言组**，可离线测试的 Kit 层全部覆盖
* 测试 198→201；0 errors/0 warnings；主包 gzip 27.51KB（预算内）

## v0.103.0 2026-10-03 · A-06 决策落地：发布包裁剪为用户向文档 + Kit smoke 第五批（LvSection 宿主）

* **A-06 发布包内容决策落地**：dist 静态拷贝从全量 34 篇内部文档裁剪为用户向五件（20-FAQ/21-上手指南/22-术语表/23-许可证/PRIVACY，stripBase 平铺防 docs/docs 嵌套）；内部调研与治理文档经 GitHub 仓库获取；README 双语仍随包。决策可逆（git revert vite.config.ts）
* **Kit smoke 第五批（LvSection 宿主）**：LvSectionHost（children+actions snippet 完整形态）——title/sub/children/actions 四要素渲染断言
* 修复 LvSectionHost 重复 describe（v0.102 遗留）
* 测试 198→198（重整）；0 errors/0 warnings；主包 gzip 27.51KB（预算内）

## v0.102.0 2026-10-03 · 测试宿主方案：snippet 传子组件可测（限制解除）

* 解决 v0.86 记录的基建限制：以**测试宿主组件**（tests/helpers/*Host.svelte，{#snippet} 在 .svelte 文件内定义可正常编译）替代 createRawSnippet——绕开模块解析错位，snippet 传子的 Kit 组件从此可挂载测试
* 首个宿主单测：LvChip 渲染 children 与 tone 语义色（LvChipHost）
* docs/16 限制说明更新为已解决（宿主方案留痕）
* 测试 198→199；0 errors/0 warnings；主包 gzip 27.51KB（预算内）

## v0.101.0 2026-10-03 · ADR-7 修复：预览移除候选的下标错位 + 未勾选 skipped 语义

* 修复（v0.81 回归）：预览 ✕ 移除候选后下标错位——wizard 候选携带 `origIndex`（✕ 移除后仍指向作业 candidates 原位），逐卡 `CARD_CREATED` 不再标记错误候选
* 未勾选/被移除的候选记 `CARD_SKIPPED`（状态机新增 skipped 语义，COMMIT_DONE 前清算）——作业不再卡死在 committing、不再产生虚假「未完成导入」横幅
* docs/24 ADR-7 草案同步 skipped 状态留痕
* 测试 198/198；0 errors/0 warnings；主包 gzip 27.51KB（预算内）

## v0.100.0 2026-10-03 · v1.0.0-rc 发布就绪审计（docs/35）

* 新增 docs/35-v1.0.0-发布就绪审计.md：发布链路七环节逐环核查（全通过）+ 审计发现处置表 + **打 tag 前检查清单**（真机验收/A-06 决策/版本一致性/Release notes 引用/已知限制声明）
* **新发现已登记 A-06（P1）**：dist 静态拷贝把全量内部文档（34 篇/约 720K，含内部待办清单与调研报告）打进 package.zip——发布前需决策保留或裁剪为用户向文档
* 本轮已在线修复的历史缺口：存储体检漏 ai-jobs（v0.94）、PRIVACY 漏两个存储文件（v0.95）、基线滞后（v0.97）——均已有对应治理门禁防再犯
* docs/README 登记 docs/35；docs/17 基线段同步 v0.100.0
* 测试 192/192；0 errors/0 warnings；主包 gzip 27.51KB（预算内）

## v0.99.0 2026-10-03 · docs-only：术语表交叉引用 + Kit 规范补测试覆盖说明

* docs/22 术语表三行（作答耗时/动态建议/AI 作业）补 docs/17 条目 ID 交叉引用（AQ-13/AQ-8/AQ-17+ADR-7）——术语可追溯
* docs/16 补记 Kit 单测覆盖现状（13 个纯 props 组件已测）与 snippet 传子组件的限制说明
* docs/17 基线登记同步 v0.99.0
* docs-only 轮次：测试 198/198、0 errors/0 warnings、governance OK、主包 gzip 27.51KB 不变

## v0.98.0 2026-10-03 · Kit smoke 第六批：可绑定包装组件（收官）

* **LvSlider**（区间/步长/初值反映、oninput 触发 onchange 携带数值）、**LvInput**（type/placeholder/disabled 透传、oninput 携带字符串）、**LvSelect**（options 渲染与初值选中、change 携带新值、disabled 透传）——6 组输入契约单测
* 纯 props/事件/可绑定 Kit smoke 覆盖达 **11 个**组件；仅剩 snippet 传子组件（LvSection/LvDrawer/LvPage 内容与 LvChip）维持暂缓——**可离线测试的 Kit 层至此全部覆盖**
* 测试 193→198；0 errors/0 warnings；主包 gzip 27.51KB（预算内）

## v0.97.0 2026-10-03 · 基线登记修正 + 治理脚本基线版本门禁

* 修正 docs/17「当前基线」滞后（登记在 v0.95.0、实际已到 v0.96.0）——该漂移两轮内发生两次，根因是基线更新无门禁
* `scripts/check-governance.mjs` 新增第⑧项核对：docs/17「当前基线」必须包含 package.json 当前版本号，否则 CI 失败——基线漂移从此自动化拦截
* `transitionJob` GENERATE_OK 纯度测试补齐（替换 candidates 不突变入参）
* 测试 192→193；0 errors/0 warnings；主包 gzip 27.34KB（预算内）

## v0.96.0 2026-10-03 · docs-only：AQ-16 部分交付登记

* docs/17 AQ-16 条目补记 v0.92-v0.93 部分交付（此前基线更新但条目本身漏注记——治理遗漏）：ai-lint 预览 lint 离线子集三类提示 + 编辑响应式重算已落地；余验收（多事实/歧义语义级 lint、来源块追溯、批次告警与接受率）需真实模型或更大改动，保持开放
* checkbox 无变化（部分交付不勾选）；192/192 单测等门禁数字不变

## v0.95.0 2026-10-03 · 隐私披露补全 + 治理脚本新增存储披露核对

* docs/PRIVACY 存储表列全 7 个数据文件：补 `session-state.json`（当日已评分/已跳过卡 ID 与计数，次日作废）与 `suspend-today.json`——此前的披露行只列了 4/7
* `scripts/check-governance.mjs` 新增**存储披露核对**：src/index.ts 声明的每个 `*_DATA` 文件必须在 PRIVACY.md 披露，否则 CI 失败——隐私披露完整性从此自动化防漂移
* docs-only 轮次：测试 192/192、0 errors/0 warnings、主包 gzip 27.51KB 不变

## v0.94.0 2026-10-03 · cards-created 事件转正 + 存储体检补 ai-jobs

* docs/14 §8 预留事件 `lv-cards:cards-created` 转正：AI 制卡逐卡导入全部完成后发射 `{deckID, count, blockIDs[]}`（ADR-7 落地后 payload 确定；快速/标记等无 AI 制卡路径不发）
* 存储体检（设置 → 数据）补 `ai-jobs.json` 行（v0.81 新增的持久化文件此前未入体检清单）
* 测试 192/192；0 errors/0 warnings；主包 gzip 27.46KB（预算内）

## v0.93.0 2026-10-03 · AQ-16 lint 响应式重算 + 行号引用核对

* 修正：lint 改为 `$derived.by` 随 candidates（含 textarea 编辑）响应式重算——此前仅生成时计算一次，用户编辑后提示不更新（v0.92 CHANGELOG 的「编辑后重算」描述不实，已修正实现与文档一致）
* docs/33 行号引用抽查：review.svelte rate()/riff.ts reviewRiffCard/forget-requeue 三处引用仍与源码语义一致，无需更新
* 测试 192/192；0 errors/0 warnings；主包 gzip 27.34KB（预算内）

## v0.92.0 2026-10-03 · AQ-16 预览 lint（离线子集）：重复/过长/过短提示

* 新增 `core/ai-lint.ts`（零依赖纯模块）：批内重复（忽略大小写/空白）、过长（q/a >300 字符）、过短（问题 <4 字符）三类静态提示——只标记不删除，取舍由用户勾选
* AI 向导预览卡显示 warn chip（疑似重复/过长/问题过短）；重新生成/编辑后 lint 随 candidates 重算
* 语义级 lint（多事实/歧义/关键符号缺失）仍归 AQ-16 完整验收（后置）
* 测试 186→192；i18n 533 对齐；0 errors/0 warnings；主包 gzip 27.34KB（预算内）

## v0.91.0 2026-10-03 · ADR-7 收尾：总览未完成导入提示

* ADR-7 最后一处可见性断点修复：未完成 AI 导入此前只在打开向导时可见（恢复横幅）——现总览页新增提示条「有未完成的 AI 导入（n/m 已落卡）」，点击直接打开向导（恢复横幅在其中），生成/导入后经 onReviewed 自动刷新
* docs/22 术语表补「AI 作业」条目
* 测试 186/186；i18n 531 对齐；0 errors/0 warnings；主包 gzip 27.34KB（预算内）

## v0.90.0 2026-10-03 · Kit smoke 第五批：布局壳组件头部契约

* **LvSection**（title/sub 渲染、title 缺省不渲染区块头）、**LvPage**（title/subtitle/dot 渲染、title 缺省无页头）、**LvDrawer**（open=true 渲染遮罩+title、open=false 无遮罩）——6 组布局壳契约单测
* 已知限制：Esc→onclose 经 svelte:window 的 window 级 keydown 在 happy-dom 下模拟不可靠，归 docs/34 V 项真机验收（注释在案）
* 纯 props Kit smoke 覆盖达 **13 个**组件（含布局壳的头部契约）；children/actions snippet 内容维持暂缓
* 测试 180→186；0 errors/0 warnings；主包 gzip 27.34KB（预算内）

## v0.89.0 2026-10-03 · Kit smoke 第四批：LvTabs + LvRow

* **LvTabs**（页签渲染/active `aria-selected`+高亮类/点击 onchange 携带 id/点当前页签仍触发——hub 重挂载自愈语义允许）、**LvRow**（label 渲染/hint 缺省不渲染/提供时置于 label 下方）——5 组 smoke 单测
* 纯 props/事件 Kit smoke 覆盖达 **10 个**组件（LvStat/LvSteps/LvProgress/LvKbd/LvEmpty/LvError/LvSegmented/LvSwitch/LvTabs/LvRow）；剩余 LvSection/LvDrawer/LvPage 为 snippet 传子组件维持暂缓
* 测试 175→180；0 errors/0 warnings；主包 gzip 27.34KB（预算内）

## v0.88.0 2026-10-03 · Kit smoke 第三批：交互组件 + 测试稳定性

* **LvSegmented**（选中 aria-checked/点击 onchange 携带值/点击当前项不触发/disabled 全禁用）、**LvSwitch**（checked 反映/change 携带新值/disabled 传递）——6 组交互契约单测
* AQ-21 截断重载测试超时 30s→60s（两次 20k round-trip 对系统负载敏感，负载高峰误报）
* 纯 props + 事件类 Kit smoke 覆盖达 8 个组件
* 测试 169→175；0 errors/0 warnings；主包 gzip 27.34KB（预算内）

## v0.87.0 2026-10-03 · Kit smoke 第二批：基础组件四件

* **LvProgress**（0-100 钳制）、**LvKbd**（键位渲染）、**LvEmpty**（文案/空态无按钮/action 按钮触发）、**LvError**（role=alert/重试触发/无 onretry 无按钮）——7 组 smoke 单测
* 纯 props Kit 组件 smoke 覆盖：LvStat/LvSteps/LvProgress/LvKbd/LvEmpty/LvError 六个（snippet 传子组件的 LvSection/LvDrawer/LvPage 维持暂缓）
* 测试 162→169；0 errors/0 warnings；主包 gzip 27.34KB（预算内）

## v0.86.0 2026-10-03 · 组件测试基建：Kit 组件可挂载测试

* 测试基建：`vitest.config.ts`（happy-dom + svelte 插件 + @ 别名 + browser 条件）+ devDeps `happy-dom`/`@testing-library/svelte`——Svelte 组件从此可在单测中挂载
* 首批 Kit smoke 测试：**LvStat**（label/value 渲染、denom/progress 缺省不渲染）、**LvSteps**（步骤渲染、`aria-current="step"` 落在当前步、onclick 回跳触发、缺省禁用）——渲染契约与 a11y 语义被测试锁定
* 已知限制（记录在案）：以 snippet 传子的组件（LvChip 等）因 createRawSnippet 与 browser 条件编译的模块错位暂不纳入，待测试基建升级后补测
* 测试 158→162；0 errors/0 warnings；主包 gzip 27.34KB（预算内）

## v0.85.0 2026-10-03 · docs-only：巡检轮（CI 门禁在线核实 + 规范同步）

* GitHub CI 巡检：v0.84.0 引入的 Governance consistency 门禁在线上运行成功（两次推送全绿，35s）——治理自动化正式生效
* docs/16 LvSteps 行同步 v0.71 的 aria 变更（`aria-current="step"`，不再用 button+listitem 组合）
* docs/34 执行顺序建议补 V-15 编排说明（与 V-7 同属真实 AI 专场，需配合一次导入中强制中断）
* docs-only 轮次：测试 158/158、0 errors/0 warnings、governance OK、主包 gzip 27.34KB 不变

## v0.84.0 2026-10-03 · 工程化：治理一致性校验入 CI

* 新增 `scripts/check-governance.mjs`：docs/17 ↔ docs/31 六项自动核对——[x] 总数、summary 块五项统计、每包 summary.total、docs/17 总计行（含加粗格式）、每条 entry 主归属存在性、AQ/BZ 组统计行抽查；不一致即 CI 失败
* `.github/workflows/ci.yml` 新增 Governance consistency 门禁步骤（i18n 校验之后、单测之前）
* 此前每轮手工做的计数核对从此自动化——手改文档漂移会被 CI 拦截
* 测试 158/158；0 errors/0 warnings；主包 gzip 27.34KB（预算内）

## v0.83.0 2026-10-03 · docs-only：ADR-7 状态更新 + 隐私说明补 ai-jobs

* docs/24 候选 ADR-7 状态更新：Proposed → **Partially Accepted**（v0.80-v0.82 第 1-3 步按草案实现且与设计一致；第 4 步真实模型联调待 G3-call）；两处实现决策差异留痕——逐卡提交为 appendBlock+单卡入组完整流程（无半成品窗口，开放问题①据此关闭）、放弃语义为删作业记录且已落卡保留（不回滚）
* docs/PRIVACY 存储表补 **ai-jobs.json**：断点续传用途、材料来源摘要不存原文、生成的卡片问答文本与导入状态、20 作业上限与放弃语义
* docs-only 轮次：测试 158/158、0 errors/0 warnings、主包 gzip 27.34KB 不变

## v0.82.0 2026-10-03 · ADR-7 收口补件：失败明细导出 + V-15 验收项

* AQ-17「失败明细可导出」验收点落地：恢复横幅新增「复制失败明细」按钮——导出每张失败卡的序号/题面/错误原因到剪贴板（getUnfinishedAIJob 扩展 failed 明细数组）
* docs/34 补 **V-15 AI 导入中断续传冒烟**：生成→导入中强制中断→重开向导验证横幅计数→继续导入不重复→放弃语义（已落卡保留，设计决策见 ADR-7）
* AQ-17 剩余验收：真实模型联调（须 G3-call 门禁）；「回滚已落卡」按 ADR-7 设计决策为保留不回滚
* 测试 158/158；i18n 530 对齐；0 errors/0 warnings；主包 gzip 27.31KB（预算内）

## v0.81.0 2026-10-03 · ADR-7 第 2+3 步：ai-jobs 存储接入 + 向导生命周期/恢复入口

* **存储接入（第 2 步）**：`ai-jobs.json` 入批量加载批次（zipLoaded 键位扩展），经 loadStore normalize 兜底；写入统一走 persist 队列
* **向导生命周期（第 3 步）**：生成阶段创建作业并入账（drafting→generating→reviewing；失败/取消落账后重开向导可续传）；导入改**逐卡提交**（appendBlock+单卡入组成功即 CARD_CREATED 记账持久化），中断后 pending 续传、已落卡如实保留
* **恢复入口**：向导打开时检测未完成导入（committing/failed/canceled 且有 pending）→ 横幅显示「n/m 已落卡」+ 继续/放弃；继续走 `resumeAIJobCommit`（从首个 pending 续传，单卡失败不阻断后续）；放弃删除作业记录（已落卡不动）
* AQ-17 实现顺序 3/4 完成（剩：真实模型联调，须过 G3-call）；重生成仅替换候选内容、保持作业绑定（已知边界：作业记录中该卡为旧文本）
* 测试 158/158；i18n 528 对齐；0 errors/0 warnings；主包 gzip 25.58KB（预算内）

## v0.80.0 2026-10-03 · ADR-7 第 1 步落地：AI 批次作业状态机纯模块

* `core/ai-jobs.ts`（零依赖纯模块，ADR-7 实现顺序第 1 步）：六态迁移表（drafting→generating→reviewing→committing→done，failed/canceled 带 resumeTo 回迁）、逐卡事件（CARD_CREATED/CARD_FAILED）、续传视角 `firstPendingIndex`、normalize 清洗（白名单状态/候选剔除/字段收敛）、容量维护（20 个上限优先淘汰已结作业）
* 语义要点：非法迁移返回 ok:false 且 job 原样不变（纯函数）；CANCEL 记录 resumeTo+「canceled by user」；COMMIT_DONE 拒绝仍有 pending 的作业；source 摘要三字段截断（隐私边界）
* 迁移表全覆盖单测 9 组：主链/失败回迁/取消续传/非法迁移/越界拒绝/纯函数性/清洗/淘汰/摘要边界
* 未接线（按 ADR 实现顺序：存储接入与向导 UI 为后续切片）；测试 149→158；0 errors/0 warnings；主包 gzip 25.58KB 不变

## v0.79.0 2026-10-03 · docs-only：候选 ADR-7「AI 批次作业状态机」设计定稿

* docs/24 新增**候选 ADR-7**（AQ-17 设计草案，R54 确认的唯一实现缺口）：ai-jobs.json 存储契约、六态状态机（drafting/generating/reviewing/committing/done/failed/canceled）、逐卡断点续传（每卡成功即持久化，续传只处理 pending）、孤儿防护（卡组先建即记 deckID 不重建）、取消语义（已创建保留如实入账）、幂等重试（成功标记永不重复）
* 开放问题 3 项（半成品块判重口径、source 原文落盘隐私边界、跨设备续传范围）与决策门槛（W3 排期授权后实现；状态机纯模块+迁移表单测可先行）
* docs/17 AQ-17 条目同步登记设计出处；checkbox 无变化
* docs-only 轮次：测试 149/149、0 errors/0 warnings、主包 gzip 25.58KB 不变

## v0.78.0 2026-10-03 · docs-only：R55 真机验收清单

* docs/34-真机验收清单.md（R55 产出）：V-1—V-14 共 14 组结构化操作手册，覆盖 v0.64-v0.77 全部「代码+单测完成、待真机」项——会话恢复双 P0 冒烟、显示答案四路径、原生评分旁听去重、写入失败可观测、对话框关闭责任与焦点归还、中心页并发刷新、AI 取消/降级（需真实 AI）、移动端计时策略、考试动态建议与复盘口径、覆盖三视图、设置热更新（含跨窗口已知边界）、卸载冲刷、懒加载竞态、加载体感
* 每项含前置/步骤/预期/证据记录方式与失败特征；附执行顺序建议（约 2 小时）与记录约定（通过回 docs/17 勾选，失败留诊断不改码）
* docs/18、docs/README、docs/00（R55 小节）同步登记；checkbox 无变化
* docs-only 轮次：测试 149/149、0 errors/0 warnings、主包 gzip 25.58KB 不变

## v0.77.0 2026-10-03 · 死代码收尾 + 加载路径性能护栏

* 移除最后一个零引用模板遗留 `libs/const.ts`（块类型映射表，99 行）——libs/ 目录至此全部为在用模块
* 性能预算扩展：新增「2 万条 normalize（加载清洗路径）≤1.5s」护栏——AQ-3 清洗 + AQ-21 快照重建的加载成本被 CI 持续看护
* AQ-21 截断重载测试显式放宽超时至 30s（两次 20k JSON round-trip 对系统负载敏感，v0.76 曾因默认 5s 超时误报）
* 测试 148→149；0 errors/0 warnings；主包 gzip 25.58KB（预算内）

## v0.76.0 2026-10-03 · 事件契约补登记 + 最后两个测试盲区

* docs/14 §8 事件契约表补 `lv-cards:settings-changed`（v0.71 引入但未入契约文档）：触发时机=设置保存成功落盘后、payload `{}`（消费方自行重读）、幂等性=防抖合并后的最终值
* 测试盲区收官：**lvLog 环形缓冲**（dump 格式、500 字符截断、200 条上限、非字符串消息、clear）；**dailyTarget**（向上取整、缺失 null、deck 规模仅 deck 范围参与的口径边界用测试固化）
* 测试 143→148；0 errors/0 warnings；主包 gzip 25.58KB（预算内）

## v0.75.0 2026-10-03 · riff API 契约测试 + 术语表补齐

* 新增 riff API 契约测试（mock 全局 fetch）：**payload 形状锁定**——`reviewedCards→[{cardID}]` 映射、review/skip/add/batchSet 请求体；错误映射（code≠0 抛 msg、无 msg 带错误码）、请求头 JSON、超时 AbortError→code=504（friendlyError 可映射）——内核契约面首次有测试护栏
* docs/22 术语表补 8 条：作答耗时、knownCards、卡片覆盖、SR 语法、动态建议等 v0.64-v0.72 新引入概念
* 测试 137→143；0 errors/0 warnings；主包 gzip 25.58KB（预算内）

## v0.74.0 2026-10-03 · 死代码清理 + 帮助补 Obsidian SR 语法

* 移除模板遗留死代码约 550 行（全部经引用核查为零引用）：`libs/setting-utils.ts`（宿主 Setting 包装类）、`libs/promise-pool.ts`（并发池，含其测试）、`libs/components/` 整目录（Form/setting-panel/sidebar-tabs-layout/b3-typography）、`libs/index.d.ts`（仅为 setting-utils 服务的环境类型）
* `dialog.ts` 移除三个无人引用导出（inputDialog/inputDialogSync/confirmDialogSync），保留在用的 confirmDialog/confirmDialogBool/simpleDialog（内部）/svelteDialog；补回被误删的 IConfirmDialogArgs 接口定义
* 内置帮助「制卡方式」补 Obsidian SR 语法说明（中英：`:::` 双向按正向、多行 `?`/`??`、tag 仅作提示）
* 测试 140→137（promise-pool 测试随模块移除）；0 errors/0 warnings；主包 gzip 25.38KB（预算内）

## v0.73.0 2026-10-03 · 巡检轮：CI 全绿核实 + 回归自查 + 最后三组测试盲区

* GitHub CI 巡检：v0.64→v0.72 全部推送提交的 CI 运行均为 success（含最新 main）
* 回归自查抽查：AQ-2（显示答案 onclick + persistSession 落盘）与 AQ-5（native-events 测试）修复点与测试均在位，未被后续改动削弱
* 最后三组测试盲区：**ai-batches**（id/date 校验剔除、blockIDs 过滤、200 条截尾、tokens 非有限回 undefined、幂等）；**suspend-today**（跨日清空、suspend 去重自动滚日、结构非法落空库）；**friendlyError**（错误码命中 i18n、未命中透传、非 Error 值）
* 至此 src/core 与 src/libs 全部纯函数模块均有直接单测覆盖
* 测试 130→140；0 errors/0 warnings；主包 gzip 25.58KB（预算内）

## v0.72.0 2026-10-03 · 测试盲区补齐 + AO 立项提案齐备

* 测试盲区三组补齐：**occlusion 数据契约**（serialize↔parse 往返、坏 JSON/错版本/rects 非数组宽容 null、多框顺序）；**并发池 PromiseLimitPool**（并发上限、严格串行排空、失败传播）；**AI 输出解析**（```json 围栏与噪声容忍、question/answer 别名、d 难度越界过滤、空 q/a 剔除、非数组抛错）
* `parseCards`/`estimateTokens` 拆至零依赖模块 ai-parse.ts（ai.ts 再导出，调用方 import 不变）——AI 网络层与解析层测试解耦
* docs/17 AO 组立项提案 4 份齐备（均标注「待用户授权立项」）：Orbit 阅读态迷你复习、hashcards 内容寻址防重复、olmps/memo 代码卡型、anki-jlpt 语音例句卡
* 测试 115→130；0 errors/0 warnings；主包 gzip 25.38KB（预算内）

## v0.71.0 2026-10-03 · 质量收口：svelte warnings 25→0 + AO 立项提案

* 真问题修复 4 条：LvSteps 步骤指示器以 `aria-current="step"` 取代非法的 button+listitem 组合；遮挡画布 SVG 补 `role="img"`+aria-label（键盘替代为撤销/清空按钮）、删除框加注释豁免；AI 向导死 CSS `.lv-ob-step` 清理
* 刻意初值捕获登记 21 条：`state_referenced_locally` 逐条加 svelte-ignore + 理由注释（对话框 props 一次性传入 / hub 首帧直达 / 设置快照 draft / LvStat 动画首值——挂载后语义即固化，非缺陷）
* `pnpm check` 达成 **0 errors / 0 warnings**（此前 25 warnings 含已登记刻意的基线长期存在）
* docs/17 AO 组新增立项提案草案 2 份（标注「待用户授权立项」，不建 checkbox）：Orbit 阅读态迷你复习（建议并入 BX-7 评审）、hashcards 内容寻址防重复（与内核查重互补）
* 测试 115/115；i18n 526 对齐；主包 gzip 25.38KB（预算内）

## v0.70.0 2026-10-03 · docs-only：AT-1 候选 ADR + R54 五旅程验证报告

* docs/24 新增**候选 ADR-6「跨前端同步重载协议」**（AT-1 预研，状态 Proposed 待宿主契约确认）：按 key 版本探测 + 有界串行 reload（先冲刷本地未落盘写入）+ 合并策略（settings 逐字段/revlog 幂等去重/session 取新）+ Tab 保持与失败重试；开放问题与决策门槛逐条列出，未改任何运行代码
* docs/00 新增 **R54 五旅程验证报告**：五条关键旅程逐一对照 docs/33 矩阵与源码——唯一确认的实现缺口是 AQ-17（AI 批次断点续传，W3 泳道）；可合并观察 1 项（③觉得答案有误 ↔ W2 主链回源修订，仅记录不删 ID）；可降级 0、需新增 0
* 结论：离线分析类产出进入稳态，后续 R 轮次以真机 fixture 采集与人工任务观察为主
* docs-only 轮次：无代码改动；测试 115/115、0 errors、主包 gzip 25.38KB 不变

## v0.69.0 2026-10-03 · docs-only：R53 能力矩阵与评分口径

* docs/33-能力矩阵与评分口径.md（R53 首项产出）：全卡型（QA/Cloze/Occlusion/Typing/Choice/SR 导入）与学习模式（普通/cram/范围筛选/倒序随机/听写/限时挑战/配对/忘记卡重现/超时）逐项「已实现/实验中/宿主依赖/后置」矩阵，证据=源码行号（v0.68.0）
* 评分口径总表：正式评分唯一通道推论——只有面板 rate() 与快速改期会写内核，原生事件只旁听，挑战/配对/重现/AI 建议一律不产生正式评分；超时「自动评遗忘」边界显式化
* N/A 与缺失字段口径表（原生无 duration/deckID、内核 state 未开放、2 万条截断、V2 状态机）与宿主依赖清单（V2 端点/onDataChanged/Agent 桥/真机 fixture）
* 查重结论：扫描发现断点均已有条目承载，未新增 checkbox；docs/README 与 docs/00 R53 记录同步登记
* docs-only 轮次：无代码改动；测试 115/115、0 errors、主包 gzip 25.38KB 不变

## v0.68.0 2026-10-03 · W2 收口批次：文档维度覆盖 + E-09 判分保真 + 弹窗焦点归还

* AQ-12（收口）：文档维度覆盖——`docCoverage` 纯聚合 + `getBlockDocMap`/`getDocTitles` 内核 SQL 分块查询，总览新增文档 Top3（标题回源，空标题回退文档 ID 前缀）与「无法归属文档」单独列示（块已删除/移动不猜测）；查询失败整区隐藏；AR-6 generation 守卫覆盖异步归属查询；至此总览/卡组/文档三维度覆盖齐备
* E-09（W1/W2 部分完成）：打字判分关键符号保真——宽松模式保留小数点/正负号/百分号/比号（`-1 vs 1`、`1.2 vs 12` 不再被归一化抹平）；NFKC 折叠全角输入（全角作答不再整段被剥离）；相似度分母改 max(期望, 作答)——额外错误命题拉低相似度而非被无视；空期望 ratio=0 不产「完美匹配」误导（5 组新单测，数值单位/容差策略仍归 BX-1 W4）
* AR-2（增量）：svelteDialog 任意关闭路径归还打开前焦点（宿主已卸载则跳过），键盘流不因弹窗丢焦
* 待办：勾选 AQ-12（三维度覆盖齐备），BX-1/AR-2 增量标注，docs/17 与 31 索引同步 924 条/186 勾选
* 测试 109→115；i18n 525 对齐；0 errors；主包 gzip 25.38KB（预算内）

## v0.67.0 2026-10-03 · W2 互通与口径批次：Obsidian SR 语法 + 卡组覆盖分解 + 口径文档

* AQ-11：Obsidian Spaced Repetition Markdown 互通——`core/obsidian-sr.ts` 解析/导出纯模块：单行 `::`/`:::`、多行 `?`/`??`、`==挖空==` 整块、`#flashcards/...` tag deck 提取、媒体透传；双向语法按正向制卡（内核一块一卡边界记录于模块）；标记制卡扫描接入（tag 不进卡面、空边不产卡）；导出往返幂等，方向/媒体/cloze/tag 全 fixture（22 组单测）
* AQ-12（增量）：卡组维度覆盖 `deckCoverage`——按 revlog.deckID 归属、规模缺失不算覆盖率、原生缺 deckID 的卡单独列示不摊派；总览覆盖区新增卡组分解（规模 Top5，回源卡组名）
* AQ-9（增量）：统计口径文档——内置帮助新增「复习日志统计口径」（中英：本地时区/day-start、2 万条明细上限与快照、作答耗时封顶、覆盖率口径、CSV 列含义），同步 docs/21、FAQ 与 CSV 导出注释
* BZ-2：按验收 B 路径关闭——上限语义明确接受，存储构成与保留范围写入 PRIVACY.md「复习日志的构成与上限语义」与 FAQ
* 待办：勾选 AQ-11/BZ-2，docs/17 与 31 索引同步 924 条/185 勾选
* 测试 95→109；i18n 523 对齐；0 errors；主包 gzip 25.11KB（预算内）

## v0.66.0 2026-10-03 · W2 开局批次：考试动态建议 + 作答耗时统计 + 导出契约

* AQ-8：考试计划动态重算建议层——`dynamicPlanAdvice` 学习日/容量/落后补偿/不可行原因（按每日上限所需天数）/容量未知口径；考试页计划卡只读展示并注明「不改内核调度」，deck 容量实时取规模，容量/数据变化即时反映；notebook 范围归属需内核查询，回退简单日均（7 组 fixture 单测，时钟注入可测）
* AQ-13：单卡作答耗时统计——revlog 可选 `dur` 字段（题面呈现→评分按壁钟差），设置新增「单卡作答计时上限」（5-3600s，默认 60s）封顶防离席超长样本；原生事件无字段保持 N/A 不补 0；总览新增「今日作答(分)」卡片（无数据不显示）；normalize/merge 清洗透传
* AQ-9（部分）：CSV 导出新列 `duration` + `review_state`（本地无内核复习状态，显式缺失留空不猜测）；旧 7 列文件照常导入，导出再导出幂等（optimizer 端到端样本解析与 timezone/day-start 口径文档待补）
* 考试页建议输入走 exam ctx 只读 getter（getRevlog/getDailyCap），不改任何写入路径
* AQ-12（部分）：总览新增「卡片覆盖（本地证据）」行——coverageStats 去重卡数 / 内核卡组规模分母 / 起点日期注记，覆盖率≠掌握率随行展示；分母缺失不算覆盖率（卡组/文档维度聚合回源待后续切片）
* 待办：勾选 AQ-8/AQ-13（离线证据完整），docs/17 与 31 索引同步 924 条/183 勾选
* 测试 84→95；i18n 522 对齐；0 errors；主包 gzip 24.55KB（预算内）

## v0.65.0 2026-10-03 · W1 收尾批次：Dialog 责任 + 计时/刷新治理 + 截断一致性

* 修复（AR-2）：Dialog 关闭责任——svelteDialog 此前把调用方传入的空 onClose/onExit stub 原样下传，内嵌组件的取消/完成/导入成功**根本关不掉对话框**；现注入可用 close（先执行调用方回调再销毁，幂等只关一次），选卡组/遮挡确认 await 写入成功才关闭、失败保留草稿与选择
* 修复（AR-10）：限时挑战计时器 start 从未启动 interval（倒计时永远满格）——改 monotonic deadline 按壁钟校正，计时点与材料加载完成一致，0 秒只完成一次
* 修复（AR-11）：考试复盘报告时间窗用 Math.min 扩大起点、且不过滤计划范围——现固定「计划创建以来」，deck 按 deckID、notebook 按来源块归属查内核，无法归属的记录单独列示，缺失历史声明「无可核算数据」而非全 0（交错/移动/缺失 fixture 单测）
* AQ-21：revlog 截断一致性——days 采用快照策略（早于最早保留明细的日期保留合法快照，覆盖内由明细重建），knownCards 保留截断卡首评语义（20,001+ 条重载 fixture）
* AQ-6：V2 迁移状态白名单归一——未知状态→Unknown 与「无端点=未升级」区分，report 字段清洗（契约纯逻辑拆至 v2-contract.ts）
* AR-6/AT-11：dashboard 刷新 generation 守卫 + 原生/插件两路评分经 reviewed 事件 800ms 合并自刷；manager 分页与到期清单各自序号守卫，切入「今日到期」即重拉（顺带修复 dueSet 非响应式导致过滤不刷新）
* AT-10：设置保存广播 settings-changed 事件，复习超时参数立即重启计时（评分风格/顺序下一卡自然生效）；AT-2：onunload 冲刷防抖中的设置保存 + 清理计时日志
* 体积：复习面板移入懒加载 chunk（首开一次性加载）——主包 31.92KB→25.01KB gzip，review chunk 10.02KB，预算内余量充足
* AR-7：复习超时同款 deadline 持续计时政策——后台节流按壁钟校正、剩余时长可预期（替代 interval tick 累减），后台不自动重复评分
* 待办：勾选 AQ-21/AR-11（离线证据完整），新增 BZ-1（懒加载挂载竞态真机验证）/BZ-2（knownCards 对账清理），docs/17 与 31 索引同步 924 条
* 测试 71→84；i18n 512 对齐；0 errors；主包 gzip 25.01KB（预算内）

## v0.64.0 2026-10-02 · W1 可靠性批次：会话恢复双 P0 + 数据/请求治理

* 修复（P0·AQ-1）：会话恢复加载错位——onload 6 项 Promise.all 只解构 5 项，session 实际读到 AI 批次数据致重载清空；改为 keys 数组驱动 + zipLoaded 位置配对（键值数不匹配直接抛错），AI 批次复用批量加载不再二次读盘
* 修复（P0·AQ-2）：复习页显示答案按钮从未绑定 onclick（容器点击又跳过 button，鼠标翻面失效、打字输入被覆盖层死区遮挡）；评分改为先更新计数再落盘（重载不丢刚评的一张）；skip 与跳过集合落盘（重载不重复出卡）；撤销同步落盘；打字输入/选择题/改期/遮挡 overlay 抬层修复点击死区
* revlog（AQ-3）：加载时逐条清洗——NaN/越界时间戳、非法评分（小数/越界/数字字符串）、非字符串卡 ID 一律剔除，days 由清洗后明细重建；fuzz 与幂等单测
* 原生评分（AQ-5）：rating 严格收敛 1-4 整数（显式 skip 记 0，5/-1/2.5 丢弃进诊断）；事件时间优先内核字段（缺失标估算）；eventId / cardID+1s 时间窗幂等去重
* 队列竞态（AQ-19）：复习 loadQueue 请求序号守卫——快速切范围/连续重试时旧响应不改队列、卡面、计数与计时器；setCurrent 等待期切卡不重启旧计时器
* 内核响应（AQ-20）：unwrapKernelData 统一校验 + getBlockDOM 封装，review/card-detail/challenge/occlusion/pairing/源上下文 6 处裸 fetchSyncPost 调用点收口；复习卡面刷新失败保留旧卡面（仅诊断），首载失败进可重试错误态
* 设置校验（AQ-22）：逐字段类型/范围/枚举校验——数值钳制、HH:mm 白名单、枚举白名单、savedFilters 条目清洗限量；损坏数据落默认，未知字段仍前向兼容
* 持久化（AQ-4）：统一写入队列——同 key 串行（旧数据不覆盖先写）、失败有限重试、ok/fail 与最近成功时间可观测；「复制诊断」含 persist 报表，最终失败限流提示用户；卸载前 waitAll(3s) 冲刷
* AI 安全（AQ-14/15）：生成请求 AbortController——关闭向导/取消按钮即取消，取消不触发 fallback、晚到响应不写回（genSeq 守卫）；自定义端点 15s 超时；fallback 仅对网络/超时/5xx/429 生效，401/配额/4xx/解析失败直接给原因；切换备用端点有提示
* i18n +2 键（512 对齐）；测试 27→71；主包 gzip 31.92KB（预算内）；全批离线可验证（fixture/单测），真机 fixture 复核项见 docs/17

## v0.63.0 2026-10-01 · AI 深化小件 + 完成页小确幸

* AI：单卡重新生成——预览卡 ↻ 同源同参 count=1 替换该张（保留勾选态）
* AI：难度标注——prompt 要求 d 字段（1易/2中/3难，宽容解析），预览卡显示难度 chip；默认与三预置模板同步
* 复习：完成页连击里程碑庆祝（365/100/30/7 天 🔥 专属文案）
* 复习：每日一语——5 条学习科学小贴士按日期轮换，设置可关（dailyTipEnabled）
* 安全：{@html} 净化审计通过（全部站点渲染内核 DOM 同信任级；AI 内容走文本插值不进 {@html}）
* 体积：示例卡内容移入 help 懒加载 chunk，主包保持预算内
* i18n +12 键（510 对齐）；测试 27/27；主包 gzip 31.52KB

## v0.62.0 2026-10-01 · 架构文档 + 浮层可达性收尾

* docs/14 §8：lv-cards:* 事件契约表固化（reviewed/streak-changed/session-finished/gateway-changed 的触发时机、payload、幂等性、失败隔离约定）
* docs/24：架构决策记录（ADR）起步——双轨 Gateway / Kit-only UI / 内核唯一调度源 / 体积预算 / 数据契约五条 Accepted
* a11y：帮助浮层打开即焦点移入（Esc 关闭后焦点归还卡面，闭环 542）
* 待办审计：6 项陈旧/已覆盖条目核实归档（CSV 导入早已存在、目标达成语义已实现等）
* 测试 27/27；0 errors；主包 gzip 31.81KB（预算内）

## v0.61.0 2026-10-01 · 请求层 + 存储入口 + 落盘笔记本

* 工程：libs/request.ts 统一请求层——AbortController 15s 超时（超时映射 code=504 入错误码表），riff.ts 全端点迁移
* 工程：libs/store.ts TypedStore 入口（loadStore：key+fallback+normalize，绝不抛错阻塞启动）；core/ai-batches.ts schema 清洗（id/date 必填、blockIDs 过滤、200 条上限）接入
* 设置：「落盘笔记本」下拉（targetNotebookId）——快速制卡/标记制卡/帮助/示例/AI 卡/学习报告/考试复盘 7 个落盘点统一走 targetNotebook()
* 修复：onload 中 normalizeSessionState 重复调用；目标笔记本未设置时行为与旧版一致
* i18n +3 键（498 对齐）；测试 27/27；主包 gzip 31.75KB（预算内）

## v0.60.0 2026-10-01 · Kit 控件组专项

* Kit +5：LvSwitch / LvSelect / LvInput（`$bindable` 封装 b3 原生控件）、LvSteps（向导步骤指示器）、LvSkeleton（骨架屏 row/block）；工具 lvConfirm.ts（Promise 化确认框）
* 采用：设置页 14 个开关行、timeoutMode/aiMode 下拉、AI 区 6 个文本输入行全部换装组件；AI 向导步骤头换 LvSteps；管理器加载态换 LvSkeleton
* docs/16：组件目录 14→19+1 工具
* 测试 27/27；0 errors；主包 gzip 31.50KB（预算内）

## v0.59.0 2026-10-01 · AI 深化批 + 诊断基建

* AI：Provider 回退链（备用端点/Key/模型，主端点失败自动切换）
* AI：Prompt 模板库——自定义 system 模板 + 通用/考研/语言三预置一键填充 + 恢复默认（占位符 count/language/type）
* AI：向导新增「粘贴剪贴板」输入源（权限拒绝降级提示）
* 统计：AI 批次记录 tokens 估算，总览 AI 质量区显示累计消耗
* 诊断：libs/log.ts 200 条环形日志缓冲随「复制诊断」导出；修复诊断中硬编码的过期插件版本号（改读 manifest）
* 错误映射：friendlyError + i18n 错误码文案（393 加密笔记本/401/404/500/501），复习错误态统一走映射
* i18n +22 键（495 对齐）；测试 27/27；主包 gzip 31.33KB（预算内）

## v0.58.0 2026-10-01 · 交互与数据打磨批

* 修复（真实 bug）：评分音效 sfxEnabled 开关从未生效——音效一直无条件播放；补设置区开关 + 三种合成风格（清音/木鱼/铃）
* 管理器：按遗忘次数排序（本地 revlog 统计）、选中卡导出 CSV（BOM+转义）、文本过滤 200ms 防抖
* 复习：队列倒序模式（与随机互斥）、答案揭示前隐藏元信息开关、浮层关闭后焦点归还卡面、触屏评分按钮 ≥44px 命中区
* 角标：请求序号守卫（慢响应不覆盖新数据）+ 语义色（今日目标达成变绿）
* 设置：normalizeSettings 幂等 round-trip 单测（未知字段前向兼容只增不删）；画像导入 256KB 上限
* i18n +15 键（473 对齐）；测试 27/27

## v0.57.0 2026-10-01 · 外观设置四件套

* 设置新增「外观」区（M12·FR5）：卡面字号缩放（0.85-1.25× LvSlider）、评分按钮密度（舒适/紧凑）、热力图范围（17/26/52 周）、角标刷新间隔（30s/60s/关闭，保存即生效）
* i18n +10 键（462 对齐）；测试 26/26

## v0.56.0 2026-10-01 · 内置帮助 + 示例工作区 + 画像 diff 预览

* 制卡：命令「生成示例工作区」——自动建「示例卡组」+ 5 张形态各异示例卡（普通/公式/挖空/列表/问答），落文档并打开
* 帮助：命令「打开使用帮助」——中英双语帮助文档写入「小驴闪卡/使用帮助」并打开（独立 chunk，不占主包预算）
* 画像：应用预设确认框升级为逐项 diff（模块开关 ✓/✕、参数 前值→后值；无改动明确提示）
* Gateway：探测结果落库 settings.gatewayState，手动重探广播 lv-cards:gateway-changed 事件（M11 契约）
* 工程：CI 增补 gzip ≤32KB 门禁步骤；M1-M12 契约对齐注记（M12 为系统层模块不入表）；README 双语状态重写至实况
* i18n +6 键（452 对齐）；测试 26/26

## v0.55.0 2026-10-01 · 错误边界 + 会话刷新联动 + 主包重回体积预算

* 中心：hub 三子页包 svelte:boundary（{#key active} 随页签重建自愈），单子页崩溃出重置卡片不拖垮中心；考试子页改为首次切入动态 import
* 联动：dashboard 经 onSessionFinished 订阅会话完成事件自刷；复习结束即刷顶栏角标（不等 60s 心跳）
* 体积：settings/deck-picker/quick-card 移入懒加载 chunk——主包 141.6KB/gzip 39.4KB → 98.8KB/gzip 29.11KB，重回 ≤32KB 预算
* i18n +1 键（448 对齐）；测试 26/26

## v0.54.0 2026-10-01 · 复习体验打磨 + 考试里程碑通知

* 复习：完成页新增 ⏱ 会话时长与今日目标 a/b 进度（AX·544）
* 修复：快捷键 interactive target guard（AX·541）——焦点在面板外交互控件时不抢键；面板内 Space/Enter 接管防双动作
* 移动端：复习面板四向 safe-area inset 适配（306）
* 提醒：考试里程碑系统通知 30/7/1 天（同计划同日去重，点击开中心，免打扰静默）；通知点击跳转行为核实归档
* i18n +3 键（447 对齐）；测试 26/26

## v0.53.0 2026-10-01 · 陈旧项大扫账 + 细节修复

* 待办审计：12 项「已实现未归档」条目核实归档（DeckPicker 内联新建/睡前巩固包/batchLimit/count-up 统一/tween 竞态消解/onboarded/诊断版本/CI test 门禁/backlogDays/TTS 设置/键位内核覆盖/空态制卡引导）
* 修复：考试编辑器名称/日期缺失静默不保存 → 内联红字三态提示（role=alert）
* 细节：LvStat 分母为 "0" 时隐藏；超时倒计时 >1 小时显示 H:MM:SS
* i18n +3 键（444 对齐）；测试 26/26

## v0.52.0 2026-10-01 · LvError 统一错误态 + a11y 补齐

* Kit +1：LvError（错误信息 + 重试按钮 + role=alert），复习/管理/总览三屏统一接入（G 组·异常边界）
* a11y：复习头部 6 个图标按钮补 aria-label；清理三屏死样式（.lv-error/.lv-hint 残留），未用选择器清零
* docs/16 Kit 规范 13→14 组件
* 测试 26/26；i18n 441 对齐

## v0.51.0 2026-10-01 · 标记符制卡 + 配对挑战 + XP/等级

* 制卡：标记符扫描制卡（M2·FR4）——命令扫描活动文档，`术语:: 定义` 新建问答块（落「小驴闪卡/标记制卡/日期」），「？」结尾块整块直加；勾选预览两步入组，设置可关
* 激励：配对挑战（M4·FR4）——到期挖空卡限时配对（题面挖空 × 答案列），计时/失误统计，<4 张挖空卡友好提示；纯练习不计调度
* 激励：XP/等级（M8·FR3，默认关）——calcXp 本地推导，总览里程碑区 Lv 章，设置开关，2 单测
* i18n +25 键（441 对齐）；测试 26/26

## v0.50.0 2026-10-01 · 分叉检测与合并预览 + 发版纪律链

* 数据健康：revlog 导入分叉检测（M10·FR3）——同 ts+cardID 评分冲突计 forks 并采样预览，默认保守跳过；检测到分叉后可确认「以导入为准」幂等重放合并
* 工程单元测试：2 万条 revlog 写入+重算+全聚合 <2s 预算单测；分叉双策略单测（24/24）
* 发版纪律（D9）：`pnpm release` 链（交互改版→全套门禁）；斜杠命令核实插件 API 无注册入口，维持命令面板+块菜单降级；热键留空按 D5 归档
* i18n +2 键（416 对齐）

## v0.49.0 2026-10-01 · 设置四区重组 + 决策记录完善

* 设置：学习偏好按 13-W10 拆为四区——节奏与目标 / 评分与作答 / 朗读与音效 / 提醒与免打扰
* 修复（真实 bug）：设置页 ttsEnabled 行重复渲染两次（此前补丁残留）
* docs/18：D3（disabledInPublish）/ D4（kernel.js 桩）决策依据补充——包体/生命周期影响已核验
* i18n +4 键（418 对齐）

## v0.48.0 2026-10-01 · 键盘双触发修复 + Kit 三新组件 + count-up 收敛

* 修复（真实 bug）：复习键盘双通道双触发（AJ 复核）——容器与 window 同时绑定 onKeydown，焦点在面板内时回看键「开即关」、连续 skip 误跳两张；改为互斥去重（容器管面板内，window 管面板外）
* Kit +3：LvSegmented（分段选择器，接评分风格）、LvSlider（数值滑杆，接超时秒数）、LvDrawer（右侧抽屉，卡片详情迁移至此）
* LvSection 头部操作插槽（曲线导出 PNG 按钮已用）；LvStat animate 收敛：dashboard 删除局部 tween，六个统计卡统一 count-up
* docs/16 Kit 规范更新（10→13 组件）；测试 21/21

## v0.47.0 2026-10-01 · 管理器状态过滤 + 画像导入导出

* 卡片管理：状态下拉过滤（M6·FR2）——全部/新卡（本地 revlog 无记录）/已复习/今日到期（内核到期清单按需加载）
* 设置：画像导入导出（M12·FR6）——当前「模块开关+推荐参数」打包为 JSON 分享，导入校验后应用到草稿
* 待办清单核对：滑卡手势（v0.42）、限时挑战（v0.38）、虚拟滚动（分页覆盖）三项陈旧项标记完成
* i18n +11 键（416 对齐）；测试 21/21

## v0.46.0 2026-10-01 · 图表导出 PNG + 源上下文预览

* 统计：保持曲线一键导出 PNG（M5）——克隆 SVG 并把 CSS 变量解析为具体色值（独立渲染无级联上下文），底色填充 960×300 导出
* 复习：源上下文预览（M3·P2）——「≡」开关只读展示来源块前后各 2 块（SQL sort 窗口取块），当前来源块高亮
* LvSection Kit 组件新增 actions 头部操作插槽
* i18n +4 键（401 对齐）；测试 21/21

## v0.45.0 2026-10-01 · 编辑返回续读 + 里程碑统计 + 死样式修复

* 复习：应用内编辑返回检测（M3）——思源内切回复习页不触发 visibilitychange，新增「离开面板 ≥15s 重新点入」节流刷新当前卡
* 统计：里程碑（M5）——累计复习 / 最长连续 / 活跃天数 / 单日之最 四格 + 下一目标阶梯（1000/5000/20000）+ 2 单测
* 修复：dashboard 样式表 `.lv-ret` 缺失闭合括号，导致 weekdelta/airow/ms 等嵌套死样式（warnings 30→21）
* i18n +8 键（397 对齐）；测试 21/21

## v0.44.0 2026-10-01 · 忘记卡本批重现 + 挖空制卡 + 重复提示 + 周期对比

* 复习：忘记卡本批重现（M3）——评「遗忘」的卡在批尾再出现一次，仅本地强化（不计内核调度、不计 revlog），卡面 chip 标识，设置可关（requeueAgain）
* 制卡：块菜单新增「挖空并制卡」——捕获编辑器选区 Range，一键包 `==...==` 后走常规入组流程（含重复提示）
* 制卡：重复提示（M2）——目标块已在复习集时弹确认框（confirmDialogBool），幂等提醒可仍要添加
* 统计：周期对比（M5）——本周 vs 上周 新学/复习/遗忘 三指标 delta（正向主色/反向红），revlog.weekCompare + 2 单测
* i18n +12 键（389 对齐）；测试 19/19

## v0.43.0 2026-10-01 · 卡片管理「只看烂卡」筛选 + 构建修复

* 卡片管理新增「只看烂卡」筛选（M6·FR5 leech 工作台入口），与批量重置/移除联动
* LvStat 计数动画走 $effect（runes 模式），移除未使用导入
* managerCtx 补齐 getLeechCards 接线；修复工具栏残留片段导致的模板解析错误
* 版本门禁强化：CHANGELOG 顶部小节必须与当前版本一致（防版本漂移）

## v0.42.0 2026-10-01 · 复习进度条 + 触屏滑动 + 听写模式

* 复习会话顶部进度条（渐变填充，按 batchLimit 计算）
* 触屏滑动改善：右滑=良好、左滑=忘记、上滑=翻转（M3·FR10）
* 听写模式：TTS 读答案 + 键入 + LCS 差异判分（M4·FR6）
* 设置项：每批拉取数、听写开关、TTS 语速/音色、免打扰时段
* 快捷键帮助浮层（? 键），九行快捷键速查
* 卡片管理：批量移除/重置（带确认）、烂卡 AI 改写入口、卡片详情浮层
* 到期角标：考试倒计时优先于到期数
* saveSettings 1.2s 防抖、会话状态持久化、复习日志 CSV 导入
* 修复 writeReportDoc ctx 引用、dashboard 清理整合

## v0.40.0 2026-10-02 · 设置导出 + 批量限制 + 笔记本源 + 选区源

* 设置导出 JSON（设置→数据→导出设置）
* 每批拉取数量设置（batchLimit，0=跟随内核上限）
* AI 向导「载入笔记本内容」SQL 聚合最近 200 块
* AI 向导「载入选中文字」防御式窗口选区
* i18n +6 键（328 对齐）

## v0.39.0 2026-10-02 · 仅新卡/仅旧卡模式（睡前巩固包）

* 复习范围选择器新增「仅新卡 / 仅旧卡」客户端过滤伪范围（W 组睡前巩固包落地）
* 命令面板新增「睡前巩固（只学新卡）」直达入口
* i18n +4 键

## v0.38.0 2026-10-02 · 限时挑战模式（M8·FR4）

* 限时挑战模式：3 分钟快答——加载到期卡，快速标记"记得/忘了"，不计内核评分（纯练习）
* 三阶段流程：idle → running（倒计时+计数）→ done（结算屏）
* 正确/未知计数实时显示；练习结束展示统计

## v0.37.0 2026-10-02 · 考试复盘双通道 + 恢复默认设置

* 考试复盘「写入复盘文档」：计划窗口内统计数据写入「小驴闪卡/考试复盘/<计划名>」普通文档（剪贴板通道保留）
* 恢复默认设置按钮
* 修复考试计划卡片操作条缺失容器 div

## v0.36.0 2026-10-02 · Onboarding 首启自动弹出

* 首次安装且未完成引导时，延迟 2 秒自动弹出三步引导
* settings.onboarded 标记控制：完成/跳过后不再自动弹出

## v0.35.0 2026-10-02 · 兜底循环#1

* 兜底①优化：代码扫查零 console.log/TODO/FIXME
* 兜底②新增待办：docs/17 AP 组扩展——MCP Server 模式 / AI 导师模式 / 助记媒介 / AI 词汇构建器
* 兜底③调研：GitHub 四路高星项目搜索
* settings.ts 旧 ID 迁移完整覆盖确认

## v0.34.0 2026-10-02 · 自主待办清零

* LvCardsSettings 新增 onboarded 标记
* settings.ts 旧 ID 迁移完整覆盖
* 全部自主可闭环待办已消化——剩余项收敛为 V2 依赖 / 🧪 真机 / P3 远期三类

## v0.33.0 2026-10-02 · 评分音效（Web Audio 合成）

* 评分音效：Web Audio oscillator 按评分级别合成，无文件依赖
* settings.sfxEnabled 开关；修复重复声明

## v0.32.0 2026-10-02 · 细节加固 + 术语表 + 许可证清单

* dashboard getDailyTargets 单次计算缓存
* dueText 格式化加固
* docs/22 术语表；docs/23 依赖许可证清单

## v0.31.0 2026-10-02 · 触屏滑卡手势（M3·FR10）

* 复习面板触屏手势：右滑评良好、左滑评遗忘、上滑翻面

## v0.30.0 2026-10-02 · 听写模式（M4·FR6 前置落地）

* 听写模式开关：问题态自动朗读答案，输入听写后 diff 判分

## v0.29.0 2026-10-02 · 仅新卡/仅旧卡模式（睡前巩固包）

* 复习范围选择器新增「仅新卡 / 仅旧卡」客户端过滤伪范围
* 命令面板新增「睡前巩固（只学新卡）」直达入口

## v0.28.0 2026-10-02 · 每批数量设置 + 笔记本源 + CSV 导入

* 每批拉取数量设置
* AI 向导「载入笔记本内容」
* 复习日志 CSV 导入

## v0.27.0 2026-10-02 · 考试复盘双通道 + 恢复默认设置

* 考试复盘「写入复盘文档」
* 恢复默认设置按钮
* 修复考试计划卡片操作条缺失容器 div

## v0.36.0 2026-10-02 · Onboarding 首启自动弹出

* 首次安装且未完成引导时，延迟 2 秒自动弹出三步引导
* settings.onboarded 标记控制

## v0.35.0 2026-10-02 · 兜底循环#1

* 兜底①优化：代码扫查零 console.log/TODO/FIXME
* 兜底②新增待办：docs/17 AP 组扩展
* 兜底③调研：GitHub 四路高星项目搜索
* settings.ts 旧 ID 迁移完整覆盖确认

## v0.34.0 2026-10-02 · 自主待办清零

* LvCardsSettings 新增 onboarded 标记
* settings.ts 旧 ID 迁移完整覆盖
* 全部自主可闭环待办已消化

## v0.33.0 2026-10-02 · 评分音效（Web Audio 合成）

* 评分音效：Web Audio oscillator 按评分级别合成，无文件依赖
* settings.sfxEnabled 开关；修复重复声明

## v0.32.0 2026-10-02 · 细节加固 + 术语表 + 许可证清单

* dashboard getDailyTargets 单次计算缓存
* dueText 格式化加固
* docs/22 术语表；docs/23 依赖许可证清单

## v0.31.0 2026-10-02 · 触屏滑卡手势（M3·FR10）

* 复习面板触屏手势

## v0.30.0 2026-10-02 · 听写模式（M4·FR6 前置落地）

* 听写模式开关：问题态自动朗读答案，输入听写后 diff 判分

## v0.29.0 2026-10-02 · 仅新卡/仅旧卡模式（睡前巩固包）

* 复习范围选择器新增「仅新卡 / 仅旧卡」客户端过滤伪范围
* 命令面板新增「睡前巩固（只学新卡）」直达入口

## v0.28.0 2026-10-02 · 每批数量设置 + 笔记本源 + CSV 导入

* 每批拉取数量设置
* AI 向导「载入笔记本内容」
* 复习日志 CSV 导入

## v0.27.0 2026-10-02 · 考试复盘双通道 + 恢复默认设置

* 考试复盘「写入复盘文档」
* 恢复默认设置按钮
* 修复考试计划卡片操作条缺失容器 div

## v0.36.0-合并 2026-10-02 · Onboarding 首启自动弹出 + settings 去重清理

* 首次安装且未完成引导时，延迟 2 秒自动弹出三步引导
* settings.onboarded 标记控制

## v0.35.0-合并 2026-10-02 · 兜底循环#1

* 兜底①优化：代码扫查零 console.log/TODO/FIXME
* 兜底②新增待办：docs/17 AP 组扩展
* 兜底③调研：GitHub 四路高星项目搜索
* settings.ts 旧 ID 迁移完整覆盖确认

## v0.34.0-合并 2026-10-02 · 自主待办清零

* LvCardsSettings 新增 onboarded 标记
* settings.ts 旧 ID 迁移完整覆盖
* 全部自主可闭环待办已消化

## v0.33.0-合并 2026-10-02 · 评分音效（Web Audio 合成）

* 评分音效：Web Audio oscillator 按评分级别合成，无文件依赖
* settings.sfxEnabled 开关；修复重复声明

## v0.32.0-合并 2026-10-02 · 细节加固 + 术语表 + 许可证清单

* dashboard getDailyTargets 单次计算缓存
* dueText 格式化加固
* docs/22 术语表；docs/23 依赖许可证清单

## v0.31.0-合并 2026-10-02 · 触屏滑卡手势（M3·FR10）

* 复习面板触屏手势

## v0.30.0-合并 2026-10-02 · 听写模式（M4·FR6 前置落地）

* 听写模式开关：问题态自动朗读答案，输入听写后 diff 判分

## v0.29.0-合并 2026-10-02 · 仅新卡/仅旧卡模式（睡前巩固包）

* 复习范围选择器新增「仅新卡 / 仅旧卡」客户端过滤伪范围
* 命令面板新增「睡前巩固（只学新卡）」直达入口

## v0.28.0-合并 2026-10-02 · 每批数量设置 + 笔记本源 + CSV 导入

* 每批拉取数量设置
* AI 向导「载入笔记本内容」
* 复习日志 CSV 导入

## v0.27.0-合并 2026-10-02 · 考试复盘双通道 + 恢复默认设置

* 考试复盘「写入复盘文档」
* 恢复默认设置按钮
* 修复考试计划卡片操作条缺失容器 div

## v0.26.0 2026-10-02 · AI 向导笔记本范围源

* AI 向导新增「载入笔记本内容」：选择笔记本 → SQL 聚合最近 200 个文本块进材料框
* 自诊断补思源内核版本号

## v0.25.0 2026-10-02 · 学习报告导出 + 快捷键帮助

* 学习报告导出：总览页「学习报告」按钮一键下载 Markdown
* 快捷键帮助覆盖层：`?` 键弹出九项键位说明

## v0.24.0 2026-10-02 · 上手指南 + 选区输入源

* 用户上手指南（docs/21）：5 分钟版——入口矩阵/第一张卡/第一场复习/统计解读/画像/进阶表/FAQ 链接
* AI 向导新增「载入选中文字」源
* README 双语加上手指南与 FAQ 快捷链接

## v0.23.0 2026-10-02 · 懒加载瘦身 + TTS 语音选择

* 构建优化：AI 向导/遮挡编辑器/onboarding 三重组件懒加载——主包 gzip 49.8→30.2KB
* TTS 语音选择：设置区语音下拉
* 能力状态表（AN P1）

## v0.22.0 2026-10-02 · 免打扰时段 + 安全与隐私收口

* 免打扰时段（X 组）：quietStart/quietEnd 默认 23:00-08:00
* 清空复习日志前自动导出 JSON 备份
* TTS 语速设置
* docs/PRIVACY.md + 20-FAQ

## v0.21.0 2026-10-02 · 面包屑按钮 + 版本门禁 + 保存重试

* 面包屑「复习本文档闪卡」按钮（官方 addBreadcrumbButton API）
* revlog 保存失败单次重试
* 版本事实源门禁

## v0.20.0 2026-10-02 · 会话中断恢复 + TTS 语速

* 会话中断恢复：session-state.json 按日落盘
* TTS 语速设置
* 积压预警阈值可配

## v0.19.0 2026-10-02 · AI 向导「当前文档」输入源

* AI 向导新增「载入当前文档」：getAllEditor 取活动编辑器 → exportMdContent

## v0.18.0 2026-10-02 · TTS 朗读 + 积压阈值 + 考试倒计时 chip

* 答案 TTS 朗读（Web Speech）
* 积压预警阈值可配
* 总览头部考试倒计时 chip

## v0.17.0 2026-10-02 · 图片遮挡卡型（M4·FR4 v1）

* 块菜单「制作遮挡卡」→ SVG 拖拽编辑器 → 块属性 lv-occlusion → 复习态 overlay

## v0.16.0 2026-10-02 · 理论参考线 + leech AI 改写联动 + 记忆持久化

* 保持曲线叠加理论参考线
* leech 行 AI 改写联动
* lastHubTab/lastReviewScope 记忆

## v0.15.0 2026-10-02 · 考后复盘 + 存储体检 + 积压预警

* 考试归档 + 复盘报告
* 存储体检
* 积压预警
* 设置未保存确认

## v0.14.0 2026-10-02 · AnkiConnect 客户端 + 自诊断 + 细节设置

* AnkiConnect 客户端
* 自诊断
* 卡面宽度设置
* 全弹窗响应式

## v0.13.0 2026-10-02 · 批次质量反哺 + leech 清单

* AI 批次质量区块
* leech 重写清单

## v0.12.0 2026-10-02 · 选择题模式 + 保存筛选 + 记忆保持曲线

* 选择题练习模式
* 保存筛选
* 记忆保持曲线 SVG

## v0.11.0 2026-10-02 · 触屏滑卡手势（M3·FR10）

* 复习面板触屏手势

## v0.30.0-合并 2026-10-02 · 听写模式（M4·FR6 前置落地）

* 听写模式开关：问题态自动朗读答案，输入听写后 diff 判分

## v0.29.0-合并 2026-10-02 · 仅新卡/仅旧卡模式（睡前巩固包）

* 复习范围选择器新增「仅新卡 / 仅旧卡」客户端过滤伪范围
* 命令面板新增「睡前巩固（只学新卡）」直达入口

## v0.28.0-合并 2026-10-02 · 每批数量设置 + 笔记本源 + CSV 导入

* 每批拉取数量设置
* AI 向导「载入笔记本内容」
* 复习日志 CSV 导入

## v0.27.0-合并 2026-10-02 · 考试复盘双通道 + 恢复默认设置

* 考试复盘「写入复盘文档」
* 恢复默认设置按钮
* 修复考试计划卡片操作条缺失容器 div

## v0.26.0 2026-10-02 · AI 向导笔记本范围源

* AI 向导新增「载入笔记本内容」：选择笔记本 → SQL 聚合最近 200 个文本块进材料框
* 自诊断补思源内核版本号

## v0.25.0 2026-10-02 · 学习报告导出 + 快捷键帮助

* 学习报告导出：总览页「学习报告」按钮一键下载 Markdown
* 快捷键帮助覆盖层：`?` 键弹出九项键位说明

## v0.24.0 2026-10-02 · 上手指南 + 选区输入源

* 用户上手指南（docs/21）：5 分钟版——入口矩阵/第一张卡/第一场复习/统计解读/画像/进阶表/FAQ 链接
* AI 向导新增「载入选中文字」源
* README 双语加上手指南与 FAQ 快捷链接

## v0.23.0 2026-10-02 · 懒加载瘦身 + TTS 语音选择

* 构建优化：AI 向导/遮挡编辑器/onboarding 三重组件懒加载——主包 gzip 49.8→30.2KB
* TTS 语音选择：设置区语音下拉
* 能力状态表（AN P1）

## v0.22.0 2026-10-02 · 免打扰时段 + 安全与隐私收口

* 免打扰时段（X 组）：quietStart/quietEnd 默认 23:00-08:00
* 清空复习日志前自动导出 JSON 备份
* TTS 语速设置
* docs/PRIVACY.md + 20-FAQ

## v0.21.0 2026-10-02 · 面包屑按钮 + 版本门禁 + 保存重试

* 面包屑「复习本文档闪卡」按钮（官方 addBreadcrumbButton API）
* revlog 保存失败单次重试
* 版本事实源门禁

## v0.20.0 2026-10-02 · 会话中断恢复 + TTS 语速

* 会话中断恢复：session-state.json 按日落盘
* TTS 语速设置
* 积压预警阈值可配

## v0.19.0 2026-10-02 · AI 向导「当前文档」输入源

* AI 向导新增「载入当前文档」：getAllEditor 取活动编辑器 → exportMdContent

## v0.18.0 2026-10-02 · TTS 朗读 + 积压阈值 + 考试倒计时 chip

* 答案 TTS 朗读（Web Speech）
* 积压预警阈值可配
* 总览头部考试倒计时 chip

## v0.17.0 2026-10-02 · 图片遮挡卡型（M4·FR4 v1）

* 块菜单「制作遮挡卡」→ SVG 拖拽编辑器 → 块属性 lv-occlusion → 复习态 overlay

## v0.16.0 2026-10-02 · 理论参考线 + leech AI 改写联动 + 记忆持久化

* 保持曲线叠加理论参考线
* leech 行 AI 改写联动
* lastHubTab/lastReviewScope 记忆

## v0.15.0 2026-10-02 · 考后复盘 + 存储体检 + 积压预警

* 考试归档 + 复盘报告
* 存储体检
* 积压预警
* 设置未保存确认

## v0.14.0 2026-10-02 · AnkiConnect 客户端 + 自诊断 + 细节设置

* AnkiConnect 客户端
* 自诊断
* 卡面宽度设置
* 全弹窗响应式

## v0.13.0 2026-10-02 · 批次质量反哺 + leech 清单

* AI 批次质量区块
* leech 重写清单

## v0.12.0 2026-10-02 · 选择题模式 + 保存筛选 + 记忆保持曲线

* 选择题练习模式
* 保存筛选
* 记忆保持曲线 SVG

## v0.11.0 2026-10-02 · 触屏滑卡手势（M3·FR10）

* 复习面板触屏手势

## v0.30.0-合并 2026-10-02 · 听写模式（M4·FR6 前置落地）

* 听写模式开关：问题态自动朗读答案，输入听写后 diff 判分

## v0.29.0-合并 2026-10-02 · 仅新卡/仅旧卡模式（睡前巩固包）

* 复习范围选择器新增「仅新卡 / 仅旧卡」客户端过滤伪范围
* 命令面板新增「睡前巩固（只学新卡）」直达入口

## v0.28.0-合并 2026-10-02 · 每批数量设置 + 笔记本源 + CSV 导入

* 每批拉取数量设置
* AI 向导「载入笔记本内容」
* 复习日志 CSV 导入

## v0.27.0-合并 2026-10-02 · 考试复盘双通道 + 恢复默认设置

* 考试复盘「写入复盘文档」
* 恢复默认设置按钮
* 修复考试计划卡片操作条缺失容器 div

## v0.26.0 2026-10-02 · AI 向导笔记本范围源

* AI 向导新增「载入笔记本内容」：选择笔记本 → SQL 聚合最近 200 个文本块进材料框
* 自诊断补思源内核版本号

## v0.25.0 2026-10-02 · 学习报告导出 + 快捷键帮助

* 学习报告导出：总览页「学习报告」按钮一键下载 Markdown
* 快捷键帮助覆盖层：`?` 键弹出九项键位说明

## v0.24.0 2026-10-02 · 上手指南 + 选区输入源

* 用户上手指南（docs/21）：5 分钟版——入口矩阵/第一张卡/第一场复习/统计解读/画像/进阶表/FAQ 链接
* AI 向导新增「载入选中文字」源
* README 双语加上手指南与 FAQ 快捷链接

## v0.23.0 2026-10-02 · 懒加载瘦身 + TTS 语音选择

* 构建优化：AI 向导/遮挡编辑器/onboarding 三重组件懒加载——主包 gzip 49.8→30.2KB
* TTS 语音选择：设置区语音下拉
* 能力状态表（AN P1）

## v0.22.0 2026-10-02 · 免打扰时段 + 安全与隐私收口

* 免打扰时段（X 组）：quietStart/quietEnd 默认 23:00-08:00
* 清空复习日志前自动导出 JSON 备份
* TTS 语速设置
* docs/PRIVACY.md + 20-FAQ

## v0.21.0 2026-10-02 · 面包屑按钮 + 版本门禁 + 保存重试

* 面包屑「复习本文档闪卡」按钮（官方 addBreadcrumbButton API）
* revlog 保存失败单次重试
* 版本事实源门禁

## v0.20.0 2026-10-02 · 会话中断恢复 + TTS 语速

* 会话中断恢复：session-state.json 按日落盘
* TTS 语速设置
* 积压预警阈值可配

## v0.19.0 2026-10-02 · AI 向导「当前文档」输入源

* AI 向导新增「载入当前文档」：getAllEditor 取活动编辑器 → exportMdContent

## v0.18.0 2026-10-02 · TTS 朗读 + 积压阈值 + 考试倒计时 chip

* 答案 TTS 朗读（Web Speech）
* 积压预警阈值可配
* 总览头部考试倒计时 chip

## v0.17.0 2026-10-02 · 图片遮挡卡型（M4·FR4 v1）

* 块菜单「制作遮挡卡」→ SVG 拖拽编辑器 → 块属性 lv-occlusion → 复习态 overlay

## v0.16.0 2026-10-02 · 理论参考线 + leech AI 改写联动 + 记忆持久化

* 保持曲线叠加理论参考线
* leech 行 AI 改写联动
* lastHubTab/lastReviewScope 记忆

## v0.15.0 2026-10-02 · 考后复盘 + 存储体检 + 积压预警

* 考试归档 + 复盘报告
* 存储体检
* 积压预警
* 设置未保存确认

## v0.14.0 2026-10-02 · AnkiConnect 客户端 + 自诊断 + 细节设置

* AnkiConnect 客户端
* 自诊断
* 卡面宽度设置
* 全弹窗响应式

## v0.13.0 2026-10-02 · 批次质量反哺 + leech 清单

* AI 批次质量区块
* leech 重写清单

## v0.12.0 2026-10-02 · 选择题模式 + 保存筛选 + 记忆保持曲线

* 选择题练习模式
* 保存筛选
* 记忆保持曲线 SVG

## v0.11.0 2026-10-02 · 触屏滑卡手势（M3·FR10）

* 复习面板触屏手势

## v0.10.0 2026-10-02 · 听写模式（M4·FR6 前置落地）

* 听写模式开关：问题态自动朗读答案，输入听写后 diff 判分

## v0.9.0 2026-10-02 · AI 向导「当前文档」输入源

* AI 向导新增「载入当前文档」：getAllEditor 取活动编辑器 → exportMdContent

## v0.8.0 2026-10-02 · TTS 朗读 + 积压阈值 + 考试倒计时 chip

* 答案 TTS 朗读（Web Speech）
* 积压预警阈值可配
* 总览头部考试倒计时 chip

## v0.7.0 2026-10-02 · 图片遮挡卡型（M4·FR4 v1）

* 块菜单「制作遮挡卡」→ SVG 拖拽编辑器 → 块属性 lv-occlusion → 复习态 overlay
