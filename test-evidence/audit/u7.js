(() => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[0];
  const next = [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("下一步"));
  const r = next?.getBoundingClientRect();
  return { pos: r ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null };
})()
