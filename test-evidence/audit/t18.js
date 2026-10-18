(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const out = {};
  // 切简单模式
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 1800));
  let dlg = vis()[vis().length - 1];
  const sel = [...dlg.querySelectorAll("select")].find(s => [...s.options].some(o => o.value === "simple"));
  sel.value = "simple";
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise(r => setTimeout(r, 500));
  [...dlg.querySelectorAll("button")].filter(b => b.textContent.trim() === "确定" && b.getBoundingClientRect().width > 0).pop()?.click();
  await new Promise(r => setTimeout(r, 1500));
  out.savedSimple = p.settings.uiMode;
  // 重载 → 开中心 → 页签清单
  return out;
})()
