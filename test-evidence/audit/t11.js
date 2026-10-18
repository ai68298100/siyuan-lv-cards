(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  let dlg = vis()[vis().length - 1];
  if (!dlg) return { err: "dialog closed" };
  const nameInput = [...dlg.querySelectorAll("input[type=text]")][0];
  nameInput.value = "审计走查考试";
  nameInput.dispatchEvent(new Event("input", { bubbles: true }));
  const dateInput = [...dlg.querySelectorAll("input[type=date]")][0];
  const d = new Date(Date.now() + 14 * 86400000);
  dateInput.value = d.toISOString().slice(0, 10);
  dateInput.dispatchEvent(new Event("input", { bubbles: true }));
  dateInput.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise(r => setTimeout(r, 400));
  [...dlg.querySelectorAll("button")].filter(b => b.textContent.trim() === "确定").pop()?.click();
  await new Promise(r => setTimeout(r, 2200));
  const hubEl = document.querySelector("[class*=lv-hub]");
  const t = hubEl.textContent.replace(/\s+/g, " ");
  return {
    planCreated: t.includes("审计走查考试"),
    examView: t.slice(0, 300),
  };
})()
