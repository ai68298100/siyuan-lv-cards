(() => {
  const btn = [...document.querySelectorAll(".b3-dialog button")].find(b => b.textContent.includes("确定"));
  if (!btn) return null;
  const r = btn.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
})()
