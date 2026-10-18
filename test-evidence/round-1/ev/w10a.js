(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0).length;
  const out = { dialogsAtBoot: vis() };
  // 打开闪卡中心，逐页签点击并记录渲染
  await p.openTabOf("lv-cards-dashboard");
  await new Promise(r => setTimeout(r, 2500));
  const tabs = [...document.querySelectorAll("[class*=lv-hub] [role=tab], [class*=lv-hub] .lv-tabs button, [class*=lv-hub] nav button")];
  out.hubTabs = tabs.map(t => t.textContent.trim()).slice(0, 8);
  return out;
})()
