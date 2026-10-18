(() => {
  const rev = document.querySelector("[class*=lv-review]");
  const showBtn = rev.querySelector(".lv-btn-wide");
  const r = showBtn?.getBoundingClientRect();
  return { pos: r ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null };
})()
