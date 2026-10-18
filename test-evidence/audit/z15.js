(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  // 激活示例卡片 tab + 向导 + 载入 + 生成 + 确认
  const tab = [...document.querySelectorAll(".layout-tab-container__item, [data-type=tab-header]")].filter(t => t.getBoundingClientRect().width > 0).find(t => t.textContent.includes("示例卡片"));
  tab?.click();
  await new Promise(r => setTimeout(r, 1000));
  await p.openAIWizard();
  await new Promise(r => setTimeout(r, 2000));
  let dlg = vis()[0];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Load current doc") || b.textContent.includes("载入当前文档"))?.click();
  await new Promise(r => setTimeout(r, 1500));
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Generate") || b.textContent.includes("AI 生成"))?.click();
  await new Promise(r => setTimeout(r, 1500));
  dlg = vis()[0];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Confirm") || b.textContent.includes("确认发送"))?.click();
  await new Promise(r => setTimeout(r, 4000));
  dlg = vis()[0];
  // 新建卡组：填 New deck name → Import selected
  const nameInput = [...dlg.querySelectorAll("input[type=text]")].find(i => /New deck|新卡组/i.test(i.placeholder ?? ""));
  const deckName = "审计新建卡组" + Date.now() % 1000;
  if (nameInput) {
    nameInput.value = deckName;
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
  }
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Import selected"))?.click();
  await new Promise(r => setTimeout(r, 3500));
  const t = vis()[0]?.textContent.replace(/\s+/g, " ") ?? "";
  // 验证新卡组在内核
  const decks = await (await fetch("/api/riff/getRiffDecks", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json();
  const newDeck = (decks.data ?? []).find(d2 => d2.name === deckName);
  return {
    wizardClosed: !vis().some(d => d.textContent.includes("AI Cards") && d.textContent.includes("Preview")),
    newDeckCreated: !!newDeck,
    newDeckSize: newDeck?.size ?? 0,
  };
})()
