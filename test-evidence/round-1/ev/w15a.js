(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const s = { ...p.settings, aiMode: "custom", aiEndpoint: "http://127.0.0.1:9", aiKey: "dummy-key", aiModel: "glm-4-flash" };
  p.settings = s;
  await p.persist.save("settings.json", s);
  return { saved: s.aiEndpoint };
})()
