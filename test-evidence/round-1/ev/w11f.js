(() => {
  const p = window.siyuan.ws.app.plugins[0];
  const ctxs = p.entryContexts ? Object.values(p.entryContexts).flat?.() ?? p.entryContexts : null;
  return { entryContexts: typeof ctxs === "object" ? JSON.stringify(ctxs).slice(0, 300) : String(ctxs) };
})()
