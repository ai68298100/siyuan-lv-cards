(() => {
  const b = [...document.querySelectorAll(".protyle-wysiwyg [data-node-id]")].find(e => e.textContent.includes("FSRS"));
  const r = b.getBoundingClientRect();
  return { bx: Math.round(r.x + 40), by: Math.round(r.y + r.height / 2) };
})()
