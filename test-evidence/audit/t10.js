(async () => {
  const hubEl = () => document.querySelector("[class*=lv-hub]");
  const out = {};
  [...hubEl().querySelectorAll("button, [role=tab]")].find(b => b.textContent.trim() === "考试")?.click();
  await new Promise(r => setTimeout(r, 2000));
  out.examView = hubEl().textContent.replace(/\s+/g, " ").slice(0, 220);
  // 新建计划
  [...hubEl().querySelectorAll("button")].find(b => /新建|创建/.test(b.textContent))?.click();
  await new Promise(r => setTimeout(r, 1200));
  const inputs = [...hubEl().querySelectorAll("input")].filter(e => e.getBoundingClientRect().width > 50);
  out.inputs = inputs.map(i => ({ type: i.type, ph: i.placeholder, val: i.value, w: Math.round(i.getBoundingClientRect().width) })).slice(0, 6);
  // 填名称
  const nameInput = inputs.find(i => i.type === "text");
  if (nameInput) {
    nameInput.value = "审计走查考试";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
  }
  // 截获保存按钮
  const saveBtn = [...hubEl().querySelectorAll("button")].find(b => /保存|创建|开始/.test(b.textContent.trim()));
  out.saveBtn = saveBtn?.textContent?.trim() ?? null;
  saveBtn?.click();
  await new Promise(r => setTimeout(r, 2000));
  out.afterSave = hubEl().textContent.replace(/\s+/g, " ").slice(0, 240);
  return out;
})()
