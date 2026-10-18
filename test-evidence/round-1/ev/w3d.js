(() => {
  const found = [...document.querySelectorAll("*")].filter(e => e.children.length === 0 && /术语与概念|快速问答素材/.test(e.textContent.trim())).map(e => ({ text: e.textContent.trim().slice(0, 14), x: Math.round(e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2), y: Math.round(e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2) }));
  return found;
})()
