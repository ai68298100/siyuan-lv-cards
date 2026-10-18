(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  // 关抽屉
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  await new Promise(r => setTimeout(r, 600));
  // 打开顶栏右键菜单
  p.showTopbarMenu(new MouseEvent("contextmenu", { bubbles: true }));
  await new Promise(r => setTimeout(r, 1200));
  const menu = document.querySelector("#commonMenu:not(.fn__none), .b3-menu:not(.fn__none)");
  const items = [...(menu?.querySelectorAll(".b3-menu__item") ?? [])].map(e => e.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
  return { menuOpen: !!menu, items };
})()
