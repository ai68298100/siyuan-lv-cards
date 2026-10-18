(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  if (!p.settings?.onboarded) {
    const s = { ...p.settings, onboarded: true, aiMode: "custom", aiEndpoint: "http://127.0.0.1:18787", aiKey: "mock-key", aiModel: "mock-model" };
    p.settings = s;
    await p.persist.save("settings.json", s);
  } else {
    const s = { ...p.settings, aiMode: "custom", aiEndpoint: "http://127.0.0.1:18787", aiKey: "mock-key", aiModel: "mock-model" };
    p.settings = s;
    await p.persist.save("settings.json", s);
  }
  await p.createSampleWorkspace();
  await new Promise(r => setTimeout(r, 2500));
  return { ai: p.settings.aiMode + "@" + p.settings.aiEndpoint };
})()
