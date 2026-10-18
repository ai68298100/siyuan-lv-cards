(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  if (p && !p.settings?.onboarded) {
    const s = { ...p.settings, onboarded: true };
    p.settings = s;
    await p.persist.save("settings.json", s);
  }
  await p.createSampleWorkspace();
  await new Promise(r => setTimeout(r, 3000));
  return { ok: !!p };
})()
