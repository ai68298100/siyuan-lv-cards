(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  p.openPalette();
  await new Promise(r => setTimeout(r, 1200));
  const dlg = document.querySelector(".b3-dialog");
  const input = dlg?.querySelector("input");
  if (input) { input.value = "复习"; input.dispatchEvent(new Event("input", { bubbles: true })); }
  await new Promise(r => setTimeout(r, 800));
  const items = [...(dlg?.querySelectorAll(".b3-list-item, .b3-menu__item, [class*=palette] [class*=item]") ?? [])].map(e => e.textContent.replace(/\s+/g, " ").trim()).filter(t => t && t.length < 30).slice(0, 8);
  return { open: !!dlg, text: dlg?.textContent?.replace(/\s+/g, " ")?.slice(0, 120) ?? null, filteredItems: items };
})()
