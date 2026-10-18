(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  // 关文档浮层（点侧栏按钮收起）
  const dockBtn = document.querySelector("#dockLeft, [id*=dock]");
  // 直接开复习
  await p.openTabOf("lv-cards-review");
  await new Promise(r => setTimeout(r, 3000));
  const rev = document.querySelector("[class*=lv-review]");
  return { reviewOpen: !!rev, iw: window.innerWidth, text: rev?.textContent?.replace(/\s+/g, " ")?.slice(0, 80) ?? null };
})()
