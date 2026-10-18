(async () => {
  const rev = () => document.querySelector("[class*=lv-review]");
  const out = {};
  // 提示后再看一次卡面区域文本
  const face = () => (rev().querySelector(".b3-typography, [class*=lv-card2]")?.textContent ?? "").replace(/\s+/g, " ").slice(0, 200);
  out.afterHint = face();
  // 空格翻面：点卡面聚焦后真实按键
  const el = rev().querySelector("[class*=lv-card2], .b3-typography");
  const r = el?.getBoundingClientRect();
  return { afterHint: out.afterHint, cardRect: r ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + Math.min(r.height / 2, 200)) } : null };
})()
