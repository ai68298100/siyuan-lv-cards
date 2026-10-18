(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const p = window.siyuan.ws.app.plugins[0];
  // 打开文档（供载入当前文档）
  const { openTab } = await import("/plugins/siyuan-lv-cards/index.js").catch(() => ({}));
  // 兜底：直接用内核 API 打开文档 tab
  const docId = "20261008215118-r5q8cr3";
  window.siyuan.ws.app.plugins[0].openTab ? null : null;
  // 使用思源全局 openTab（siyuan 模块在插件闭包里，这里用事件替代）
  const evt = new CustomEvent("click", { bubbles: true });
  // 直接调用插件内部公开的打开方法（lifecycle 面板）；若不可用则跳过
  try { p.openTabOf("lv-cards-dashboard"); } catch {}
  await new Promise(r => setTimeout(r, 1000));
  // 向导是否还开着
  let dlg = vis()[vis().length - 1];
  const wizardOpen = dlg && dlg.textContent.includes("AI 制卡");
  if (!wizardOpen) { await p.openAIWizard(); await new Promise(r => setTimeout(r, 2000)); dlg = vis()[vis().length - 1]; }
  // 载入笔记本内容（不依赖活动文档）
  const nbBtn = [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("载入笔记本内容"));
  nbBtn?.click();
  await new Promise(r => setTimeout(r, 1500));
  const t1 = dlg.textContent.replace(/\s+/g, " ");
  return { wizardOpen, afterLoadBtn: t1.slice(0, 260) };
})()
