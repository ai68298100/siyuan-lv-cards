(async () => {
  const rev = document.querySelector("[class*=lv-review]");
  const out = {};
  // 1) 点一个收工原因
  [...rev.querySelectorAll("button")].find(b => b.textContent.trim() === "精力不足")?.click();
  await new Promise(r => setTimeout(r, 800));
  out.reasonPicked = rev.textContent.includes("精力不足");
  // 2) 撤销最后一评
  [...rev.querySelectorAll("button")].find(b => b.textContent.trim() === "撤销最后一评")?.click();
  await new Promise(r => setTimeout(r, 2000));
  const t2 = rev.textContent.replace(/\s+/g, " ");
  out.afterUndo = { backToCard: /显示答案/.test(t2), progress: rev.querySelector(".lv-progress")?.textContent ?? null };
  return out;
})()
