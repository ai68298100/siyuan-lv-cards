(async () => {
  // 跳过引导（直接置 onboarded）
  const p = window.siyuan.ws.app.plugins[0];
  if (p && !p.settings?.onboarded) {
    const s = { ...p.settings, onboarded: true };
    p.settings = s;
    await p.persist.save("settings.json", s);
  }
  return { plugin: p?.name, onboarded: p?.settings?.onboarded };
})()
