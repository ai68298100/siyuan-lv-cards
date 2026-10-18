(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  let dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("制卡"))?.click();
  await new Promise(r => setTimeout(r, 3000));
  return {
    closed: ![...vis()].some(d => d.textContent.includes("标记符制卡")),
    toast: document.querySelector("#message")?.textContent?.replace(/\s+/g, " ")?.slice(0, 120) ?? null,
  };
})()
