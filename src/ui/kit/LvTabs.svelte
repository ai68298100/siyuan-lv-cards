<script lang="ts">
    let { tabs, active, onchange }: {
        tabs: { id: string; label: string }[];
        active: string;
        onchange: (id: string) => void;
    } = $props();
</script>

<div class="lv-tabs" role="tablist">
    {#each tabs as tb (tb.id)}
        <button
            class="lv-tab"
            class:lv-tab-active={active === tb.id}
            role="tab"
            aria-selected={active === tb.id}
            onclick={() => onchange(tb.id)}
        >{tb.label}</button>
    {/each}
</div>
