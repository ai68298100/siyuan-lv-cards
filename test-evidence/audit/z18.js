(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  let dlg = vis()[0];
  const t = dlg?.textContent.replace(/\s+/g, " ") ?? "";
  return { open: !!dlg, text: t.slice(0, 140) };
})()
