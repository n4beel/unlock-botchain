import { formatEther } from "viem";

/**
 * Decodes contract errors into user-friendly diagnostic messages matching spec §4.
 */
export function decodeContractError(err: unknown): string {
  if (!err) return "An unexpected error occurred.";

  const message = err instanceof Error ? err.message : String(err);

  // User rejection
  if (
    message.includes("User rejected") ||
    message.includes("User denied") ||
    message.includes("declined the request")
  ) {
    return "Transaction was cancelled in your wallet.";
  }

  // Custom errors
  if (message.includes("WrongKey")) {
    return "That key doesn't match the sale.";
  }
  if (message.includes("TooLate")) {
    return "The window closed. The buyer can claim a refund.";
  }
  if (message.includes("WrongPayment")) {
    const match = message.match(/WrongPayment\((\d+)\)/);
    if (match) {
      return `Pay exactly ${formatEther(BigInt(match[1]))} BOT.`;
    }
    return "Payment amount must match the offer price exactly.";
  }
  if (message.includes("NotLate")) {
    return "The deadline has not passed yet. The seller still has time to reveal the key.";
  }
  if (message.includes("SellerCannotBuy")) {
    return "Sellers cannot buy their own offer.";
  }
  if (message.includes("NotOpen")) {
    return "This offer is no longer open for purchase.";
  }
  if (message.includes("NotSeller")) {
    return "Only the seller can perform this action.";
  }
  if (message.includes("NotBuyer")) {
    return "Only the buyer can claim a refund.";
  }
  if (message.includes("NotPaid")) {
    return "This offer is not in Paid state.";
  }
  if (message.includes("ZeroPrice")) {
    return "Price must be greater than zero.";
  }
  if (message.includes("BadWindow")) {
    return "Reveal window must be between 1 hour and 7 days.";
  }
  if (message.includes("ZeroHash")) {
    return "Blob hash and key hash cannot be zero.";
  }
  if (message.includes("BadLabel")) {
    return "Label must be between 1 and 64 bytes.";
  }
  if (message.includes("NotFound")) {
    return "Offer not found.";
  }
  if (message.includes("NothingToWithdraw")) {
    return "No balance available to withdraw.";
  }
  if (message.includes("TransferFailed")) {
    return "BOT transfer failed.";
  }
  if (message.includes("REENTRANCY")) {
    return "Reentrant call detected.";
  }

  return message.length > 120 ? `${message.slice(0, 117)}...` : message;
}
