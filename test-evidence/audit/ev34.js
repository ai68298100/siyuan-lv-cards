(() => {
  const drawer = [...document.querySelectorAll("*")].filter(e => /内容状态|学习记录|卡面|来源/.test(e.textContent) && e.getBoundingClientRect().width > 280 && e.getBoundingClientRect().width < 720 && e.getBoundingClientRect().height > 250);
  const d = drawer[drawer.length - 1];
  return { drawerOpen: !!d, text: d?.textContent?.replace(/\s+/g, " ")?.slice(0, 420) ?? null };
})()
