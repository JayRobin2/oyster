import {

 
  LENDING_PROGRAM_ID,
  models,
  notify,
  sendTransaction,
  TokenAccount,
} from '@oyster/common';
import { AccountLayout } from '@solana/spl-token';
import {
  Account,
  Connection,
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  depositReserveLiquidityInstruction,
  refreshReserveInstruction,
  Reserve,
} from '../models';
import { ensureSplAccount, findOrCreateAccountByMint } from './accounts';

const { approve } = models;

export const depositReserveLiquidity = async (
  connection: Connection,
  wallet: any,
  liquidityAmount: number,
  source: TokenAccount,
  reserve: Reserve,
  reserveAddress: PublicKey,
) => {
  notify({
    message: 'Depositing liquidity...',
    description: 'Please review transactions to approve.',
    type: 'warn',
  });

  // user from account
  const signers: Account[] = [];
  const instructions: TransactionInstruction[] = [];
  const cleanupInstructions: TransactionInstruction[] = [];

  const accountRentExempt = await connection.getMinimumBalanceForRentExemption(
    AccountLayout.span,
  );

  const [lendingMarketAuthority] = await PublicKey.findProgramAddress(
    [reserve.lendingMarket.toBuffer()], // which account should be authority
    LENDING_PROGRAM_ID,
  );

  const sourceLiquidityAccount = ensureSplAccount(
    instructions,
    cleanupInstructions,
    source,
    wallet.publicKey,
    liquidityAmount + accountRentExempt,
    signers,
  );

  // create approval for transfer transactions
  const transferAuthority = approve(
    instructions,
    cleanupInstructions,
    sourceLiquidityAccount,
    wallet.publicKey,
    liquidityAmount,
  );

  signers.push(transferAuthority);

  let destinationCollateralAccount: PublicKey = await findOrCreateAccountByMint(
    wallet.publicKey,
    wallet.publicKey,
    instructions,
    cleanupInstructions,
    accountRentExempt,
    reserve.collateral.mintPubkey,
    signers,
  );

  instructions.push(
    refreshReserveInstruction(
      reserveAddress,
      reserve.liquidity.oraclePubkey,
    ),
    depositReserveLiquidityInstruction(
      liquidityAmount,
      sourceLiquidityAccount,
      destinationCollateralAccount,
      reserveAddress,
      reserve.liquidity.supplyPubkey,
      reserve.collateral.mintPubkey,
      reserve.lendingMarket,
      lendingMarketAuthority,
      transferAuthority.publicKey,
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
      message: 'Liquidity deposited.',
      type: 'success',
      description: `Transaction - ${txid}`,
    });
  } catch {
    // TODO:
    throw new Error();
  }
};