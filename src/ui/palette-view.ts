import LvPalette from "./kit/LvPalette.svelte";
import { computePaletteCommands, type PaletteCommandConfig } from "../core/palette-navigation";
import type { PaletteCommand } from "../core/palette";

/** Build the command-only view in the dialogs chunk; the shell owns its lifecycle and actions. */
export function createPaletteView(
    config: PaletteCommandConfig,
    onrun: (command: PaletteCommand) => void,
    onClose: () => void,
) {
    const { i18n } = config;
    return {
        title: i18n.cmdPalette,
        component: LvPalette,
        width: "min(560px, 94vw)",
        panel: true,
        props: {
            commands: computePaletteCommands(config),
            placeholder: i18n.palettePlaceholder,
            groupNames: { actions: i18n.paletteGroupActions, nav: i18n.paletteGroupNav },
            labels: { empty: i18n.paletteEmpty, foot: i18n.paletteFoot },
            onClose,
            onrun,
        },
    };
}
