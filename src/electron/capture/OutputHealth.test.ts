import { describe, expect, it } from "vitest"
import { OutputHealthMonitor } from "./OutputHealth"

describe("OutputHealthMonitor", () => {
    it("tracks completed and dropped frames independently", () => {
        const health = new OutputHealthMonitor(() => 100)
        health.update("a", "ndi", { state: "online", connections: 2 })
        health.frame("a", false)
        health.frame("a", true)
        expect(health.snapshot()[0]).toMatchObject({ framesCompleted: 1, framesDropped: 1, connections: 2 })
    })
    it("marks stale online outputs degraded without mutating source status", () => {
        let now = 0
        const health = new OutputHealthMonitor(() => now, 1000)
        health.update("a", "blackmagic", { state: "online" })
        now = 1001
        expect(health.snapshot()[0].state).toBe("degraded")
        health.update("a", "blackmagic", { state: "online" })
        expect(health.snapshot()[0].state).toBe("online")
    })
    it("removes stopped outputs", () => {
        const health = new OutputHealthMonitor()
        health.update("a", "ndi", {})
        health.remove("a")
        expect(health.snapshot()).toEqual([])
    })
})
