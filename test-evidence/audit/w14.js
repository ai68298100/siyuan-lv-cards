(async () => {
  const rev = document.querySelector("[class*=lv-review]");
  const skipBtn = [...rev.querySelectorAll("button")].find(b => b.textContent.trim() === "Skip");
  skipBtn?.click();
  await new Promise(r => setTimeout(r, 1800));
  return { showAnswerGone: !rev.textContent.includes("Show Answer") || rev.querySelector(".lv-btn-wide") !== null };
})()
