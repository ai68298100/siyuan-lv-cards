(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  let dlg = vis()[vis().length - 1];
  const btn = [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("确认发送"));
  const before = performance.getEntriesByType("resource").filter(e => /bigmodel|chat\/completions|api\/ai/.test(e.name)).length;
  btn?.click();
  await new Promise(r => setTimeout(r, 3000));
  dlg = vis()[vis().length - 1];
  const after = performance.getEntriesByType("resource").filter(e => /bigmodel|chat\/completions|api\/ai/.test(e.name)).length;
  const toast = document.querySelector("#message")?.textContent?.replace(/\s+/g, " ")?.slice(0, 200);
  const t = dlg?.textContent?.replace(/\s+/g, " ") ?? "";
  return {
    wizardNow: t.slice(0, 300),
    toast,
    modelRequests: { before, after },
  };
})()
