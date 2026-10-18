(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 1800));
  const dlg = vis()[vis().length - 1];
  const findByLabel = (kw) => {
    const rows = [...dlg.querySelectorAll("*")].filter(e => {
      const sws = e.querySelectorAll(":scope input.b3-switch, :scope > input.b3-switch");
      return sws.length === 1 && e.textContent.includes(kw) && e.getBoundingClientRect().height < 80 && e.getBoundingClientRect().height > 15;
    });
    return rows[rows.length - 1]?.querySelector("input.b3-switch");
  };
  // 关混合，保持打字开
  const mixed = findByLabel("混合题型轮换");
  if (mixed?.checked) { mixed.click(); await new Promise(r => setTimeout(r, 300)); }
  [...dlg.querySelectorAll("button")].filter(b => b.textContent.trim() === "确定" && b.getBoundingClientRect().width > 0).pop()?.click();
  await new Promise(r => setTimeout(r, 1500));
  // 重开复习（新队列）
  await p.openTabOf("lv-cards-review");
  await new Promise(r => setTimeout(r, 3000));
  const rev = document.querySelector("[class*=lv-review]");
  const hasTyping = !!rev.querySelector(".lv-typing input, input.b3-text-field");
  return {
    mixedNow: p.settings.mixedRotation, typingNow: p.settings.typingEnabled,
    firstCardForm: hasTyping ? "TYPING" : "flip/other",
    text: rev.textContent.replace(/\s+/g, " ").slice(0, 100),
  };
})()
