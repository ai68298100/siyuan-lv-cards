(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  if (!p.settings?.onboarded) {
    const s = { ...p.settings, onboarded: true };
    p.settings = s;
    await p.persist.save("settings.json", s);
  }
  const decks = await (await fetch("/api/riff/getRiffDecks", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json();
  const deck = decks.data.find(d => d.name === "一致性对照卡组");
  await p.openTabOf("lv-cards-review", { scope: "deck:" + deck.id });
  await new Promise(r => setTimeout(r, 3500));
  const rev = document.querySelector("[class*=lv-review]");
  // 设置 lastReviewScope 持久化以防队列空
  return {
    progress: rev?.querySelector(".lv-progress")?.textContent ?? null,
    text: rev?.textContent?.replace(/\s+/g, " ")?.slice(0, 150) ?? null,
    deckId: deck?.id,
  };
})()
