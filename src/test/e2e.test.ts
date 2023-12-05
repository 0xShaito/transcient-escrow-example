import {
  Fr,
  PXE,
  computeMessageSecretHash,
  createAccount,
  createPXEClient,
  getSandboxAccountsWallets,
  waitForSandbox,
  AztecAddress,
  AccountWalletWithPrivateKey,
  computeAuthWitMessageHash,
  TxHash,
  ExtendedNote,
  Note,
} from "@aztec/aztec.js";

import { TokenContract } from "../artifacts/Token.js";
import { TranscientEscrowContract } from "../artifacts/TranscientEscrow.js";

const AMOUNT_1 = 1000n;
const AMOUNT_2 = 200n;
const MINT_AMOUNT = 10000n;

let pxe: PXE;
let token: TokenContract;
let transient: TranscientEscrowContract;

let requester: AccountWalletWithPrivateKey;
let deployer: AccountWalletWithPrivateKey;

// Setup: Set the sandbox
beforeAll(async () => {
  const { SANDBOX_URL = "http://localhost:8080" } = process.env;
  pxe = createPXEClient(SANDBOX_URL);

  [, [requester,,], deployer] = await Promise.all([
    waitForSandbox(pxe),
    getSandboxAccountsWallets(pxe),
    createAccount(pxe),
  ]);
}, 60_000);

describe("E2E Transcient escrow", () => {

  beforeAll(async () => {
    // Deploy the token
    token = await TokenContract.deploy(deployer, requester.getAddress())
      .send()
      .deployed();

    // Mint tokens for the requester
    await mintTokenFor(requester, requester, MINT_AMOUNT);

    // Deploy the transcient escrow
    transient = await TranscientEscrowContract.deploy(deployer).send().deployed();

    // Add the contract public key to the PXE
    await pxe.registerRecipient(transient.completeAddress);
  }, 60_000);

  it('WORKS!', async () => {
    // Give approvals to create the escrows
    let nonce1 = await createAuthEscrowMessage(token, requester, transient.completeAddress.address, AMOUNT_1);
    let nonce2 = await createAuthEscrowMessage(token, requester, transient.completeAddress.address, AMOUNT_2);

    // Create the escrows through the contract
    await transient.withWallet(requester).methods.createEscrows(token.address, AMOUNT_1, nonce1, AMOUNT_2, nonce2).send().wait();

    let escrows = await token.withWallet(requester).methods.get_escrows(0n).view();

    // There should be two escrows
    expect(escrows.filter((escrow: any) => escrow._is_some).length).toBe(2);

    // Merge both escrows
    await transient.withWallet(requester).methods.combineTwoEscrows(
      token.address, 
      AMOUNT_1, escrows[1]._value.randomness,
      AMOUNT_2, escrows[0]._value.randomness
    ).send().wait();

    escrows = await token.withWallet(requester).methods.get_escrows(0n).view();

    console.log(escrows);

    // There should be one escrow
    expect(escrows.filter((escrow: any) => escrow._is_some).length).toBe(1);

    // The escrow should have the sum of the amounts
    expect(escrows[0]._value.amount.value).toBe(AMOUNT_1 + AMOUNT_2);
  }, 60_000);
});

const createAuthEscrowMessage = async (
  token: TokenContract,
  from: AccountWalletWithPrivateKey,
  agent: AztecAddress,
  amount: any
) => {
  const nonce = Fr.random();

  // We need to compute the message we want to sign and add it to the wallet as approved
  const action = token.methods.escrow(
    from.getAddress(),
    agent,
    amount,
    nonce
  );
  const messageHash = await computeAuthWitMessageHash(agent, action.request());

  // Both wallets are connected to same node and PXE so we could just insert directly using
  // await wallet.signAndAddAuthWitness(messageHash, );
  // But doing it in two actions to show the flow.
  const witness = await from.createAuthWitness(messageHash);
  await from.addAuthWitness(witness);
  return nonce;
};

const addPendingShieldNoteToPXE = async (
  account: AccountWalletWithPrivateKey,
  amount: bigint,
  secretHash: Fr,
  txHash: TxHash
) => {
  const storageSlot = new Fr(5); // The storage slot of `pending_shields` is 5.

  await pxe.addNote(
    new ExtendedNote(
      new Note([new Fr(amount), secretHash]),
      account.getAddress(),
      token.address,
      storageSlot,
      txHash
    )
  );
};

const mintTokenFor = async (
  account: AccountWalletWithPrivateKey,
  minter: AccountWalletWithPrivateKey,
  amount: bigint
) => {
  // Mint private tokens
  const secret = Fr.random();
  const secretHash = await computeMessageSecretHash(secret);

  const recipt = await token
    .withWallet(minter)
    .methods.mint_private(amount, secretHash)
    .send()
    .wait();

  await addPendingShieldNoteToPXE(minter, amount, secretHash, recipt.txHash);

  await token
    .withWallet(minter)
    .methods.redeem_shield(account.getAddress(), amount, secret)
    .send()
    .wait();
};
