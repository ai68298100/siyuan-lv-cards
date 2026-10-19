/**
 * AR-4 新手引导与示例卡幂等装配引擎（纯逻辑，node 可单测）。
 * 
 * 核心契约与安全原则：
 * 1. 引导状态机：未开始（unstarted） -> 进行中（in-progress） -> 已完成（completed） / 已跳过（skipped）；
 * 2. 示例卡生成幂等防重入：同一会话与笔记本内，快速连击或重复调用严格去重，仅执行一次物理创建；
 * 3. 结果可复用：如果之前已在目标笔记本创建过示例文档，直接复用已有 docId，绝不重复生成多份垃圾文档；
 * 4. 只读/无笔记本优雅降级：在无可用笔记本或只读环境下，自动启用免写演示模式（walkthrough），保证新手体验顺畅不中断。
 */

export type OnboardingStep = 1 | 2 | 3;
export type OnboardingPersona = "exam" | "notes" | "language";
export type OnboardingStatus = "unstarted" | "in-progress" | "completed" | "skipped";

/** 引导持久化元数据模型 */
export interface OnboardingState {
    version: 1;
    status: OnboardingStatus;
    selectedPersona?: OnboardingPersona;
    createdSampleDocId?: string;
    targetNotebookId?: string;
    isReadOnlyFallback: boolean;
    startedAt?: number;
    completedAt?: number;
}

export function createDefaultOnboardingState(): OnboardingState {
    return {
        version: 1,
        status: "unstarted",
        isReadOnlyFallback: false,
    };
}

/** 引导执行控制器参数 */
export interface OnboardingBootstrapControllerOptions {
    state?: OnboardingState;
    /** 执行真正的示例卡创建操作（由宿主提供 API 交互） */
    createDocAction: (notebookId: string, persona: OnboardingPersona) => Promise<string>;
    /** 保存引导状态至 settings（由宿主提供） */
    saveStateAction?: (state: OnboardingState) => Promise<void>;
    log?: (msg: string) => void;
}

/**
 * 新手引导幂等装配控制器
 */
export class OnboardingBootstrapController {
    private state: OnboardingState;
    private options: OnboardingBootstrapControllerOptions;
    private inFlightCreation: Promise<string> | null = null;

    constructor(options: OnboardingBootstrapControllerOptions) {
        this.state = options.state ? { ...options.state } : createDefaultOnboardingState();
        this.options = options;
    }

    public getState(): OnboardingState {
        return { ...this.state };
    }

    /** 开始或恢复引导流程 */
    public startWizard(now: number = Date.now()): OnboardingState {
        if (this.state.status === "completed") {
            // 已完成用户不重置状态，但允许查看
            return this.getState();
        }

        this.state = {
            ...this.state,
            status: "in-progress",
            startedAt: this.state.startedAt ?? now,
        };
        return this.getState();
    }

    /** 选定学习画像 */
    public selectPersona(persona: OnboardingPersona): OnboardingState {
        this.state = {
            ...this.state,
            selectedPersona: persona,
        };
        return this.getState();
    }

    /**
     * 幂等生成示例卡片文档：
     * 1. 若当前正在创建中，直接返回在途 Promise（防止连击双重写入）；
     * 2. 若目标笔记本此前已成功生成过示例文档，直接复用已有 docId；
     * 3. 若无可用笔记本（notebookId 为空），自动激活只读演示降级模式；
     * 4. 成功后记录 createdSampleDocId 并持久化。
     */
    public async ensureSampleCards(
        notebookId: string | null | undefined,
    ): Promise<{ docId: string; isReused: boolean; isReadOnlyFallback: boolean }> {
        const persona = this.state.selectedPersona ?? "notes";

        // 1. 无笔记本降级为免写演示模式
        if (!notebookId || notebookId.trim() === "") {
            this.state = {
                ...this.state,
                isReadOnlyFallback: true,
                createdSampleDocId: "doc-demo-walkthrough",
            };
            await this.options.saveStateAction?.(this.state);
            return {
                docId: "doc-demo-walkthrough",
                isReused: false,
                isReadOnlyFallback: true,
            };
        }

        // 2. 已有相同笔记本的示例卡，直接幂等复用已有文档
        if (this.state.createdSampleDocId && this.state.targetNotebookId === notebookId) {
            this.options.log?.(`Reusing existing sample cards doc: ${this.state.createdSampleDocId}`);
            return {
                docId: this.state.createdSampleDocId,
                isReused: true,
                isReadOnlyFallback: false,
            };
        }

        // 3. 在途调用合并（防重复点击）
        if (this.inFlightCreation !== null) {
            this.options.log?.("Sample cards creation in-flight, joining existing task...");
            const inFlightDocId = await this.inFlightCreation;
            return {
                docId: inFlightDocId,
                isReused: true,
                isReadOnlyFallback: false,
            };
        }

        // 4. 发起物理创建
        this.inFlightCreation = this.options.createDocAction(notebookId, persona);

        try {
            const newDocId = await this.inFlightCreation;
            this.state = {
                ...this.state,
                targetNotebookId: notebookId,
                createdSampleDocId: newDocId,
                isReadOnlyFallback: false,
            };
            await this.options.saveStateAction?.(this.state);
            return {
                docId: newDocId,
                isReused: false,
                isReadOnlyFallback: false,
            };
        } finally {
            this.inFlightCreation = null;
        }
    }

    /** 完成整个引导向导 */
    public async completeWizard(now: number = Date.now()): Promise<OnboardingState> {
        this.state = {
            ...this.state,
            status: "completed",
            completedAt: now,
        };
        await this.options.saveStateAction?.(this.state);
        return this.getState();
    }

    /** 用户主动跳过向导 */
    public async skipWizard(now: number = Date.now()): Promise<OnboardingState> {
        this.state = {
            ...this.state,
            status: "skipped",
            completedAt: now,
        };
        await this.options.saveStateAction?.(this.state);
        return this.getState();
    }
}
