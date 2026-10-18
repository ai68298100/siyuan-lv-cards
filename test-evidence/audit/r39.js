(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  await p.openMarkerCards();
  await new Promise(r => setTimeout(r, 2000));
  let dlg = vis()[vis().length - 1];
  const t = dlg?.textContent?.replace(/\s+/g, " ") ?? "";
  return { open: !!dlg, text: t.slice(0, 300) };
})()
