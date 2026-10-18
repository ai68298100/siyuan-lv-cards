(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[0];
  // 到确认发送层看文案
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Generate") || b.textContent.includes("AI 生成"))?.click();
  await new Promise(r => setTimeout(r, 1500));
  dlg = vis()[0];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Confirm") || b.textContent.includes("确认发送"))?.click();
  await new Promise(r => setTimeout(r, 3000));
  // 错误以 toast 显示（throw Error → showMessage）
  const toast = document.querySelector("#message")?.textContent?.replace(/\s+/g, " ") ?? "";
  const dlgText = dlg.textContent.replace(/\s+/g, " ");
  return {
    toastMsg: toast.match(/(格式失败|不可解析|无法解析|重试一次)[^|]{0,80}/)?.[0] ?? toast.slice(0, 150),
    inDialog: dlgText.match(/(格式失败|无法解析)[^|]{0,60}/)?.[0] ?? null,
    noRawError: !toast.includes("Unexpected token") && !dlgText.includes("Unexpected token"),
  };
})()
