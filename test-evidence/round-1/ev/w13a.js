(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const before = performance.getEntriesByType("resource").length;
  await p.openAIWizard();
  await new Promise(r => setTimeout(r, 2000));
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[vis().length - 1];
  const textareas = [...(dlg?.querySelectorAll("textarea") ?? [])].filter(t => t.getBoundingClientRect().width > 0);
  const buttons = [...(dlg?.querySelectorAll("button") ?? [])].map(b => b.textContent.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 15);
  return {
    wizardOpen: !!dlg,
    title: dlg?.querySelector(".b3-dialog__title")?.textContent?.trim() ?? null,
    textareaCount: textareas.length,
    buttons,
    netDelta: performance.getEntriesByType("resource").length - before,
  };
})()
