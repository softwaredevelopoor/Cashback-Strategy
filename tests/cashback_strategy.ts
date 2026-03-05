import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { assert } from "chai";
import {
  createMint,
  createAssociatedTokenAccount,
  getAccount,
  getAssociatedTokenAddressSync,
  mintTo,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

describe("cashback_strategy", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.CashbackStrategy as Program;

  let mint: PublicKey;
  let user: Keypair;
  let userAta: PublicKey;
  let adminAta: PublicKey;

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId,
  );
  const holderPdaFor = (owner: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("holder"), owner.toBuffer()], program.programId);

  const [stakingAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("staking_authority")],
    program.programId,
  );
  const [treasuryAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury_authority")],
    program.programId,
  );

  const sleep = async (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });

  before(async () => {
    user = Keypair.generate();

    const sig = await provider.connection.requestAirdrop(user.publicKey, 3 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig, "confirmed");

    mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      null,
      6,
    );

    userAta = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      user.publicKey,
    );

    adminAta = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      provider.wallet.publicKey,
    );

    await mintTo(
      provider.connection,
      provider.wallet.payer,
      mint,
      userAta,
      provider.wallet.payer,
      1_000_000_000,
    );

    await mintTo(
      provider.connection,
      provider.wallet.payer,
      mint,
      adminAta,
      provider.wallet.payer,
      5_000_000_000,
    );
  });

  it("initializes treasury and registers holder", async () => {
    const stakingVault = getAssociatedTokenAddressSync(mint, stakingAuthority, true);
    const treasuryVault = getAssociatedTokenAddressSync(mint, treasuryAuthority, true);

    await program.methods
      .initializeTreasury({
        minHoldAmount: new BN(100_000),
        claimCooldownSecs: new BN(3),
        kFactorCap: new BN(500_000_000),
        cashbackPeriodSecs: new BN(10),
        tierDurations: [new BN(2), new BN(5), new BN(8), new BN(12)],
        tierBps: [100, 200, 400, 600],
      })
      .accounts({
        admin: provider.wallet.publicKey,
        mint,
        config: configPda,
        stakingAuthority,
        treasuryAuthority,
        stakingVault,
        treasuryVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const [holderPda] = holderPdaFor(user.publicKey);

    await program.methods
      .registerHolder()
      .accounts({
        owner: user.publicKey,
        config: configPda,
        holder: holderPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const holder = await program.account.holder.fetch(holderPda);
    assert.equal(holder.owner.toBase58(), user.publicKey.toBase58());
    assert.equal(holder.stakedAmount.toNumber(), 0);
  });

  it("stakes, progresses tier, funds treasury, and claims cashback", async () => {
    const [holderPda] = holderPdaFor(user.publicKey);
    const stakingVault = getAssociatedTokenAddressSync(mint, stakingAuthority, true);
    const treasuryVault = getAssociatedTokenAddressSync(mint, treasuryAuthority, true);

    await program.methods
      .stakeTokens(new BN(500_000))
      .accounts({
        owner: user.publicKey,
        config: configPda,
        holder: holderPda,
        ownerTokenAccount: userAta,
        stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    await sleep(5500);

    await program.methods
      .updateHolderState()
      .accounts({
        owner: user.publicKey,
        config: configPda,
        holder: holderPda,
      })
      .signers([user])
      .rpc();

    const holderAfterUpdate = await program.account.holder.fetch(holderPda);
    assert.isAtLeast(holderAfterUpdate.tierIndex, 1);

    await program.methods
      .fundTreasury(new BN(1_000_000))
      .accounts({
        admin: provider.wallet.publicKey,
        config: configPda,
        adminTokenAccount: adminAta,
        treasuryVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const balanceBefore = Number((await getAccount(provider.connection, userAta)).amount);
    await sleep(3500);

    await program.methods
      .claimCashback()
      .accounts({
        owner: user.publicKey,
        config: configPda,
        holder: holderPda,
        treasuryAuthority,
        treasuryVault,
        ownerTokenAccount: userAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    const balanceAfter = Number((await getAccount(provider.connection, userAta)).amount);
    assert.isAbove(balanceAfter, balanceBefore);
  });

  it("unstake resets accrual and keeps treasury funded", async () => {
    const [holderPda] = holderPdaFor(user.publicKey);
    const stakingVault = getAssociatedTokenAddressSync(mint, stakingAuthority, true);
    const treasuryVault = getAssociatedTokenAddressSync(mint, treasuryAuthority, true);

    const holderBefore = await program.account.holder.fetch(holderPda);

    await program.methods
      .unstakeTokens(new BN(100_000))
      .accounts({
        owner: user.publicKey,
        config: configPda,
        holder: holderPda,
        stakingAuthority,
        stakingVault,
        ownerTokenAccount: userAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    const holderAfter = await program.account.holder.fetch(holderPda);
    assert.equal(holderAfter.tierIndex, 0);
    assert.isAtMost(
      holderAfter.accrualStartTs.toNumber() - holderBefore.accrualStartTs.toNumber(),
      60,
    );

    const treasuryAccount = await getAccount(provider.connection, treasuryVault);
    assert.isAbove(Number(treasuryAccount.amount), 0);
  });
});
