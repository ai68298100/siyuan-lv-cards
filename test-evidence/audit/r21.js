(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  // 重开复习面板（新队列按新设置轮换）
  await p.openTabOf("lv-cards-review");
  await new Promise(r => setTimeout(r, 3000));
  const rev = document.querySelector("[class*=lv-review]");
  const out = { forms: [] };
  // 只观察前 3 张的形态（翻面/打字/选择应轮流出现）
  for (let i = 0; i < 3; i++) {
    const t = rev.textContent.replace(/\s+/g, " ");
    const hasInput = !!rev.querySelector("input[type=text]");
    const hasChoiceBtns = [...rev.querySelectorAll("button")].filter(b => /^[ABCD][\.、]/.test(b.textContent.trim())).length;
    const form = hasInput ? "typing" : hasChoiceBtns >= 3 ? "choice" : /显示答案/.test(t) ? "flip" : "done?";
    out.forms.push({ form, hasInput, hasChoiceBtns });
    if (form === "done?") break;
    // 翻面（flip）/提交空作答（typing）/选 A（choice）后评分 3
    if (form === "flip") {
      const el = rev.querySelector("[class*=lv-card2], .b3-typography");
      const r = el?.getBoundingClientRect();
      if (!r) break;
      window.__p = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + Math.min(r.height / 2, 200)) };
      break; // flip 需要真实键盘，交给外层
    } else if (form === "typing") {
      const input = rev.querySelector("input[type=text]");
      input.value = "作答";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      // 提交按钮
      const submit = [...rev.querySelectorAll("button")].find(b => /对照|提交|判分/.test(b.textContent));
      submit?.click();
      await new Promise(r => setTimeout(r, 1200));
    } else if (form === "choice") {
      const opt = [...rev.querySelectorAll("button")].find(b => /^[ABCD][\.、]/.test(b.textContent.trim()));
      opt?.click();
      await new Promise(r => setTimeout(r, 1200));
    }
    const rate3 = [...rev.querySelectorAll("button")].find(b => /^良好/.test(b.textContent.trim()));
    rate3?.click();
    await new Promise(r => setTimeout(r, 1800));
  }
  return out;
})()
