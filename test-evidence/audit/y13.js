(async () => {
  const drawers = [...document.querySelectorAll("*")].filter(e => /注册为知识对象/.test(e.textContent) && e.getBoundingClientRect().width > 280);
  const d = drawers[drawers.length - 1];
  const out = { drawerFound: !!d };
  // 点注册
  const regBtn = [...(d?.querySelectorAll("button") ?? [])].find(b => b.textContent.includes("注册为知识对象") || b.textContent.includes("注册"));
  out.regBtn = regBtn?.textContent?.trim() ?? null;
  regBtn?.click();
  await new Promise(r => setTimeout(r, 2000));
  const p = window.siyuan.ws.app.plugins[0];
  out.koCount = p.knowledgeObjects?.objects?.length ?? Object.keys(p.knowledgeObjects?.objects ?? {}).length;
  out.koSnapshot = JSON.stringify(p.knowledgeObjects).slice(0, 220);
  return out;
})()
