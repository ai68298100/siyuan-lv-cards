(() => {
  const inputs = [...document.querySelectorAll(".b3-dialog input")].filter(i => i.offsetParent !== null);
  const last = inputs[inputs.length - 1];
  if (!last) return null;
  const r = last.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), count: inputs.length };
})()
