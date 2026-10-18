(() => {
  const tab = [...document.querySelectorAll(".layout-tab-container__item, [data-type=tab-header], .item")].find(e => e.textContent.includes("开始复习"));
  if (!tab) return { tabs: [...document.querySelectorAll(".layout-tab-container__item")].map(e => e.textContent.trim()) };
  const r = tab.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
})()
