(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  // 验证标注已写入 error-tags.json
  return { errorTags: JSON.stringify(p.errorTags).slice(0, 200) };
})()
