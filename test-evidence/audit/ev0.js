(async () => {
  const app = window.siyuan?.ws?.app;
  const icon = !!document.querySelector("#plugin_siyuan-lv-cards_0");
  const p = app?.plugins?.[0];
  if (!p) return { err: "plugin not loaded", icon };
  // 打开闪卡中心并停在新构建上
  await p.openTabOf("lv-cards-dashboard");
  await new Promise(r => setTimeout(r, 2500));
  const errs = [];
  return { plugin: p.name, version: p.version, icon, hubOpen: !!document.querySelector("[class*=lv-hub]") };
})()
