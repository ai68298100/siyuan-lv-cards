(() => {
  const rows = [...document.querySelectorAll(".b3-list-item")].filter(e => e.textContent.includes("小驴走查"));
  if (!rows.length) return { err: "row not found" };
  const row = rows[0];
  const arrow = row.querySelector(".b3-list-item__arrow");
  const r = (arrow ?? row).getBoundingClientRect();
  return { arrowFound: !!arrow, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), rowCls: row.className.slice(0, 60) };
})()
