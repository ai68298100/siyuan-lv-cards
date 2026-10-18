(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  return {
    weeklyEnabled: p.settings?.weeklyReportEnabled,
    revlogCount: p.revlog?.entries?.length ?? 0,
  };
})()
