<script lang="ts">
    import LvInput from "../../src/ui/kit/LvInput.svelte";
    import LvSelect from "../../src/ui/kit/LvSelect.svelte";
    import LvSwitch from "../../src/ui/kit/LvSwitch.svelte";

    let checked = $state(false);
    let text = $state("");
    let selected = $state("one");

    const options = [
        { value: "one", label: "一" },
        { value: "two", label: "二" },
    ];
</script>

<LvSwitch bind:checked ariaLabel="开关" />
<LvInput bind:value={text} ariaLabel="文本" />
<LvSelect bind:value={selected} {options} ariaLabel="选项" />

<output data-testid="switch-value">{String(checked)}</output>
<output data-testid="input-value">{text}</output>
<output data-testid="select-value">{selected}</output>
