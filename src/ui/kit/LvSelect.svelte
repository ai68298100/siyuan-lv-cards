<script lang="ts">
    /** 下拉选择（Kit）：b3-select 标准封装（336） */
    let { value = $bindable(""), options, onchange, disabled = false, width = "", ariaLabel = "" }: {
        value?: string;
        options: { value: string; label: string }[];
        onchange?: (v: string) => void;
        disabled?: boolean;
        /** 任意 CSS 宽度（如 "200px"），空=自适应 */
        width?: string;
        /** AS-10：读屏标签 */
        ariaLabel?: string;
    } = $props();
</script>

<select
    class="b3-select"
    style={width ? `width:${width}` : ""}
    {disabled}
    {value}
    aria-label={ariaLabel || undefined}
    onchange={(e) => {
        value = (e.target as HTMLSelectElement).value;
        onchange?.(value);
    }}
>
    {#each options as o (o.value)}
        <option value={o.value}>{o.label}</option>
    {/each}
</select>
