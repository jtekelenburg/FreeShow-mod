import { recoveryDelay } from "./RecoveryPolicy"

export type MediaWorkerState = "idle" | "starting" | "running" | "recovering" | "stopped"
export type MediaWorkerSnapshot = Readonly<{ state: MediaWorkerState; generation: number; failures: number; retryDelayMs: number }>

/**
 * Central lifecycle authority for the shared sender worker.
 * Protocol owners retain their own desired output configurations and reconnect independently.
 */
export class MediaWorkerSupervisor {
    private state: MediaWorkerState = "idle"
    private generation = 0
    private failures = 0
    private stopped = false
    private listeners = new Set<(snapshot: MediaWorkerSnapshot) => void>()

    snapshot(): MediaWorkerSnapshot {
        return { state: this.state, generation: this.generation, failures: this.failures, retryDelayMs: this.failures ? recoveryDelay(this.failures - 1) : 0 }
    }

    subscribe(listener: (snapshot: MediaWorkerSnapshot) => void): () => void {
        this.listeners.add(listener)
        listener(this.snapshot())
        return () => this.listeners.delete(listener)
    }

    private publish() {
        const snapshot = this.snapshot()
        for (const listener of this.listeners) listener(snapshot)
    }

    starting() {
        if (this.stopped) return false
        this.state = "starting"
        this.publish()
        return true
    }

    started(generation: number) {
        if (this.stopped) return
        this.generation = generation
        this.state = "running"
        this.publish()
    }

    exited(generation: number) {
        if (this.stopped || generation !== this.generation) return
        this.failures++
        this.state = "recovering"
        this.publish()
    }

    startFailed() {
        if (this.stopped) return
        this.failures++
        this.state = "recovering"
        this.publish()
    }

    healthy() {
        if (this.stopped || this.state !== "running") return
        if (this.failures === 0) return
        this.failures = 0
        this.publish()
    }

    shutdown() {
        this.stopped = true
        this.state = "stopped"
        this.publish()
    }
}
