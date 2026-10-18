(async () => {
  const rev = document.querySelector("[class*=lv-review]");
  // 单独打开偏好
  [...rev.querySelectorAll("button")].find(b => b.textContent.trim() === "偏好")?.click();
  await new Promise(r => setTimeout(r, 1200));
  return { done: true };
})()
