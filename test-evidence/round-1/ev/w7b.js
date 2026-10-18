(() => {
  const rev = document.querySelector("[class*=lv-review]");
  const r = rev.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + 160) };
})()
