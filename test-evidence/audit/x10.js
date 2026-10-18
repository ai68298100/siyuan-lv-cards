(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[vis().length - 1];
  // 全部接受 → 落库所选
  [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "全部接受")?.click();
  await new Promise(r => setTimeout(r, 600));
  const picked = dlg.textContent.match(/已接受 \d+/)?.[0];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("落库所选"))?.click();
  await new Promise(r => setTimeout(r, 3500));
  const t = dlg.textContent.replace(/\s+/g, " ");
  return {
    picked,
    imported: /落库成功|已创建|3 张|已落库/.test(t),
    toast: document.querySelector("#message")?.textContent?.replace(/\s+/g, " ")?.slice(0, 120) ?? null,
    wizardClosed: !vis().some(d => d.textContent.includes("AI 制卡")),
  };
})()
