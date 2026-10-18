(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  p.openPalette();
  await new Promise(r => setTimeout(r, 1200));
  const dlg1 = document.querySelector(".b3-dialog");
  const t1 = dlg1?.textContent?.replace(/\s+/g, " ")?.slice(0, 150) ?? null;
  // Esc 关闭
  document.querySelector(".b3-dialog [data-close], .b3-dialog .b3-dialog__close")?.click() ?? dlg1?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 600));
  const closedAfterEsc = !document.querySelector(".b3-dialog");
  // 再开
  p.openPalette();
  await new Promise(r => setTimeout(r, 1200));
  const dlg2 = document.querySelector(".b3-dialog");
  const input = dlg2?.querySelector("input");
  if (input) { input.value = "复习"; input.dispatchEvent(new Event("input", { bubbles: true })); }
  await new Promise(r => setTimeout(r, 800));
  const items = [...(dlg2?.querySelectorAll(".b3-list-item, [class*=item]") ?? [])].map(e => e.textContent.replace(/\s+/g, " ").trim().slice(0, 20)).filter(Boolean).slice(0, 10);
  const residue = document.querySelectorAll(".b3-dialog").length;
  return { firstOpen: t1, closedAfterEsc, reopened: !!dlg2, filteredItems: items, dialogCount: residue };
})()
