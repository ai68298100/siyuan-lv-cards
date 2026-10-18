(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  // 关挑战
  let dlg = vis()[vis().length - 1];
  [...(dlg?.querySelectorAll("button") ?? [])].find(b => b.textContent.trim() === "取消")?.click();
  await new Promise(r => setTimeout(r, 800));
  const p = window.siyuan.ws.app.plugins[0];
  const before = [...document.querySelectorAll(".layout-tab-container__item")].map(e => e.textContent.trim());
  await p.openHelpDoc();
  await new Promise(r => setTimeout(r, 3000));
  const after = [...document.querySelectorAll(".layout-tab-container__item")].map(e => e.textContent.trim());
  const helpContent = [...document.querySelectorAll("*")].find(e => e.textContent.includes("使用帮助") && e.getBoundingClientRect().height > 200);
  return { before, after, helpDocVisible: !!helpContent };
})()
