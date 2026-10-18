(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  let dlg = vis()[vis().length - 1];
  const sw = [...dlg.querySelectorAll(".b3-switch")].filter(e => e.getBoundingClientRect().width > 0)[17];
  const before = sw.classList.contains("b3-switch--on");
  sw.click();
  await new Promise(r => setTimeout(r, 700));
  const afterClick = sw.classList.contains("b3-switch--on");
  [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "确定")?.click();
  await new Promise(r => setTimeout(r, 1500));
  const savedValue = p.settings?.dailyTipEnabled;
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 1800));
  dlg = vis()[vis().length - 1];
  const sw2 = [...dlg.querySelectorAll(".b3-switch")].filter(e => e.getBoundingClientRect().width > 0)[17];
  const persisted = sw2.classList.contains("b3-switch--on");
  sw2.click();
  await new Promise(r => setTimeout(r, 500));
  [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "确定")?.click();
  await new Promise(r => setTimeout(r, 1200));
  return { before, afterClick, savedValue, persisted, restored: p.settings?.dailyTipEnabled };
})()
