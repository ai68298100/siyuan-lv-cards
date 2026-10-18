(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[0];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Mask and continue"))?.click();
  await new Promise(r => setTimeout(r, 1200));
  const ta = [...dlg.querySelectorAll("textarea")].find(e => e.getBoundingClientRect().width > 100);
  const masked = ta?.value ?? "";
  return {
    maskedOk: !masked.includes("项目代号") && !masked.includes("蓝图计划") && masked.includes("***"),
    snippet: masked.slice(0, 120),
  };
})()
