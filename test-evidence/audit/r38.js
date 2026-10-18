(() => {
  const doc = [...document.querySelectorAll(".b3-list-item__text")].filter(e => e.getBoundingClientRect().width > 100);
  const el = doc[doc.length - 1];
  const r = el?.getBoundingClientRect();
  return { last: el?.textContent, x: r ? Math.round(r.x + r.width / 2) : null, y: r ? Math.round(r.y + r.height / 2) : null };
})()
