(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 2000));
  const dlg = vis()[vis().length - 1];
  // 滚到底找备份导出
  const scroller = [...dlg.querySelectorAll("*")].find(e => e.scrollHeight > e.clientHeight + 500);
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
  await new Promise(r => setTimeout(r, 500));
  const btn = [...dlg.querySelectorAll("button")].find(b => /导出全部|备份/.test(b.textContent));
  const out = { btnFound: !!btn, label: btn?.textContent?.trim() ?? null };
  // 监听下载
  const downloadPromise = new Promise((res) => {
    const timer = setTimeout(() => res(null), 4000);
    document.addEventListener("click", () => {}, true);
    // 轮询 a[download] 触发不可靠——headless 下载行为由浏览器处理
    setTimeout(() => { clearTimeout(timer); res("clicked"); }, 500);
  });
  btn?.click();
  await downloadPromise;
  await new Promise(r => setTimeout(r, 2500));
  out.toast = document.querySelector("#message")?.textContent?.replace(/\s+/g, " ")?.slice(0, 150) ?? null;
  // 关设置
  [...dlg.querySelectorAll("button")].filter(b => b.textContent.trim() === "取消").pop()?.click();
  return out;
})()
