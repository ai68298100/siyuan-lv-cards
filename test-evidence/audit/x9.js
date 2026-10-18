(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  // 重新走：打开向导（之前那个可能已显示失败错误）→ 关旧的 → 开新的
  for (let i = 0; i < 3; i++) {
    const dlg = vis()[vis().length - 1];
    if (!dlg) break;
    [...dlg.querySelectorAll("button")].filter(b => b.textContent.trim() === "取消" || b.textContent.trim() === "Cancel").pop()?.click();
    await new Promise(r => setTimeout(r, 700));
  }
  await p.openAIWizard();
  await new Promise(r => setTimeout(r, 2000));
  let dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("载入当前文档") || b.textContent.includes("Load current doc"))?.click();
  await new Promise(r => setTimeout(r, 1500));
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("AI 生成") || b.textContent.includes("Generate"))?.click();
  await new Promise(r => setTimeout(r, 1500));
  dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("确认发送") || b.textContent.includes("Confirm"))?.click();
  await new Promise(r => setTimeout(r, 4000));
  dlg = vis()[vis().length - 1];
  const t = dlg?.textContent?.replace(/\s+/g, " ") ?? "";
  return {
    step2: /预览与落库|Preview & import|Preview/.test(t),
    cardPreviews: (t.match(/审计卡\d/g) ?? []).length,
    reviewChips: /已接受|已核实|Accepted|Verified/.test(t),
    wizardText: t.slice(0, 400),
  };
})()
