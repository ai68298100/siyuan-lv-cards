<script lang="ts">
    /** 开关（Kit）：b3-switch 标准封装，消除裸类散布（336） */
    let { checked = $bindable(false), onchange, disabled = false, title = "", ariaLabel = "" }: {
        checked?: boolean;
        onchange?: (v: boolean) => void;
        disabled?: boolean;
        title?: string;
        /** AS-10：读屏标签（无可见标签的行内开关必配） */
        ariaLabel?: string;
    } = $props();
</script>

<input
    class="b3-switch"
    type="checkbox"
    {checked}
    {disabled}
    {title}
    aria-label={ariaLabel || undefined}
    onchange={(e) => onchange?.((e.target as HTMLInputElement).checked)}
/>
