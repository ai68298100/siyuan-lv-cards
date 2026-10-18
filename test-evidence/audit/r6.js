(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  if (![...document.querySelectorAll(".b3-dialog")].some(d => d.textContent.includes("设置"))) {
    await p.openSettingsDialog();
    await new Promise(r => setTimeout(r, 1800));
  }
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[vis().length - 1];
  // 抓所有开关及其行文本
  const switches = [...dlg.querySelectorAll(".b3-switch")].filter(e => e.getBoundingClientRect().width > 0);
  return {
    count: switches.length,
    items: switches.slice(0, 30).map((sw, i) => {
      let label = "";
      let el = sw.parentElement;
      for (let d = 0; d < 3 && el; d++) {
        const t = el.textContent.replace(/\s+/g, " ").trim();
        if (t.length > 2) { label = t.slice(0, 30); break; }
        el = el.parentElement;
      }
      return { i, on: sw.classList.contains("b3-switch--on"), label };
    }),
  };
})()
