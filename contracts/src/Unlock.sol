// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/**
 * @title Unlock
 * @notice Fair exchange of a file for BOT, enforced by the chain.
 * The seller lists an encrypted file's sha256 (blobHash) and the keccak256 of the random AES key (keyHash).
 * A buyer pays the price into escrow. The seller reveals the key before the deadline.
 * If the seller reveals in time, the payment is released to the seller and the buyer decrypts the file.
 * If the seller fails to reveal before the deadline, the buyer receives a full refund.
 */
contract Unlock {
    enum State {
        Open,
        Paid,
        Revealed,
        Refunded,
        Cancelled
    }

    struct Offer {
        address seller;
        address buyer; // address(0) until bought
        uint128 price; // wei, > 0
        uint64 revealWindow; // seconds seller has after payment (1 hour .. 7 days)
        uint64 deadline; // set at purchase: block.timestamp + revealWindow
        State state;
        bytes32 blobHash; // sha256 of encrypted file
        bytes32 keyHash; // keccak256(abi.encodePacked(key))
        bytes32 key; // bytes32(0) until revealed
        string label; // <= 64 bytes
    }

    uint64 public constant MIN_WINDOW = 3600; // 1 hour
    uint64 public constant MAX_WINDOW = 604800; // 7 days
    uint256 public constant MAX_LABEL = 64;

    mapping(uint256 => Offer) private _offers;
    mapping(address => uint256[]) private _sellerOffers;
    mapping(address => uint256) public pending;
    uint256 public offerCount; // ids start at 1

    uint256 private _reentrancyStatus;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    event Listed(
        uint256 indexed id,
        address indexed seller,
        uint128 price,
        uint64 revealWindow,
        bytes32 blobHash,
        bytes32 keyHash,
        string label
    );
    event Bought(uint256 indexed id, address indexed buyer, uint64 deadline);
    event Revealed(uint256 indexed id, bytes32 key);
    event Refunded(uint256 indexed id);
    event Cancelled(uint256 indexed id);
    event Withdrawn(address indexed to, uint256 amount);

    error ZeroPrice();
    error BadWindow();
    error ZeroHash();
    error BadLabel();
    error NotFound();
    error NotOpen();
    error SellerCannotBuy();
    error WrongPayment(uint128 requiredPrice);
    error NotSeller();
    error NotPaid();
    error TooLate();
    error WrongKey();
    error NotBuyer();
    error NotLate();
    error NothingToWithdraw();
    error TransferFailed();

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "REENTRANCY");
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    constructor() {
        _reentrancyStatus = _NOT_ENTERED;
    }

    /**
     * @notice List a new encrypted file offer.
     */
    function list(
        bytes32 blobHash,
        bytes32 keyHash,
        uint128 price,
        uint64 revealWindow,
        string calldata label
    ) external returns (uint256 id) {
        if (price == 0) revert ZeroPrice();
        if (revealWindow < MIN_WINDOW || revealWindow > MAX_WINDOW) revert BadWindow();
        if (blobHash == bytes32(0) || keyHash == bytes32(0)) revert ZeroHash();
        if (bytes(label).length == 0 || bytes(label).length > MAX_LABEL) revert BadLabel();

        id = ++offerCount;
        _offers[id] = Offer({
            seller: msg.sender,
            buyer: address(0),
            price: price,
            revealWindow: revealWindow,
            deadline: 0,
            state: State.Open,
            blobHash: blobHash,
            keyHash: keyHash,
            key: bytes32(0),
            label: label
        });
        _sellerOffers[msg.sender].push(id);

        emit Listed(id, msg.sender, price, revealWindow, blobHash, keyHash, label);
    }

    /**
     * @notice Pay for an open offer into escrow.
     */
    function buy(uint256 id) external payable {
        Offer storage o = _offers[id];
        if (o.seller == address(0)) revert NotFound();
        if (o.state != State.Open) revert NotOpen();
        if (msg.sender == o.seller) revert SellerCannotBuy();
        if (msg.value != o.price) revert WrongPayment(o.price);

        o.buyer = msg.sender;
        o.deadline = uint64(block.timestamp) + o.revealWindow;
        o.state = State.Paid;

        emit Bought(id, msg.sender, o.deadline);
    }

    /**
     * @notice Seller reveals the encryption key to claim escrow funds.
     */
    function reveal(uint256 id, bytes32 key) external {
        Offer storage o = _offers[id];
        if (o.seller == address(0)) revert NotFound();
        if (msg.sender != o.seller) revert NotSeller();
        if (o.state != State.Paid) revert NotPaid();
        if (block.timestamp > o.deadline) revert TooLate();
        if (keccak256(abi.encodePacked(key)) != o.keyHash) revert WrongKey();

        o.key = key;
        o.state = State.Revealed;
        pending[o.seller] += o.price;

        emit Revealed(id, key);
    }

    /**
     * @notice Buyer claims full refund if seller failed to reveal before deadline.
     */
    function refund(uint256 id) external {
        Offer storage o = _offers[id];
        if (o.seller == address(0)) revert NotFound();
        if (o.state != State.Paid) revert NotPaid();
        if (msg.sender != o.buyer) revert NotBuyer();
        if (block.timestamp <= o.deadline) revert NotLate();

        o.state = State.Refunded;
        pending[o.buyer] += o.price;

        emit Refunded(id);
    }

    /**
     * @notice Seller cancels an offer before any purchase.
     */
    function cancel(uint256 id) external {
        Offer storage o = _offers[id];
        if (o.seller == address(0)) revert NotFound();
        if (msg.sender != o.seller) revert NotSeller();
        if (o.state != State.Open) revert NotOpen();

        o.state = State.Cancelled;

        emit Cancelled(id);
    }

    /**
     * @notice Pull payment withdrawal for seller proceeds and buyer refunds.
     */
    function withdraw() external nonReentrant {
        uint256 amount = pending[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        pending[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice View offer details.
     */
    function offerOf(uint256 id) external view returns (Offer memory) {
        Offer storage o = _offers[id];
        if (o.seller == address(0)) revert NotFound();
        return o;
    }

    /**
     * @notice View list of offer IDs created by a seller.
     */
    function bySeller(address seller) external view returns (uint256[] memory) {
        return _sellerOffers[seller];
    }

    /**
     * @notice Get latest offers with pagination (newest first).
     */
    function latest(uint256 offset, uint256 count) external view returns (Offer[] memory) {
        if (count > 50) count = 50;
        if (offset >= offerCount || count == 0) {
            return new Offer[](0);
        }

        uint256 remaining = offerCount - offset;
        uint256 actualCount = count > remaining ? remaining : count;
        Offer[] memory result = new Offer[](actualCount);

        for (uint256 i = 0; i < actualCount; i++) {
            // Newest offers first: offerCount - offset - i
            uint256 id = offerCount - offset - i;
            result[i] = _offers[id];
        }

        return result;
    }

    /**
     * @notice Compute keyHash from a 32-byte key.
     */
    function keyHashOf(bytes32 key) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(key));
    }
}
