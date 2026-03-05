import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.CashbackStrategy as Program;
  const mint = new PublicKey(process.env.CASHBACK_MINT as string);

  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
  const [stakingAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("staking_authority")],
    program.programId,
  );
  const [treasuryAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury_authority")],
    program.programId,
  );

  const stakingVault = getAssociatedTokenAddressSync(mint, stakingAuthority, true);
  const treasuryVault = getAssociatedTokenAddressSync(mint, treasuryAuthority, true);

  const sig = await program.methods
    .initializeTreasury({
      minHoldAmount: new BN(1_000_000),
      claimCooldownSecs: new BN(86_400),
      kFactorCap: new BN(10_000_000_000),
      cashbackPeriodSecs: new BN(86_400),
      tierDurations: [new BN(7 * 86_400), new BN(30 * 86_400), new BN(90 * 86_400), new BN(180 * 86_400)],
      tierBps: [50, 100, 200, 300],
    })
    .accounts({
      admin: provider.wallet.publicKey,
      mint,
      config,
      stakingAuthority,
      treasuryAuthority,
      stakingVault,
      treasuryVault,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("Initialized treasury:", sig);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
