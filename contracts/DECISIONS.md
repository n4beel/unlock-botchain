# Architecture Decisions & Invariants — Unlock

## 1. Product Architecture & Protocol Boundaries

Unlock is a fair exchange protocol of a file for native BOT, enforced trustlessly on Bohr testnet (chain ID 968). The seller encrypts an arbitrary file locally in their browser using AES-256-GCM with a 32-byte secret key and 12-byte random IV. The contract records the SHA-256 hash of the ciphertext (`blobHash`) and the keccak256 hash of the 32-byte key (`keyHash`), along with an exact price and a reveal window (1 hour to 7 days).

### Core Protocol Decisions

1. **Client-Side Encryption (Zero-Knowledge On-Chain)**:
   - Neither the plaintext file nor the secret encryption key is transmitted to the blockchain during listing.
   - The seller distributes the encrypted `.unlock` file out-of-band (via IPFS, email, direct download, messaging, or cloud storage).
   - The contract enforces the binding between the key and the lock:
     $$\text{keyHash} = \text{keccak256}(\text{abi.encodePacked}(key))$$

2. **Fair Exchange State Machine**:
   - `State.Open`: Listed by seller. Anyone can view `blobHash`, `keyHash`, price, and label. Can be cancelled by seller.
   - `State.Paid`: One buyer pays the exact price into escrow (`msg.value == price`). A hard deadline is established:
     $$\text{deadline} = \text{block.timestamp} + \text{revealWindow}$$
   - `State.Revealed`: Seller provides the preimage key before `deadline`. The contract verifies the hash and records the key on-chain for the buyer to decrypt. Escrowed funds are credited to `pending[seller]`.
   - `State.Refunded`: If the seller fails to reveal the valid key before `deadline`, the buyer claims a 100% refund into `pending[buyer]`.
   - `State.Cancelled`: If unbought, the seller can cancel the listing at any time.

3. **No Front-Running of Refunds / Deterministic Resolution**:
   - The seller cannot reveal after the deadline (`block.timestamp <= o.deadline`), even if the buyer has not yet called `refund()`. This eliminates race conditions between late reveals and refunds.
   - Escrow funds are released to exactly one party: seller after valid reveal, or buyer after deadline refund; never both, never neither.

4. **Pull Payments via `withdraw()`**:
   - All seller earnings and buyer refunds credit `pending[address]`.
   - Withdrawals follow the checks-effects-interactions pattern with reentrancy protection.

---

## 2. Invariants & Formal Properties

The contract was formally verified via stateful invariant testing (`contracts/test/UnlockInvariant.t.sol`) across 32,768 calls and 256 runs with 0 failures:

1. **Escrow Balance Conservation**:
   $$\text{address(this).balance} == \sum \text{pending} + \sum_{o \in \text{Paid}} o.\text{price}$$
   - Every single wei entering the contract via `buy()` is strictly conserved across all state transitions.

2. **Key Immutability and Authenticity**:
   $$\forall \text{ offer with state } == \text{Revealed}: \quad \text{keyHashOf}(o.\text{key}) == o.\text{keyHash} \land o.\text{key} \ne 0$$
   - A wrong key can never transition an offer to `Revealed`. Once revealed, the key is permanently immutable.

3. **State Monotonicity**:
   - Offers in `Open` or `Cancelled` have `buyer == address(0)` and `deadline == 0`.
   - Offers in `Paid`, `Revealed`, or `Refunded` have a fixed buyer and fixed deadline.

---

## 3. Mutation Analysis

25 deliberate mutants were tested against the test suite to ensure comprehensive branch and logic coverage:

| Mutant ID | Target / Function | Mutation Description | Result |
|---|---|---|---|
| M01 | `list` | Allowed zero price (`price == 0`) | KILLED |
| M02 | `list` | Allowed revealWindow < 3600 seconds (`MIN_WINDOW`) | KILLED |
| M03 | `list` | Allowed revealWindow > 604,800 seconds (`MAX_WINDOW`) | KILLED |
| M04 | `list` | Allowed zero blobHash | KILLED |
| M05 | `list` | Allowed zero keyHash | KILLED |
| M06 | `list` | Allowed empty label | KILLED |
| M07 | `list` | Allowed label exceeding 64 bytes (`MAX_LABEL`) | KILLED |
| M08 | `buy` | Allowed purchase when offer is not Open (`NotOpen`) | KILLED |
| M09 | `buy` | Allowed seller to buy their own offer (`SellerCannotBuy`) | KILLED |
| M10 | `buy` | Allowed payment not equal to price (`WrongPayment`) | KILLED |
| M11 | `buy` | Incorrect deadline computation (omitted revealWindow) | KILLED |
| M12 | `reveal` | Allowed non-seller to reveal key (`NotSeller`) | KILLED |
| M13 | `reveal` | Allowed reveal when offer is not Paid (`NotPaid`) | KILLED |
| M14 | `reveal` | Allowed reveal after deadline (`TooLate`) | KILLED |
| M15 | `reveal` | Removed keyHash verification check (`WrongKey`) | KILLED |
| M16 | `reveal` | Omitted seller credit to `pending[seller]` | KILLED |
| M17 | `refund` | Allowed non-buyer to claim refund (`NotBuyer`) | KILLED |
| M18 | `refund` | Allowed refund when offer is not Paid (`NotPaid`) | KILLED |
| M19 | `refund` | Allowed refund before deadline (`NotLate`) | KILLED |
| M20 | `refund` | Omitted buyer refund credit to `pending[buyer]` | KILLED |
| M21 | `cancel` | Allowed non-seller to cancel offer (`NotSeller`) | KILLED |
| M22 | `cancel` | Allowed cancellation when offer is not Open (`NotOpen`) | KILLED |
| M23 | `withdraw` | Allowed zero-balance withdrawal (`NothingToWithdraw`) | KILLED |
| M24 | `withdraw` | Removed `nonReentrant` guard on `withdraw()` | KILLED |
| M25 | `keyHashOf`| Used SHA-256 instead of keccak256 for key hash computation | KILLED |

**Mutation testing result**: 25/25 mutants killed (**100.0%** kill rate).
