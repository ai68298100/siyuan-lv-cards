(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  for (let i = 0; i < 3; i++) {
    const dlg = vis()[vis().length - 1];
    if (!dlg) break;
    [...dlg.querySelectorAll("button")].filter(b => b.textContent.trim() === "取消" || b.textContent.trim() === "Cancel").pop()?.click();
    await new Promise(r => setTimeout(r, 600));
  }
  // 复习：评完 2 张到完成屏
  await p.openTabOf("lv-cards-review");
  await new Promise(r => setTimeout(r, 3000));
  const rev = document.querySelector("[class*=lv-review]");
  const out = {};
  for (let i = 0; i < 3; i++) {
    const showBtn = rev.querySelector(".lv-btn-wide");
    if (!showBtn) break;
    const r = showBtn.getBoundingClientRect();
    window.__p = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    out["card" + i] = window.__p;
    break;
  }
  return out;
})()
