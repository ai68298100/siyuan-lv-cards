(async () => {
  // 管理器行内的详情按钮
  const rowBtns = [...document.querySelectorAll("button")].filter(b => b.getBoundingClientRect().width > 0 && /详情|打开/.test(b.getAttribute("aria-label") ?? b.textContent));
  const b = rowBtns[0];
  if (!b) {
    // 兜底：点第一行本身
    const row = [...document.querySelectorAll("*")].find(e => e.children.length === 0 && e.textContent.includes("FSRS 是一种基于深度学习模型"));
    const r = row?.getBoundingClientRect();
    return { fallback: true, x: r ? Math.round(r.x + 30) : null, y: r ? Math.round(r.y + r.height / 2) : null };
  }
  const r = b.getBoundingClientRect();
  return { btn: b.getAttribute("aria-label"), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
})()
