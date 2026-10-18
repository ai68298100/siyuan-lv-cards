(() => {
  const p = window.siyuan.ws.app.plugins[0];
  return { inbox: JSON.stringify(p.inbox).slice(0, 200) };
})()
