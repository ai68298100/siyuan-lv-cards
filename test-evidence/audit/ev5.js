(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  let dlg = vis()[vis().length - 1];
  if (!dlg || !dlg.textContent.includes("开始使用")) {
    return { err: "onboarding not shown", dialogs: vis().length };
  }
  // 步骤1：选卡片笔记
  [...dlg.querySelectorAll("button, [role=button]")].find(b => b.textContent.includes("卡片笔记"))?.click();
  await new Promise(r => setTimeout(r, 1000));
  // 步骤2：创建示例卡
  dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "创建示例卡")?.click();
  await new Promise(r => setTimeout(r, 4000));
  dlg = vis()[vis().length - 1];
  const text = dlg?.textContent?.replace(/\s+/g, " ") ?? "";
  return { step: text.match(/步骤 \d \/ \d/)?.[0], text: text.slice(0, 300) };
})()
