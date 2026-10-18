(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.openTabOf("lv-cards-review");
  await new Promise(r => setTimeout(r, 3000));
  const rev = document.querySelector("[class*=lv-review]");
  // 问题态直接按 f → 改期面板应出现
  const showBtn = rev.querySelector(".lv-btn-wide");
  const r = showBtn?.getBoundingClientRect();
  return { pos: r ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null };
})()
