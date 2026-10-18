(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 2000));
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[vis().length - 1];
  const t = dlg?.textContent?.replace(/\s+/g, " ") ?? "";
  const btns = [...(dlg?.querySelectorAll("button") ?? [])].map(b => b.textContent.replace(/\s+/g, " ").trim()).filter(x => x && x.length < 24);
  return { open: !!dlg, text: t.slice(0, 200), buttons: btns.slice(0, 25) };
})()
