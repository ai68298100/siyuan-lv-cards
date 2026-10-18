(async () => {
  const rev = document.querySelector("[class*=lv-review]");
  [...rev.querySelectorAll("button")].find(b => b.textContent.trim() === "刷新")?.click();
  await new Promise(r => setTimeout(r, 2500));
  return { queue: rev.querySelector(".lv-progress")?.textContent, text: rev.textContent.replace(/\s+/g, " ").slice(0, 80) };
})()
