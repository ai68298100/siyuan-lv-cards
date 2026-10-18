(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  let dlg = vis()[vis().length - 1];
  const ta = [...dlg.querySelectorAll("textarea")].find(t => t.getBoundingClientRect().width > 100);
  if (!ta) return { err: "no textarea" };
  ta.value = "间隔重复是一种利用间隔效应安排复习的学习方法。FSRS 是新一代调度算法。";
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise(r => setTimeout(r, 800));
  const before = performance.getEntriesByType("resource").filter(e => /bigmodel|chat\/completions|api\/ai/.test(e.name)).length;
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("AI 生成"))?.click();
  await new Promise(r => setTimeout(r, 1200));
  dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("确认发送"))?.click();
  await new Promise(r => setTimeout(r, 2500));
  const after = performance.getEntriesByType("resource").filter(e => /bigmodel|chat\/completions|api\/ai/.test(e.name)).length;
  dlg = vis()[vis().length - 1];
  return {
    wizardText: (dlg?.textContent?.replace(/\s+/g, " ") ?? "").slice(0, 380),
    toast: document.querySelector("#message")?.textContent?.replace(/\s+/g, " ")?.slice(0, 160),
    modelRequests: { before, after },
  };
})()
