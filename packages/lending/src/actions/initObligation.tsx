import { sendTransaction, notify } from '@oyster/common';
import {
  Account,
  Connection,
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js';
import { initObligationInstruction, Obligation } from '../models';

export const initObligation = async (
  connection: Connection,
  wallet: any,
  obligation: Obligation,
  obligationAddress: PublicKey
) => {
  notify({
    message: 'Initializing obligation...',
    description: 'Please review transactions to approve.',
    type: 'warn',
  });

  // user from account
  const signers: Account[] = [];
  const instructions: TransactionInstruction[] = [];
  const cleanupInstructions: TransactionInstruction[] = [];

  signers.push(wallet.info.account);

  instructions.push(
    initObligationInstruction(
      obligationAddress,
      obligation.lendingMarket,
      wallet.publicKey
    ),
  );

  try {
    let { txid } = await sendTransaction(
      connection,
      wallet,
      instructions.concat(cleanupInstructions),
      signers,
      true,
    );

    notify({
      message: 'Obligation initialized.',
      type: 'success',
      description: `Transaction - ${txid}`,
    });
  } catch {
    // TODO:
    throw new Error();
  }
};
