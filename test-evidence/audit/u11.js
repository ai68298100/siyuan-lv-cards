(() => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[0];
  const cards = [...dlg.querySelectorAll("button")].filter(b => b.getBoundingClientRect().width > 100).map(b => ({
    t: b.textContent.trim().slice(0, 16),
    cls: String(b.className).slice(0, 60),
    data: Object.entries(b.dataset).map(([k, v]) => k + "=" + String(v).slice(0, 12)).join(","),
  }));
  return cards.slice(0, 10);
})()
