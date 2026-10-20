import { describe, it, expect, vi } from "vitest";
import {
    maskBlockId,
    maskSourcePath,
    maskTargetName,
    maskDateString,
    maskUserName,
    createPresentationPrivacyController,
    PRESENTATION_PRESETS,
} from "../src/core/presentation-privacy";

describe("BX-6 临时演示与投屏的私密展示模式引擎 (presentation-privacy)", () => {
    describe("脱敏过滤纯函数", () => {
        it("maskBlockId: 仅显示前 8 位并加上 [ID] 标识", () => {
            expect(maskBlockId("20230512143000-abcdefg")).toBe("20230512... [ID]");
            expect(maskBlockId("short")).toBe("••••••••");
            expect(maskBlockId("")).toBe("");
        });

        it("maskSourcePath: 隐藏上级目录层级，仅保留最底层文件名", () => {
            expect(maskSourcePath("学习资料/考研数学/高等数学/极限与连续.sy")).toBe("••• / 极限与连续.sy");
            expect(maskSourcePath("根目录文档.sy")).toBe("••• [私密来源]");
            expect(maskSourcePath("")).toBe("");
        });

        it("maskTargetName: 保留首末字符，中间遮蔽", () => {
            expect(maskTargetName("考研核心英语词汇")).toBe("考•••汇");
            expect(maskTargetName("AB")).toBe("••");
            expect(maskTargetName("")).toBe("");
        });

        it("maskDateString: 遮蔽年月日与时分秒", () => {
            expect(maskDateString("创建于 2026-10-20 18:30:45")).toBe("创建于 ••••-••-•• ••:••");
            expect(maskDateString("2026-05-01")).toBe("••••-••-••");
        });

        it("maskUserName: 遮蔽用户名与邮箱前缀", () => {
            expect(maskUserName("alice@example.com")).toBe("al***@example.com");
            expect(maskUserName("张三丰")).toBe("张•••丰");
            expect(maskUserName("小明")).toBe("用户••");
        });
    });

    describe("状态控制器与运行时过滤 (createPresentationPrivacyController)", () => {
        it("未启用私密模式时，所有字段原样透传", () => {
            const ctrl = createPresentationPrivacyController();
            expect(ctrl.getState().enabled).toBe(false);

            expect(ctrl.filterSourcePath("深度路径/我的笔记.sy")).toBe("深度路径/我的笔记.sy");
            expect(ctrl.filterTargetName("机密考题卡包")).toBe("机密考题卡包");
            expect(ctrl.filterDate("2026-10-20 12:00:00")).toBe("2026-10-20 12:00:00");
            expect(ctrl.filterBlockId("20260101120000-xyz1234")).toBe("20260101120000-xyz1234");
            expect(ctrl.filterUserName("testuser@siyuan.io")).toBe("testuser@siyuan.io");
            expect(ctrl.shouldMaskThumbnail()).toBe(false);
            expect(ctrl.shouldSuppressNotification()).toBe(false);
        });

        it("开启投屏模式 (screen-sharing) 全量脱敏", () => {
            const onChange = vi.fn();
            const ctrl = createPresentationPrivacyController(undefined, onChange);

            ctrl.enter("screen-sharing");
            expect(ctrl.getState().enabled).toBe(true);
            expect(onChange).toHaveBeenCalledTimes(1);

            expect(ctrl.filterSourcePath("考研/专业课/数据结构.sy")).toBe("••• / 数据结构.sy");
            expect(ctrl.filterTargetName("高频错题本")).toBe("高•••本");
            expect(ctrl.filterDate("2026-10-20 15:30:00")).toBe("••••-••-•• ••:••");
            expect(ctrl.shouldMaskThumbnail()).toBe(true);
            expect(ctrl.shouldSuppressNotification()).toBe(true);
        });

        it("切换到录屏模式 (recording) 允许显示卡包名与多媒体", () => {
            const ctrl = createPresentationPrivacyController();
            ctrl.enter("recording");

            expect(ctrl.shouldMaskThumbnail()).toBe(false); // 录屏允许缩略图
            expect(ctrl.filterTargetName("高频错题本")).toBe("高频错题本"); // 录屏保留卡包名
            expect(ctrl.filterSourcePath("私密/专业课.sy")).toBe("••• / 专业课.sy"); // 路径依旧脱敏
            expect(ctrl.shouldSuppressNotification()).toBe(true);
        });

        it("退出私密模式后即刻恢复原始展示", () => {
            const ctrl = createPresentationPrivacyController();
            ctrl.enter("screen-sharing");
            expect(ctrl.shouldMaskThumbnail()).toBe(true);

            ctrl.exit();
            expect(ctrl.getState().enabled).toBe(false);
            expect(ctrl.filterTargetName("我的私密词库")).toBe("我的私密词库");
            expect(ctrl.shouldMaskThumbnail()).toBe(false);
        });

        it("支持微调自定义配置选项", () => {
            const ctrl = createPresentationPrivacyController();
            ctrl.enter("screen-sharing");
            expect(ctrl.shouldMaskThumbnail()).toBe(true);

            ctrl.updateOptions({ maskThumbnails: false });
            expect(ctrl.shouldMaskThumbnail()).toBe(false);
            expect(ctrl.filterTargetName("自定义")).toBe("自•••义");
        });
    });
});
