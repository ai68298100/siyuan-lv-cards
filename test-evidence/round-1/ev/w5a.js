(() => {
  const title = document.querySelector(".protyle-title")?.textContent?.trim();
  const blocks = [...document.querySelectorAll(".protyle-wysiwyg [data-node-id]")].map(b => ({ id: b.dataset.nodeId, text: b.textContent.trim().slice(0, 24) }));
  return { title, blocks };
})()
