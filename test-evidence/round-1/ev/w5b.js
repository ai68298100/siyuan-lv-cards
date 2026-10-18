(() => {
  const gutters = [...document.querySelectorAll(".protyle-gutters button")].map(b => ({ nodeid: b.closest(".protyle-gutters")?.dataset?.nodeid ?? b.dataset?.nodeid, x: Math.round(b.getBoundingClientRect().x + b.getBoundingClientRect().width / 2), y: Math.round(b.getBoundingClientRect().y + b.getBoundingClientRect().height / 2) }));
  return { count: gutters.length, gutters: gutters.slice(0, 6) };
})()
