(() => {
  const items = [...document.querySelectorAll("#fileTree .b3-list-item, #fileTree .fn__flex-1 .b3-list-item")].slice(0, 14).map(e => ({
    text: e.textContent.replace(/\s+/g, " ").trim().slice(0, 20),
  }));
  return items;
})()
