(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 1800));
  const dlg = vis()[vis().length - 1];
  const btn = [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("撤销 AI 使用同意"));
  const out = { btnFound: !!btn, btnText: btn?.textContent?.trim() };
  btn?.click();
  await new Promise(r => setTimeout(r, 1500));
  // 抓点击后出现的所有对话框/菜单
  const after = vis().map(d => d.textContent.replace(/\s+/g, " ").slice(0, 150));
  out.afterDialogs = after;
  const menus = [...document.querySelectorAll(".b3-menu:not(.fn__none)")].map(m => m.textContent.replace(/\s+/g, " ").slice(0, 120));
  out.afterMenus = menus;
  return out;
})()
