(() => {
  const dlg = document.querySelector(".b3-dialog");
  const rows = [...dlg.querySelectorAll("*")].filter(e => e.children.length === 0 && /走查卡组\s*4/.test(e.textContent.trim()) && e.textContent.trim().length < 12);
  const r = rows[0].getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
})()
