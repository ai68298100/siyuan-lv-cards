(() => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[vis().length - 1];
  if (!dlg) return { err: "wizard closed" };
  const editables = [...dlg.querySelectorAll("textarea, [contenteditable=true], [contenteditable=''], input[type=text]")].filter(e => e.getBoundingClientRect().width > 60).map(e => ({ tag: e.tagName, cls: String(e.className).slice(0, 40), ce: e.getAttribute("contenteditable"), ph: e.getAttribute("placeholder"), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) }));
  return { editables };
})()
