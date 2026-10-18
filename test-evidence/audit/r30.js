(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  // 管理页签
  await p.openTabOf("lv-cards-dashboard", { tab: "manage" });
  await new Promise(r => setTimeout(r, 2500));
  const hub = () => document.querySelector("[class*=lv-hub]");
  // 勾选第一行 checkbox
  const cb = hub().querySelector("input[type=checkbox]");
  cb?.click();
  await new Promise(r => setTimeout(r, 600));
  // 批量操作按钮出现？
  const btns = [...hub().querySelectorAll("button")].filter(b => b.getBoundingClientRect().width > 0).map(b => b.textContent.trim());
  return {
    checked: cb?.checked,
    batchButtons: btns.filter(t => /移除|重置|导出|全选|批量|CSV|Obsidian|取消/.test(t)).slice(0, 8),
    allButtons: btns.slice(0, 20),
  };
})()
