(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  let dlg = vis()[vis().length - 1];
  if (dlg) {
    [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "确定")?.click();
    await new Promise(r => setTimeout(r, 1200));
  }
  const rev = document.querySelector("[class*=lv-review]");
  const out = { settingsClosed: vis().length === 0 };
  // 翻面评分循环 ×4，记录每张的形态
  out.forms = [];
  for (let i = 0; i < 4; i++) {
    const t = rev.textContent.replace(/\s+/g, " ");
    if (/本场完成|收工/.test(t)) { out.forms.push("DONE"); break; }
    const form = rev.querySelector("input[type=text]") ? "typing" : (/显示答案/.test(t) ? "flip" : "?");
    out.forms.push(form);
    const el = rev.querySelector("[class*=lv-card2], .b3-typography");
    const r = el?.getBoundingClientRect();
    if (!r) break;
    window.__p = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + Math.min(r.height / 2, 200)) };
    break;
  }
  return out;
})()
