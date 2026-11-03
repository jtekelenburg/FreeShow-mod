<script lang="ts">
    import { onMount } from "svelte"
    import { Main } from "../../../../types/IPC/Main"
    import { requestMain } from "../../../IPC/main"

    type Projector = { id: string; name: string; host: string; port?: number; groups?: string[] }
    type Action = "powerOn" | "powerOff" | "powerState" | "muteVideo" | "unmuteVideo" | "muteAudio" | "unmuteAudio"
    type Result = { id: string; name: string; ok: boolean; value?: string; error?: string }

    let projectors: Projector[] = []
    let results: Result[] = []
    let selected = new Set<string>()
    let expanded = ""
    let search = ""
    let groupFilter = ""
    let view: "control" | "groups" | "settings" = "control"
    let busy = false
    let error = ""
    let name = ""
    let host = ""
    let group = "Sanctuary"
    let password = ""
    let discoveryPrefix = "192.168.1."
    let discovered: { host: string; name: string }[] = []
    let autoRefresh = false
    let pollTimer: ReturnType<typeof setInterval> | undefined
    let inputCodes: Record<string, string> = {}
    let pendingOff: string[] = []

    $: groups = [...new Set(projectors.flatMap((p) => p.groups ?? []))].sort()
    $: filtered = projectors.filter((p) => (!groupFilter || p.groups?.includes(groupFilter)) && (p.name + " " + p.host).toLowerCase().includes(search.toLowerCase()))
    $: onCount = results.filter((r) => r.ok && r.value === "on").length

    async function refresh() {
        const response = await requestMain(Main.PROJECTOR_LIST)
        if (response) projectors = response
        else error = "Unable to load projector configuration"
    }

    onMount(() => {
        void refresh()
        return () => { if (pollTimer) clearInterval(pollTimer) }
    })

    function togglePolling() {
        autoRefresh = !autoRefresh
        if (pollTimer) clearInterval(pollTimer)
        if (autoRefresh) pollTimer = setInterval(() => {
            if (!busy && projectors.length) void run(projectors.map((p) => p.id), "powerState")
        }, 30000)
    }

    async function discover() {
        busy = true
        error = ""
        try { discovered = (await requestMain(Main.PROJECTOR_DISCOVER, { prefix: discoveryPrefix, start: 1, count: 32 })) ?? [] }
        catch (err) { error = String(err) }
        finally { busy = false }
    }

    async function add() {
        if (!name.trim() || !host.trim()) return
        busy = true
        error = ""
        try {
            const result = await requestMain(Main.PROJECTOR_SAVE, { id: crypto.randomUUID(), name: name.trim(), host: host.trim(), groups: group.trim() ? [group.trim()] : [], ...(password ? { password } : {}) })
            if (!result?.ok) error = result?.error || "Unable to save projector"
            else { name = ""; host = ""; password = ""; await refresh(); view = "control" }
        } catch (err) { error = String(err) }
        finally { busy = false }
    }

    async function remove(id: string) {
        if (!confirm("Remove this projector from FreeShow?")) return
        busy = true
        try {
            const response = await requestMain(Main.PROJECTOR_REMOVE, { id })
            if (!response?.ok) error = "Unable to remove projector"
            else { selected.delete(id); selected = new Set(selected); await refresh() }
        } catch (err) { error = String(err) }
        finally { busy = false }
    }

    async function run(ids: string[], action: Action, confirmed = false) {
        if (!ids.length) { error = "Select at least one projector"; return }
        if (action === "powerOff" && ids.length > 1 && !confirmed) { pendingOff = [...ids]; return }
        busy = true
        error = ""
        try {
            const response = await requestMain(Main.PROJECTOR_COMMAND, { ids, action })
            if (!response) error = "Projector command timed out"
            else results = [...response, ...results.filter((r) => !ids.includes(r.id))]
        } catch (err) { error = String(err) }
        finally { busy = false }
    }

    async function switchInput(id: string) {
        const code = (inputCodes[id] ?? "").trim()
        if (!/^[1-5][1-9]$/.test(code)) { error = "Enter a valid two-digit PJLink input code"; return }
        busy = true
        error = ""
        try {
            const response = await requestMain(Main.PROJECTOR_INPUT, { ids: [id], code })
            if (!response) error = "Input switch timed out"
            else results = [...response, ...results.filter((r) => r.id !== id)]
        } catch (err) { error = String(err) }
        finally { busy = false }
    }

    function toggle(id: string, checked: boolean) {
        const next = new Set(selected)
        if (checked) next.add(id)
        else next.delete(id)
        selected = next
    }

    function status(id: string) {
        const result = results.find((r) => r.id === id)
        if (!result) return "Unknown"
        if (!result.ok) return "Error"
        return result.value === "on" ? "On" : result.value === "off" ? "Off" : result.value === "warming" ? "Warming" : result.value === "cooling" ? "Cooling" : "Command sent"
    }
</script>

<section class="projectors">
    <header>
        <div><h3>Projector Manager</h3><p>Manage PJLink projectors and display groups</p></div>
        <button disabled={busy} on:click={refresh}>Refresh list</button>
    </header>
    <div class="summary">
        <div><strong>{projectors.length}</strong><span>Configured</span></div>
        <div><strong>{groups.length}</strong><span>Groups</span></div>
        <div><strong>{onCount}</strong><span>Last reported on</span></div>
    </div>
    <nav aria-label="Projector manager sections">
        <button class:active={view === "control"} on:click={() => view = "control"}>Control</button>
        <button class:active={view === "groups"} on:click={() => view = "groups"}>Groups</button>
        <button class:active={view === "settings"} on:click={() => view = "settings"}>Settings / Add</button>
    </nav>

    {#if error}<p role="alert" class="failed">{error}</p>{/if}
    {#if pendingOff.length}
        <div class="confirm" role="alertdialog" aria-label="Confirm group power off">
            <strong>Power off {pendingOff.length} projectors?</strong>
            <p>This sends a real power-off command to every selected device.</p>
            <button disabled={busy} on:click={async () => { const ids = pendingOff; pendingOff = []; await run(ids, "powerOff", true) }}>Confirm power off</button>
            <button on:click={() => pendingOff = []}>Cancel</button>
        </div>
    {/if}

    {#if view === "control"}
        <label class="poll"><input type="checkbox" checked={autoRefresh} on:change={togglePolling} /> Poll projector status every 30 seconds</label>
        <div class="filters">
            <input aria-label="Search projectors" placeholder="Search name or IP address" bind:value={search} />
            <select aria-label="Filter group" bind:value={groupFilter}>
                <option value="">All groups</option>
                {#each groups as g}<option value={g}>{g}</option>{/each}
            </select>
            <button on:click={() => selected = new Set(filtered.map((p) => p.id))}>Select visible</button>
            <button on:click={() => selected = new Set()}>Clear</button>
        </div>
        {#if !filtered.length}<p>No projectors match the current filter.</p>{/if}
        {#each filtered as p (p.id)}
            <article class="device">
                <div class="device-heading">
                    <input type="checkbox" aria-label={"Select " + p.name} checked={selected.has(p.id)} on:change={(e) => toggle(p.id, e.currentTarget.checked)} />
                    <div class="identity"><strong>{p.name}</strong><small>{p.host} · {(p.groups ?? []).join(", ") || "Ungrouped"}</small></div>
                    <span class="status">{status(p.id)}</span>
                    <button on:click={() => expanded = expanded === p.id ? "" : p.id}>{expanded === p.id ? "Less" : "Details"}</button>
                </div>
                {#if expanded === p.id}
                    <div class="details">
                        <div class="actions">
                            <button disabled={busy} on:click={() => run([p.id], "powerOn")}>Power On</button>
                            <button disabled={busy} on:click={() => run([p.id], "powerOff")}>Power Off</button>
                            <button disabled={busy} on:click={() => run([p.id], "powerState")}>Check status</button>
                            <button disabled={busy} on:click={() => run([p.id], "muteVideo")}>Blank</button>
                            <button disabled={busy} on:click={() => run([p.id], "unmuteVideo")}>Unblank</button>
                        </div>
                        <label>Input code (PJLink, e.g. 31 for HDMI 1)
                            <input placeholder="31" maxlength="2" value={inputCodes[p.id] ?? ""} on:input={(e) => inputCodes = { ...inputCodes, [p.id]: e.currentTarget.value }} />
                        </label>
                        <button disabled={busy || !/^[1-5][1-9]$/.test(inputCodes[p.id] ?? "")} on:click={() => switchInput(p.id)}>Switch input</button>
                        <p class="hint">Uses PJLink input codes; check your projector manual for supported sources.</p>
                        <button class="remove" disabled={busy} on:click={() => remove(p.id)}>Remove projector</button>
                    </div>
                {/if}
            </article>
        {/each}
        <div class="bulk">
            <strong>Bulk control · {selected.size} selected</strong>
            <div class="actions">
                <button disabled={busy || !selected.size} on:click={() => run([...selected], "powerOn")}>Power On</button>
                <button disabled={busy || !selected.size} on:click={() => run([...selected], "powerOff")}>Power Off</button>
                <button disabled={busy || !selected.size} on:click={() => run([...selected], "muteVideo")}>Blank</button>
                <button disabled={busy || !selected.size} on:click={() => run([...selected], "unmuteVideo")}>Unblank</button>
                <button disabled={busy || !selected.size} on:click={() => run([...selected], "powerState")}>Refresh status</button>
            </div>
        </div>
    {:else if view === "groups"}
        {#each groups as g}
            <article class="device">
                <div class="device-heading"><strong>{g}</strong><small>{projectors.filter((p) => p.groups?.includes(g)).length} projectors</small></div>
                <div class="actions">
                    <button disabled={busy} on:click={() => run(projectors.filter((p) => p.groups?.includes(g)).map((p) => p.id), "powerOn")}>Power On</button>
                    <button disabled={busy} on:click={() => run(projectors.filter((p) => p.groups?.includes(g)).map((p) => p.id), "powerOff")}>Power Off</button>
                    <button disabled={busy} on:click={() => run(projectors.filter((p) => p.groups?.includes(g)).map((p) => p.id), "powerState")}>Check status</button>
                </div>
            </article>
        {/each}
    {:else}
        <h4>Discover projectors</h4>
        <p class="hint">Scan the first 32 addresses in an IPv4 subnet. PJLink must be enabled on the projector.</p>
        <label>IPv4 subnet prefix <input bind:value={discoveryPrefix} placeholder="192.168.1." /></label>
        <button disabled={busy} on:click={discover}>Scan subnet</button>
        {#each discovered as found (found.host)}
            <div class="device-heading"><span>{found.name} · {found.host}</span><button on:click={() => { name = found.name; host = found.host }}>Use address</button></div>
        {/each}
        <h4>Add PJLink projector</h4>
        <form class="add" on:submit|preventDefault={add}>
            <label>Name <input bind:value={name} placeholder="Main Center" required /></label>
            <label>IP address or hostname <input bind:value={host} placeholder="192.0.2.105" required /></label>
            <label>Group <input bind:value={group} placeholder="Sanctuary" /></label>
            <label>PJLink password (optional) <input type="password" autocomplete="new-password" bind:value={password} /></label>
            <button type="submit" disabled={busy}>Add projector</button>
        </form>
        <p class="hint">Uses PJLink TCP port 4352. Passwords are encrypted using the operating system credential encryption API.</p>
    {/if}
    {#if results.length}
        <div class="results"><h4>Last command results</h4>
            {#each results as result (result.id)}
                <p class:failed={!result.ok}>{result.name}: {result.ok ? result.value : result.error}</p>
            {/each}
        </div>
    {/if}
</section>

<style>
    .projectors { display: flex; flex-direction: column; gap: 14px; color: var(--text); }
    header, .filters, .device-heading, .actions, nav { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    header { justify-content: space-between; }
    h3, h4, p { margin: 0; }
    .summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .summary > div { background: var(--primary-lighter); padding: 14px; border-radius: 10px; display: flex; flex-direction: column; gap: 4px; }
    .summary strong { font-size: 1.5em; }
    nav { border-bottom: 1px solid var(--primary-lighter); padding-bottom: 8px; }
    nav .active { font-weight: bold; border-bottom: 2px solid currentColor; }
    .filters input { flex: 1; min-width: 170px; }
    .device, .bulk, .confirm, .results { border: 1px solid var(--primary-lighter); padding: 14px; border-radius: 10px; }
    .identity { display: flex; flex-direction: column; flex: 1; gap: 4px; }
    .identity small, .hint { opacity: 0.7; }
    .status { padding: 5px 9px; border-radius: 12px; background: var(--primary-lighter); }
    .details, .add { display: flex; flex-direction: column; gap: 12px; padding-top: 12px; }
    label { display: flex; flex-direction: column; gap: 5px; }
    input, select, button { padding: 8px; }
    .bulk { display: flex; flex-direction: column; gap: 10px; }
    .remove, .failed { color: #d66; }
    .results { display: flex; flex-direction: column; gap: 6px; }
    @media (max-width: 700px) { .summary { grid-template-columns: repeat(3, 1fr); } .device-heading { align-items: flex-start; } }
</style>
