(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 1800));
  const dlg = vis()[vis().length - 1];
  const findByLabel = (kw) => {
    const rows = [...dlg.querySelectorAll("*")].filter(e => {
      const sws = e.querySelectorAll(":scope > input.b3-switch, :scope .b3-switch");
      return sws.length === 1 && e.textContent.includes(kw) && e.getBoundingClientRect().height < 80 && e.getBoundingClientRect().height > 15;
    });
    const row = rows[rows.length - 1];
    return row?.querySelector("input.b3-switch");
  };
  const out = {};
  for (const [kw, key] of [["打字模式", "typingEnabled"], ["选择题练习模式", "choiceEnabled"], ["混合题型轮换", "mixedRotation"]]) {
    const sw = findByLabel(kw);
    out[key] = { found: !!sw, before: sw?.checked };
    if (sw && !sw.checked) { sw.click(); await new Promise(r => setTimeout(r, 400)); out[key].after = sw.checked; }
  }
  [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "确定")?.click();
  await new Promise(r => setTimeout(r, 1500));
  out.saved = { typing: p.settings?.typingEnabled, choice: p.settings?.choiceEnabled, mixed: p.settings?.mixedRotation };
  return out;
})()
