import type * as kernel from "siyuan/kernel";

// 内核插件骨架（3.8.x goja 运行时）。
// 当前仅注册 echo RPC 用于链路验证；后续考试倒计时广播、多端提醒共享状态在此实现。
const api: kernel.ISiyuan = siyuan;

api.plugin.lifecycle.onload = async () => {
    await api.logger.info(`[${api.plugin.name}] kernel plugin loading`);
    await api.rpc.bind("echo", async (...args) => {
        return {
            plugin: api.plugin.name,
            platform: api.plugin.platform,
            args,
        };
    }, "Echo the received arguments with plugin metadata.");
};

api.plugin.lifecycle.onunload = async () => {
    await api.rpc.unbind("echo");
};
