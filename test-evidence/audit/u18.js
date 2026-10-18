(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  // 复习翻面不评分（制造进行中会话状态）
  await p.openTabOf("lv-cards-review");
  await new Promise(r => setTimeout(r, 3000));
  const rev = document.querySelector("[class*=lv-review]");
  const showBtn = [...rev.querySelectorAll("button")].find(b => b.textContent.trim() === "显示答案");
  const r = showBtn?.getBoundingClientRect();
  window.__p = r ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null;
  return window.__p;
})()
