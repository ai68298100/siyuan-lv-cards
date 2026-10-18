(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[0];
  const inputs = [...dlg.querySelectorAll("input")].filter(e => e.getBoundingClientRect().width > 50).map(e => ({ type: e.type, ph: e.placeholder?.slice(0, 30), cls: String(e.className).slice(0, 30) }));
  return inputs;
})()
