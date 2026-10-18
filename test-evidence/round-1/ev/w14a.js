(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const s = { ...p.settings, aiMode: "custom", aiEndpoint: "", aiKey: "", aiModel: "" };
  p.settings = s;
  await p.persist.save("settings.json", s);
  return { saved: p.settings.aiMode };
})()
