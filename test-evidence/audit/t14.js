(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  let dlg = vis()[vis().length - 1];
  if (!dlg || !dlg.textContent.includes("计划名称")) {
    // 重开表单
    const hubEl = document.querySelector("[class*=lv-hub]");
    [...hubEl.querySelectorAll("button")].find(b => b.textContent.includes("新建考试计划"))?.click();
    await new Promise(r => setTimeout(r, 1500));
    dlg = vis()[vis().length - 1];
  }
  if (!dlg || !dlg.textContent.includes("计划名称")) return { err: "form not open" };
  const name = [...dlg.querySelectorAll("input[type=text]")][0];
  if (!name.value) {
    name.value = "审计走查考试";
    name.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const date = [...dlg.querySelectorAll("input[type=date]")][0];
  date.value = "2026-10-23";
  date.dispatchEvent(new Event("input", { bubbles: true }));
  date.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise(r => setTimeout(r, 500));
  [...dlg.querySelectorAll("button")].filter(b => b.textContent.trim() === "确定").pop()?.click();
  await new Promise(r => setTimeout(r, 2500));
  const t = document.querySelector("[class*=lv-hub]").textContent.replace(/\s+/g, " ");
  return { planCreated: t.includes("审计走查考试"), examView: t.slice(0, 300) };
})()
