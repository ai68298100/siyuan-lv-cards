(async () => {
  const hub = () => document.querySelector("[class*=lv-hub]");
  const rows = [...hub().querySelectorAll("*")].filter(e => e.children.length === 0 && e.textContent.includes("轮换卡3") && e.getBoundingClientRect().width > 120);
  const el = rows[rows.length - 1];
  const r = el?.getBoundingClientRect();
  if (!r) return { err: "row not visible" };
  const x = Math.round(r.x + Math.min(r.width / 2, 260)), y = Math.round(r.y + r.height / 2);
  return { x, y };
})()
