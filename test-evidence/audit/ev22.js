(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  try {
    await p.saveData("probe-test.json", { hello: "world", at: Date.now() });
    const read = await p.loadData("probe-test.json");
    return { saveOk: true, readBack: read };
  } catch (e) {
    return { saveOk: false, err: String(e).slice(0, 200) };
  }
})()
