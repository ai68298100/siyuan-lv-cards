(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  let dlg = vis()[vis().length - 1];
  const btn = [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "创建示例卡");
  btn?.click();
  await new Promise(r => setTimeout(r, 2500));
  dlg = vis()[vis().length - 1];
  return {
    step: dlg?.textContent.match(/步骤 \d \/ \d/)?.[0] ?? null,
    text: dlg?.textContent?.replace(/\s+/g, " ")?.slice(0, 300) ?? null,
    toast: document.querySelector("#message")?.textContent?.replace(/\s+/g, " ")?.slice(0, 120) ?? null,
  };
})()
