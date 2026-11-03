import { describe, expect, it } from "vitest"
import { createHash } from "crypto"
import { pjlinkAuthentication, pjlinkCommand, pjlinkResponse, projectorPower } from "./PJLinkProtocol"

describe("PJLink protocol", () => {
    it("encodes class 1 commands", () => {
        expect(pjlinkCommand("POWR", "1")).toBe("%1POWR 1\r")
        expect(pjlinkCommand("INPT")).toBe("%1INPT ?\r")
        expect(() => pjlinkCommand("INPT", "1\r%1POWR 1")).toThrow()
    })
    it("supports unauthenticated and authenticated greetings", () => {
        expect(pjlinkAuthentication("PJLINK 0")).toBe("")
        expect(pjlinkAuthentication("PJLINK 1 12345678", "secret")).toBe(createHash("md5").update("12345678secret").digest("hex"))
        expect(() => pjlinkAuthentication("PJLINK 1 12345678")).toThrow()
    })
    it("validates response commands and errors", () => {
        expect(pjlinkResponse("POWR", "%1POWR=1")).toBe("1")
        expect(() => pjlinkResponse("POWR", "%1INPT=1")).toThrow()
        expect(() => pjlinkResponse("POWR", "%1POWR=ERR3")).toThrow()
        expect(projectorPower("2")).toBe("cooling")
    })
})
