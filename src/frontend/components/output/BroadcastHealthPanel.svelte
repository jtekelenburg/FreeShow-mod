<script lang="ts">
    export let outputs: { id: string; protocol: string; state: string; framesDropped: number; framesCompleted: number; connections: number }[] = []
    $: active = outputs.filter((output) => output.state === "online").length
    $: unhealthy = outputs.filter((output) => output.state === "offline" || output.state === "degraded").length
</script>

<section class="broadcast-health" aria-label="Broadcast output health">
    <header>
        <h2>Broadcast output health</h2>
        <p>{active} online · {unhealthy} requiring attention</p>
    </header>
    {#if outputs.length === 0}
        <p>No output health telemetry available.</p>
    {:else}
        <table>
            <thead><tr><th>Output</th><th>Protocol</th><th>Status</th><th>Connections</th><th>Frames</th><th>Dropped</th></tr></thead>
            <tbody>
                {#each outputs as output (output.id)}
                    <tr>
                        <th scope="row">{output.id}</th>
                        <td>{output.protocol.toUpperCase()}</td>
                        <td>{output.state}</td>
                        <td>{output.connections}</td>
                        <td>{output.framesCompleted}</td>
                        <td>{output.framesDropped}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
    {/if}
</section>

<style>
    .broadcast-health { padding: 1rem; overflow-x: auto; }
    header { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
    h2 { font-size: 1.1rem; margin: 0; }
    p { opacity: .8; }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th, td { padding: .5rem; border-bottom: 1px solid currentColor; }
</style>
