(async () => {
  // 点文件树展开并打开闪卡语料
  const nb = [...document.querySelectorAll(".b3-list-item__text")].find(e => e.textContent.trim() === "一致性走查");
  const arrow = nb?.closest(".b3-list-item")?.querySelector(".b3-list-item__arrow");
  arrow?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 1200));
  const doc = [...document.querySelectorAll(".b3-list-item__text")].find(e => e.textContent.trim() === "闪卡语料");
  doc?.click();
  await new Promise(r => setTimeout(r, 3000));
  const mathEls = [...document.querySelectorAll(".katex, .katex-display")].length;
  const protyle = document.querySelector(".protyle-wysiwyg");
  const formulaText = protyle?.textContent?.includes("质能方程");
  return { mathEls, formulaTextVisible: formulaText, mathSample: document.querySelector(".katex")?.textContent?.slice(0, 30) ?? null };
})()
