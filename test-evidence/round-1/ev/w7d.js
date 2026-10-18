(() => {
  const rev = document.querySelector("[class*=lv-review]");
  return {
    progress: rev?.querySelector(".lv-progress")?.textContent ?? null,
    reviewText: rev?.textContent?.replace(/\s+/g, " ")?.slice(0, 150),
  };
})()
