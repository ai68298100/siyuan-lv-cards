(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const rev = document.querySelector("[class*=lv-review]");
  // 确保在复习面板；翻面→评遗忘
  const el = rev.querySelector("[class*=lv-card2], .b3-typography");
  const r = el?.getBoundingClientRect();
  window.__p = r ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + Math.min(r.height / 2, 200)) } : null;
  return { pos: window.__p, progress: rev.querySelector(".lv-progress")?.textContent };
})()
