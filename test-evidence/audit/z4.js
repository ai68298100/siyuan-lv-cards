(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const jobs = p.aiJobs;
  const list = jobs?.jobs ?? [];
  return {
    jobCount: list.length,
    states: list.map(j => ({ id: j.id, status: j.status, phase: j.phase ?? null })),
    hubTile: (() => {
      const hubEl = document.querySelector("[class*=lv-hub]");
      return hubEl?.textContent.match(/AI[^|]{0,30}import[^|]{0,30}|AI 导入[^|]{0,30}/)?.[0] ?? null;
    })(),
  };
})()
