(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  await p.openAIWizard();
  await new Promise(r => setTimeout(r, 2000));
  let dlg = vis()[0];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Load current doc") || b.textContent.includes("载入当前文档"))?.click();
  await new Promise(r => setTimeout(r, 1500));
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Generate") || b.textContent.includes("AI 生成"))?.click();
  await new Promise(r => setTimeout(r, 1200));
  dlg = vis()[0];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Confirm") || b.textContent.includes("确认发送"))?.click();
  await new Promise(r => setTimeout(r, 4000));
  dlg = vis()[0];
  // 定位 New deck name 输入框坐标
  const nameInput = [...dlg.querySelectorAll("input[type=text]")].find(i => (i.placeholder ?? "").includes("New deck"));
  const r = nameInput?.getBoundingClientRect();
  return { pos: r ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null };
})()
