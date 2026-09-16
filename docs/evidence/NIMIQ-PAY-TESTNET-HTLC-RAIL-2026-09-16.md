# Nimiq Pay TESTNET HTLC payment-rail correction — 2026-09-16

## Why this supersedes the previous working diagnosis

A controlled device check on Nimiq Pay 2.19.1 established that the earlier NimCarry payment attempts were made while the production Nimiq Pay build was still using its default MAINNET network mode, even though NimCarry's UI displayed `TESTNET` and the backend reconciliation RPC was TESTNET.

Therefore the earlier no-hash / no-match incident remains useful evidence that NimCarry failed closed, but it is **not a clean reproduction of a Nimiq Pay TESTNET submission regression**. The previous external-regression classification must not be presented as the primary root-cause conclusion for NimCarry.

## Native TESTNET control

After explicitly switching Nimiq Pay to TESTNET through its developer network switch:

1. Nimiq Pay received the testnet faucet allocation.
2. A native Nimiq Pay withdrawal of exactly `1 NIM` to an independent regular TESTNET account was submitted successfully.
3. The transaction appeared on TESTNET.WATCH with fee `0 NIM` and advanced far beyond the macro-block finality boundary.
4. This proves that the installed Nimiq Pay environment can broadcast and finalize a normal TESTNET NIM payment when it is actually operating on TESTNET.

Full addresses and the full transaction hash are deliberately omitted from this repository evidence record.

## Identity / payment-rail observation

The same Nimiq Pay TESTNET session produced two different on-chain identities with distinct roles:

- `listAccounts()` exposed the user's regular wallet identity (basic account).
- The successful outgoing transaction's `from` address was different.
- TESTNET.WATCH classified that outgoing sender as a **Hashed Timelock Contract (HTLC)**.
- The HTLC account's on-chain `sender` field matched the regular wallet identity exposed by `listAccounts()`.
- The HTLC showed `110,000 NIM` total amount and `109,999 NIM` remaining after the controlled `1 NIM` withdrawal, consistent with the payment rail funding and the observed spend.

The operational model is therefore:

`Nimiq Pay signed wallet identity -> Nimiq Pay HTLC payment rail -> outgoing transaction`

and **not**:

`Nimiq Pay signed wallet identity == transaction.from`

## NimCarry defect confirmed

Before this correction, NimCarry's relay validator required:

`tx.from === intent.currentHolder`

That assumption is incompatible with the observed Nimiq Pay payment architecture. It can reject a legitimate Nimiq Pay transaction even when the holder correctly signed `AUTHORIZE_PASS` and Nimiq Pay sent the exact authorized payment through its HTLC rail.

## Security-preserving correction

NimCarry does **not** relax sender verification to accept arbitrary HTLCs.

A transaction whose `tx.from` differs from the signed holder can qualify only if independent chain reads prove all of the following:

1. `tx.from` is an HTLC account;
2. the HTLC's declared `sender` equals the wallet identity that signed `AUTHORIZE_PASS`;
3. the HTLC's original `totalAmount` is backed by an on-chain funding/creation transaction from that same signed holder to the HTLC;
4. the baton transaction recipient equals the committed next bridge;
5. the value is exactly `100000` Luna (`1 NIM`);
6. the opaque `co:v1:` recipient-data commitment matches exactly;
7. only independent chain finality can advance custody.

Direct basic-account sends remain valid when `tx.from` directly equals the signed holder.

## Network gate correction

The Nimiq Mini App provider does not currently expose a Nimiq network-id method. Because production Nimiq Pay defaults to MAINNET unless the developer switch forces TESTNET, NimCarry must not label or request a TESTNET payment based on UI assumptions alone.

Before `sendBasicTransactionWithData`, the web provider wrapper now:

1. requires Nimiq Pay consensus;
2. reads the live provider block height;
3. independently reads the canonical TESTNET head from the TESTNET RPC;
4. requires the two heights to be within a small bounded drift;
5. fails closed before any wallet write request if TESTNET cannot be proven or the heights materially disagree.

This prevents a production Nimiq Pay MAINNET session from silently receiving a NimCarry TESTNET payment request.

## Next real-payment gate

No additional payment should be attempted until this correction passes CI and production deployment checks.

After deployment:

1. confirm Nimiq Pay is explicitly on TESTNET;
2. run the read-only network/identity preflight;
3. perform exactly one controlled NimCarry `A -> B` pass;
4. require the exact commitment + payment-rail proof + independent FINAL;
5. only if A -> B is FINAL proceed to the B-side canary and B -> C.

A route is not transactionally validated until every required hop is independently FINAL.
