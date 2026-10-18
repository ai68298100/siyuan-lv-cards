(async () => {
  const out = {};
  // 抽屉：点「开档记录」
  const drawer = [...document.querySelectorAll("*")].filter(e => /内容状态/.test(e.textContent) && e.getBoundingClientRect().width > 280 && e.getBoundingClientRect().height > 250);
  const d = drawer[drawer.length - 1];
  const openBtn = [...(d?.querySelectorAll("button") ?? [])].find(b => b.textContent.includes("开档记录"));
  openBtn?.click();
  await new Promise(r => setTimeout(r, 1500));
  const d2 = [...document.querySelectorAll("*")].filter(e => /内容状态/.test(e.textContent) && e.getBoundingClientRect().width > 280 && e.getBoundingClientRect().height > 250).pop();
  out.afterOpen = d2?.textContent?.replace(/\s+/g, " ")?.match(/候选|活跃|复习中|开档后?/g)?.slice(0, 6) ?? null;
  out.drawerText = d2?.textContent?.replace(/\s+/g, " ")?.slice(0, 300) ?? null;
  return out;
})()
