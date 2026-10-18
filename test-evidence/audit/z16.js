(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[0];
  const out = {};
  // 新建卡组名
  const nameInput = [...dlg.querySelectorAll("input[type=text]")].find(i => (i.placeholder ?? "").includes("New deck") || (i.placeholder ?? "").includes("卡组名"));
  if (nameInput) {
    nameInput.value = "审计新建卡组88";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    out.nameFilled = nameInput.value;
  }
  // Accept all → Import selected
  [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "Accept all")?.click();
  await new Promise(r => setTimeout(r, 600));
  out.accepted = dlg.textContent.match(/Accepted \d+/)?.[0];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Import selected"))?.click();
  await new Promise(r => setTimeout(r, 4000));
  // 验证内核新卡组
  const decks = await (await fetch("/api/riff/getRiffDecks", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json();
  const nd = (decks.data ?? []).find(d2 => d2.name === "审计新建卡组88");
  out.newDeck = nd ? { name: nd.name, size: nd.size } : null;
  out.wizardClosed = ![...vis()].some(d => d.textContent.includes("Preview & import"));
  return out;
})()
