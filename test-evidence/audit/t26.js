(async () => {
  const rev = document.querySelector("[class*=lv-review]");
  const out = {};
  const showBtn = [...rev.querySelectorAll("button")].find(b => b.textContent.trim() === "显示答案");
  out.showFound = !!showBtn;
  const r = showBtn?.getBoundingClientRect();
  out.pos = r ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null;
  return out;
})()
