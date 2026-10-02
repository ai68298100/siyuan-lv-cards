<script lang="ts">
    /** 文本输入（Kit）：b3-text-field 标准封装（336） */
    let { value = $bindable(""), placeholder = "", type = "text", oninput, disabled = false, width = "", min, max, step }: {
        value?: string;
        placeholder?: string;
        /** text/password/number/date/time */
        type?: string;
        oninput?: (v: string) => void;
        disabled?: boolean;
        width?: string;
        min?: number;
        max?: number;
        step?: number;
    } = $props();
</script>

<input
    class="b3-text-field"
    style={width ? `width:${width}` : ""}
    {type}
    {placeholder}
    {disabled}
    {min}
    {max}
    {step}
    {value}
    oninput={(e) => oninput?.((e.target as HTMLInputElement).value)}
/>
