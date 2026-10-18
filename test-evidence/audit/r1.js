(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.createSampleWorkspace();
  await new Promise(r => setTimeout(r, 3000));
  return { sampleOk: true };
})()
