(() => {
  const el = [...document.querySelectorAll(".b3-list-item__text")].find(e => e.textContent.trim() === "术语与概念");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
})()
