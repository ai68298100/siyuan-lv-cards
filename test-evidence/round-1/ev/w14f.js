(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  let dlg = vis()[vis().length - 1];
  const sel = [...dlg.querySelectorAll("select")].find(s => s.getBoundingClientRect().width > 0);
  if (!sel) return { err: "no select" };
  const opt = [...sel.options].find(o => o.textContent.includes("小驴走查"));
  if (!opt) return { err: "notebook option missing", opts: [...sel.options].map(o => o.textContent) };
  sel.value = opt.value;
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise(r => setTimeout(r, 600));
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("载入笔记本内容"))?.click();
  await new Promise(r => setTimeout(r, 1500));
  const before = performance.getEntriesByType("resource").filter(e => /bigmodel|chat\/completions|api\/ai/.test(e.name)).length;
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("AI 生成"))?.click();
  await new Promise(r => setTimeout(r, 1200));
  dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("确认发送"))?.click();
  await new Promise(r => setTimeout(r, 3000));
  const after = performance.getEntriesByType("resource").filter(e => /bigmodel|chat\/completions|api\/ai/.test(e.name)).length;
  dlg = vis()[vis().length - 1];
  return {
    wizardText: (dlg?.textContent?.replace(/\s+/g, " ") ?? "").slice(0, 420),
    toast: document.querySelector("#message")?.textContent?.replace(/\s+/g, " ")?.slice(0, 200),
    modelRequests: { before, after },
  };
})()
