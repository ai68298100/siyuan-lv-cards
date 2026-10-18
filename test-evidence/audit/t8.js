(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.openTabOf("lv-cards-dashboard");
  await new Promise(r => setTimeout(r, 2500));
  const hubEl = document.querySelector("[class*=lv-hub]");
  const tabs = [...hubEl.querySelectorAll("button, [role=tab]")].map(b => b.textContent.trim()).filter(t => /总览|管理|制卡|目标|收件箱|维护|考试/.test(t));
  return { tabs: tabs, examModule: p.settings.examEnabled };
})()
