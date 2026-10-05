// AT-17（v0.174.0）：对话框 chunk 入口——9 个对话框组件 + 自带 svelte 挂载器。
// 组件与挂载共用本 chunk 的 svelte 实例（无双份内部状态）；siyuan 走 window.__lvSiyuan。
// 注意：挂载器安装由 shell 侧完成（loadX 读注册表后调 setDialogMounter）——
// 本 chunk 若 import shell 的 libs/dialog 会形成模块双副本，setter 只改本副本状态（无效）。
import { mount, unmount } from "svelte";
import AIWizard from "@/ui/ai-wizard.svelte";
import OcclusionEditor from "@/ui/occlusion-editor.svelte";
import Onboarding from "@/ui/onboarding.svelte";
import ChallengeMode from "@/ui/challenge-mode.svelte";
import MarkerCards from "@/ui/marker-cards.svelte";
import PairingGame from "@/ui/pairing-game.svelte";
import SettingsPanel from "@/ui/settings.svelte";
import DeckPicker from "@/ui/deck-picker.svelte";
import QuickCard from "@/ui/quick-card.svelte";

type Props = Record<string, any>;

function mountDialogComponent(comp: any, target: HTMLElement, props: Props) {
    const app = mount(comp, { target, props });
    return { destroy: () => { void unmount(app); } };
}

// 按键合并注册（v0.185.1 修复，同 hub.ts；components 子表=shell loadDialogsComp 消费形态）
const w = window as unknown as { __lvChunks?: Record<string, unknown> };
(w.__lvChunks ??= {}).dialogs = {
    components: {
        AIWizard,
        OcclusionEditor,
        Onboarding,
        ChallengeMode,
        MarkerCards,
        PairingGame,
        SettingsPanel,
        DeckPicker,
        QuickCard,
    },
    mountDialogComponent,
};
