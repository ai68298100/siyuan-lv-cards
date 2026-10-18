(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  let dlg = vis()[0];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("记得"))?.click();
  await new Promise(r => setTimeout(r, 1500));
  dlg = vis()[0];
  const t1 = dlg?.textContent?.replace(/\s+/g, " ") ?? "";
  const score1 = t1.match(/✓ \d+ · ✗ \d+/)?.[0] ?? null;
  [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "结束")?.click();
  await new Promise(r => setTimeout(r, 2000));
  dlg = vis()[0];
  const t2 = dlg?.textContent?.replace(/\s+/g, " ") ?? "";
  return { score1, summary: t2.slice(0, 220) };
})()
