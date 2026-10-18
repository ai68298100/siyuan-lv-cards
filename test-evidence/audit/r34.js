(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  // 关抽屉
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  await new Promise(r => setTimeout(r, 600));
  // 需要活动文档=标记走查：先打开它
  const token = await (await import("node:fs")).promises.readFile("C:/Users/Admin/AppData/Local/Temp/siyuan-lvcards-e2e-1791480918226/conf/conf.json", "utf8");
  return { skipped: "need active doc" };
})()
