(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  let dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("完成并开始复习"))?.click();
  await new Promise(r => setTimeout(r, 4000));
  dlg = vis()[vis().length - 1];
  const rev = document.querySelector("[class*=lv-review]");
  return {
    dialogClosed: !dlg || !dlg.textContent.includes("开始使用"),
    reviewOpen: !!rev,
    reviewText: rev?.textContent?.replace(/\s+/g, " ")?.slice(0, 220) ?? null,
  };
})()
