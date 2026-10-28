// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../src/Unlock.sol";

contract UnlockHandler is Test {
    Unlock public unlock;

    address[] public actors;
    uint256[] public createdIds;

    mapping(uint256 => bytes32) public correctKeys;

    constructor(Unlock _unlock) {
        unlock = _unlock;
        actors.push(address(0x1111));
        actors.push(address(0x2222));
        actors.push(address(0x3333));
        actors.push(address(0x4444));

        for (uint256 i = 0; i < actors.length; i++) {
            vm.deal(actors[i], 1000 ether);
        }
    }

    function list(uint256 actorSeed, uint128 price, uint64 window, bytes32 key) external returns (uint256 id) {
        address seller = actors[actorSeed % actors.length];
        price = uint128(bound(price, 0.01 ether, 50 ether));
        window = uint64(bound(window, 3600, 604800));
        if (key == bytes32(0)) key = bytes32(hex"1234");

        bytes32 keyHash = unlock.keyHashOf(key);
        bytes32 blobHash = keccak256(abi.encodePacked(key, "blob"));

        vm.prank(seller);
        id = unlock.list(blobHash, keyHash, price, window, "Dataset");
        createdIds.push(id);
        correctKeys[id] = key;
    }

    function buy(uint256 actorSeed, uint256 idSeed) external {
        if (createdIds.length == 0) return;
        uint256 id = createdIds[idSeed % createdIds.length];

        Unlock.Offer memory o;
        try unlock.offerOf(id) returns (Unlock.Offer memory _o) {
            o = _o;
        } catch {
            return;
        }

        if (o.state != Unlock.State.Open) return;

        address buyer = actors[actorSeed % actors.length];
        if (buyer == o.seller) {
            // Pick a different actor
            buyer = actors[(actorSeed + 1) % actors.length];
        }

        vm.prank(buyer);
        try unlock.buy{value: o.price}(id) {} catch {}
    }

    function reveal(uint256 idSeed, bool useCorrectKey) external {
        if (createdIds.length == 0) return;
        uint256 id = createdIds[idSeed % createdIds.length];

        Unlock.Offer memory o;
        try unlock.offerOf(id) returns (Unlock.Offer memory _o) {
            o = _o;
        } catch {
            return;
        }

        if (o.state != Unlock.State.Paid) return;
        if (block.timestamp > o.deadline) return;

        bytes32 keyToUse = useCorrectKey ? correctKeys[id] : bytes32(hex"deadbeef");

        vm.prank(o.seller);
        try unlock.reveal(id, keyToUse) {} catch {}
    }

    function refund(uint256 idSeed) external {
        if (createdIds.length == 0) return;
        uint256 id = createdIds[idSeed % createdIds.length];

        Unlock.Offer memory o;
        try unlock.offerOf(id) returns (Unlock.Offer memory _o) {
            o = _o;
        } catch {
            return;
        }

        if (o.state != Unlock.State.Paid) return;

        // Warp past deadline to exercise refund
        if (block.timestamp <= o.deadline) {
            vm.warp(o.deadline + 1);
        }

        vm.prank(o.buyer);
        try unlock.refund(id) {} catch {}
    }

    function cancel(uint256 idSeed) external {
        if (createdIds.length == 0) return;
        uint256 id = createdIds[idSeed % createdIds.length];

        Unlock.Offer memory o;
        try unlock.offerOf(id) returns (Unlock.Offer memory _o) {
            o = _o;
        } catch {
            return;
        }

        if (o.state != Unlock.State.Open) return;

        vm.prank(o.seller);
        try unlock.cancel(id) {} catch {}
    }

    function withdraw(uint256 actorSeed) external {
        address user = actors[actorSeed % actors.length];
        if (unlock.pending(user) == 0) return;

        vm.prank(user);
        try unlock.withdraw() {} catch {}
    }

    function getCreatedIds() external view returns (uint256[] memory) {
        return createdIds;
    }

    function getActors() external view returns (address[] memory) {
        return actors;
    }
}

contract UnlockInvariantTest is Test {
    Unlock public unlock;
    UnlockHandler public handler;

    function setUp() public {
        unlock = new Unlock();
        handler = new UnlockHandler(unlock);

        targetContract(address(handler));
    }

    function invariant_BalanceConservation() public view {
        uint256 expectedBalance = 0;

        // Sum pending balances across all handler actors
        address[] memory actors = handler.getActors();
        for (uint256 i = 0; i < actors.length; i++) {
            expectedBalance += unlock.pending(actors[i]);
        }

        // Sum escrowed price of all Paid offers
        uint256 total = unlock.offerCount();
        for (uint256 id = 1; id <= total; id++) {
            Unlock.Offer memory o = unlock.offerOf(id);
            if (o.state == Unlock.State.Paid) {
                expectedBalance += o.price;
            }
        }

        assertEq(address(unlock).balance, expectedBalance);
    }

    function invariant_RevealedKeyMatchesHash() public view {
        uint256 total = unlock.offerCount();
        for (uint256 id = 1; id <= total; id++) {
            Unlock.Offer memory o = unlock.offerOf(id);
            if (o.state == Unlock.State.Revealed) {
                assertEq(unlock.keyHashOf(o.key), o.keyHash);
                assertTrue(o.key != bytes32(0));
            }
        }
    }

    function invariant_StateTransitionsConsistent() public view {
        uint256 total = unlock.offerCount();
        for (uint256 id = 1; id <= total; id++) {
            Unlock.Offer memory o = unlock.offerOf(id);
            if (o.state == Unlock.State.Open || o.state == Unlock.State.Cancelled) {
                assertEq(o.buyer, address(0));
                assertEq(o.deadline, 0);
            } else {
                assertTrue(o.buyer != address(0));
                assertTrue(o.deadline > 0);
            }
        }
    }
}
