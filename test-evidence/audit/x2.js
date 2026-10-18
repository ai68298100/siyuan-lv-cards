(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.openTabOf("lv-cards-review");
  await new Promise(r => setTimeout(r, 3000));
  const rev = document.querySelector("[class*=lv-review]");
  const showBtn = [...rev.querySelectorAll("button")].find(b => b.textContent.trim() === "显示答案");
  const r = showBtn?.getBoundingClientRect();
  return { pos: r ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null, progress: rev.querySelector(".lv-progress")?.textContent };
})()
