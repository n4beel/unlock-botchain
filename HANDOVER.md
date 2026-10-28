# Unlock Handover Report

## 1. What Was Built
Unlock is a cryptographic fair-exchange hashlock protocol on BOT Chain (Bohr testnet, chain ID 968) under **Archetype W · Airlock**.

Key components:
- **Smart Contract (`contracts/src/Unlock.sol`)**:
  - `list(blobHash, keyHash, price, revealWindow, label)`: Publishes a hashlock offer with bounded label (1..64 bytes), non-zero price, bounded reveal window (1 hour to 7 days), and non-zero hashes. Emits `Listed`.
  - `buy(id)` payable: Escrows exact payment (`msg.value == price`). Blocks seller from buying own offer (`SellerCannotBuy`), enforces `Open` state, sets buyer address and deadline (`block.timestamp + revealWindow`), sets state `Paid`. Emits `Bought`.
  - `reveal(id, key)`: Releases escrow to seller. Requires seller caller (`NotSeller`), `Paid` state (`NotPaid`), valid deadline (`block.timestamp <= deadline`, else `TooLate`), and exact cryptographic key match (`keccak256(key) == keyHash`, else `WrongKey`). Writes key to public storage, marks `Revealed`, credits `pending[seller] += price`. Emits `Revealed`.
  - `refund(id)`: Claims buyer refund after deadline. Requires buyer caller (`NotBuyer`), `Paid` state (`NotPaid`), and expired deadline (`block.timestamp > deadline`, else `NotLate`). Marks `Refunded`, credits `pending[buyer] += price`. Emits `Refunded`.
  - `cancel(id)`: Allows seller to cancel an unbought offer (`Open` state only). Marks `Cancelled`. Emits `Cancelled`.
  - `withdraw()`: Non-reentrant pull payment withdrawal for seller proceeds and buyer refunds. Emits `Withdrawn`.
  - Views: `offerOf(id)`, `latest(offset, count)`, `bySeller(account)`, `keyHashOf(key)`, `offerCount()`, `pending(account)`.
- **Frontend Architecture (Archetype W · Airlock)**:
  - Palette: Ground Deep Naval Blue-Black `#101A24`, Surface Dark Naval Iron `#16232F`, Text Pale Crisp Ink `#E6EEF4`, Subtle Slate `#9FB4C4`, Accent Emergency Hatch Orange `#FF8F3F` (`#1A0D00` ink), Borders `#2B3E50`.
  - Wallet Menu Tokens: `--menu-bg #1A2733` · `--menu-fg #E6EEF4` · `--menu-muted #A9BECE` · `--menu-border #4A6076` · `--menu-hover-bg #263848` · `--menu-danger #FFB199`.
  - Signature Components:
    - `GateColumn.tsx`: Central vertical segmented progress line between chambers with 4 sequential lamps (Listed · Paid · Key revealed · Settled) that pulse on change. Reorganizes into a compact horizontal strip on mobile (≤ 768px).
    - `OfferChamber.tsx`: Left chamber ("the offer") displaying title, required price in BOT, SHA-256 blobHash, Keccak-256 keyHash, seller address, reveal window, and live countdown timer when paid.
    - `KeyChamber.tsx`: Right chamber ("the key") with role-aware buy, reveal with local storage auto-fill, in-browser decryption panel for revealed keys, and claim refund button for late offers.
    - `DockBay.tsx`: Narrow horizontal bay for home page dock displaying state lamp on the left, metadata in center, and price on the right.
    - `LimitationBlock.tsx`: Industrial airlock placard with heading `What an unlock can't do` and the 3 exact limitation statements.
  - Routes:
    - `/`: The Dock (vertical stack of offer bays, stats strip, filter tabs, limitation block).
    - `/sell`: Guided listing wizard (choose file → client-side AES-256-GCM encryption → download .unlock and key backup JSON → list on chain).
    - `/offer/[id]`: Airlock chamber view (Offer Chamber + Central Gate Column + Key Chamber).
    - `/me`: Vault & Till (seller listings with reveal actions, buyer purchases with decrypt/refund actions, browser secret key vault, and pull-payment withdrawal till).
    - `app/not-found.tsx`: Depressurized Chamber 404 page.

---

## 2. Verification Results

### Foundry Unit & Fuzz Tests
```bash
$ cd contracts && forge test
Ran 24 tests for test/Unlock.t.sol:UnlockTest
[PASS] testFuzz_EscrowConservation(uint128) (runs: 256)
[PASS] testFuzz_NoStateChangeOnWrongKey(bytes32) (runs: 256)
[PASS] test_BadWindowReverts()
[PASS] test_CancelNonSellerReverts()
[PASS] test_CancelOnlyWhenOpen()
[PASS] test_DoubleWithdrawReverts()
[PASS] test_ExactPaymentOnly()
[PASS] test_HappyPath()
[PASS] test_KeyHashOffChainVector()
[PASS] test_LatestOffersView()
[PASS] test_MaxLabelLength()
[PASS] test_NonSellerRevealReverts()
[PASS] test_OnlyOneBuyer()
[PASS] test_ReentrantWithdrawBlocked()
[PASS] test_RefundNonBuyerReverts()
[PASS] test_RefundOnlyAfterDeadline()
[PASS] test_RefundOnlyByBuyer()
[PASS] test_RefundWhenNotPaidReverts()
[PASS] test_RevealAfterDeadlineReverts()
[PASS] test_RevealWhenNotPaidReverts()
[PASS] test_SellerCannotBuy()
[PASS] test_WrongKeyReverts()
[PASS] test_ZeroHashReverts()
[PASS] test_ZeroPriceReverts()
Suite result: ok. 24 passed; 0 failed
```

### Foundry Stateful Invariant Tests
```bash
$ cd contracts && forge test --match-contract UnlockInvariantTest
Ran 3 tests for test/UnlockInvariant.t.sol:UnlockInvariantTest
[PASS] invariant_BalanceConservation() (runs: 256, calls: 32768, reverts: 0)
[PASS] invariant_RevealedKeyMatchesHash() (runs: 256, calls: 32768, reverts: 0)
[PASS] invariant_StateTransitionsConsistent() (runs: 256, calls: 32768, reverts: 0)
Suite result: ok. 3 passed; 0 failed
```

### Mutation Testing (`scripts/mutate.py`)
```bash
$ python3 scripts/mutate.py
Killed 25 / 25 mutants (100.0% kill rate).
0 mutants survived.
All decisions documented in contracts/DECISIONS.md.
```

### Vitest Unit & Integration Tests
```bash
$ npm test
Test Files  9 passed (9)
     Tests  53 passed (53)

$ npm run test:integration
Test Files  2 passed (2)
     Tests  8 passed (8)
```

### Automated Headless Chrome CDP Walkthrough (`scripts/browser-walkthrough.mjs`)
- Tested 1280px Desktop and 360px Mobile viewports across all routes (`/`, `/sell`, `/offer/1`, `/offer/2`, `/offer/3`, `/offer/4`, `/me`, `/_not-found`).
- Confirmed **0px horizontal overflow** on every route at both screen widths.
- Verified mobile adaptation: two chambers stack with gate column as horizontal progress strip without horizontal scrolling.
- Verified wallet menu tokens match spec (`#1A2733` bg, `#E6EEF4` fg, `#4A6076` border, `#263848` hover, `#FFB199` danger).
- Verified footer links to `botchain.ai` and `BOT Chain Explorer`.
- Verified limitation block copy matches spec §3.4.
- Confirmed 6 live on-chain transactions via injected mock wallet:
  1. Bob buys Offer 1 on `/offer/1` (2.5 BOT) -> State becomes `Paid`, buyer set to Bob.
  2. Alice reveals key for Offer 2 on `/offer/2` -> State becomes `Revealed`, key stored on chain.
  3. Bob claims refund for Offer 3 on `/offer/3` -> State becomes `Refunded`, Bob's till credited with 0.8 BOT.
  4. In-browser decryption of Offer 4 on `/offer/4` -> SHA-256 verified, decrypted sample file `geological-survey-core-samples.csv`.
  5. Alice withdraws 4.8 BOT from till on `/me` -> Wallet credited, till zeroed.
  6. Charlie lists Offer 7 on `/sell` -> File encrypted, listed on chain, offerCount incremented to 7.
- **Console Errors Logged: 0**. Exit code 0.

### Policy Checks
```bash
$ python3 scripts/check-tokens.py unlock
0 project(s) with undefined tokens

$ python3 scripts/check-ui-contract.py unlock
unlock: ok

$ python3 scripts/check-distinct.py unlock
45 projects compared; 0 pair/file problem(s)

$ python3 scripts/check-honesty.py unlock
honesty: 0 finding(s) in 1 project(s)
```

---

## 3. Git Commit History
- `731e002`: `scaffold(unlock): initialize project with archetype W Airlock (M1)`
- `aeeb5a8`: `feat(unlock): implement contract, tests, invariants, and mutation suite (M2)`
- `f305146`: `feat(unlock): implement types, limits, errors, WebCrypto encryption, and unit tests (M3)`
- `2aa818f`: `feat(unlock): implement local stack runner and integration test suite (M4)`
- `f8c545e`: `feat(unlock): implement Archetype W Airlock UI components and tokens (M5)`
- `9be9355`: `feat(unlock): implement routes, useUnlock hook, and full wire-up (M6)`
- *(Current)*: `feat(unlock): complete verification, icon, walkthrough, and handover (M7)`
