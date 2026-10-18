(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[0];
  // ⊘ 按钮点击后来源行状态变化？重新读来源清单
  const srcRow = [...dlg.querySelectorAll("*")].filter(e => e.children.length === 0 && /示例卡片 · \d+/.test(e.textContent.trim()));
  const deniedChip = [...dlg.querySelectorAll("*")].filter(e => e.textContent.trim() === "⊘");
  // deny 列表状态
  const denyList = p.aiDenyList;
  // 生成 → 应阻断（srcDenied）
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Generate") || b.textContent.includes("AI 生成"))?.click();
  await new Promise(r => setTimeout(r, 1500));
  const dlg2 = vis()[0];
  [...dlg2.querySelectorAll("button")].find(b => /Confirm|确认发送/.test(b.textContent))?.click();
  await new Promise(r => setTimeout(r, 2500));
  const dlg3 = vis()[0];
  const t = dlg3?.textContent?.replace(/\s+/g, " ") ?? "";
  return {
    denyListState: JSON.stringify(denyList).slice(0, 200),
    blocked: /禁止|denied|Denied|⊘/.test(t),
    blockText: t.match(/(来源[^。]{0,60}|denied[^|]{0,60})/i)?.[0] ?? null,
    snippet: t.slice(0, 180),
  };
})()
