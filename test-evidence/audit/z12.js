(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const hubEl = document.querySelector("[class*=lv-hub]");
  const hubText = hubEl?.textContent.replace(/\s+/g, " ") ?? "";
  await p.openAIWizard();
  await new Promise(r => setTimeout(r, 2500));
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[0];
  const wt = dlg?.textContent.replace(/\s+/g, " ") ?? "";
  return {
    hubTile: hubText.match(/AI[^|]{0,24}(import|导入)[^|]{0,24}/)?.[0] ?? null,
    wizardResumeEntry: /Resume|继续|断点|unfinished/i.test(wt),
    wizardText: wt.slice(0, 260),
  };
})()
