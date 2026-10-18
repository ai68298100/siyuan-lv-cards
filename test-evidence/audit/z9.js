(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  let dlg = vis()[0];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Generate") || b.textContent.includes("AI 生成"))?.click();
  await new Promise(r => setTimeout(r, 1500));
  dlg = vis()[0];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Confirm") || b.textContent.includes("确认发送"))?.click();
  await new Promise(r => setTimeout(r, 3000));
  const toast = document.querySelector("#message")?.textContent?.replace(/\s+/g, " ") ?? "";
  const allDlg = [...vis()].map(d => d.textContent.replace(/\s+/g, " ")).join(" | ");
  return {
    toastMsg: toast.match(/(格式失败|不可解析|无法解析|重试一次|refusal)[^|]{0,80}/i)?.[0] ?? toast.slice(0, 150),
    noRawError: !toast.includes("Unexpected token") && !allDlg.includes("Unexpected token"),
    dialogHint: allDlg.match(/(格式失败|不可解析|无法解析)[^|]{0,60}/)?.[0] ?? null,
  };
})()
