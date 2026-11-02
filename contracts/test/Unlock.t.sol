// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../src/Unlock.sol";

contract MaliciousRecipient {
    Unlock public target;
    bool public attacked;

    constructor(Unlock _target) {
        target = _target;
    }

    function attack() external payable {
        target.withdraw();
    }

    receive() external payable {
        if (!attacked) {
            attacked = true;
            (bool s, bytes memory data) = address(target).call(abi.encodeWithSignature("withdraw()"));
            require(!s, "Reentrancy allowed");
            bytes memory expected = abi.encodeWithSignature("Error(string)", "REENTRANCY");
            require(keccak256(data) == keccak256(expected), "Not REENTRANCY error");
        }
    }
}

contract UnlockTest is Test {
    Unlock public unlock;

    address public alice = address(0xA11CE); // seller
    address public bob = address(0xB0B);     // buyer
    address public charlie = address(0xCC);   // outsider / 2nd buyer

    bytes32 public constant SAMPLE_KEY = bytes32(hex"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
    bytes32 public sampleKeyHash;
    bytes32 public constant SAMPLE_BLOB_HASH = bytes32(hex"abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd");

    function setUp() public {
        unlock = new Unlock();
        sampleKeyHash = unlock.keyHashOf(SAMPLE_KEY);

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(charlie, 100 ether);
    }

    function test_HappyPath() public {
        vm.prank(alice);
        uint256 id = unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 2 ether, 86400, "Encrypted Dataset 2026");
        assertEq(id, 1);

        Unlock.Offer memory o = unlock.offerOf(1);
        assertEq(o.seller, alice);
        assertEq(o.price, 2 ether);
        assertEq(uint8(o.state), uint8(Unlock.State.Open));

        // Bob buys
        vm.prank(bob);
        unlock.buy{value: 2 ether}(1);

        o = unlock.offerOf(1);
        assertEq(o.buyer, bob);
        assertEq(uint8(o.state), uint8(Unlock.State.Paid));
        assertEq(o.deadline, block.timestamp + 86400);

        // Alice reveals key before deadline
        vm.warp(block.timestamp + 1000);
        vm.prank(alice);
        unlock.reveal(1, SAMPLE_KEY);

        o = unlock.offerOf(1);
        assertEq(uint8(o.state), uint8(Unlock.State.Revealed));
        assertEq(o.key, SAMPLE_KEY);
        assertEq(unlock.pending(alice), 2 ether);

        // Alice withdraws
        uint256 balBefore = alice.balance;
        vm.prank(alice);
        unlock.withdraw();
        assertEq(alice.balance, balBefore + 2 ether);
        assertEq(unlock.pending(alice), 0);
    }

    function test_WrongKeyReverts() public {
        vm.prank(alice);
        unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 1 ether, 3600, "Secret File");

        vm.prank(bob);
        unlock.buy{value: 1 ether}(1);

        bytes32 wrongKey = bytes32(hex"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
        vm.prank(alice);
        vm.expectRevert(Unlock.WrongKey.selector);
        unlock.reveal(1, wrongKey);
    }

    function test_RevealAfterDeadlineReverts() public {
        vm.prank(alice);
        unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 1 ether, 3600, "Secret File");

        vm.prank(bob);
        unlock.buy{value: 1 ether}(1);

        // Warp past deadline
        vm.warp(block.timestamp + 3601);

        vm.prank(alice);
        vm.expectRevert(Unlock.TooLate.selector);
        unlock.reveal(1, SAMPLE_KEY);
    }

    function test_RevealAtExactDeadlineSucceeds() public {
        vm.prank(alice);
        unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 1 ether, 3600, "Secret File");

        vm.prank(bob);
        unlock.buy{value: 1 ether}(1);

        // Warp exactly to deadline (block.timestamp + 3600)
        vm.warp(block.timestamp + 3600);

        vm.prank(alice);
        unlock.reveal(1, SAMPLE_KEY);

        Unlock.Offer memory o = unlock.offerOf(1);
        assertEq(uint8(o.state), uint8(Unlock.State.Revealed));
    }

    function test_RefundOnlyAfterDeadline() public {
        vm.prank(alice);
        unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 1 ether, 3600, "Secret File");

        vm.prank(bob);
        unlock.buy{value: 1 ether}(1);

        // Before deadline: refund reverts NotLate
        vm.prank(bob);
        vm.expectRevert(Unlock.NotLate.selector);
        unlock.refund(1);

        // At exact deadline: still NotLate
        vm.warp(block.timestamp + 3600);
        vm.prank(bob);
        vm.expectRevert(Unlock.NotLate.selector);
        unlock.refund(1);

        // 1 second after deadline: refund succeeds
        vm.warp(block.timestamp + 1);
        vm.prank(bob);
        unlock.refund(1);

        Unlock.Offer memory o = unlock.offerOf(1);
        assertEq(uint8(o.state), uint8(Unlock.State.Refunded));
        assertEq(unlock.pending(bob), 1 ether);

        // Bob withdraws refund
        uint256 bobBalBefore = bob.balance;
        vm.prank(bob);
        unlock.withdraw();
        assertEq(bob.balance, bobBalBefore + 1 ether);
    }

    function test_NonSellerRevealReverts() public {
        vm.prank(alice);
        unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 1 ether, 3600, "Secret File");

        vm.prank(bob);
        unlock.buy{value: 1 ether}(1);

        // Bob or Charlie cannot reveal
        vm.prank(bob);
        vm.expectRevert(Unlock.NotSeller.selector);
        unlock.reveal(1, SAMPLE_KEY);

        vm.prank(charlie);
        vm.expectRevert(Unlock.NotSeller.selector);
        unlock.reveal(1, SAMPLE_KEY);
    }

    function test_RevealWhenNotPaidReverts() public {
        vm.prank(alice);
        unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 1 ether, 3600, "Secret File");

        // Open state
        vm.prank(alice);
        vm.expectRevert(Unlock.NotPaid.selector);
        unlock.reveal(1, SAMPLE_KEY);

        // Cancelled state
        vm.prank(alice);
        unlock.cancel(1);

        vm.prank(alice);
        vm.expectRevert(Unlock.NotPaid.selector);
        unlock.reveal(1, SAMPLE_KEY);
    }

    function test_RefundWhenNotPaidReverts() public {
        vm.prank(alice);
        unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 1 ether, 3600, "Secret File");

        // Open state
        vm.prank(bob);
        vm.expectRevert(Unlock.NotPaid.selector);
        unlock.refund(1);

        // Bob buys, Alice reveals -> Revealed state
        vm.prank(bob);
        unlock.buy{value: 1 ether}(1);

        vm.prank(alice);
        unlock.reveal(1, SAMPLE_KEY);

        vm.warp(block.timestamp + 3601);
        vm.prank(bob);
        vm.expectRevert(Unlock.NotPaid.selector);
        unlock.refund(1);
    }

    function test_RefundOnlyByBuyer() public {
        vm.prank(alice);
        unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 1 ether, 3600, "Secret File");

        vm.prank(bob);
        unlock.buy{value: 1 ether}(1);

        vm.warp(block.timestamp + 3601);

        // Alice or Charlie cannot refund
        vm.prank(alice);
        vm.expectRevert(Unlock.NotBuyer.selector);
        unlock.refund(1);

        vm.prank(charlie);
        vm.expectRevert(Unlock.NotBuyer.selector);
        unlock.refund(1);
    }

    function test_ExactPaymentOnly() public {
        vm.prank(alice);
        unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 1 ether, 3600, "Secret File");

        // Underpayment
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Unlock.WrongPayment.selector, uint128(1 ether)));
        unlock.buy{value: 0.9 ether}(1);

        // Overpayment
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Unlock.WrongPayment.selector, uint128(1 ether)));
        unlock.buy{value: 1.1 ether}(1);
    }

    function test_SellerCannotBuy() public {
        vm.prank(alice);
        unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 1 ether, 3600, "Secret File");

        vm.prank(alice);
        vm.expectRevert(Unlock.SellerCannotBuy.selector);
        unlock.buy{value: 1 ether}(1);
    }

    function test_OnlyOneBuyer() public {
        vm.prank(alice);
        unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 1 ether, 3600, "Secret File");

        vm.prank(bob);
        unlock.buy{value: 1 ether}(1);

        // Charlie cannot buy paid offer
        vm.prank(charlie);
        vm.expectRevert(Unlock.NotOpen.selector);
        unlock.buy{value: 1 ether}(1);
    }

    function test_CancelOnlyWhenOpen() public {
        vm.prank(alice);
        unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 1 ether, 3600, "Secret File");

        // Cancel succeeds when open
        vm.prank(alice);
        unlock.cancel(1);

        Unlock.Offer memory o = unlock.offerOf(1);
        assertEq(uint8(o.state), uint8(Unlock.State.Cancelled));

        // Cannot buy cancelled offer
        vm.prank(bob);
        vm.expectRevert(Unlock.NotOpen.selector);
        unlock.buy{value: 1 ether}(1);

        // Cannot cancel again
        vm.prank(alice);
        vm.expectRevert(Unlock.NotOpen.selector);
        unlock.cancel(1);
    }

    function test_NonSellerCancelReverts() public {
        vm.prank(alice);
        unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 1 ether, 3600, "Secret File");

        vm.prank(bob);
        vm.expectRevert(Unlock.NotSeller.selector);
        unlock.cancel(1);
    }

    function test_CannotCancelOncePaid() public {
        vm.prank(alice);
        unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 1 ether, 3600, "Secret File");

        vm.prank(bob);
        unlock.buy{value: 1 ether}(1);

        vm.prank(alice);
        vm.expectRevert(Unlock.NotOpen.selector);
        unlock.cancel(1);
    }

    function test_DoubleWithdrawReverts() public {
        vm.prank(alice);
        unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 1 ether, 3600, "Secret File");

        vm.prank(bob);
        unlock.buy{value: 1 ether}(1);

        vm.prank(alice);
        unlock.reveal(1, SAMPLE_KEY);

        vm.prank(alice);
        unlock.withdraw();

        vm.prank(alice);
        vm.expectRevert(Unlock.NothingToWithdraw.selector);
        unlock.withdraw();
    }

    function test_ReentrantWithdrawBlocked() public {
        MaliciousRecipient attacker = new MaliciousRecipient(unlock);

        // List and buy so attacker has pending balance
        vm.prank(address(attacker));
        unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 1 ether, 3600, "Attacker Offer");

        vm.prank(bob);
        unlock.buy{value: 1 ether}(1);

        vm.prank(address(attacker));
        unlock.reveal(1, SAMPLE_KEY);

        assertEq(unlock.pending(address(attacker)), 1 ether);

        attacker.attack();
        assertEq(unlock.pending(address(attacker)), 0);
    }

    function test_KeyHashOffChainVector() public {
        bytes32 knownKey = bytes32(hex"0000000000000000000000000000000000000000000000000000000000000001");
        bytes32 expectedHash = keccak256(abi.encodePacked(knownKey));
        assertEq(unlock.keyHashOf(knownKey), expectedHash);
    }

    function test_ZeroPriceReverts() public {
        vm.prank(alice);
        vm.expectRevert(Unlock.ZeroPrice.selector);
        unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 0, 3600, "Free File");
    }

    function test_MinWindowBoundary() public {
        // Less than 1 hour reverts
        vm.prank(alice);
        vm.expectRevert(Unlock.BadWindow.selector);
        unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 1 ether, 3599, "Fast File");

        // Exactly 1 hour succeeds
        vm.prank(alice);
        uint256 id = unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 1 ether, 3600, "Exact 1h File");
        assertEq(id, 1);
    }

    function test_MaxWindowBoundary() public {
        // More than 7 days reverts
        vm.prank(alice);
        vm.expectRevert(Unlock.BadWindow.selector);
        unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 1 ether, 604801, "Slow File");

        // Exactly 7 days succeeds
        vm.prank(alice);
        uint256 id = unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 1 ether, 604800, "Exact 7d File");
        assertEq(id, 1);
    }

    function test_ZeroHashReverts() public {
        vm.prank(alice);
        vm.expectRevert(Unlock.ZeroHash.selector);
        unlock.list(bytes32(0), sampleKeyHash, 1 ether, 3600, "Zero Blob");

        vm.prank(alice);
        vm.expectRevert(Unlock.ZeroHash.selector);
        unlock.list(SAMPLE_BLOB_HASH, bytes32(0), 1 ether, 3600, "Zero Key");
    }

    function test_BadLabelBoundary() public {
        vm.prank(alice);
        vm.expectRevert(Unlock.BadLabel.selector);
        unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 1 ether, 3600, "");

        // 64 bytes is fine
        string memory label64 = "1234567890123456789012345678901234567890123456789012345678901234";
        vm.prank(alice);
        uint256 id = unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 1 ether, 3600, label64);
        assertEq(id, 1);

        // 65 bytes reverts
        string memory label65 = "12345678901234567890123456789012345678901234567890123456789012345";
        vm.prank(alice);
        vm.expectRevert(Unlock.BadLabel.selector);
        unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 1 ether, 3600, label65);
    }

    function test_NotFoundReverts() public {
        vm.expectRevert(Unlock.NotFound.selector);
        unlock.offerOf(999);

        vm.expectRevert(Unlock.NotFound.selector);
        unlock.buy{value: 1 ether}(999);

        vm.expectRevert(Unlock.NotFound.selector);
        unlock.reveal(999, SAMPLE_KEY);

        vm.expectRevert(Unlock.NotFound.selector);
        unlock.refund(999);

        vm.expectRevert(Unlock.NotFound.selector);
        unlock.cancel(999);
    }

    function test_LatestPagination() public {
        for (uint256 i = 1; i <= 5; i++) {
            vm.prank(alice);
            unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, uint128(i * 1 ether), 3600, "Offer");
        }

        // Get 3 newest (IDs 5, 4, 3)
        Unlock.Offer[] memory res = unlock.latest(0, 3);
        assertEq(res.length, 3);
        assertEq(res[0].price, 5 ether);
        assertEq(res[1].price, 4 ether);
        assertEq(res[2].price, 3 ether);

        // Offset 3 count 2 (IDs 2, 1)
        res = unlock.latest(3, 2);
        assertEq(res.length, 2);
        assertEq(res[0].price, 2 ether);
        assertEq(res[1].price, 1 ether);

        // Offset 3 count 10 (remaining is 2, requesting 10)
        res = unlock.latest(3, 10);
        assertEq(res.length, 2);
        assertEq(res[0].price, 2 ether);
        assertEq(res[1].price, 1 ether);

        // Offset beyond count
        res = unlock.latest(10, 5);
        assertEq(res.length, 0);
    }

    function test_BySeller() public {
        vm.prank(alice);
        unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 1 ether, 3600, "Alice 1");
        vm.prank(bob);
        unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 2 ether, 3600, "Bob 1");
        vm.prank(alice);
        unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 3 ether, 3600, "Alice 2");

        uint256[] memory aliceOffers = unlock.bySeller(alice);
        assertEq(aliceOffers.length, 2);
        assertEq(aliceOffers[0], 1);
        assertEq(aliceOffers[1], 3);

        uint256[] memory bobOffers = unlock.bySeller(bob);
        assertEq(bobOffers.length, 1);
        assertEq(bobOffers[0], 2);
    }

    function testFuzz_EscrowConservation(uint128 price, uint64 window) public {
        vm.assume(price > 0 && price < 1000 ether);
        vm.assume(window >= 3600 && window <= 604800);

        vm.deal(bob, price);

        vm.prank(alice);
        uint256 id = unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, price, window, "Fuzz Offer");

        vm.prank(bob);
        unlock.buy{value: price}(id);

        assertEq(address(unlock).balance, price);

        // 50% chance reveal, 50% chance refund
        if (price % 2 == 0) {
            vm.prank(alice);
            unlock.reveal(id, SAMPLE_KEY);
            assertEq(unlock.pending(alice), price);
            assertEq(address(unlock).balance, price);

            vm.prank(alice);
            unlock.withdraw();
            assertEq(address(unlock).balance, 0);
        } else {
            vm.warp(block.timestamp + window + 1);
            vm.prank(bob);
            unlock.refund(id);
            assertEq(unlock.pending(bob), price);
            assertEq(address(unlock).balance, price);

            vm.prank(bob);
            unlock.withdraw();
            assertEq(address(unlock).balance, 0);
        }
    }

    function testFuzz_NoStateChangeOnWrongKey(bytes32 randomKey) public {
        vm.assume(randomKey != SAMPLE_KEY);

        vm.prank(alice);
        uint256 id = unlock.list(SAMPLE_BLOB_HASH, sampleKeyHash, 1 ether, 3600, "Immutable Offer");

        vm.prank(bob);
        unlock.buy{value: 1 ether}(id);

        vm.prank(alice);
        vm.expectRevert(Unlock.WrongKey.selector);
        unlock.reveal(id, randomKey);

        Unlock.Offer memory o = unlock.offerOf(id);
        assertEq(uint8(o.state), uint8(Unlock.State.Paid));
        assertEq(o.key, bytes32(0));
        assertEq(unlock.pending(alice), 0);
    }
}
