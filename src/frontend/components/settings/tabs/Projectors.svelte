<script lang="ts">
    import { onMount } from "svelte"
    import { Main } from "../../../types/IPC/Main"
    import { requestMain } from "../../IPC/main"

    type Projector = { id: string; name: string; host: string; port?: number; groups: string[] }
    type Result = { id: string; ok: boolean; value?: string; error?: string }
    let projectors: Projector[] = []
    let results: Result[] = []
    let busy = false
    let error = ""
    let name = ""
    let host = ""
    let group = "Sanctuary"
    let selectedGroup = ""
    let selected = new Set<string>()

    async function refresh() {
        const response = await requestMain(Main.PROJECTOR_LIST)
        if (response) projectors = response
    }
    onMount(() => { void refresh() })

    async function add() {
        if (!name.trim() || !host.trim()) return
        busy = true
        error = ""
        try {
            const result = await requestMain(Main.PROJECTOR_SAVE, { id: crypto.randomUUID(), name: name.trim(), host: host.trim(), groups: group.trim() ? [group.trim()] : [] })
            if (!result?.ok) error = result?.error || "Unable to save projector"
            else { name = ""; host = ""; await refresh() }
        } finally { busy = false }
    }

    async function run(action: "powerOn" | "powerOff" | "powerState" | "muteVideo" | "unmuteVideo") {
        busy = true
        error = ""
        try {
            const ids = selectedGroup ? projectors.filter((p) => p.groups.includes(selectedGroup)).map((p) => p.id) : [...selected]
            if (!ids.length) { error = "Select a projector or group"; return }
            const response = await requestMain(Main.PROJECTOR_COMMAND, { ids, action })
            if (!response) error = "Projector command timed out"
            else results = response
        } finally { busy = false }
    }

    function toggle(id: string, checked: boolean) {
        const next = new Set(selected)
        if (checked) next.add(id)
        else next.delete(id)
        selected = next
    }
    $: groups = [...new Set(projectors.flatMap((p) => p.groups))].sort()
</script>

<section class="projectors">
    <h3>Projector Control</h3>
    <p>Manage PJLink-compatible projectors individually or in groups.</p>
    <form on:submit|preventDefault={add} class="add">
        <label>Name <input bind:value={name} placeholder="Main Left" required /></label>
        <label>IP / Host <input bind:value={host} placeholder="192.0.2.101" required /></label>
        <label>Group <input bind:value={group} placeholder="Sanctuary" /></label>
        <button type="submit" disabled={busy}>Add projector</button>
    </form>
    <div class="toolbar">
        <label>Target group
            <select bind:value={selectedGroup}>
                <option value="">Selected projectors</option>
                {#each groups as item}<option value={item}>{item}</option>{/each}
            </select>
        </label>
        <button disabled={busy} on:click={() => run("powerOn")}>Power On</button>
        <button disabled={busy} on:click={() => run("powerOff")}>Power Off</button>
        <button disabled={busy} on:click={() => run("powerState")}>Refresh Status</button>
        <button disabled={busy} on:click={() => run("muteVideo")}>Blank</button>
        <button disabled={busy} on:click={() => run("unmuteVideo")}>Unblank</button>
    </div>
    {#if error}<p role="alert">{error}</p>{/if}
    {#if !projectors.length}<p>No projectors configured.</p>{/if}
    {#each projectors as projector (projector.id)}
        <div class="device">
            <label><input type="checkbox" checked={selected.has(projector.id)} on:change={(event) => toggle(projector.id, event.currentTarget.checked)} /> {projector.name}</label>
            <span>{projector.host} · {projector.groups.join(", ") || "Ungrouped"}</span>
            <button disabled={busy} on:click={async () => { busy = true; try { await requestMain(Main.PROJECTOR_REMOVE, { id: projector.id }); await refresh() } finally { busy = false } }}>Remove</button>
        </div>
    {/each}
    {#each results as result (result.id)}
        <p class:failed={!result.ok}>{result.id}: {result.ok ? result.value : result.error}</p>
    {/each}
</section>

<style>
    .projectors { display: flex; flex-direction: column; gap: 12px; color: var(--text); }
    .add, .toolbar, .device { display: flex; align-items: end; gap: 10px; flex-wrap: wrap; }
    label { display: flex; flex-direction: column; gap: 4px; }
    .device { align-items: center; justify-content: space-between; border-bottom: 1px solid var(--primary-lighter); padding: 10px 0; }
    .device label { flex-direction: row; align-items: center; }
    input, select, button { padding: 7px; }
    .failed, [role="alert"] { color: #d66; }
</style>
