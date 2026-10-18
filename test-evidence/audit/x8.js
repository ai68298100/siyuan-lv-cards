(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  // 激活示例卡片文档 tab（有内容）
  const tab = [...document.querySelectorAll(".layout-tab-container__item, [data-type=tab-header]")].filter(t => t.getBoundingClientRect().width > 0).find(t => t.textContent.includes("示例卡片"));
  tab?.click();
  await new Promise(r => setTimeout(r, 1200));
  await p.openAIWizard();
  await new Promise(r => setTimeout(r, 2000));
  let dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("载入当前文档"))?.click();
  await new Promise(r => setTimeout(r, 1500));
  const hasMaterial = !dlg.textContent.includes("No material") && !dlg.textContent.includes("材料为空");
  const before = performance.getEntriesByType("resource").filter(e => e.name.includes("18787")).length;
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("AI 生成") || b.textContent.includes("Generate"))?.click();
  await new Promise(r => setTimeout(r, 1500));
  dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("确认发送") || b.textContent.includes("Confirm"))?.click();
  await new Promise(r => setTimeout(r, 3500));
  const after = performance.getEntriesByType("resource").filter(e => e.name.includes("18787")).length;
  dlg = vis()[vis().length - 1];
  const t = dlg?.textContent?.replace(/\s+/g, " ") ?? "";
  return {
    hasMaterial,
    mockHits: { before, after },
    step2: t.includes("预览与落库") || t.includes("Preview"),
    cardCount: t.match(/(\d+) (张|cards)/)?.[0] ?? null,
    wizardText: t.slice(0, 350),
  };
})()
