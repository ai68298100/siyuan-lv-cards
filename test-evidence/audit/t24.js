(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.openTabOf("lv-cards-review");
  await new Promise(r => setTimeout(r, 3500));
  const rev = document.querySelector("[class*=lv-review]");
  const el = rev.querySelector("[class*=lv-card2], .b3-typography");
  const r = el?.getBoundingClientRect();
  return { pos: r ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + Math.min(r.height / 2, 200)) } : null, progress: rev.querySelector(".lv-progress")?.textContent };
})()
