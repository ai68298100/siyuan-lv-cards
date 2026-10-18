(() => {
  // 当前活动文档是哪个？找 protyle 标题
  const title = document.querySelector(".protyle-title")?.textContent?.trim();
  const blocks = [...document.querySelectorAll(".protyle-wysiwyg [data-node-id]")].map(b => b.textContent.trim().slice(0, 20));
  return { title, blocks: blocks.slice(0, 6) };
})()
