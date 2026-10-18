(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  await p.openRepairDrill();
  await new Promise(r => setTimeout(r, 2500));
  let dlg = vis()[vis().length - 1];
  const out = { steps: [] };
  // 五步走：每步找"下一步"类按钮推进
  for (let i = 0; i < 6; i++) {
    const t = dlg?.textContent?.replace(/\s+/g, " ") ?? "";
    out.steps.push(t.match(/\d [看找改对旁][^\d]{0,10}/)?.[0] ?? t.slice(0, 30));
    const next = [...(dlg?.querySelectorAll("button") ?? [])].find(b => /下一步|继续|对照|旁路|完成/.test(b.textContent));
    if (!next) break;
    next.click();
    await new Promise(r => setTimeout(r, 1200));
    dlg = vis()[vis().length - 1];
  }
  out.finalText = dlg?.textContent?.replace(/\s+/g, " ")?.slice(0, 200) ?? null;
  return out;
})()
