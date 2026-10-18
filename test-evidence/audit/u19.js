(() => {
  const rev = document.querySelector("[class*=lv-review]");
  return { flippedNow: !rev.textContent.includes("显示答案"), progress: rev.querySelector(".lv-progress")?.textContent };
})()
