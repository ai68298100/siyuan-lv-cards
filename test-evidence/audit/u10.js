(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[0];
  const cards = [...dlg.querySelectorAll("button")].filter(b => b.getBoundingClientRect().width > 100 && !b.classList.contains("lv-pair-done") && b.textContent.trim().length > 1).map(b => ({ t: b.textContent.trim().slice(0, 18), x: Math.round(b.getBoundingClientRect().x + b.getBoundingClientRect().width / 2), y: Math.round(b.getBoundingClientRect().y + b.getBoundingClientRect().height / 2) }));
  return cards;
})()
