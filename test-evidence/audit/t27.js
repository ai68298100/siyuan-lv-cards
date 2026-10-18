(() => {
  const rev = document.querySelector("[class*=lv-review]");
  const forgetBtn = [...rev.querySelectorAll("button")].find(b => b.textContent.trim().startsWith("遗忘"));
  const r = forgetBtn?.getBoundingClientRect();
  return { flipped: !!forgetBtn, pos: r ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null };
})()
