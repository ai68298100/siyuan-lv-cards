(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const s = p.settings;
  return {
    typing: s.typingEnabled, choice: s.choiceEnabled, mixed: s.mixedRotation,
    modules: s.modules,
    reviewModuleOn: s.modules?.review,
  };
})()
