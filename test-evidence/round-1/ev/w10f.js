(() => {
  const els = [...document.querySelectorAll("*")].filter(e => e.textContent.trim() === "本地优先是思源笔记的设计理念，数据完全存储在用户设备上。" && e.getBoundingClientRect().width > 100);
  const el = els[els.length - 1];
  if (!el) return { err: "not found", candidates: els.length };
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x + Math.min(r.width / 2, 300)), y: Math.round(r.y + r.height / 2), cls: String(el.className).slice(0, 40) };
})()
