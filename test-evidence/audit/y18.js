(() => {
  const drawer = [...document.querySelectorAll("*")].filter(e => /Knowledge object|知识对象|Instances/.test(e.textContent) && e.getBoundingClientRect().width > 280).pop();
  const t = drawer?.textContent?.replace(/\s+/g, " ") ?? "";
  return {
    koPanelShown: /Instances|实例/.test(t),
    emptyInstancesText: t.match(/No derived cards yet|暂无派生|emptyInstances/)?.[0] ?? t.slice(0, 200),
    registered: /Registered|已注册/.test(t),
  };
})()
