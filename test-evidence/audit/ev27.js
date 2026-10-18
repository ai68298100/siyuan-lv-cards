(() => {
  const rev = document.querySelector("[class*=lv-review]");
  const t = rev?.textContent?.replace(/\s+/g, " ") ?? "";
  const chips = [...(rev?.querySelectorAll("button") ?? [])].map(b => b.textContent.trim()).filter(x => /精力|时间|今天|状态|先走|不想/.test(x));
  return { doneScreen: /完成|收工|明日|连胜|复习 /.test(t) && chips.length >= 0, chips, text: t.slice(0, 320) };
})()
