(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  // 知识对象已注册（R8 前面步骤），打开管理器→示例 1 行→抽屉应显示 ko-panel（不崩）
  await p.openTabOf("lv-cards-dashboard", { tab: "manage" });
  await new Promise(r => setTimeout(r, 2500));
  const hubEl = document.querySelector("[class*=lv-hub]");
  const rows = [...hubEl.querySelectorAll("*")].filter(e => e.children.length === 0 && e.textContent.includes("示例 1") && e.getBoundingClientRect().width > 150);
  const el = rows[rows.length - 1];
  const r = el?.getBoundingClientRect();
  return { pos: r ? { x: Math.round(r.x + Math.min(r.width / 2, 260)), y: Math.round(r.y + r.height / 2) } : null };
})()
