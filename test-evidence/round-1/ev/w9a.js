(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const out = {};
  // 快速制卡：开→内容→Esc 关
  await p.openQuickCard();
  await new Promise(r => setTimeout(r, 1500));
  let dlg = [...document.querySelectorAll(".b3-dialog")].filter(d => d.offsetParent !== null).pop();
  out.quickCard = { open: !!dlg, text: dlg?.textContent?.replace(/\s+/g, " ")?.slice(0, 100) ?? null };
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await new Promise(r => setTimeout(r, 800));
  out.quickCardClosed = [...document.querySelectorAll(".b3-dialog")].filter(d => d.offsetParent !== null).length;
  // 标记制卡
  await p.openMarkerCards();
  await new Promise(r => setTimeout(r, 1500));
  dlg = [...document.querySelectorAll(".b3-dialog")].filter(d => d.offsetParent !== null).pop();
  out.marker = { open: !!dlg, text: dlg?.textContent?.replace(/\s+/g, " ")?.slice(0, 100) ?? null };
  return out;
})()
