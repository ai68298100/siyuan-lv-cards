(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[0];
  const clickPair = async (leftKw, rightKw) => {
    const l = [...dlg.querySelectorAll("button")].find(b => b.textContent.includes(leftKw) && !b.classList.contains("lv-pair-on"));
    l?.click();
    await new Promise(r => setTimeout(r, 350));
    const r2 = [...dlg.querySelectorAll("button")].find(b => b.classList.contains("lv-pair-ans") && b.textContent.includes(rightKw) && !b.classList.contains("lv-pair-on"));
    r2?.click();
    await new Promise(r => setTimeout(r, 700));
  };
  await clickPair("示例 5", "成熟度");
  await clickPair("示例 2", "光速");
  await clickPair("示例 4", "遗忘");
  const t = dlg.textContent.replace(/\s+/g, " ");
  return { matched: t.match(/已配对: \d \/ \d/)?.[0], misses: t.match(/失误: \d+/)?.[0], done: /完成/.test(t) };
})()
