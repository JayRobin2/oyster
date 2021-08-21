import React from 'react';

import { AccountLayout } from '@solana/spl-token';
import { WalletAdapter } from '@solana/wallet-base';
import { Account, Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';


import { TokenAccount, ParsedAccount, notify, LENDING_PROGRAM_ID, sendTransaction, cache } from '@oyster/common';
import { ensureSplAccount, findOrCreateAccountByMint, createUninitializedObligation } from './accounts';
import { refreshObligationAndReserves } from './helpers/refreshObligationAndReserves';
import { Reserve, Obligation, ObligationLayout, collateralExchangeRate, initObligationInstruction, refreshReserveInstruction, depositObligationCollateralInstruction, ObligationParser } from '../models';



export const borrowObligationLiquidity = async (
  connection: Connection,
  wallet: WalletAdapter,
  source: TokenAccount,
  liquidityAmount: number,
  reserve: ParsedAccount<Reserve>,
  obligation?: ParsedAccount<Obligation>
) => {
  if (!wallet.publicKey) {
    throw new Error('Wallet is not connected');
  }

  notify({
    message: 'Depositing funds into obligation account...',
    description: 'Please review transactions to approve.',
    type: 'warn',
  });

  const signers: Account[] = [];
  const instructions: TransactionInstruction[] = [];
  const cleanupInstructions: TransactionInstruction[] = [];

  const accountRentExempt = await connection.getMinimumBalanceForRentExemption(AccountLayout.span);
  const obligationRentExempt = await connection.getMinimumBalanceForRentExemption(ObligationLayout.span);

  const [lendingMarketAuthority] = await PublicKey.findProgramAddress(
    [reserve.info.lendingMarket.toBuffer()], // which account should be authority
    LENDING_PROGRAM_ID
  );

  const sourceLiquidityAccount = ensureSplAccount(
    instructions,
    cleanupInstructions,
    source,
    wallet.publicKey,
    liquidityAmount + accountRentExempt,
    signers
  );

  const destinationCollateralAccount = await findOrCreateAccountByMint(
    wallet.publicKey,
    wallet.publicKey,
    instructions,
    cleanupInstructions,
    accountRentExempt,
    reserve.info.collateral.mintPubkey,
    signers
  );

  const   collateralAmount = liquidityAmount * collateralExchangeRate(reserve.info);
  console.log(collateralAmount," Collateral Amount ",liquidityAmount," Liquidity Amount ", collateralExchangeRate(reserve.info), " Exchange")
  const sourceCollateral = destinationCollateralAccount;

  let obligationAccount;

  if (obligation) {
    obligationAccount = obligation.pubkey;
  } else {
    obligationAccount = createUninitializedObligation(instructions, wallet.publicKey, obligationRentExempt, signers);
    instructions.push(initObligationInstruction(obligationAccount, reserve.info.lendingMarket, wallet.publicKey));
  }


  instructions.push(refreshReserveInstruction(reserve.pubkey, reserve.info.liquidity.oraclePubkey));

  console.log(collateralAmount)
  instructions.push(
    depositObligationCollateralInstruction(
      collateralAmount,
      sourceCollateral,
      reserve.info.collateral.supplyPubkey,
      reserve.pubkey,
      obligationAccount,
      reserve.info.lendingMarket,
      lendingMarketAuthority,
      wallet.publicKey,
      wallet.publicKey
    )
  );

  try {
    const { txid } = await sendTransaction(connection, wallet, instructions.concat(cleanupInstructions), signers, true);

    notify({
      message: 'Deposting funds into obligation.',
      type: 'success',
      description: (
        <>
          Transaction - FILL THIS IN LATER
        </>
      ),
    });
  } catch (error) {
    console.error(error);
    throw new Error(error);
  }

 
  try {
    notify({
      message: 'Updating obligation and reserves.',
      description: 'Please review transactions to approve.',
      type: 'warn',
    });

    const updatedObligation = (await cache.query(
      connection,
      obligationAccount,
      ObligationParser
    )) as ParsedAccount<Obligation>;

    const { txid } = await sendTransaction(
      connection,
      wallet,
      [...(await refreshObligationAndReserves(connection, updatedObligation))],
      [],
      true
    );

    notify({
      message: 'Obligation and reserves updated.',
      type: 'success',
      description: `Transaction - ${txid}`,
    });
  } catch (error) {
    console.error(error);
    throw new Error(error);
  }
};
