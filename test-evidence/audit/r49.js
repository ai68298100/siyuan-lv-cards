(async () => {
  const hubEl = () => document.querySelector("[class*=lv-hub]");
  const out = {};
  // 点行内 checkbox → 选中
  hubEl().querySelector("input[type=checkbox]")?.click();
  await new Promise(r => setTimeout(r, 500));
  [...hubEl().querySelectorAll("button")].find(b => b.textContent.trim() === "选中")?.click();
  await new Promise(r => setTimeout(r, 1500));
  const t = hubEl().textContent.replace(/\s+/g, " ");
  out.afterSelect = { picked: /已选中 1|已选中 \(1\)/.test(t), snippet: t.slice(0, 180) };
  return out;
})()
