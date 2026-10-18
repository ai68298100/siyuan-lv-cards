(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  // 打开标记走查文档（openTab 内部 API 由 kernel event？直接用插件的 loadCurrentDoc 需要 active editor）
  // 用内核 API 打开：/api/filetree/getDoc 不开 tab；用 SiYuan 的 openFileById 事件不可达。
  // 走 UI：文件树点开文档
  const nb = [...document.querySelectorAll("*")].filter(e => e.children.length === 0 && e.textContent.trim() === "我的笔记本" && e.getBoundingClientRect().width > 50);
  nb[0]?.click();
  await new Promise(r => setTimeout(r, 1200));
  const doc = [...document.querySelectorAll("*")].filter(e => e.children.length === 0 && e.textContent.trim() === "标记走查" && e.getBoundingClientRect().width > 40);
  const el = doc[doc.length - 1];
  const r = el?.getBoundingClientRect();
  return { found: !!el, x: r ? Math.round(r.x + r.width / 2) : null, y: r ? Math.round(r.y + r.height / 2) : null };
})()
