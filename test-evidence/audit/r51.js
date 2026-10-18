(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.openTabOf("lv-cards-dashboard");
  await new Promise(r => setTimeout(r, 2500));
  return { dark: document.body.classList.contains("dark"), bodyCls: document.body.className.slice(0, 60) };
})()
