(() => {
  const rev = document.querySelector("[class*=lv-review]");
  const rateBtn = [...rev.querySelectorAll("button")].map(b => b.textContent.replace(/\s+/g, " ").trim());
  return { ratingVisible: rateBtn.some(t => /遗忘|困难|良好|简单/.test(t)), btns: rateBtn.filter(t => /遗忘|困难|良好|简单|预览|间隔/.test(t)).slice(0, 8) };
})()
