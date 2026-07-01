declare module 'snarkjs' {
  export const groth16: {
    fullProve(
      inputs: Record<string, bigint>,
      wasm: string | Uint8Array,
      zkey: string | Uint8Array,
    ): Promise<{ proof: any; publicSignals: string[] }>;
    verify(
      vkey: string | Uint8Array,
      publicSignals: string[],
      proof: any,
    ): Promise<boolean>;
  };
}
