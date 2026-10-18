(() => {
  const all = [...document.querySelectorAll("*")].filter(e => e.children.length === 0 && e.textContent.trim() === "术语与概念").map(e => ({ tag: e.tagName, cls: String(e.className).slice(0, 50), parentCls: String(e.parentElement?.className).slice(0, 50) }));
  const treeRoots = [...document.querySelectorAll(".layout__left, .fn__flex-column")].slice(0, 3).map(e => e.id || String(e.className).slice(0, 30));
  return { all, treeRoots };
})()
