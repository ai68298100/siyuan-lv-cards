(async () => {
  const rev = () => document.querySelector("[class*=lv-review]");
  const out = {};
  out.afterRate3 = { progress: rev().querySelector(".lv-progress")?.textContent, face: (rev().querySelector(".b3-typography, [class*=lv-card2]")?.textContent ?? "").replace(/\s+/g, " ").slice(0, 80) };
  // 回看（上一张）
  [...rev().querySelectorAll("button")].find(b => b.textContent.trim() === "回看")?.click();
  await new Promise(r => setTimeout(r, 1500));
  out.afterLookBack = { progress: rev().querySelector(".lv-progress")?.textContent, face: (rev().querySelector(".b3-typography, [class*=lv-card2]")?.textContent ?? "").replace(/\s+/g, " ").slice(0, 80) };
  // 撤销（撤销上一次评分）
  [...rev().querySelectorAll("button")].find(b => b.textContent.trim() === "撤销")?.click();
  await new Promise(r => setTimeout(r, 2000));
  out.afterUndo = { progress: rev().querySelector(".lv-progress")?.textContent, text: rev().textContent.replace(/\s+/g, " ").slice(0, 120) };
  return out;
})()
