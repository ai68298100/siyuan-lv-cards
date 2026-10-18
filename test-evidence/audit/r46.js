(() => {
  // 找包含目标块的可见 protyle 所在 tab 头
  const tabs = [...document.querySelectorAll(".layout-tab-container__item, [data-type=tab-header]")];
  const vis = tabs.filter(t => t.getBoundingClientRect().width > 0).map(t => ({ t: t.textContent.trim().slice(0, 14), x: Math.round(t.getBoundingClientRect().x + t.getBoundingClientRect().width / 2), y: Math.round(t.getBoundingClientRect().y + t.getBoundingClientRect().height / 2) }));
  // 也给出所有含"主动回忆"的块（含不可见）
  const blocks = [...document.querySelectorAll(".protyle-wysiwyg [data-node-id]")].filter(e => e.textContent.includes("主动回忆")).map(e => { const r = e.getBoundingClientRect(); return { h: Math.round(r.height), vis: r.width > 0 }; });
  return { tabs: vis, blocks };
})()
