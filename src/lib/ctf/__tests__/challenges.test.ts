import { describe, expect, it } from "vitest";
import { CTF_CHALLENGES, getCtfChallengeSource } from "../challenges";

describe("CTF challenge catalog", () => {
  it("lists both workshop challenges with live repository links", () => {
    expect(CTF_CHALLENGES).toHaveLength(2);
    const lab2 = getCtfChallengeSource("cuhkctf26-lab2");
    expect(lab2?.repoUrl).toBe(
      "https://github.com/Gameboy612/CUHKCTF26-Workshop-CMDLab2",
    );
    expect(lab2?.hint).toContain("creative");
    for (const challenge of CTF_CHALLENGES) {
      expect(challenge.repoUrl).toMatch(/^https:\/\/github\.com\//);
      expect(challenge.hint.length).toBeGreaterThan(0);
    }
  });
});
