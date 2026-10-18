(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  // maybeWriteWeeklyReport 有周期门控（本周已写则跳过）——强制触发并检查
  try {
    await p.maybeWriteWeeklyReport(true);
  } catch (e) { return { err: String(e).slice(0, 120) }; }
  await new Promise(r => setTimeout(r, 2500));
  const titles = [...document.querySelectorAll(".protyle-title, .layout-tab-container__item")].map(e => e.textContent.trim()).filter(t => /周报|weekly/i.test(t));
  // 文档树里找
  const fs = null;
  return { weeklyTitles: titles.slice(0, 3), bodyHasWeekly: /学习周报|Weekly report/.test(document.body.textContent) };
})()
