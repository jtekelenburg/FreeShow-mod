import { describe, expect, it } from "vitest"
import { parseProjectors, serializeProjectors } from "./ProjectorStore"

describe("projector settings persistence", () => {
    it("round-trips multiple projector groups without saving passwords", () => {
        const saved = serializeProjectors([
            { id: "left", name: "Left", host: "192.0.2.10", password: "secret", groups: ["stage", "all"] },
            { id: "right", name: "Right", host: "192.0.2.11", groups: ["stage"] }
        ])
        expect(saved).not.toContain("secret")
        expect(parseProjectors(saved)).toMatchObject([
            { id: "left", groups: ["stage", "all"] },
            { id: "right", groups: ["stage"] }
        ])
    })
    it("rejects malformed and duplicate entries", () => {
        expect(() => parseProjectors('{"version":2,"projectors":[]}')).toThrow()
        expect(() => parseProjectors('{"version":1,"projectors":[{"id":"a","name":"A","host":"x"},{"id":"a","name":"B","host":"y"}]}')).toThrow()
    })
})
