(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.openTabOf("lv-cards-dashboard", { tab: "goals" });
  await new Promise(r => setTimeout(r, 2000));
  const hubEl = () => document.querySelector("[class*=lv-hub]");
  const out = {};
  [...hubEl().querySelectorAll("button")].find(b => b.textContent.includes("新建目标"))?.click();
  await new Promise(r => setTimeout(r, 1500));
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[vis().length - 1];
  out.goalDialog = dlg?.textContent?.replace(/\s+/g, " ")?.slice(0, 260) ?? null;
  const inputs = [...(dlg?.querySelectorAll("input[type=text], input:not([type]), textarea") ?? [])].filter(e => e.getBoundingClientRect().width > 60);
  out.fields = inputs.length;
  if (inputs.length > 0) {
    inputs[0].value = "审计走查目标：完成隔离靶场全部走查";
    inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
  }
  const createBtn = [...(dlg?.querySelectorAll("button") ?? [])].find(b => /创建|确定|保存/.test(b.textContent.trim()));
  out.createBtn = createBtn?.textContent?.trim() ?? null;
  createBtn?.click();
  await new Promise(r => setTimeout(r, 2200));
  const t = hubEl().textContent.replace(/\s+/g, " ");
  out.afterCreate = t.includes("审计走查目标") ? "目标已出现在列表" : t.slice(0, 160);
  return out;
})()
