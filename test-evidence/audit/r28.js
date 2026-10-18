(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  // 开复习（旧式：先开面板）
  await p.openTabOf("lv-cards-review");
  await new Promise(r => setTimeout(r, 3000));
  const rev = document.querySelector("[class*=lv-review]");
  const formOf = () => {
    const hasTyping = !!rev.querySelector(".lv-typing input, input.b3-text-field");
    const choiceBtns = [...rev.querySelectorAll("button")].filter(b => /^[ABCD][\.、．]/.test(b.textContent.trim())).length;
    const t = rev.textContent.replace(/\s+/g, " ");
    return hasTyping ? "TYPING" : choiceBtns >= 3 ? "CHOICE" : t.includes("显示答案") ? "FLIP" : "?";
  };
  const before = formOf();
  // 面板开着时改设置：开混合+选择+打字（当前 typing 开、mixed 关）
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 1800));
  let dlg = vis()[vis().length - 1];
  const findByLabel = (kw) => {
    const rows = [...dlg.querySelectorAll("*")].filter(e => {
      const sws = e.querySelectorAll(":scope input.b3-switch, :scope > input.b3-switch");
      return sws.length === 1 && e.textContent.includes(kw) && e.getBoundingClientRect().height < 80 && e.getBoundingClientRect().height > 15;
    });
    return rows[rows.length - 1]?.querySelector("input.b3-switch");
  };
  for (const kw of ["混合题型轮换", "选择题练习模式"]) {
    const sw = findByLabel(kw);
    if (sw && !sw.checked) { sw.click(); await new Promise(r => setTimeout(r, 300)); }
  }
  [...dlg.querySelectorAll("button")].filter(b => b.textContent.trim() === "确定" && b.getBoundingClientRect().width > 0).pop()?.click();
  await new Promise(r => setTimeout(r, 1500));
  // 不重载页面：翻面评分后看下一张形态（应轮换 CHOICE）
  const el = rev.querySelector("[class*=lv-card2], .b3-typography");
  const r = el?.getBoundingClientRect();
  return { formBeforeSettingsChange: before, saved: { mixed: p.settings.mixedRotation, choice: p.settings.choiceEnabled }, clickPos: r ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + Math.min(r.height / 2, 200)) } : null };
})()
