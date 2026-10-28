# Unlock

> Sell a key. Get paid when it works.

A cryptographic fair-exchange hashlock protocol on BOT Chain where sellers lock digital files behind AES-256-GCM encryption and on-chain commitments. Sellers publish a cryptographic commitment combining the file's SHA-256 (`blobHash`) and the 32-byte decryption key's Keccak-256 (`keyHash`), along with an exact price and a reveal window. Buyers lock exact payment into smart contract escrow. Once paid, the seller must publish the matching key before the deadline to receive the funds into their pull-payment till. If the window closes without a valid reveal, the buyer can claim a 100% refund, and late seller reveals are strictly rejected. Built for the BOT Chain ecosystem under **Archetype W · Airlock**.

## What it is

A fair-exchange protocol providing trust-minimized digital goods delivery:
- **Client-Side WebCrypto Encryption**: Files are encrypted in the browser using AES-256-GCM with a random 12-byte IV prepended to the ciphertext and original filename preserved in a 2-byte header. The plaintext data and secret key never leave the client during listing.
- **On-Chain Hashlock Commitment**:
  $$\text{keyHash} = \text{keccak256}(\text{key})$$
  $$\text{blobHash} = \text{sha256}(\text{blob})$$
  Sellers commit both hashes on-chain along with an exact price and a bounded reveal window (1 hour to 7 days).
- **Single-Buyer Escrow Guarantee**: The first buyer to pay exact price (`msg.value == price`) locks the offer into `Paid` state and triggers the reveal countdown timer (`deadline = block.timestamp + revealWindow`). Sellers cannot buy their own key.
- **Atomic Reveal & Release**:
  - The seller calls `reveal(id, key)`. The contract checks `keccak256(key) == keyHash` and `block.timestamp <= deadline`.
  - A matching key transitions the offer to `Revealed`, writes the key to public contract storage, and credits the full price to `pending[seller]`.
  - Any buyer or observer can read the revealed key to decrypt the `.unlock` payload in their browser.
- **Guaranteed Buyer Refund**:
  - If the reveal window closes without a valid reveal (`block.timestamp > deadline`), the buyer calls `refund(id)`.
  - 100% of the escrowed payment is credited to `pending[buyer]`.
  - The seller cannot race the buyer: any reveal after the deadline is strictly rejected (`TooLate()`).
- **Non-Reentrant Pull Payments**: All seller earnings and buyer refunds accrue to `pending[account]` and are withdrawn via zero-then-transfer pull payments (`withdraw()`).
- **Pre-Purchase Cancellation**: Sellers can cancel any offer while it remains `Open` (`cancel(id)`). Once paid, offers cannot be cancelled.

## What it cannot do (stated on the main screen)

- **The key is public the moment it is revealed.** Once written to the blockchain, anyone can read the key. Unlock is built for single-delivery transactions, not perpetual secret vaults.
- **The chain checks the key, not what the file contains.** Smart contracts verify the keccak256 hash of the 32-byte key. Verify the SHA-256 blob hash matches your expected data before paying.
- **One buyer. No haggling.** The first buyer to lock exact payment wins the exclusive reveal window. There are no counter-offers or partial refunds.

## Archetype W · Airlock

- **Ground**: Deep Naval Blue-Black `#101A24`
- **Surface**: Dark Naval Iron `#16232F` / Elevated `#1D2E3D` / Overlay `#233749`
- **Text**: Pale Crisp Ink `#E6EEF4`, Subtle Slate `#9FB4C4`, Tertiary `#5A7285`
- **Accent**: Emergency Hatch Orange `#FF8F3F` (`#1A0D00` accent ink)
- **Borders**: Naval Border `#2B3E50`, Subtle `#1F2F3D`, Strong `#3D556E`
- **Status Colors**: Success `#7BD88F`, Warning `#FFD27A`, Danger `#FFB199`
- **Wallet Menu**: `--menu-bg #1A2733` · `--menu-fg #E6EEF4` · `--menu-muted #A9BECE` · `--menu-border #4A6076` · `--menu-hover-bg #263848` · `--menu-danger #FFB199`
- **Typography**: Geist Sans & Geist Mono / Tabular numbers.

## Signature Components

- **Gate Column (`GateColumn.tsx`)**: Central vertical segmented progress line between the two chambers featuring 4 sequential lamps (Listed · Paid · Key revealed · Settled) with pulse animations on state change. Reorganizes into a compact horizontal strip on mobile (≤ 768px).
- **Offer Chamber (`OfferChamber.tsx`)**: Left chamber ("the offer") displaying title, required price in BOT, SHA-256 blobHash, Keccak-256 keyHash, seller address, reveal window, and live countdown timer when paid.
- **Key Chamber (`KeyChamber.tsx`)**: Right chamber ("the key") providing role-aware action interfaces: exact payment button for buyers, key reveal form with auto-fill for sellers, in-browser decryption panel for revealed keys, and claim refund button for late offers.
- **Dock Bay (`DockBay.tsx`)**: Narrow horizontal bay for the home page dock displaying state lamp on the left, offer metadata in the center, and right-aligned price in BOT.
- **Limitation Block (`LimitationBlock.tsx`)**: Industrial airlock placard with heading `What an unlock can't do` and the 3 exact limitation statements.

## Contract Architecture (`contracts/src/Unlock.sol`)

- `list(bytes32 blobHash, bytes32 keyHash, uint128 price, uint64 revealWindow, string calldata label) external returns (uint256 id)`: Requires price > 0, window in [3600, 604800], non-zero hashes, label ≤ 64 bytes. Emits `Listed`.
- `buy(uint256 id) external payable`: Open offers only (`NotOpen`), seller cannot buy (`SellerCannotBuy`), exact payment required (`WrongPayment(price)`). Sets buyer, deadline; state `Paid`. Emits `Bought`.
- `reveal(uint256 id, bytes32 key) external`: Seller only (`NotSeller`), Paid state only (`NotPaid`), deadline check (`TooLate`), key hash verification (`WrongKey`). Stores key, state `Revealed`, credits `pending[seller] += price`. Emits `Revealed`.
- `refund(uint256 id) external`: Buyer only (`NotBuyer`), Paid state only (`NotPaid`), must be late (`NotLate`). Credits `pending[buyer] += price`, state `Refunded`. Emits `Refunded`.
- `cancel(uint256 id) external`: Seller only (`NotSeller`), Open state only (`NotOpen`). State `Cancelled`. Emits `Cancelled`.
- `withdraw() external nonReentrant`: Pull payment withdrawal for seller proceeds and buyer refunds. Emits `Withdrawn`.
- Views: `offerOf(id)`, `latest(offset, count)`, `bySeller(account)`, `keyHashOf(key)`, `offerCount()`, `pending(account)`.

## Verification & Testing

- **Foundry Unit & Fuzz Tests**: 24 unit & fuzz tests (`testFuzz_EscrowConservation` and `testFuzz_NoStateChangeOnWrongKey` with 256 runs) passing.
- **Foundry Invariant Suites**: 3 stateful invariant suites (`invariant_BalanceConservation`, `invariant_RevealedKeyMatchesHash`, `invariant_StateTransitionsConsistent`) with 256 runs, 32,768 calls, 0 failures.
- **Mutation Testing**: 25/25 mutants killed (**100.0%** kill rate, documented in `contracts/DECISIONS.md`).
- **Vitest Unit & Integration**: 53 unit tests + 8 on-chain integration tests passing on port `8618`.
- **CDP Browser Walkthrough**: Automated Headless Chrome CDP walkthrough across 1280px Desktop and 360px Mobile verifying 0px overflow, wallet menu tokens, limitation copy, 404 route, and 6 live on-chain transactions (Bob buys Offer 1, Alice reveals Offer 2, Bob refunds Offer 3, Bob decrypts Offer 4 with seeded sample, Alice withdraws till on /me, Charlie lists Offer 7 on /sell) with **0 console errors**.
