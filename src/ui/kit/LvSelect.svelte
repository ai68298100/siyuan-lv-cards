<script lang="ts">
    /** 下拉选择（Kit）：b3-select 标准封装（336） */
    let { value = $bindable(""), options, onchange, disabled = false, width = "" }: {
        value?: string;
        options: { value: string; label: string }[];
        onchange?: (v: string) => void;
        disabled?: boolean;
        /** 任意 CSS 宽度（如 "200px"），空=自适应 */
        width?: string;
    } = $props();
</script>

<select
    class="b3-select"
    style={width ? `width:${width}` : ""}
    {disabled}
    value={value}
    onchange={(e) => onchange?.((e.target as HTMLSelectElement).value)}
>
    {#each options as o (o.value)}
        <option value={o.value}>{o.label}</option>
    {/each}
</select>
