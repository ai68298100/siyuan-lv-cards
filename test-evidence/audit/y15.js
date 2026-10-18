(async () => {
  const drawer = [...document.querySelectorAll("*")].filter(e => /Register as knowledge object/.test(e.textContent) && e.getBoundingClientRect().width > 280).pop();
  const reg = [...(drawer?.querySelectorAll("a, button, span") ?? [])].find(e => e.textContent.trim() === "Register as knowledge object");
  reg?.click();
  await new Promise(r => setTimeout(r, 2000));
  const p = window.siyuan.ws.app.plugins[0];
  const ko = p.knowledgeObjects;
  return {
    koObjects: ko?.objects?.length ?? 0,
    snapshot: JSON.stringify(ko).slice(0, 260),
  };
})()
