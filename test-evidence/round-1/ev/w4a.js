(() => {
  const nb = [...document.querySelectorAll("*")].filter(e => e.children.length === 0 && e.textContent.trim() === "小驴走查").map(e => ({ x: Math.round(e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2), y: Math.round(e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2) }));
  return nb;
})()
