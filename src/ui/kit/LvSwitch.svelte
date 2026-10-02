<script lang="ts">
    /** 开关（Kit）：b3-switch 标准封装，消除裸类散布（336） */
    let { checked = $bindable(false), onchange, disabled = false, title = "" }: {
        checked?: boolean;
        onchange?: (v: boolean) => void;
        disabled?: boolean;
        title?: string;
    } = $props();
</script>

<input
    class="b3-switch"
    type="checkbox"
    {checked}
    {disabled}
    {title}
    onchange={(e) => onchange?.((e.target as HTMLInputElement).checked)}
/>
