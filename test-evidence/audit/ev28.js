(async () => {
  const rev = document.querySelector("[class*=lv-review]");
  [...rev.querySelectorAll("button")].find(b => b.textContent.trim() === "精力不足")?.click();
  await new Promise(r => setTimeout(r, 1200));
  // 关复习页签重开（W-4 验证恢复横幅）
  return { clicked: true };
})()
