(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[0];
  const nameInput = [...dlg.querySelectorAll("input")].find(e => (e.placeholder ?? "").includes("New deck"));
  nameInput.value = "审计新建卡组88";
  nameInput.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise(r => setTimeout(r, 400));
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Import selected"))?.click();
  await new Promise(r => setTimeout(r, 4000));
  const decks = await (await fetch("/api/riff/getRiffDecks", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json();
  const nd = (decks.data ?? []).find(d2 => d2.name === "审计新建卡组88");
  return {
    wizardClosed: ![...vis()].some(d => d.textContent.includes("Preview & import")),
    newDeckCreated: !!nd,
    newDeckSize: nd?.size ?? 0,
  };
})()
