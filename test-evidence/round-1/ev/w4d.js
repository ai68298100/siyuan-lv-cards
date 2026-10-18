(() => {
  const rows = [...document.querySelectorAll(".b3-list-item")].filter(e => e.textContent.includes("小驴走查"));
  const arrow = rows[0]?.querySelector(".b3-list-item__arrow");
  const open = arrow?.className?.includes("b3-list-item__arrow--open");
  const allTexts = [...document.querySelectorAll(".b3-list-item__text")].map(e => e.textContent.trim()).slice(0, 15);
  return { open, allTexts };
})()
