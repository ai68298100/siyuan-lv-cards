(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.openTabOf("lv-cards-review");
  await new Promise(r => setTimeout(r, 3000));
  const rev = document.querySelector("[class*=lv-review]");
  const text = rev?.textContent?.replace(/\s+/g, " ") ?? "";
  const chips = [...rev?.querySelectorAll("button") ?? []].map(b => b.textContent.trim()).filter(t => /精力|时间|状态|完成|不想|收工/.test(t)).slice(0, 8);
  return { doneScreen: /完成|收工|不错|明日/.test(text), text: text.slice(0, 300), chips };
})()
