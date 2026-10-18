(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.openTabOf("lv-cards-dashboard");
  await new Promise(r => setTimeout(r, 1500));
  await p.openAIWizard();
  await new Promise(r => setTimeout(r, 2000));
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  let dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("载入当前文档"))?.click();
  await new Promise(r => setTimeout(r, 1200));
  const before = performance.getEntriesByType("resource").filter(e => /bigmodel|chat\/completions|api\/ai/.test(e.name)).length;
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("AI 生成"))?.click();
  await new Promise(r => setTimeout(r, 1200));
  dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("确认发送"))?.click();
  await new Promise(r => setTimeout(r, 2500));
  const after = performance.getEntriesByType("resource").filter(e => /bigmodel|chat\/completions|api\/ai/.test(e.name)).length;
  dlg = vis()[vis().length - 1];
  const t = dlg?.textContent?.replace(/\s+/g, " ") ?? "";
  return {
    wizardText: t.slice(0, 400),
    toast: document.querySelector("#message")?.textContent?.replace(/\s+/g, " ")?.slice(0, 160),
    modelRequests: { before, after },
  };
})()
