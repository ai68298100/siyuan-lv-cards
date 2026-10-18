(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  let dlg = vis()[0];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "完成")?.click();
  await new Promise(r => setTimeout(r, 800));
  const p = window.siyuan.ws.app.plugins[0];
  const hubEl = () => document.querySelector("[class*=lv-hub]");
  await p.openTabOf("lv-cards-dashboard");
  await new Promise(r => setTimeout(r, 2500));
  const out = {};
  // 学习报告按钮
  const reportBtn = [...hubEl().querySelectorAll("button, a, span")].find(e => e.textContent.trim() === "学习报告");
  out.reportBtnFound = !!reportBtn;
  reportBtn?.click();
  await new Promise(r => setTimeout(r, 2500));
  out.reportToast = document.querySelector("#message")?.textContent?.replace(/\s+/g, " ")?.slice(0, 150) ?? null;
  // 写入思源文档
  const writeBtn = [...hubEl().querySelectorAll("button, a, span")].find(e => e.textContent.trim() === "写入思源文档");
  out.writeBtnFound = !!writeBtn;
  writeBtn?.click();
  await new Promise(r => setTimeout(r, 2500));
  out.writeToast = document.querySelector("#message")?.textContent?.replace(/\s+/g, " ")?.slice(0, 150) ?? null;
  return out;
})()
