/** Environment: RELAYER_SECRET, CONTRACT_ID, NETWORK (default testnet), PORT (default 8787). */
import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import { PrivacySDK, createMemoryStorageProvider, resolveNetworkConfig } from '@stellar-privacy/sdk';
import { createRelayer } from './server.mjs';

const { RELAYER_SECRET, CONTRACT_ID, NETWORK = 'testnet', PORT = '8787' } = process.env;
if (!RELAYER_SECRET || !CONTRACT_ID) {
  console.error('RELAYER_SECRET and CONTRACT_ID are required');
  process.exit(1);
}
const keypair = Keypair.fromSecret(RELAYER_SECRET);
const { client } = new PrivacySDK({
  network: resolveNetworkConfig(NETWORK, { contractId: CONTRACT_ID }),
  storageProvider: createMemoryStorageProvider(),
  logLevel: 'error',
  signer: async (xdr, passphrase) => {
    const tx = TransactionBuilder.fromXDR(xdr, passphrase);
    tx.sign(keypair);
    return tx.toXDR();
  },
});
await client.connectWallet(keypair.publicKey(), NETWORK);

async function submit({ proof, root, nullifier, recipient }) {
  // Simulated first, so invalid proofs cost no fee.
  const hash = await client.withdraw(proof, root, nullifier, recipient);
  for (let i = 0; i < 30; i++) {
    const status = await client.getTransactionStatus(hash);
    if (status === 'SUCCESS') return hash;
    if (status === 'FAILED') throw new Error('Transaction failed');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return hash;
}

createRelayer({ submit }).listen(Number(PORT), () => console.log(`Relayer listening on ${PORT}`));
