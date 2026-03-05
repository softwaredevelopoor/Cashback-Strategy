import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? "Fg6PaFpoGXkYsidMpWxTWqkY6W2BeZ7FEfcYkgMQ2N2P",
);

export const deriveConfigPda = () =>
  PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID)[0];

export const deriveHolderPda = (owner: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("holder"), owner.toBuffer()], PROGRAM_ID)[0];

export const deriveStakingAuthority = () =>
  PublicKey.findProgramAddressSync([Buffer.from("staking_authority")], PROGRAM_ID)[0];

export const deriveTreasuryAuthority = () =>
  PublicKey.findProgramAddressSync([Buffer.from("treasury_authority")], PROGRAM_ID)[0];

export const formatDuration = (seconds: number): string => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days}d ${hours}h`;
};
