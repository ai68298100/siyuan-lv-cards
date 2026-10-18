(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  let dlg = vis()[vis().length - 1];
  const out = {};
  // 找"每日提示"开关行（dailyTipEnabled）——按行文本找最近的开关
  const rows = [...dlg.querySelectorAll("*")].filter(e => e.children.length >= 2 && /每日提示|学习提示/.test(e.textContent) && e.getBoundingClientRect().height < 60 && e.getBoundingClientRect().height > 20);
  const row = rows[rows.length - 1];
  out.rowFound = !!row;
  if (!row) return out;
  const sw = row.querySelector(".b3-switch, [class*=lv-switch], input[type=checkbox], [role=switch]");
  out.switchFound = !!sw;
  if (!sw) return out;
  const before = sw.checked ?? sw.getAttribute("aria-checked") ?? sw.classList.contains("b3-switch--on");
  sw.click();
  await new Promise(r => setTimeout(r, 800));
  const after = sw.checked ?? sw.getAttribute("aria-checked") ?? sw.classList.contains("b3-switch--on");
  out.toggle = { before: String(before), after: String(after) };
  // 确定（保存）
  [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "确定")?.click();
  await new Promise(r => setTimeout(r, 1500));
  out.savedSettingsTip = p.settings?.dailyTipEnabled;
  // 重开验证持久化
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 1800));
  dlg = vis()[vis().length - 1];
  const rows2 = [...dlg.querySelectorAll("*")].filter(e => e.children.length >= 2 && /每日提示|学习提示/.test(e.textContent) && e.getBoundingClientRect().height < 60 && e.getBoundingClientRect().height > 20);
  const sw2 = rows2[rows2.length - 1]?.querySelector(".b3-switch, [class*=lv-switch], input[type=checkbox], [role=switch]");
  const persisted = sw2?.checked ?? sw2?.getAttribute("aria-checked") ?? sw2?.classList.contains("b3-switch--on");
  out.persisted = String(persisted);
  // 拨回原状
  sw2?.click();
  await new Promise(r => setTimeout(r, 500));
  [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "确定")?.click();
  await new Promise(r => setTimeout(r, 1000));
  out.restored = p.settings?.dailyTipEnabled;
  return out;
})()
