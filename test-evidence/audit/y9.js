(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[0];
  // 来源清单行的 ⊘ 按钮（deny source）
  const denyBtn = [...dlg.querySelectorAll("button")].find(b => (b.textContent.trim() === "⊘" || b.getAttribute("aria-label")?.includes("禁止") || b.getAttribute("aria-label")?.includes("deny")));
  const out = { found: !!denyBtn, aria: denyBtn?.getAttribute("aria-label") ?? null };
  denyBtn?.click();
  await new Promise(r => setTimeout(r, 1200));
  // 可能出现 deny 确认菜单/对话框
  const menus = [...document.querySelectorAll(".b3-menu:not(.fn__none)")].map(m => m.textContent.replace(/\s+/g, " ").slice(0, 150));
  const dlg2 = vis()[vis().length - 1];
  out.menu = menus;
  out.confirmDialog = dlg2 !== dlg ? dlg2.textContent.replace(/\s+/g, " ").slice(0, 150) : null;
  return out;
})()
