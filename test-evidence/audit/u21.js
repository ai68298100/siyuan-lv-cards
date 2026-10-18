(async () => {
  const rev = document.querySelector("[class*=lv-review]");
  // 翻面+评分3
  const showBtn = [...rev.querySelectorAll("button")].find(b => b.textContent.trim() === "显示答案");
  const r = showBtn?.getBoundingClientRect();
  if (!r) return { err: "no show btn" };
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
})()
