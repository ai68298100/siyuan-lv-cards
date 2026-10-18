(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const hubEl = () => document.querySelector("[class*=lv-hub]");
  // 重开表单（上一轮对话框被上上轮的取消关了？重开）
  [...hubEl().querySelectorAll("button")].find(b => b.textContent.includes("新建考试计划"))?.click();
  await new Promise(r => setTimeout(r, 1200));
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[vis().length - 1];
  if (!dlg) return { err: "no form" };
  const nameInput = [...dlg.querySelectorAll("input[type=text]")][0];
  nameInput.value = "审计走查考试";
  nameInput.dispatchEvent(new Event("input", { bubbles: true }));
  const dateInput = [...dlg.querySelectorAll("input[type=date]")][0];
  dateInput.value = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  dateInput.dispatchEvent(new Event("input", { bubbles: true }));
  dateInput.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise(r => setTimeout(r, 500));
  [...dlg.querySelectorAll("button")].filter(b => b.textContent.trim() === "确定").pop()?.click();
  await new Promise(r => setTimeout(r, 2500));
  const t = hubEl().textContent.replace(/\s+/g, " ");
  return {
    planCreated: t.includes("审计走查考试"),
    dailySuggestion: t.match(/每天[约 ]*\d+[^，。]*/)?.[0] ?? null,
    examView: t.slice(0, 320),
  };
})()
