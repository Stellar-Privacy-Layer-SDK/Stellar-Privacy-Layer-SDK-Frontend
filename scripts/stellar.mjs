/** Shared helpers for the deployment and end-to-end scripts. */
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../packages/core-sdk/package.json', import.meta.url));
const { Address, Asset, Operation, TransactionBuilder, nativeToScVal, rpc, xdr } =
  require('@stellar/stellar-sdk');

export function connect(rpcUrl, networkPassphrase) {
  const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
  return {
    server,
    nativeToken: Asset.native().contractId(networkPassphrase),

    async submit(keypair, operation) {
      const account = await server.getAccount(keypair.publicKey());
      const tx = new TransactionBuilder(account, { fee: '1000000', networkPassphrase })
        .addOperation(operation)
        .setTimeout(60)
        .build();
      const prepared = await server.prepareTransaction(tx);
      prepared.sign(keypair);
      const sent = await server.sendTransaction(prepared);
      if (sent.status === 'ERROR') throw new Error('Transaction rejected');
      return this.wait(sent.hash);
    },

    async wait(hash) {
      const result = await server.pollTransaction(hash, { attempts: 40 });
      if (result.status !== 'SUCCESS') throw new Error(`Transaction ${hash}: ${result.status}`);
      return result;
    },

    /** Makes the native token usable from contracts on a fresh network. */
    async ensureNativeToken(keypair) {
      const operation = Operation.createStellarAssetContract({ asset: Asset.native() });
      await this.submit(keypair, operation).catch((error) => {
        if (!/ExistingValue|already exists/.test(String(error))) throw error;
      });
    },

    async deployPool(keypair, { wasm, token, denomination, vkey }) {
      const uploaded = await this.submit(keypair, Operation.uploadContractWasm({ wasm }));
      const created = await this.submit(
        keypair,
        Operation.createCustomContract({
          address: Address.fromString(keypair.publicKey()),
          wasmHash: uploaded.returnValue.bytes(),
          salt: randomBytes(32),
          constructorArgs: [
            Address.fromString(token).toScVal(),
            nativeToScVal(BigInt(denomination), { type: 'i128' }),
            encodeVerificationKey(vkey),
          ],
        }),
      );
      return Address.fromScVal(created.returnValue).toString();
    },
  };
}

const word = (v) => BigInt(v).toString(16).padStart(64, '0');
const g1 = ([x, y]) => Buffer.from(word(x) + word(y), 'hex');
const g2 = ([x, y]) => Buffer.from(word(x[1]) + word(x[0]) + word(y[1]) + word(y[0]), 'hex');

/** The fields of the contract's `Groth16VKey` as bytes. */
export function encodeVerificationKeyParts(vkey) {
  return {
    alpha_g1: g1(vkey.vk_alpha_1),
    beta_g2: g2(vkey.vk_beta_2),
    delta_g2: g2(vkey.vk_delta_2),
    gamma_g2: g2(vkey.vk_gamma_2),
    ic: vkey.IC.map(g1),
  };
}

function encodeVerificationKey(vkey) {
  return xdr.ScVal.scvMap(
    Object.entries(encodeVerificationKeyParts(vkey)).map(
      ([key, value]) =>
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol(key),
          val: Array.isArray(value)
            ? xdr.ScVal.scvVec(value.map((v) => xdr.ScVal.scvBytes(v)))
            : xdr.ScVal.scvBytes(value),
        }),
    ),
  );
}
