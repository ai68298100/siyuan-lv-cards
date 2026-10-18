(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const hubEl = () => document.querySelector("[class*=lv-hub]");
  await p.openTabOf("lv-cards-dashboard", { tab: "inbox" });
  await new Promise(r => setTimeout(r, 2000));
  const out = {};
  out.inboxView = hubEl().textContent.replace(/\s+/g, " ").slice(0, 250);
  // 勾选待筛选条目
  const cb = hubEl().querySelector("input[type=checkbox]");
  cb?.click();
  await new Promise(r => setTimeout(r, 600));
  // 选中/制卡按钮
  const btns = [...hubEl().querySelectorAll("button")].filter(b => b.getBoundingClientRect().width > 0).map(b => b.textContent.trim());
  out.actions = btns.filter(t => /选中|淘汰|暂存|制卡|全选/.test(t)).slice(0, 8);
  return out;
})()
