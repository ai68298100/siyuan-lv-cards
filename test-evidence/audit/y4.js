(async () => {
  // 接受 #1(已核实)+#2，落库验证 verified 状态入库
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[0];
  const acceptAll = [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "Accept all");
  acceptAll?.click();
  await new Promise(r => setTimeout(r, 600));
  const accepted = dlg.textContent.match(/Accepted \d+/)?.[0];
  const importBtn = [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Import selected"));
  importBtn?.click();
  await new Promise(r => setTimeout(r, 3500));
  const t = vis()[0]?.textContent ?? "";
  return { accepted, wizardStillOpen: vis().length > 0, text: t.slice(0, 120) };
})()
