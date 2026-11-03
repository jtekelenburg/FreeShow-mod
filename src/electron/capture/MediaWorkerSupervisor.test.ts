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
