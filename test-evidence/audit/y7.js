(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[0];
  // 材料当前含敏感词吗？直接看页面 fetch settings 里的 aiSensitiveTerms
  const p = window.siyuan.ws.app.plugins[0];
  const terms = p.settings.aiSensitiveTerms;
  // 材料文本：载入了吗？
  const hasMaterial = !/No material|材料为空/.test(dlg.textContent);
  // 生成 → 确认发送（触发预算/组装预览）——材料含敏感词时预览步上方出现 sensTitle 块
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Generate") || b.textContent.includes("AI 生成"))?.click();
  await new Promise(r => setTimeout(r, 1500));
  const dlg2 = vis()[0];
  const confirmText = dlg2?.textContent ?? "";
  const sensInConfirm = /检测到可能的敏感内容|敏感/.test(confirmText);
  const confirmBtn = [...(dlg2?.querySelectorAll("button") ?? [])].find(b => /Confirm|确认发送/.test(b.textContent));
  confirmBtn?.click();
  await new Promise(r => setTimeout(r, 3000));
  const dlg3 = vis()[0];
  const t3 = dlg3?.textContent ?? "";
  return { terms, hasMaterial, sensInConfirm, hitsShown: t3.includes("蓝图计划") || t3.includes("项目代号"), stepNow: /Preview & import|预览与落库/.test(t3), text: t3.slice(0, 250) };
})()
