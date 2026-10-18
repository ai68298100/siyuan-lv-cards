(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.openTabOf("lv-cards-dashboard");
  await new Promise(r => setTimeout(r, 2500));
  const hubEl = document.querySelector("[class*=lv-hub]");
  const tabs = [...hubEl.querySelectorAll("button, [role=tab]")].map(b => b.textContent.trim()).filter(t => /总览|管理|制卡|目标|收件箱|维护|考试/.test(t));
  // 管理页签的高级操作（烂卡筛选/CSV）也应隐藏
  await p.openTabOf("lv-cards-dashboard", { tab: "manage" });
  await new Promise(r => setTimeout(r, 2000));
  const btns = [...hubEl.querySelectorAll("button")].filter(b => b.getBoundingClientRect().width > 0).map(b => b.textContent.trim());
  return { simpleTabs: tabs, uiMode: p.settings.uiMode, manageHasLeech: btns.includes("只看烂卡"), manageHasCsv: btns.includes("导出选中 CSV"), manageHasReset: btns.includes("重置") };
})()
