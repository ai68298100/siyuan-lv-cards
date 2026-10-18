(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  let dlg = vis()[vis().length - 1];
  const findBtn = (txt) => [...dlg.querySelectorAll("button")].find(b => b.textContent.replace(/\s+/g, " ").trim() === txt);
  // 载入当前文档
  const loadBtn = [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("载入当前文档"));
  loadBtn?.click();
  await new Promise(r => setTimeout(r, 1500));
  const before = performance.getEntriesByType("resource").filter(e => e.name.includes("chat/completions") || e.name.includes("bigmodel")).length;
  // 点生成
  const genBtn = findBtn("AI 生成 →");
  genBtn?.click();
  await new Promise(r => setTimeout(r, 2500));
  dlg = vis()[vis().length - 1];
  const t = dlg?.textContent?.replace(/\s+/g, " ") ?? "";
  const after = performance.getEntriesByType("resource").filter(e => e.name.includes("chat/completions") || e.name.includes("bigmodel")).length;
  return {
    materialLoaded: !/载入当前文档$/.test(t.slice(0, 50)),
    wizardText: t.slice(0, 320),
    modelRequests: { before, after },
  };
})()
