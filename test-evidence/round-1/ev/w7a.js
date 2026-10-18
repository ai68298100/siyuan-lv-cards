(() => {
  const rev = document.querySelector("[class*=lv-review]");
  const btns = [...rev.querySelectorAll("button")].map(b => b.textContent.replace(/\s+/g, " ").trim()).filter(t => t && t.length < 30);
  return { hasAnswer: rev.textContent.includes("评分") || btns.some(t => /遗忘|困难|良好|简单/.test(t)), buttons: btns.slice(0, 20) };
})()
