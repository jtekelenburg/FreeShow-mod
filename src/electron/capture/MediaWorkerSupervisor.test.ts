import { describe, expect, it } from "vitest"
import { MediaWorkerSupervisor } from "./MediaWorkerSupervisor"

describe("MediaWorkerSupervisor", () => {
    it("ignores exits from superseded worker generations", () => {
        const supervisor = new MediaWorkerSupervisor()
        supervisor.starting()
        supervisor.started(1)
        supervisor.exited(1)
        expect(supervisor.snapshot().state).toBe("recovering")
        supervisor.starting()
        supervisor.started(2)
        supervisor.exited(1)
        expect(supervisor.snapshot().state).toBe("running")
        supervisor.exited(2)
        expect(supervisor.snapshot().failures).toBe(2)
    })

    it("resets failure backoff once and avoids notifications for repeated healthy messages", () => {
        const supervisor = new MediaWorkerSupervisor()
        const states: string[] = []
        supervisor.subscribe((snapshot) => states.push(snapshot.state))
        supervisor.starting()
        supervisor.started(1)
        supervisor.exited(1)
        expect(supervisor.snapshot().retryDelayMs).toBe(1000)
        supervisor.starting()
        supervisor.started(2)
        supervisor.healthy()
        supervisor.healthy()
        expect(supervisor.snapshot().failures).toBe(0)
        expect(states.filter((state) => state === "running")).toHaveLength(3)
    })

    it("prevents recovery after shutdown", () => {
        const supervisor = new MediaWorkerSupervisor()
        supervisor.starting()
        supervisor.started(1)
        supervisor.shutdown()
        expect(supervisor.starting()).toBe(false)
        supervisor.exited(1)
        expect(supervisor.snapshot().state).toBe("stopped")
    })

    it("notifies subscribers and supports unsubscribe", () => {
        const supervisor = new MediaWorkerSupervisor()
        const states: string[] = []
        const unsubscribe = supervisor.subscribe((s) => states.push(s.state))
        supervisor.starting()
        supervisor.started(1)
        unsubscribe()
        supervisor.exited(1)
        expect(states).toEqual(["idle", "starting", "running"])
    })
})
