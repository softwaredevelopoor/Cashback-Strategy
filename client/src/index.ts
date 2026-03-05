import { AnchorProvider, BN, Idl, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, PublicKey, Signer, SystemProgram } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

export type InitializeParams = {
  minHoldAmount: BN;
  claimCooldownSecs: BN;
  kFactorCap: BN;
  cashbackPeriodSecs: BN;
  tierDurations: [BN, BN, BN, BN];
  tierBps: [number, number, number, number];
};

export class CashbackStrategyClient {
  readonly program: Program;
  readonly programId: PublicKey;

  constructor(params: {
    connection: Connection;
    wallet: Wallet;
    idl: Idl;
    programId: PublicKey;
  }) {
    const provider = new AnchorProvider(params.connection, params.wallet, {
      commitment: "confirmed",
    });
    this.program = new Program(params.idl, params.programId, provider);
    this.programId = params.programId;
  }

  static deriveConfigPda(programId: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
  }

  static deriveHolderPda(programId: PublicKey, owner: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("holder"), owner.toBuffer()],
      programId,
    );
  }

  static deriveStakingAuthorityPda(programId: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from("staking_authority")], programId);
  }

  static deriveTreasuryAuthorityPda(programId: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from("treasury_authority")], programId);
  }

  async initializeTreasury(
    admin: Signer,
    mint: PublicKey,
    params: InitializeParams,
  ): Promise<string> {
    const [config] = CashbackStrategyClient.deriveConfigPda(this.programId);
    const [stakingAuthority] = CashbackStrategyClient.deriveStakingAuthorityPda(this.programId);
    const [treasuryAuthority] = CashbackStrategyClient.deriveTreasuryAuthorityPda(this.programId);
    const stakingVault = getAssociatedTokenAddressSync(mint, stakingAuthority, true);
    const treasuryVault = getAssociatedTokenAddressSync(mint, treasuryAuthority, true);

    return this.program.methods
      .initializeTreasury({
        minHoldAmount: params.minHoldAmount,
        claimCooldownSecs: params.claimCooldownSecs,
        kFactorCap: params.kFactorCap,
        cashbackPeriodSecs: params.cashbackPeriodSecs,
        tierDurations: params.tierDurations,
        tierBps: params.tierBps,
      })
      .accounts({
        admin: admin.publicKey,
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
      .signers([admin])
      .rpc();
  }

  async registerHolder(owner: Signer): Promise<string> {
    const [config] = CashbackStrategyClient.deriveConfigPda(this.programId);
    const [holder] = CashbackStrategyClient.deriveHolderPda(this.programId, owner.publicKey);

    return this.program.methods
      .registerHolder()
      .accounts({
        owner: owner.publicKey,
        config,
        holder,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();
  }

  async stakeTokens(owner: Signer, mint: PublicKey, amount: BN): Promise<string> {
    const [config] = CashbackStrategyClient.deriveConfigPda(this.programId);
    const [holder] = CashbackStrategyClient.deriveHolderPda(this.programId, owner.publicKey);
    const [stakingAuthority] = CashbackStrategyClient.deriveStakingAuthorityPda(this.programId);
    const ownerTokenAccount = getAssociatedTokenAddressSync(mint, owner.publicKey);
    const stakingVault = getAssociatedTokenAddressSync(mint, stakingAuthority, true);

    return this.program.methods
      .stakeTokens(amount)
      .accounts({
        owner: owner.publicKey,
        config,
        holder,
        ownerTokenAccount,
        stakingVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([owner])
      .rpc();
  }

  async updateHolderState(owner: Signer): Promise<string> {
    const [config] = CashbackStrategyClient.deriveConfigPda(this.programId);
    const [holder] = CashbackStrategyClient.deriveHolderPda(this.programId, owner.publicKey);

    return this.program.methods
      .updateHolderState()
      .accounts({
        owner: owner.publicKey,
        config,
        holder,
      })
      .signers([owner])
      .rpc();
  }

  async unstakeTokens(owner: Signer, mint: PublicKey, amount: BN): Promise<string> {
    const [config] = CashbackStrategyClient.deriveConfigPda(this.programId);
    const [holder] = CashbackStrategyClient.deriveHolderPda(this.programId, owner.publicKey);
    const [stakingAuthority] = CashbackStrategyClient.deriveStakingAuthorityPda(this.programId);
    const ownerTokenAccount = getAssociatedTokenAddressSync(mint, owner.publicKey);
    const stakingVault = getAssociatedTokenAddressSync(mint, stakingAuthority, true);

    return this.program.methods
      .unstakeTokens(amount)
      .accounts({
        owner: owner.publicKey,
        config,
        holder,
        stakingAuthority,
        stakingVault,
        ownerTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([owner])
      .rpc();
  }

  async claimCashback(owner: Signer, mint: PublicKey): Promise<string> {
    const [config] = CashbackStrategyClient.deriveConfigPda(this.programId);
    const [holder] = CashbackStrategyClient.deriveHolderPda(this.programId, owner.publicKey);
    const [treasuryAuthority] = CashbackStrategyClient.deriveTreasuryAuthorityPda(this.programId);
    const ownerTokenAccount = getAssociatedTokenAddressSync(mint, owner.publicKey);
    const treasuryVault = getAssociatedTokenAddressSync(mint, treasuryAuthority, true);

    return this.program.methods
      .claimCashback()
      .accounts({
        owner: owner.publicKey,
        config,
        holder,
        treasuryAuthority,
        treasuryVault,
        ownerTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([owner])
      .rpc();
  }

  async fundTreasury(admin: Signer, mint: PublicKey, amount: BN): Promise<string> {
    const [config] = CashbackStrategyClient.deriveConfigPda(this.programId);
    const [treasuryAuthority] = CashbackStrategyClient.deriveTreasuryAuthorityPda(this.programId);
    const treasuryVault = getAssociatedTokenAddressSync(mint, treasuryAuthority, true);
    const adminTokenAccount = getAssociatedTokenAddressSync(mint, admin.publicKey);

    return this.program.methods
      .fundTreasury(amount)
      .accounts({
        admin: admin.publicKey,
        config,
        adminTokenAccount,
        treasuryVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([admin])
      .rpc();
  }

  async getHolder(owner: PublicKey): Promise<unknown> {
    const [holder] = CashbackStrategyClient.deriveHolderPda(this.programId, owner);
    return this.program.account.holder.fetchNullable(holder);
  }

  async getTreasuryStatus(): Promise<{
    config: unknown;
    treasuryVault: PublicKey;
    stakingVault: PublicKey;
  }> {
    const [configPda] = CashbackStrategyClient.deriveConfigPda(this.programId);
    const config = (await this.program.account.config.fetch(configPda)) as {
      mint: PublicKey;
    };

    const [treasuryAuthority] = CashbackStrategyClient.deriveTreasuryAuthorityPda(this.programId);
    const [stakingAuthority] = CashbackStrategyClient.deriveStakingAuthorityPda(this.programId);
    const treasuryVault = getAssociatedTokenAddressSync(config.mint, treasuryAuthority, true);
    const stakingVault = getAssociatedTokenAddressSync(config.mint, stakingAuthority, true);

    return { config, treasuryVault, stakingVault };
  }

  static computeTier(
    tierDurations: [number, number, number, number],
    holdingDurationSecs: number,
  ): number {
    let tier = 0;
    for (let i = 0; i < tierDurations.length; i += 1) {
      if (holdingDurationSecs >= tierDurations[i]) {
        tier = i;
      }
    }
    return tier;
  }
}
