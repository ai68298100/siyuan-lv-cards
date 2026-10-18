(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const p = window.siyuan.ws.app.plugins[0];
  // 关闭设置对话框（点取消/确定）
  let dlg = vis()[vis().length - 1];
  if (dlg && dlg.textContent.includes("设置")) {
    [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "取消")?.click();
    await new Promise(r => setTimeout(r, 800));
  }
  await p.openAIWizard();
  await new Promise(r => setTimeout(r, 1800));
  dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("载入当前文档"))?.click();
  await new Promise(r => setTimeout(r, 1500));
  const hasMaterial = !dlg.textContent.includes("材料为空");
  const before = performance.getEntriesByType("resource").filter(e => /127\.0\.0\.1:9|chat\/completions|api\/ai/.test(e.name)).length;
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("AI 生成"))?.click();
  await new Promise(r => setTimeout(r, 1200));
  dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("确认发送"))?.click();
  await new Promise(r => setTimeout(r, 2500));
  const after = performance.getEntriesByType("resource").filter(e => /127\.0\.0\.1:9|chat\/completions|api\/ai/.test(e.name)).length;
  dlg = vis()[vis().length - 1];
  return {
    hasMaterial,
    wizardText: (dlg?.textContent?.replace(/\s+/g, " ") ?? "").slice(0, 420),
    toast: document.querySelector("#message")?.textContent?.replace(/\s+/g, " ")?.slice(0, 200),
    modelRequests: { before, after },
  };
})()
