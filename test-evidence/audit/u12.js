(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[0];
  // 点左卡"示例 3"
  const left = [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("示例 3"));
  left.click();
  await new Promise(r => setTimeout(r, 400));
  // 点右卡"未学习"
  const right = [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "未学习、学习、复习、悬置");
  right.click();
  await new Promise(r => setTimeout(r, 800));
  const t = dlg.textContent.replace(/\s+/g, " ");
  return { matched: t.match(/已配对: \d \/ \d/)?.[0], misses: t.match(/失误: \d+/)?.[0] };
})()
