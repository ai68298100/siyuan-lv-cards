(() => {
  const docs = [...document.querySelectorAll("*")].filter(e => e.children.length === 0 && /术语与概念|快速问答素材/.test(e.textContent.trim())).map(e => { const r = e.getBoundingClientRect(); return { text: e.textContent.trim().slice(0, 14), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; });
  return docs;
})()
