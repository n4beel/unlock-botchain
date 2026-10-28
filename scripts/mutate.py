import os
import subprocess
import sys

ORIGINAL_SOL = "contracts/src/Unlock.sol"
BACKUP_SOL = "contracts/src/Unlock.sol.orig"

mutants = [
    # M01: Allow zero price
    ("M01", "list", "if (price == 0) revert ZeroPrice();", "/* if (price == 0) revert ZeroPrice(); */"),
    # M02: Allow window < MIN_WINDOW
    ("M02", "list", "revealWindow < MIN_WINDOW ||", "false ||"),
    # M03: Allow window > MAX_WINDOW
    ("M03", "list", "revealWindow > MAX_WINDOW", "false"),
    # M04: Allow zero blobHash
    ("M04", "list", "blobHash == bytes32(0) ||", "false ||"),
    # M05: Allow zero keyHash
    ("M05", "list", "keyHash == bytes32(0)", "false"),
    # M06: Allow empty label
    ("M06", "list", "bytes(label).length == 0 ||", "false ||"),
    # M07: Allow label > MAX_LABEL
    ("M07", "list", "bytes(label).length > MAX_LABEL", "false"),
    # M08: Allow buy on non-open
    ("M08", "buy", "if (o.state != State.Open) revert NotOpen();", "/* if (o.state != State.Open) revert NotOpen(); */"),
    # M09: Allow seller to buy
    ("M09", "buy", "if (msg.sender == o.seller) revert SellerCannotBuy();", "/* if (msg.sender == o.seller) revert SellerCannotBuy(); */"),
    # M10: Allow wrong payment
    ("M10", "buy", "if (msg.value != o.price) revert WrongPayment(o.price);", "/* if (msg.value != o.price) revert WrongPayment(o.price); */"),
    # M11: Bad deadline computation
    ("M11", "buy", "o.deadline = uint64(block.timestamp) + o.revealWindow;", "o.deadline = uint64(block.timestamp);"),
    # M12: Allow non-seller to reveal
    ("M12", "reveal", "if (msg.sender != o.seller) revert NotSeller();", "/* if (msg.sender != o.seller) revert NotSeller(); */"),
    # M13: Allow reveal when not Paid
    ("M13", "reveal", "if (o.state != State.Paid) revert NotPaid();", "/* if (o.state != State.Paid) revert NotPaid(); */"),
    # M14: Allow reveal after deadline
    ("M14", "reveal", "if (block.timestamp > o.deadline) revert TooLate();", "/* if (block.timestamp > o.deadline) revert TooLate(); */"),
    # M15: Allow wrong key
    ("M15", "reveal", "if (keccak256(abi.encodePacked(key)) != o.keyHash) revert WrongKey();", "/* if (keccak256(abi.encodePacked(key)) != o.keyHash) revert WrongKey(); */"),
    # M16: Omit seller credit on reveal
    ("M16", "reveal", "pending[o.seller] += o.price;", "/* pending[o.seller] += o.price; */"),
    # M17: Allow non-buyer to refund
    ("M17", "refund", "if (msg.sender != o.buyer) revert NotBuyer();", "/* if (msg.sender != o.buyer) revert NotBuyer(); */"),
    # M18: Allow refund when not Paid
    ("M18", "refund", "if (o.state != State.Paid) revert NotPaid();", "/* if (o.state != State.Paid) revert NotPaid(); */"),
    # M19: Allow refund before deadline
    ("M19", "refund", "if (block.timestamp <= o.deadline) revert NotLate();", "/* if (block.timestamp <= o.deadline) revert NotLate(); */"),
    # M20: Omit buyer refund credit
    ("M20", "refund", "pending[o.buyer] += o.price;", "/* pending[o.buyer] += o.price; */"),
    # M21: Allow non-seller to cancel
    ("M21", "cancel", "if (o.seller == address(0)) revert NotFound();\n        if (msg.sender != o.seller) revert NotSeller();", "if (o.seller == address(0)) revert NotFound();\n        /* if (msg.sender != o.seller) revert NotSeller(); */"),
    # M22: Allow cancel when not Open
    ("M22", "cancel", "if (o.state != State.Open) revert NotOpen();", "/* if (o.state != State.Open) revert NotOpen(); */"),
    # M23: Allow zero withdrawal
    ("M23", "withdraw", "if (amount == 0) revert NothingToWithdraw();", "/* if (amount == 0) revert NothingToWithdraw(); */"),
    # M24: Remove reentrancy guard from withdraw
    ("M24", "withdraw", "function withdraw() external nonReentrant {", "function withdraw() external {"),
    # M25: Wrong keyHash calculation
    ("M25", "keyHashOf", "return keccak256(abi.encodePacked(key));", "return sha256(abi.encodePacked(key));"),
]

def run_test():
    res = subprocess.run(
        ["forge", "test", "--match-contract", "UnlockTest"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd="contracts"
    )
    return res.returncode == 0

def main():
    with open(ORIGINAL_SOL, "r") as f:
        original_code = f.read()

    with open(BACKUP_SOL, "w") as f:
        f.write(original_code)

    killed = 0
    survived = []

    print(f"Running mutation testing across {len(mutants)} mutants...")

    try:
        for mid, fn, target, replacement in mutants:
            if target not in original_code:
                print(f"ERROR: Mutant {mid} target not found in {ORIGINAL_SOL}: {target}")
                sys.exit(1)

            mutated = original_code.replace(target, replacement, 1)
            with open(ORIGINAL_SOL, "w") as f:
                f.write(mutated)

            passed = run_test()
            if not passed:
                killed += 1
                print(f"[{mid}] {fn:12}: KILLED (test caught mutation)")
            else:
                survived.append((mid, fn, target))
                print(f"[{mid}] {fn:12}: SURVIVED (test did not catch mutation)")

    finally:
        with open(ORIGINAL_SOL, "w") as f:
            f.write(original_code)
        if os.path.exists(BACKUP_SOL):
            os.remove(BACKUP_SOL)

    total = len(mutants)
    kill_rate = (killed / total) * 100
    print("\n" + "="*50)
    print(f"MUTATION SUMMARY: {killed}/{total} killed ({kill_rate:.1f}%)")
    print("="*50)

    if survived:
        print("Survived mutants:")
        for mid, fn, target in survived:
            print(f"- {mid} ({fn}): {target}")
        sys.exit(1)
    else:
        print("ALL MUTANTS KILLED!")
        sys.exit(0)

if __name__ == "__main__":
    main()
