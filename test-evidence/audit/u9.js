(() => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[0];
  const t = dlg?.textContent?.replace(/\s+/g, " ") ?? "";
  return { matched: t.match(/已配对: \d \/ \d/)?.[0], misses: t.match(/失误: \d+/)?.[0], finished: /完成|结束|用时/.test(t), text: t.slice(0, 200) };
})()
