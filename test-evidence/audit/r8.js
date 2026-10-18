(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  if (![...vis()].some(d => d.textContent.includes("设置"))) {
    await p.openSettingsDialog();
    await new Promise(r => setTimeout(r, 1800));
  }
  let dlg = vis()[vis().length - 1];
  const sws = [...dlg.querySelectorAll("input.b3-switch")].filter(e => e.getBoundingClientRect().width > 0);
  const sw = sws[17]; // 每日一语
  const before = sw.checked;
  sw.click();
  await new Promise(r => setTimeout(r, 700));
  const afterClick = sw.checked;
  [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "确定")?.click();
  await new Promise(r => setTimeout(r, 1500));
  const saved = p.settings?.dailyTipEnabled;
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 1800));
  dlg = vis()[vis().length - 1];
  const sw2 = [...dlg.querySelectorAll("input.b3-switch")].filter(e => e.getBoundingClientRect().width > 0)[17];
  const persisted = sw2.checked;
  sw2.click();
  await new Promise(r => setTimeout(r, 500));
  [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "确定")?.click();
  await new Promise(r => setTimeout(r, 1200));
  return { before, afterClick, saved, persisted, restored: p.settings?.dailyTipEnabled };
})()
