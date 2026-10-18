(() => {
  const rev = document.querySelector("[class*=lv-review]");
  const t = rev?.textContent?.replace(/\s+/g, " ") ?? "";
  return {
    progress: rev?.querySelector(".lv-progress")?.textContent,
    hasTyping: /输入答案|作答区|打字/.test(t),
    hasChoice: /选中以下|正确答案|干扰/.test(t) || !!rev.querySelector("input[type=text]"),
    hasInput: !!rev.querySelector("input[type=text]"),
    text: t.slice(0, 200),
  };
})()
