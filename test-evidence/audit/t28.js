(async () => {
  const rev = document.querySelector("[class*=lv-review]");
  const known = [...rev.querySelectorAll("button")].find(b => b.textContent.trim() === "知道了");
  known?.click();
  await new Promise(r => setTimeout(r, 800));
  const showBtn = [...rev.querySelectorAll("button")].find(b => b.textContent.trim() === "显示答案");
  const r = showBtn?.getBoundingClientRect();
  return { bannerGone: !rev.textContent.includes("长期返场检查"), showPos: r ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null };
})()
