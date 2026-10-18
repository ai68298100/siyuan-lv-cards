(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => { const r = d.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  await p.openQuickCard();
  await new Promise(r => setTimeout(r, 1500));
  const dlgs = vis();
  const dlg = dlgs[dlgs.length - 1];
  return { count: dlgs.length, text: dlg?.textContent?.replace(/\s+/g, " ")?.slice(0, 160) ?? null };
})()
