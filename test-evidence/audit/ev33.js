(() => {
  const rows = [...document.querySelectorAll("*")].filter(e => e.children.length === 0 && e.getBoundingClientRect().width > 150 && /间隔重复（SRS）是什么|FSRS 的全称|调度算法/.test(e.textContent));
  const el = rows[rows.length - 1];
  const r = el?.getBoundingClientRect();
  return { found: !!el, t: el?.textContent?.slice(0, 24), x: r ? Math.round(r.x + Math.min(r.width / 2, 260)) : null, y: r ? Math.round(r.y + r.height / 2) : null };
})()
