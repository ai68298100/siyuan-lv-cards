(async () => {
  const hubEl = () => document.querySelector("[class*=lv-hub]");
  const inputs = [...hubEl().querySelectorAll("input[type=text], input:not([type]), textarea")].filter(e => e.getBoundingClientRect().width > 60 && e.getBoundingClientRect().height < 80);
  const out = { inputs: inputs.length };
  if (inputs.length > 0) {
    inputs[0].value = "审计走查目标：完成隔离靶场全部走查";
    inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
  }
  const saveBtn = [...hubEl().querySelectorAll("button")].find(b => b.textContent.trim() === "保存目标");
  saveBtn?.click();
  await new Promise(r => setTimeout(r, 2000));
  const t = hubEl().textContent.replace(/\s+/g, " ");
  out.created = t.includes("审计走查目标");
  out.goalArea = t.slice(0, 260);
  return out;
})()
