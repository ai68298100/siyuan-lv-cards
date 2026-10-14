<script lang="ts">
    let { recoveryJob = null }: { recoveryJob?: { id: string } | null } = $props();
</script>

<div data-testid="recovery-ai-stub">{recoveryJob?.id ?? "ordinary"}</div>
