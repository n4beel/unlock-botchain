"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { assertActiveChain, checkedWrite, waitSuccess } from "@/lib/useChainWrite";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { type Address, parseEventLogs } from "viem";
import { unlockAbi } from "./botchain/abi";
import { getDeployment, ZERO_ADDRESS } from "./botchain/deployment";
import { activeBotChain } from "./botchain/chain";
import { decodeContractError } from "./errors";
import type { OfferDetails } from "@/components/airlock/OfferChamber";

export function useUnlock() {
  const { address: userAddress, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: activeBotChain.id }); // stable-hook-result
  const { data: walletClient } = useWalletClient();

  const [nowSec, setNowSec] = useState<bigint>(BigInt(Math.floor(Date.now() / 1000)));
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Live timer tick synced with blockchain block timestamp
  useEffect(() => {
    let mounted = true;
    async function syncTime() {
      if (publicClient) {
        try {
          const blk = await publicClient.getBlock();
          if (mounted && blk?.timestamp) {
            setNowSec(blk.timestamp);
            return;
          }
        } catch {
          // ignore error and fallback
        }
      }
      if (mounted) {
        setNowSec(BigInt(Math.floor(Date.now() / 1000)));
      }
    }
    syncTime();
    const tickTimer = setInterval(() => {
      setNowSec((prev) => prev + 1n);
    }, 1000);
    const syncInterval = setInterval(syncTime, 5000);
    return () => {
      mounted = false;
      clearInterval(tickTimer);
      clearInterval(syncInterval);
    };
  }, [publicClient]);

  const contractAddress = useMemo<Address>(() => {
    const envAddr = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as Address | undefined;
    if (envAddr && envAddr !== ZERO_ADDRESS) return envAddr;
    const deployment = getDeployment(activeBotChain.id);
    return deployment?.address ?? ZERO_ADDRESS;
  }, []);

  const isContractDeployed = Boolean(contractAddress && contractAddress !== ZERO_ADDRESS);

  // Fetch count
  const getOfferCount = useCallback(async (): Promise<bigint> => {
    if (!publicClient || !isContractDeployed) return 0n;
    try {
      const count = await publicClient.readContract({
        address: contractAddress,
        abi: unlockAbi,
        functionName: "offerCount",
      });
      return count as bigint;
    } catch {
      return 0n;
    }
  }, [publicClient, isContractDeployed, contractAddress]);

  // Fetch single offer
  const getOffer = useCallback(
    async (id: bigint): Promise<OfferDetails | null> => {
      if (!publicClient || !isContractDeployed || id <= 0n) return null;
      try {
        const raw = await publicClient.readContract({
          address: contractAddress,
          abi: unlockAbi,
          functionName: "offerOf",
          args: [id],
        });
        const o = raw as {
          seller: Address;
          buyer: Address;
          price: bigint;
          revealWindow: bigint;
          deadline: bigint;
          state: number;
          blobHash: `0x${string}`;
          keyHash: `0x${string}`;
          key: `0x${string}`;
          label: string;
        };
        return {
          id,
          seller: o.seller,
          buyer: o.buyer,
          price: o.price,
          revealWindow: o.revealWindow,
          deadline: o.deadline,
          state: o.state,
          blobHash: o.blobHash,
          keyHash: o.keyHash,
          key: o.key,
          label: o.label,
        };
      } catch {
        return null;
      }
    },
    [publicClient, isContractDeployed, contractAddress]
  );

  // Fetch all offers newest first
  const getAllOffers = useCallback(async (): Promise<OfferDetails[]> => {
    if (!publicClient || !isContractDeployed) return [];
    try {
      const count = await getOfferCount();
      if (count === 0n) return [];

      // Query latest up to 50
      const limit = count > 50n ? 50n : count;
      const rawList = await publicClient.readContract({
        address: contractAddress,
        abi: unlockAbi,
        functionName: "latest",
        args: [0n, limit],
      });

      const list = rawList as Array<{
        seller: Address;
        buyer: Address;
        price: bigint;
        revealWindow: bigint;
        deadline: bigint;
        state: number;
        blobHash: `0x${string}`;
        keyHash: `0x${string}`;
        key: `0x${string}`;
        label: string;
      }>;

      // Map with correct 1-indexed descending IDs
      return list.map((o, idx) => ({
        id: count - BigInt(idx),
        seller: o.seller,
        buyer: o.buyer,
        price: o.price,
        revealWindow: o.revealWindow,
        deadline: o.deadline,
        state: o.state,
        blobHash: o.blobHash,
        keyHash: o.keyHash,
        key: o.key,
        label: o.label,
      }));
    } catch {
      return [];
    }
  }, [publicClient, isContractDeployed, contractAddress, getOfferCount]);

  // Fetch pending balance
  const getPendingBalance = useCallback(
    async (account: Address): Promise<bigint> => {
      if (!publicClient || !isContractDeployed || !account) return 0n;
      try {
        const bal = await publicClient.readContract({
          address: contractAddress,
          abi: unlockAbi,
          functionName: "pending",
          args: [account],
        });
        return bal as bigint;
      } catch {
        return 0n;
      }
    },
    [publicClient, isContractDeployed, contractAddress]
  );

  // Actions
  const listOffer = async (
    blobHash: `0x${string}`,
    keyHash: `0x${string}`,
    price: bigint,
    revealWindow: bigint,
    label: string
  ): Promise<bigint> => {
    if (!walletClient || !publicClient || !isContractDeployed) {
      throw new Error("Wallet not connected or contract not deployed");
    }
    setIsBusy(true);
    setError(null);
    try {
      await assertActiveChain(walletClient);
      const hash = await checkedWrite(walletClient, publicClient, {
        address: contractAddress,
        abi: unlockAbi,
        functionName: "list",
        args: [blobHash, keyHash, price, revealWindow, label],
      });
      const receipt = await waitSuccess(publicClient, hash);
      const logs = parseEventLogs({
        abi: unlockAbi,
        eventName: "Listed",
        logs: receipt.logs,
      });
      const createdId = logs[0]?.args?.id ?? 0n;
      return createdId;
    } catch (err: unknown) {
      const msg = decodeContractError(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsBusy(false);
    }
  };

  const buyOffer = async (id: bigint, price: bigint): Promise<void> => {
    if (!walletClient || !publicClient || !isContractDeployed) {
      throw new Error("Wallet not connected");
    }
    setIsBusy(true);
    setError(null);
    try {
      await assertActiveChain(walletClient);
      const hash = await checkedWrite(walletClient, publicClient, {
        address: contractAddress,
        abi: unlockAbi,
        functionName: "buy",
        args: [id],
        value: price,
      });
      await waitSuccess(publicClient, hash);
    } catch (err: unknown) {
      const msg = decodeContractError(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsBusy(false);
    }
  };

  const revealKey = async (id: bigint, key: `0x${string}`): Promise<void> => {
    if (!walletClient || !publicClient || !isContractDeployed) {
      throw new Error("Wallet not connected");
    }
    setIsBusy(true);
    setError(null);
    try {
      await assertActiveChain(walletClient);
      const hash = await checkedWrite(walletClient, publicClient, {
        address: contractAddress,
        abi: unlockAbi,
        functionName: "reveal",
        args: [id, key],
      });
      await waitSuccess(publicClient, hash);
    } catch (err: unknown) {
      const msg = decodeContractError(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsBusy(false);
    }
  };

  const claimRefund = async (id: bigint): Promise<void> => {
    if (!walletClient || !publicClient || !isContractDeployed) {
      throw new Error("Wallet not connected");
    }
    setIsBusy(true);
    setError(null);
    try {
      await assertActiveChain(walletClient);
      const hash = await checkedWrite(walletClient, publicClient, {
        address: contractAddress,
        abi: unlockAbi,
        functionName: "refund",
        args: [id],
      });
      await waitSuccess(publicClient, hash);
    } catch (err: unknown) {
      const msg = decodeContractError(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsBusy(false);
    }
  };

  const cancelOffer = async (id: bigint): Promise<void> => {
    if (!walletClient || !publicClient || !isContractDeployed) {
      throw new Error("Wallet not connected");
    }
    setIsBusy(true);
    setError(null);
    try {
      await assertActiveChain(walletClient);
      const hash = await checkedWrite(walletClient, publicClient, {
        address: contractAddress,
        abi: unlockAbi,
        functionName: "cancel",
        args: [id],
      });
      await waitSuccess(publicClient, hash);
    } catch (err: unknown) {
      const msg = decodeContractError(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsBusy(false);
    }
  };

  const withdrawTill = async (): Promise<void> => {
    if (!walletClient || !publicClient || !isContractDeployed) {
      throw new Error("Wallet not connected");
    }
    setIsBusy(true);
    setError(null);
    try {
      await assertActiveChain(walletClient);
      const hash = await checkedWrite(walletClient, publicClient, {
        address: contractAddress,
        abi: unlockAbi,
        functionName: "withdraw",
      });
      await waitSuccess(publicClient, hash);
    } catch (err: unknown) {
      const msg = decodeContractError(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsBusy(false);
    }
  };

  return {
    contractAddress,
    isContractDeployed,
    userAddress,
    isConnected,
    nowSec,
    isBusy,
    error,
    setError,
    getOfferCount,
    getOffer,
    getAllOffers,
    getPendingBalance,
    listOffer,
    buyOffer,
    revealKey,
    claimRefund,
    cancelOffer,
    withdrawTill,
  };
}
