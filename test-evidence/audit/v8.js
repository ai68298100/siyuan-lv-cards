(async () => {
  // 打开语料文档验证公式渲染
  const p = window.siyuan.ws.app.plugins[0];
  // 通过编辑器按钮（打开文档）路径太绕，直接查：当前 DOM 有无 katex（复习后卡片页面）
  const anyMath = document.querySelectorAll(".katex, .katex-display, [data-type='inline-math'], img.oembed")[0];
  return { anyMathInDom: anyMath ? anyMath.tagName + "." + String(anyMath.className).slice(0, 20) : null };
})()
