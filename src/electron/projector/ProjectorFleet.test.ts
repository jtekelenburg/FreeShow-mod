import { describe, expect, it } from "vitest"
import { ProjectorFleet } from "./ProjectorFleet"

describe("ProjectorFleet", () => {
    it("runs group commands and isolates failures", async () => {
        const fleet = new ProjectorFleet(async (p) => {
            if (p.id === "b") throw new Error("Offline")
            return "OK"
        })
        fleet.upsert({ id: "a", name: "Left", host: "192.0.2.1", groups: ["stage"] })
        fleet.upsert({ id: "b", name: "Right", host: "192.0.2.2", groups: ["stage"] })
        fleet.upsert({ id: "c", name: "Lobby", host: "192.0.2.3", groups: ["lobby"] })
        expect(await fleet.runGroup("stage", "powerOn")).toMatchObject([
            { id: "a", ok: true }, { id: "b", ok: false, error: "Offline" }
        ])
        expect(fleet.list()).toHaveLength(3)
    })
    it("deduplicates selected projectors and reports unknown ids", async () => {
        const fleet = new ProjectorFleet(async () => "OK")
        expect(await fleet.run(["missing", "missing"], "powerOff")).toEqual([
            { id: "missing", name: "missing", ok: false, error: "Projector not found" }
        ])
    })
    it("enforces bounded parallelism", async () => {
        let active = 0
        let peak = 0
        const fleet = new ProjectorFleet(async () => {
            active++
            peak = Math.max(peak, active)
            await Promise.resolve()
            active--
            return "OK"
        })
        for (let i = 0; i < 10; i++) fleet.upsert({ id: String(i), name: String(i), host: "localhost" })
        await fleet.run(fleet.list().map((p) => p.id), "powerOn", 3)
        expect(peak).toBeLessThanOrEqual(3)
        expect(peak).toBeGreaterThan(1)
    })
})
