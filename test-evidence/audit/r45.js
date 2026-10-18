(() => {
  const b = [...document.querySelectorAll(".protyle-wysiwyg [data-node-id]")].find(e => e.textContent.includes("主动回忆是形成长期记忆"));
  const r = b.getBoundingClientRect();
  return { bx: Math.round(r.x + 40), by: Math.round(r.y + r.height / 2), gutterCount: document.querySelectorAll(".protyle-gutters button").length };
})()
