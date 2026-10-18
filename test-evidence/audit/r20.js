(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 1800));
  let dlg = vis()[vis().length - 1];
  const findByLabel = (kw) => {
    const rows = [...dlg.querySelectorAll("*")].filter(e => {
      const sws = e.querySelectorAll(":scope input.b3-switch, :scope > input.b3-switch");
      return sws.length === 1 && e.textContent.includes(kw) && e.getBoundingClientRect().height < 80 && e.getBoundingClientRect().height > 15;
    });
    return rows[rows.length - 1]?.querySelector("input.b3-switch");
  };
  for (const kw of ["打字模式", "选择题练习模式", "混合题型轮换"]) {
    const sw = findByLabel(kw);
    if (sw && !sw.checked) { sw.click(); await new Promise(r => setTimeout(r, 350)); }
  }
  // 精确点确定：主对话框 footer 里文本恰为"确定"的 button
  const okBtn = [...dlg.querySelectorAll("button")].filter(b => b.textContent.trim() === "确定" && b.getBoundingClientRect().width > 0).pop();
  okBtn?.click();
  await new Promise(r => setTimeout(r, 1500));
  return {
    dialogClosed: vis().length === 0,
    saved: { typing: p.settings?.typingEnabled, choice: p.settings?.choiceEnabled, mixed: p.settings?.mixedRotation },
  };
})()
