(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const rev = () => document.querySelector("[class*=lv-review]");
  const out = {};
  // 1) 提示按钮
  [...rev().querySelectorAll("button")].find(b => b.textContent.trim() === "提示")?.click();
  await new Promise(r => setTimeout(r, 1000));
  out.hint = { text: rev().textContent.replace(/\s+/g, " ").slice(0, 160), hintShown: /提示|……/.test(rev().textContent) };
  // 2) 空格翻面
  const cardEl = rev().querySelector("[class*=lv-card2], .b3-typography");
  const r = cardEl?.getBoundingClientRect();
  return out;
})()
