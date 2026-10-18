(async () => {
  const rev = document.querySelector("[class*=lv-review]");
  const before = {
    rateButtons: rev.querySelectorAll(".lv-btn-rate").length,
    showBtn: [...rev.querySelectorAll("button")].some(b => b.textContent.trim() === "显示答案"),
    progress: rev.querySelector(".lv-progress")?.textContent,
  };
  const showBtn = [...rev.querySelectorAll("button")].find(b => b.textContent.trim() === "显示答案");
  showBtn?.click();
  await new Promise(r => setTimeout(r, 1200));
  const after = {
    rateButtons: rev.querySelectorAll(".lv-btn-rate").length,
    showBtn: [...rev.querySelectorAll("button")].some(b => b.textContent.trim() === "显示答案"),
  };
  return { before, after };
})()
