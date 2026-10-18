(async () => {
  const rev = () => document.querySelector("[class*=lv-review]");
  [...rev().querySelectorAll("button")].find(b => b.textContent.trim() === "刷新")?.click();
  await new Promise(r => setTimeout(r, 2500));
  const t = rev().textContent.replace(/\s+/g, " ");
  const flipAndRate = async () => {
    // 翻面
    const el = rev().querySelector("[class*=lv-card2], .b3-typography");
    const r = el?.getBoundingClientRect();
    if (!r) return "no-card";
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + Math.min(r.height / 2, 200)) };
  };
  const pos = await flipAndRate();
  return { queueText: t.slice(0, 120), pos };
})()
