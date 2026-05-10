// tests/prova.ts
//
// Test suite for:
//   • prova_registry  — all instructions + error paths (no Arcium needed)
//   • prova_executor  — init_execute_transfer_comp_def (Arcium localnet needed)
//
// Run:
//   anchor test --skip-local-validator   (if validator already running)
//   anchor test                          (spins up a fresh localnet)

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import BN from "bn.js"; // tests/prova.ts
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { expect } from "chai";
import * as fs from "fs";
import * as os from "os";
import {
  getArciumEnv,
  getArciumProgram,
  getArciumProgramId,
  getArciumAccountBaseSeed,
  getCompDefAccOffset,
  getMXEAccAddress,
  getLookupTableAddress,
  uploadCircuit,
} from "@arcium-hq/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readKpJson(path: string): Keypair {
  const file = fs.readFileSync(path);
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(file.toString())));
}

/** Derive the registry state PDA */
function registryStatePda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("prova_registry")],
    programId,
  );
}

/** Derive a rule PDA */
function rulePda(
  owner: PublicKey,
  ruleId: Buffer,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("prova_rule"), owner.toBuffer(), ruleId],
    programId,
  );
}

/** Generate a random 32-byte rule ID */
function randomRuleId(): Buffer {
  return Buffer.from(
    Array.from({ length: 32 }, () => Math.floor(Math.random() * 256)),
  );
}

/** Build a full RegisterRuleParams object */
function makeRuleParams(ruleId: Buffer, overrides: Partial<any> = {}): any {
  return {
    ruleId: Array.from(ruleId),
    sourceChain: { ethereum: {} },
    conditionType: { balanceBelow: {} },
    watchAddress: Array.from(Buffer.alloc(20, 1)), // dummy ETH address
    tokenAddress: Array.from(Buffer.alloc(20, 0)), // native ETH
    thresholdWei: Array.from(Buffer.alloc(32, 0).fill(1, 31)), // 1 wei
    actionType: { transferSpl: {} },
    recipient: Keypair.generate().publicKey,
    tokenMint: Keypair.generate().publicKey,
    actionAmount: new BN(1_000_000),
    escrowedFee: new BN(15_000),
    ...overrides,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("prova_registry", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  const registryProgram = anchor.workspace.ProvaRegistry as Program<any>;
  const authority = readKpJson(`${os.homedir()}/.config/solana/id.json`);

  let [registryState] = registryStatePda(registryProgram.programId);

  // ── initialize ─────────────────────────────────────────────────────────────

  it("initializes registry state", async () => {
    try {
      const sig = await registryProgram.methods
        .initialize(100) // 1% protocol fee
        .accounts({
          registryState,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc({ commitment: "confirmed" });
      console.log("initialize sig:", sig);
    } catch (err: any) {
      // Already initialized from a previous run — this is fine on devnet
      if (!err.message?.includes("already in use")) throw err;
      console.log("Registry state already initialized, skipping.");
    }

    const state = await registryProgram.account.registryState.fetch(
      registryState,
    );
    expect(state.authority.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(state.protocolFeeBps).to.equal(100);
    expect(state.paused).to.be.false;
  });

  // ── register_rule ──────────────────────────────────────────────────────────

  it("registers a rule and escrows fee", async () => {
    const ruleId = randomRuleId();
    const [rule] = rulePda(
      authority.publicKey,
      ruleId,
      registryProgram.programId,
    );
    const params = makeRuleParams(ruleId);

    const balBefore = await provider.connection.getBalance(authority.publicKey);

    const sig = await registryProgram.methods
      .registerRule(params)
      .accounts({
        registryState,
        rule,
        owner: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc({ commitment: "confirmed" });

    console.log("registerRule sig:", sig);

    const ruleAcc = await registryProgram.account.rule.fetch(rule);
    expect(ruleAcc.owner.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(ruleAcc.escrowedFee.toNumber()).to.equal(15_000);
    expect(ruleAcc.status).to.deep.equal({ active: {} });

    // Verify fee was escrowed in rule PDA
    const ruleBalance = await provider.connection.getBalance(rule);
    expect(ruleBalance).to.be.gte(15_000);

    // Registry counter incremented
    const state = await registryProgram.account.registryState.fetch(
      registryState,
    );
    expect(state.totalRules.toNumber()).to.equal(1);
  });

  it("rejects register_rule with fee below minimum", async () => {
    const ruleId = randomRuleId();
    const [rule] = rulePda(
      authority.publicKey,
      ruleId,
      registryProgram.programId,
    );
    const params = makeRuleParams(ruleId, { escrowedFee: new BN(100) }); // below 15_000

    try {
      await registryProgram.methods
        .registerRule(params)
        .accounts({
          registryState,
          rule,
          owner: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc({ commitment: "confirmed" });
      expect.fail("Should have thrown FeeTooLow");
    } catch (err: any) {
      expect(err.message).to.include("FeeTooLow");
    }
  });

  it("rejects register_rule with zero threshold", async () => {
    const ruleId = randomRuleId();
    const [rule] = rulePda(
      authority.publicKey,
      ruleId,
      registryProgram.programId,
    );
    const params = makeRuleParams(ruleId, {
      thresholdWei: Array.from(Buffer.alloc(32, 0)), // all zeros
    });

    try {
      await registryProgram.methods
        .registerRule(params)
        .accounts({
          registryState,
          rule,
          owner: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc({ commitment: "confirmed" });
      expect.fail("Should have thrown InvalidThreshold");
    } catch (err: any) {
      expect(err.message).to.include("InvalidThreshold");
    }
  });

  // ── mark_triggered ─────────────────────────────────────────────────────────

  it("marks a rule as triggered", async () => {
    // Register fresh rule
    const ruleId = randomRuleId();
    const [rule] = rulePda(
      authority.publicKey,
      ruleId,
      registryProgram.programId,
    );
    await registryProgram.methods
      .registerRule(makeRuleParams(ruleId))
      .accounts({
        registryState,
        rule,
        owner: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc({ commitment: "confirmed" });

    const monitor = authority; // same keypair for simplicity
    const sig = await registryProgram.methods
      .markTriggered(new BN(12345678))
      .accounts({ rule, monitor: monitor.publicKey })
      .signers([monitor])
      .rpc({ commitment: "confirmed" });

    console.log("markTriggered sig:", sig);

    const ruleAcc = await registryProgram.account.rule.fetch(rule);
    expect(ruleAcc.status).to.deep.equal({ triggered: {} });
  });

  it("rejects mark_triggered on non-active rule", async () => {
    // Register + trigger a rule
    const ruleId = randomRuleId();
    const [rule] = rulePda(
      authority.publicKey,
      ruleId,
      registryProgram.programId,
    );
    await registryProgram.methods
      .registerRule(makeRuleParams(ruleId))
      .accounts({
        registryState,
        rule,
        owner: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc({ commitment: "confirmed" });
    await registryProgram.methods
      .markTriggered(new BN(1))
      .accounts({ rule, monitor: authority.publicKey })
      .signers([authority])
      .rpc({ commitment: "confirmed" });

    // Try to trigger again
    try {
      await registryProgram.methods
        .markTriggered(new BN(2))
        .accounts({ rule, monitor: authority.publicKey })
        .signers([authority])
        .rpc({ commitment: "confirmed" });
      expect.fail("Should have thrown RuleNotActive");
    } catch (err: any) {
      expect(err.message).to.include("RuleNotActive");
    }
  });

  // ── mark_proving ───────────────────────────────────────────────────────────

  it("transitions rule to Proving", async () => {
    const ruleId = randomRuleId();
    const [rule] = rulePda(
      authority.publicKey,
      ruleId,
      registryProgram.programId,
    );
    await registryProgram.methods
      .registerRule(makeRuleParams(ruleId))
      .accounts({
        registryState,
        rule,
        owner: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc({ commitment: "confirmed" });
    await registryProgram.methods
      .markTriggered(new BN(1))
      .accounts({ rule, monitor: authority.publicKey })
      .signers([authority])
      .rpc({ commitment: "confirmed" });

    const sig = await registryProgram.methods
      .markProving()
      .accounts({ rule, monitor: authority.publicKey })
      .signers([authority])
      .rpc({ commitment: "confirmed" });

    console.log("markProving sig:", sig);

    const ruleAcc = await registryProgram.account.rule.fetch(rule);
    expect(ruleAcc.status).to.deep.equal({ proving: {} });
  });

  it("rejects mark_proving on non-triggered rule", async () => {
    const ruleId = randomRuleId();
    const [rule] = rulePda(
      authority.publicKey,
      ruleId,
      registryProgram.programId,
    );
    await registryProgram.methods
      .registerRule(makeRuleParams(ruleId))
      .accounts({
        registryState,
        rule,
        owner: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc({ commitment: "confirmed" });

    try {
      await registryProgram.methods
        .markProving()
        .accounts({ rule, monitor: authority.publicKey })
        .signers([authority])
        .rpc({ commitment: "confirmed" });
      expect.fail("Should have thrown RuleNotTriggered");
    } catch (err: any) {
      expect(err.message).to.include("RuleNotTriggered");
    }
  });

  // ── mark_executed ──────────────────────────────────────────────────────────

  it("marks rule executed and pays executor fee", async () => {
    const executor = Keypair.generate();
    // Fund executor via transfer from authority (avoids devnet airdrop rate limits)
    const fundTx = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: executor.publicKey,
        lamports: LAMPORTS_PER_SOL / 10,
      }),
    );
    await provider.sendAndConfirm(fundTx, [authority]);
    await new Promise((r) => setTimeout(r, 1000));

    const ruleId = randomRuleId();
    const [rule] = rulePda(
      authority.publicKey,
      ruleId,
      registryProgram.programId,
    );
    await registryProgram.methods
      .registerRule(makeRuleParams(ruleId))
      .accounts({
        registryState,
        rule,
        owner: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc({ commitment: "confirmed" });
    await registryProgram.methods
      .markTriggered(new BN(1))
      .accounts({ rule, monitor: authority.publicKey })
      .signers([authority])
      .rpc({ commitment: "confirmed" });
    await registryProgram.methods
      .markProving()
      .accounts({ rule, monitor: authority.publicKey })
      .signers([authority])
      .rpc({ commitment: "confirmed" });

    const execBalBefore = await provider.connection.getBalance(
      executor.publicKey,
    );
    const txSig = Array.from(Buffer.alloc(64, 0xab)); // dummy tx sig

    const sig = await registryProgram.methods
      .markExecuted(txSig)
      .accounts({
        rule,
        executor: executor.publicKey,
        caller: authority.publicKey,
      })
      .signers([authority])
      .rpc({ commitment: "confirmed" });

    console.log("markExecuted sig:", sig);

    const ruleAcc = await registryProgram.account.rule.fetch(rule);
    expect(ruleAcc.status).to.deep.equal({ executed: {} });
    expect(ruleAcc.escrowedFee.toNumber()).to.equal(0);
    expect(ruleAcc.executedAt.toNumber()).to.be.gt(0);

    // Executor received the fee
    const execBalAfter = await provider.connection.getBalance(
      executor.publicKey,
    );
    expect(execBalAfter - execBalBefore).to.equal(15_000);
  });

  // ── cancel_rule ────────────────────────────────────────────────────────────

  it("cancels an active rule and refunds fee to owner", async () => {
    const ruleId = randomRuleId();
    const [rule] = rulePda(
      authority.publicKey,
      ruleId,
      registryProgram.programId,
    );
    await registryProgram.methods
      .registerRule(makeRuleParams(ruleId))
      .accounts({
        registryState,
        rule,
        owner: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc({ commitment: "confirmed" });

    const balBefore = await provider.connection.getBalance(authority.publicKey);

    const sig = await registryProgram.methods
      .cancelRule()
      .accounts({ rule, owner: authority.publicKey })
      .signers([authority])
      .rpc({ commitment: "confirmed" });

    console.log("cancelRule sig:", sig);

    const ruleAcc = await registryProgram.account.rule.fetch(rule);
    expect(ruleAcc.status).to.deep.equal({ cancelled: {} });
    expect(ruleAcc.escrowedFee.toNumber()).to.equal(0);

    const balAfter = await provider.connection.getBalance(authority.publicKey);
    expect(balAfter).to.be.gt(balBefore); // fee returned
  });

  it("rejects cancel_rule from non-owner", async () => {
    const ruleId = randomRuleId();
    const [rule] = rulePda(
      authority.publicKey,
      ruleId,
      registryProgram.programId,
    );
    await registryProgram.methods
      .registerRule(makeRuleParams(ruleId))
      .accounts({
        registryState,
        rule,
        owner: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc({ commitment: "confirmed" });

    const imposter = Keypair.generate();
    // Fund imposter via transfer from authority
    const fundTx2 = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: imposter.publicKey,
        lamports: LAMPORTS_PER_SOL / 10,
      }),
    );
    await provider.sendAndConfirm(fundTx2, [authority]);
    await new Promise((r) => setTimeout(r, 1000));

    try {
      await registryProgram.methods
        .cancelRule()
        .accounts({ rule, owner: imposter.publicKey })
        .signers([imposter])
        .rpc({ commitment: "confirmed" });
      expect.fail("Should have thrown Unauthorized");
    } catch (err: any) {
      expect(err.message).to.include("Unauthorized");
    }
  });

  it("rejects cancel_rule on triggered rule", async () => {
    const ruleId = randomRuleId();
    const [rule] = rulePda(
      authority.publicKey,
      ruleId,
      registryProgram.programId,
    );
    await registryProgram.methods
      .registerRule(makeRuleParams(ruleId))
      .accounts({
        registryState,
        rule,
        owner: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc({ commitment: "confirmed" });
    await registryProgram.methods
      .markTriggered(new BN(1))
      .accounts({ rule, monitor: authority.publicKey })
      .signers([authority])
      .rpc({ commitment: "confirmed" });

    try {
      await registryProgram.methods
        .cancelRule()
        .accounts({ rule, owner: authority.publicKey })
        .signers([authority])
        .rpc({ commitment: "confirmed" });
      expect.fail("Should have thrown RuleNotActive");
    } catch (err: any) {
      expect(err.message).to.include("RuleNotActive");
    }
  });

  // ── set_paused ─────────────────────────────────────────────────────────────

  it("pauses and unpauses the protocol", async () => {
    await registryProgram.methods
      .setPaused(true)
      .accounts({ registryState, authority: authority.publicKey })
      .signers([authority])
      .rpc({ commitment: "confirmed" });

    let state = await registryProgram.account.registryState.fetch(
      registryState,
    );
    expect(state.paused).to.be.true;

    // Registering a rule while paused should fail
    const ruleId = randomRuleId();
    const [rule] = rulePda(
      authority.publicKey,
      ruleId,
      registryProgram.programId,
    );
    try {
      await registryProgram.methods
        .registerRule(makeRuleParams(ruleId))
        .accounts({
          registryState,
          rule,
          owner: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc({ commitment: "confirmed" });
      expect.fail("Should have thrown Paused");
    } catch (err: any) {
      expect(err.message).to.include("Paused");
    }

    // Unpause
    await registryProgram.methods
      .setPaused(false)
      .accounts({ registryState, authority: authority.publicKey })
      .signers([authority])
      .rpc({ commitment: "confirmed" });

    state = await registryProgram.account.registryState.fetch(registryState);
    expect(state.paused).to.be.false;
  });
});

// ─── prova_executor init (Arcium localnet required) ───────────────────────────

describe("prova_executor", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const executorProgram = anchor.workspace.ProvaExecutor as Program<any>;
  const arciumProgram = getArciumProgram(provider);
  const arciumEnv = getArciumEnv();

  const payer = readKpJson(`${os.homedir()}/.config/solana/id.json`);

  it("initializes execute_transfer computation definition", async () => {
    const baseSeed = getArciumAccountBaseSeed("ComputationDefinitionAccount");
    const offset = getCompDefAccOffset("execute_transfer");

    const compDefPDA = PublicKey.findProgramAddressSync(
      [baseSeed, executorProgram.programId.toBuffer(), offset],
      getArciumProgramId(),
    )[0];

    const mxeAccount = getMXEAccAddress(executorProgram.programId);
    const mxeAcc = await arciumProgram.account.mxeAccount.fetch(mxeAccount);
    const lutAddress = getLookupTableAddress(
      executorProgram.programId,
      mxeAcc.lutOffsetSlot,
    );

    try {
      const sig = await executorProgram.methods
        .initExecuteTransferCompDef()
        .accounts({
          payer: payer.publicKey,
          mxeAccount,
          compDefAccount: compDefPDA,
          addressLookupTable: lutAddress,
        })
        .signers([payer])
        .rpc({ commitment: "confirmed" });
      console.log("initExecuteTransferCompDef sig:", sig);
    } catch (err: any) {
      // Already initialized from a previous run — safe to continue
      if (!err.message?.includes("already in use")) throw err;
      console.log(
        "Comp def already initialized, skipping init, uploading circuit.",
      );
    }

    // Upload the compiled circuit to Arcium
    const rawCircuit = fs.readFileSync("build/execute_transfer.arcis");
    await uploadCircuit(
      provider,
      "execute_transfer",
      executorProgram.programId,
      rawCircuit,
      true,
      500,
      { skipPreflight: true, commitment: "confirmed" },
    );

    console.log("execute_transfer circuit uploaded");

    // Verify comp def account was created
    const compDef =
      await arciumProgram.account.computationDefinitionAccount.fetch(
        compDefPDA,
      );
    expect(compDef).to.not.be.null;
  });
});
