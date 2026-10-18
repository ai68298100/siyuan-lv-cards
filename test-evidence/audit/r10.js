(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[vis().length - 1];
  [...(dlg?.querySelectorAll("button") ?? [])].find(b => b.textContent.trim() === "取消")?.click();
  await new Promise(r => setTimeout(r, 600));
  [...(dlg?.querySelectorAll("button") ?? [])].find(b => b.textContent.trim() === "取消")?.click();
  return { closed: true };
})()
