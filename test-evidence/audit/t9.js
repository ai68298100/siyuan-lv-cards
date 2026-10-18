(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 1800));
  const dlg = vis()[vis().length - 1];
  // 模块区块：行文本含"考试模式"的开关
  const rows = [...dlg.querySelectorAll("*")].filter(e => {
    const sws = e.querySelectorAll(":scope input.b3-switch, :scope > input.b3-switch");
    return sws.length === 1 && e.textContent.includes("考试模式") && !e.textContent.includes("deadline") && e.getBoundingClientRect().height < 80 && e.getBoundingClientRect().height > 15;
  });
  const sw = rows[rows.length - 1]?.querySelector("input.b3-switch");
  const before = sw?.checked;
  if (sw && !sw.checked) { sw.click(); await new Promise(r => setTimeout(r, 400)); }
  [...dlg.querySelectorAll("button")].filter(b => b.textContent.trim() === "确定" && b.getBoundingClientRect().width > 0).pop()?.click();
  await new Promise(r => setTimeout(r, 1500));
  return { before, modulesExam: p.settings.modules?.exam };
})()
