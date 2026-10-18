(() => {
  const drawer = [...document.querySelectorAll("*")].filter(e => /内容状态/.test(e.textContent) && e.getBoundingClientRect().width > 280 && e.getBoundingClientRect().height > 250);
  const d = drawer[drawer.length - 1];
  const btns = [...(d?.querySelectorAll("button") ?? [])].filter(b => b.getBoundingClientRect().width > 0).map(b => b.textContent.trim()).filter(Boolean);
  return { drawerOpen: !!d, actions: btns.slice(0, 16) };
})()
