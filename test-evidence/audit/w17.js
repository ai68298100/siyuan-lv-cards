(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  if (!p.settings?.onboarded) {
    const s = { ...p.settings, onboarded: true, weeklyReportEnabled: true };
    p.settings = s;
    await p.persist.save("settings.json", s);
  }
  await p.createSampleWorkspace();
  await new Promise(r => setTimeout(r, 2500));
  return { ok: true, weekly: p.settings.weeklyReportEnabled };
})()
