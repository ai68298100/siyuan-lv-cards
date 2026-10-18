(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  // 总览应有未完成 AI 导入提示（unfinished AI jobs），或向导打开时有恢复横幅
  const hubEl = document.querySelector("[class*=lv-hub]");
  const hubText = hubEl?.textContent.replace(/\s+/g, " ") ?? "";
  const unfinished = hubText.match(/AI import in progress[^|]{0,40}|AI 导入[^|]{0,40}/)?.[0] ?? null;
  await p.openAIWizard();
  await new Promise(r => setTimeout(r, 2500));
  const dlg = vis()[0];
  const wt = dlg?.textContent.replace(/\s+/g, " ") ?? "";
  return {
    hubUnfinished: unfinished,
    wizardResume: /resume|继续|Restore|上次/.test(wt),
    resumeSnippet: wt.match(/(Resume|继续|上次)[^|]{0,100}/)?.[0] ?? null,
  };
})()
