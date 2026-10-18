(() => {
  const rev = document.querySelector("[class*=lv-review]");
  return { now: rev?.textContent?.replace(/\s+/g, " ")?.slice(0, 140) };
})()
