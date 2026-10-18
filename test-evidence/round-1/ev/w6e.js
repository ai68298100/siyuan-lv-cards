(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const s = { ...p.settings, lastReviewScope: "deck:20261008215118-jxq4uxs", onboarded: true };
  await p.persist.save("settings.json", s);
  p.settings = s;
  return { saved: true, scope: s.lastReviewScope };
})()
