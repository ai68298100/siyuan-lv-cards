import type * as kernel from "siyuan/kernel";
import {
    EXAM_PLANS_CHANGED_EVENT,
    EXAM_PLANS_PUBLISH_RPC,
    isExamPlansChangedNotice,
} from "./core/exam-plan-sync";

// 内核插件骨架（3.8.x goja 运行时）。考试计划通知只转发客户端已持久化的变更失效信号，
// 广播是同一 Kernel 下连接前端间的临时消息；计划本体仍以客户端插件持久化数据为准。
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

    await api.rpc.bind(EXAM_PLANS_PUBLISH_RPC, async (notice: unknown) => {
        if (!isExamPlansChangedNotice(notice)) {
            throw new Error("Invalid exam plans change notice");
        }
        await api.rpc.broadcast(EXAM_PLANS_CHANGED_EVENT, notice);
        return { accepted: true };
    }, "Broadcasts an already-persisted exam plans change notice to connected frontends.");
};

api.plugin.lifecycle.onunload = async () => {
    await api.rpc.unbind("echo");
    await api.rpc.unbind(EXAM_PLANS_PUBLISH_RPC);
};
