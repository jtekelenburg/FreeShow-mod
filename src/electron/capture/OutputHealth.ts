export type OutputProtocol = "ndi" | "blackmagic" | "rtmp" | "omt"
export type OutputHealthState = "starting" | "online" | "offline" | "degraded"
export type OutputHealthSnapshot = Readonly<{ id: string; protocol: OutputProtocol; state: OutputHealthState; updatedAt: number; framesDropped: number; framesCompleted: number; connections: number }>

/** Bounded, process-local telemetry for the broadcast control surface. */
export class OutputHealthMonitor {
    private outputs = new Map<string, OutputHealthSnapshot>()
    constructor(private readonly now: () => number = Date.now, private readonly staleMs = 10000) {}
    update(id: string, protocol: OutputProtocol, patch: Partial<Pick<OutputHealthSnapshot, "state" | "connections">>) {
        const old = this.outputs.get(id)
        const current: OutputHealthSnapshot = {
            id, protocol, state: patch.state ?? old?.state ?? "starting",
            connections: patch.connections ?? old?.connections ?? 0,
            updatedAt: this.now(), framesDropped: old?.framesDropped ?? 0, framesCompleted: old?.framesCompleted ?? 0
        }
        this.outputs.set(id, current)
    }
    frame(id: string, dropped: boolean) {
        const old = this.outputs.get(id)
        if (!old) return
        this.outputs.set(id, { ...old, updatedAt: this.now(), framesDropped: old.framesDropped + Number(dropped), framesCompleted: old.framesCompleted + Number(!dropped) })
    }
    remove(id: string) { this.outputs.delete(id) }
    snapshot(): OutputHealthSnapshot[] {
        const now = this.now()
        return [...this.outputs.values()].map((entry) => ({
            ...entry,
            state: entry.state === "online" && now - entry.updatedAt > this.staleMs ? "degraded" as const : entry.state
        }))
    }
}
