(() => {
  const hub = document.querySelector("[class*=lv-hub]");
  const rows = [...hub.querySelectorAll("*")].filter(e => e.children.length === 0 && e.textContent.includes("轮换走查") && e.getBoundingClientRect().height < 40 && e.getBoundingClientRect().height > 5);
  const texts = [...hub.querySelectorAll(".lv-text")].map(e => e.textContent.trim().slice(0, 40)).slice(0, 10);
  return { rowMeta: rows.map(e => e.textContent.trim().slice(0, 30)).slice(0, 4), texts };
})()
