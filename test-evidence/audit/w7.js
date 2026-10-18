(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  // 关向导
  let dlg = vis()[0];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "Cancel")?.click();
  await new Promise(r => setTimeout(r, 800));
  // 设置里 Grant 恢复
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 2000));
  dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Grant") || b.textContent.includes("重新开启") || b.textContent.includes("重新同意"))?.click();
  await new Promise(r => setTimeout(r, 1200));
  const out = { granted: !p.killSwitch?.revoked };
  // 移除调试日志前的最后检查 + 关设置
  [...dlg.querySelectorAll("button")].filter(b => b.textContent.trim() === "Cancel").pop()?.click();
  return out;
})()
