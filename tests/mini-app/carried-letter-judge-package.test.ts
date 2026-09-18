import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("web/index.html", "utf8");
const manifest = readFileSync("web/manifest.webmanifest", "utf8");
const social = readFileSync("web/social-card.svg", "utf8");
const readme = readFileSync("README.md", "utf8");

describe("NimCarry V2 judge-facing carried-letter package", () => {
  it("uses one human-first product sentence across browser, install and social metadata", () => {
    expect(html).toContain("NimCarry — A private introduction, carried by people.");
    expect(html).toContain("Get introduced to someone you cannot reach directly.");
    expect(manifest).toContain("A private introduction, carried by people");
    expect(social).toContain("A private introduction.");
    expect(social).toContain("Carried by people.");
  });

  it("routes judges to the deterministic explicitly guided practice flow", () => {
    expect(readme).toContain("https://nimcarry.faadil-casecraft.workers.dev/?demo=1&tour=1&reset=1");
    expect(readme).toContain("permanently marked **PRACTICE**");
    expect(readme).toContain("presentation evidence, not a claim of real TESTNET finality");
  });

  it("states the current TESTNET evidence boundary without the stale provider-regression diagnosis", () => {
    expect(readme).toContain("A native Nimiq Pay TESTNET transfer independently confirmed on-chain.");
    expect(readme).toContain("NimCarry TESTNET network preflight | PASS / read-only");
    expect(readme).toContain("HTLC-aware sender verification | Implemented");
    expect(readme).toContain("Fresh NimCarry A→B→C TESTNET FINAL run | Pending");
    expect(readme).toContain("Real NimCarry FINAL / ARRIVED | Not claimed");
    expect(readme).not.toContain("LIKELY_EXTERNAL_NIMIQ_PAY_TESTNET_SUBMISSION_REGRESSION");
    expect(readme).not.toContain("Real A→B TESTNET broadcast | Blocked before broadcast");
  });

  it("keeps the proof ladder technically honest", () => {
    expect(readme).toContain("approval ≠ provider reference ≠ independent verification ≠ FINAL");
    expect(readme).toContain("outgoing Nimiq Pay transfers can use an HTLC payment rail");
    expect(readme).toContain("human/basic Nimiq Pay identity therefore does not have to be the raw transaction sender");
  });

  it("presents The Carried Letter as interaction model, not new custody authority", () => {
    expect(readme).toContain("The Carried Letter");
    expect(readme).toContain("the 1 NIM baton is its custody seal");
    expect(readme).toContain("warm wax represents pre-FINAL verification");
    expect(readme).toContain("a postmark appears only when independent FINAL proof changes the holder");
  });

  it("contains no accidental escaped newline artifacts in browser HTML", () => {
    expect(html).not.toContain("\\n  <link");
    expect(html).not.toContain("\\n  <script");
  });
});
