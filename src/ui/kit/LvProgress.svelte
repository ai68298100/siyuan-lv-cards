<script lang="ts">
    let { value }: { /** 0-100 */ value: number } = $props();
</script>

<div class="lv-mini-track">
    <div class="lv-mini-fill" style={`width:${Math.min(100, Math.max(0, value))}%`}></div>
</div>
