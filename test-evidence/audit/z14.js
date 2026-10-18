(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 2000));
  const dlg = vis()[vis().length - 1];
  // 备份导出按钮 = lv-row 内文本恰为 JSON 的 outline 按钮（备份行），点击 → ctx.backup.export() → 触发下载
  const jsonBtns = [...dlg.querySelectorAll("button")].filter(b => b.textContent.trim() === "JSON" && b.classList.contains("b3-button--outline"));
  const out = { jsonBtnCount: jsonBtns.length };
  // 捕获下载：监听 a.download 或 blob URL 创建
  const hook = `
    window.__lvDownloads = [];
    const origCreate = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function(obj) {
      const u = origCreate(obj);
      window.__lvDownloads.push(u);
      return u;
    };
  `;
  await p.constructor && 0; // noop
  dlg.ownerDocument.defaultView.eval(hook.replace(/^\s+/, ""));
  // 找备份行的 JSON 按钮（第 3 个 outline JSON = 备份，前两个是画像/设置导出……顺序：导出当前画像、导出设置、备份导出、导出复习日志、账本）
  // 直接逐个点击所有 outline JSON 并记录 blob URL 生成数
  const before = await dlg.ownerDocument.defaultView.eval ? 0 : 0;
  const btnBackup = jsonBtns[jsonBtns.length - 1]; // 最后一个 outline JSON 通常为备份导出
  btnBackup?.click();
  await new Promise(r => setTimeout(r, 2000));
  out.downloads = (dlg.ownerDocument.defaultView).__lvDownloads?.length ?? "n/a";
  out.toast = document.querySelector("#message")?.textContent?.replace(/\s+/g, " ")?.slice(0, 130) ?? null;
  // 关设置
  [...dlg.querySelectorAll("button")].filter(b => b.textContent.trim() === "Cancel" || b.textContent.trim() === "取消").pop()?.click();
  return out;
})()
