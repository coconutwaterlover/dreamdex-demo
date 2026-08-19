// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IArenaScores {
    function deskScoreOf(address owner) external view returns (int256);
    function contributorScoreOf(address voter) external view returns (int256);
}

/**
 * @title ArenaBadge
 * @notice Soulbound ERC-721 for the DreamDesk Arena. Deployed twice: once for desk
 * owners, once for contributors.
 *
 * The badge never stores a score. `scoreOf` reads straight through to the arena, so a
 * round that moves every leaderboard costs zero token writes — the only write this
 * contract ever does is the mint, and that happens inside the holder's own
 * createDesk / vote transaction.
 */
contract ArenaBadge {
    enum Kind {
        Desk,
        Contributor
    }

    string public name;
    string public symbol;
    Kind public immutable kind;
    IArenaScores public immutable arena;
    address public immutable admin;

    string public baseURI;
    uint256 public totalSupply;

    mapping(uint256 => address) private _ownerOf;
    mapping(address => uint256) public tokenOf;
    mapping(uint256 => string) public handleOf;
    mapping(uint256 => uint64) public mintedAt;
    address[] public holders;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    error OnlyArena();
    error OnlyAdmin();
    error Soulbound();
    error AlreadyMinted();
    error NotMinted();
    error ZeroAddress();
    error BadHandle();

    constructor(string memory name_, string memory symbol_, Kind kind_, address arena_, address admin_) {
        if (arena_ == address(0) || admin_ == address(0)) revert ZeroAddress();
        name = name_;
        symbol = symbol_;
        kind = kind_;
        arena = IArenaScores(arena_);
        admin = admin_;
    }

    function mint(address to, string calldata handle) external returns (uint256 tokenId) {
        if (msg.sender != address(arena)) revert OnlyArena();
        if (to == address(0)) revert ZeroAddress();
        if (tokenOf[to] != 0) revert AlreadyMinted();
        bytes memory raw = bytes(handle);
        if (raw.length < 3 || raw.length > 24) revert BadHandle();

        tokenId = ++totalSupply;
        _ownerOf[tokenId] = to;
        tokenOf[to] = tokenId;
        handleOf[tokenId] = handle;
        mintedAt[tokenId] = uint64(block.timestamp);
        holders.push(to);
        emit Transfer(address(0), to, tokenId);
    }

    function setBaseURI(string calldata uri) external {
        if (msg.sender != admin) revert OnlyAdmin();
        baseURI = uri;
    }

    // ------------------------------------------------------------------ reads

    function ownerOf(uint256 tokenId) public view returns (address owner) {
        owner = _ownerOf[tokenId];
        if (owner == address(0)) revert NotMinted();
    }

    function balanceOf(address owner) external view returns (uint256) {
        if (owner == address(0)) revert ZeroAddress();
        return tokenOf[owner] == 0 ? 0 : 1;
    }

    /// @notice Live score, read through to the arena at call time.
    function scoreOf(address wallet) public view returns (int256) {
        if (kind == Kind.Desk) return arena.deskScoreOf(wallet);
        return arena.contributorScoreOf(wallet);
    }

    function scoreOfToken(uint256 tokenId) external view returns (int256) {
        return scoreOf(ownerOf(tokenId));
    }

    function holderCount() external view returns (uint256) {
        return holders.length;
    }

    struct BadgeView {
        uint256 tokenId;
        address wallet;
        string handle;
        int256 score;
        uint64 mintedAt;
    }

    function board(uint256 offset, uint256 limit) external view returns (BadgeView[] memory out) {
        uint256 n = holders.length;
        if (offset >= n) return new BadgeView[](0);
        uint256 end = offset + limit;
        if (end > n) end = n;
        out = new BadgeView[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            address w = holders[i];
            uint256 id = tokenOf[w];
            out[i - offset] = BadgeView({
                tokenId: id,
                wallet: w,
                handle: handleOf[id],
                score: scoreOf(w),
                mintedAt: mintedAt[id]
            });
        }
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        ownerOf(tokenId);
        return string.concat(baseURI, _toString(tokenId));
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == 0x01ffc9a7 || // ERC165
            interfaceId == 0x80ac58cd || // ERC721
            interfaceId == 0x5b5e139f; // ERC721Metadata
    }

    // ------------------------------------------------------------------ soulbound

    function transferFrom(address, address, uint256) external pure {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert Soulbound();
    }

    function approve(address, uint256) external pure {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) external pure {
        revert Soulbound();
    }

    function getApproved(uint256) external pure returns (address) {
        return address(0);
    }

    function isApprovedForAll(address, address) external pure returns (bool) {
        return false;
    }

    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
