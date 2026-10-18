(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[0];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("退出演练"))?.click();
  await new Promise(r => setTimeout(r, 800));
  const p = window.siyuan.ws.app.plugins[0];
  const cmd = p.commands?.find(c => c.langKey === "pairing");
  await cmd?.callback?.();
  await new Promise(r => setTimeout(r, 3500));
  const dlg2 = vis()[0];
  // 读取左右卡片文本
  const cards = [...(dlg2?.querySelectorAll("button") ?? [])].filter(b => b.getBoundingClientRect().width > 100 && b.textContent.trim().length > 1).map(b => ({ t: b.textContent.trim().slice(0, 24), x: Math.round(b.getBoundingClientRect().x + b.getBoundingClientRect().width / 2), y: Math.round(b.getBoundingClientRect().y + b.getBoundingClientRect().height / 2) }));
  return { pairingOpen: !!dlg2, cards: cards.slice(0, 12) };
})()
