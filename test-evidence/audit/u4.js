(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.openTabOf("lv-cards-review");
  await new Promise(r => setTimeout(r, 3000));
  const rev = document.querySelector("[class*=lv-review]");
  const overflow = document.documentElement.scrollWidth > window.innerWidth + 2;
  return { reviewOpen: !!rev, iw: window.innerWidth, overflowX: overflow };
})()
