import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("web/app.js", "utf8");
const v2 = readFileSync("web/carried-letter-v2.js", "utf8");
const css = readFileSync("web/carried-letter-v2.css", "utf8");
const tour = readFileSync("web/demo-tour.js", "utf8");

describe("NimCarry V2 compose and invitation ritual", () => {
  it("keeps the creation contract intact while moving human intent ahead of delivery detail", () => {
    expect(app).toContain('name="target_label"');
    expect(app).toContain('name="target_wallet"');
    expect(app).toContain('name="mission_note"');
    expect(app).toContain('target_consent_confirmed');
    expect(v2).toContain("One person. One destination.");
    expect(v2).toContain("Write the human reason first. Delivery details stay sealed underneath.");
    expect(css).toContain("SEALED DELIVERY DETAIL");
  });

  it("turns a fresh mission into a clear first-human decision", () => {
    expect(app).toContain('data-finalized-hop-count="${esc(m.finalized_hop_count || 0)}"');
    expect(v2).toContain("Who do you trust to carry it first?");
    expect(v2).toContain("Choose first carrier");
    expect(v2).toContain("They still have to say yes before any handoff can begin.");
  });

  it("reframes the invitation dialog around trust rather than system fields", () => {
    expect(v2).toContain("Address the next handoff");
    expect(v2).toContain("Who do you trust to carry this one step closer?");
    expect(v2).toContain("Their name or label");
    expect(v2).toContain("Why them?");
    expect(v2).toContain("Known Nimiq address (optional)");
    expect(v2).toContain("Seal private invitation");
  });

  it("makes the generated invite a private letter artifact without changing its link", () => {
    expect(app).toContain('class="invite-link"');
    expect(v2).toContain("SEALED INVITATION");
    expect(v2).toContain("Hand this private link to one person.");
    expect(v2).toContain("Copy sealed invite");
    expect(v2).toContain("Open letter in Nimiq Pay");
    expect(css).toContain(".clv2-invite-ready");
  });

  it("keeps consent explicit on the recipient side", () => {
    expect(v2).toContain("You were chosen to carry this.");
    expect(v2).toContain("Why you were chosen");
    expect(v2).toContain("Accept the letter");
    expect(v2).toContain("Not this time");
    expect(v2).toContain("Nimiq Pay authorization is the consent proof.");
  });

  it("keeps practice invitation material visually distinct", () => {
    expect(tour).toContain("Open demo invite");
    expect(css).toContain('.carried-letter-v2-demo .clv2-invite-ready::after');
    expect(css).toContain('content:"PRACTICE"');
  });

  it("keeps the V2 composition layer presentation-only", () => {
    expect(v2).not.toContain("fetch(");
    expect(v2).not.toContain("sendBasicTransactionWithData");
    expect(v2).not.toContain("nimiq.sign");
    expect(v2).not.toContain("localStorage.setItem");
    expect(v2).not.toContain("sessionStorage.setItem");
  });
});
