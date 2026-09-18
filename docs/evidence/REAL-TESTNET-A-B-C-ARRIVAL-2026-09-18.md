# REAL TESTNET A→B→C ARRIVAL — 2026-09-18

## Verdict

**PASS — one complete real TESTNET NimCarry route reached ARRIVED through two independently finalized handoffs.**

Runtime: `https://nimcarry.faadil-casecraft.workers.dev/`

Mission fingerprint: `95cefe89…91f2`

Observed terminal state:

- `2 VERIFIED BRIDGES`
- `2 FINAL`
- `ARRIVED`
- final UI: **“It made it.”**
- recovery banner after the second hop: **“Existing handoff verified FINAL. No second payment was requested.”**

This is real TESTNET evidence. It is **not** a MAINNET proof and must not be presented as one.

## Route evidence

### Hop 1 — A → B

- B human/basic wallet fingerprint: `NQ48…E1QT`
- bridge consent was signed before the handoff
- exactly 1 NIM was authorized as the custody baton
- the returned transaction was independently reconciled
- custody moved only after FINAL
- Mission Home then showed:
  - `1 VERIFIED BRIDGE`
  - `1 FINAL`
  - current holder = B
- privacy-safe visible tx fingerprint: `b6b0229…acdc6`

### Hop 2 — B → C

- C human/basic wallet fingerprint: `NQ67…7S1U`
- C accepted the invitation before any NimCarry payment
- B's TESTNET preflight passed
- B's independent native canary reached FINAL before the controlled NimCarry handoff
- B authorized exactly one NimCarry 1 NIM handoff to C
- the first UI state was correctly non-final: **“REFERENCE RETURNED · NOT FINAL / The wax is still warm.”**
- the same recorded handoff was later reconciled; no second payment was requested
- the mission reached:
  - `2 VERIFIED BRIDGES`
  - `ARRIVED`

## Safety properties demonstrated

1. **Consent before custody** — invitation acceptance did not move funds or custody.
2. **Approval ≠ FINAL** — wallet approval and returned references were not treated as custody.
3. **Independent finality** — route state advanced only after network verification.
4. **No resend on ambiguous/recoverable state** — recorded handoffs were reconciled instead of duplicated.
5. **Recovery is read-only** — VIEW_ROUTE recovery restored mission access without changing custody.
6. **Destination privacy remained scoped** — full wallet data was not rendered into the public-facing route artifact.

## Defects discovered and closed during the live gate

- Same-origin TESTNET head preflight hardened at commit `62c03509b0c4c3c67282713fd74834ed7eed69ab`.
- Nimiq JSON-RPC `recipientData` hex normalization fixed at commit `6ae38114a25c1c24348ca74315578c57c60acfe3`.
- Safe **Recheck existing handoff** recovery shipped at commit `c94bd8199a764ba1698a9389a9153c6e762fe661`.
- Real PostgreSQL `mission_status` prepared-statement typing fixed at commit `1b36f9287c15aaf35c5f10de2e9c9bc7823c533d`.

## Evidence handling

Operator screen recordings and screenshots were reviewed during the gate. They are intentionally not committed here because some captures contain ephemeral/private invitation or account context.

The durable claim in this repository is limited to the observed lifecycle facts above and the runtime/code fixes that made the successful TESTNET route possible.

## Mainnet boundary

NimCarry's current protocol uses **1 NIM as a custody baton per handoff**. On MAINNET that would be real value transfer, not a forwarding reward. An intermediate bridge receives the baton and later passes the same 1 NIM onward; the current protocol does not make MAINNET handoffs “payment-free.”

A no-value-transfer MAINNET variant would be a separate protocol/economic design and is outside this proof.
