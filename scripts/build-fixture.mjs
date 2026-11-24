/** Generates packages/contract/src/fixture.rs: a proof for the third of three notes. */
import { fileURLToPath } from 'node:url'; import {createRequire} from 'module'; import {readFileSync,writeFileSync} from 'fs'; import {createHash} from 'crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const req=createRequire(root+'packages/core-sdk/package.json');
const snarkjs=req('snarkjs'); const {Address}=req('@stellar/stellar-sdk');
const {poseidonHash}=await import(root+'packages/core-sdk/dist/utils/crypto.js');
const H=async(a,b)=>BigInt(await poseidonHash([a,b]));
const secrets=[111n,222n,333n]; const leaves=[]; for(const s of secrets) leaves.push(await H(s,1n));
const recipient='CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUWDA';
const d=createHash('sha256').update(Address.fromString(recipient).toScVal().toXDR()).digest(); d[0]=0;
let idx=2, level=leaves, zero=0n, sib=[],pos=[];
for(let i=0;i<20;i++){ const p=idx&1; sib.push(level[p?idx-1:idx+1]??zero); pos.push(p); const n=[]; for(let j=0;j<level.length;j+=2) n.push(await H(level[j],level[j+1]??zero)); level=n; idx>>=1; zero=await H(zero,zero);}
const a=root+'artifacts/';
const {proof,publicSignals}=await snarkjs.groth16.fullProve({root:level[0],recipient:BigInt('0x'+d.toString('hex')),secret:333n,siblings:sib,positions:pos},a+'withdraw.wasm',a+'withdraw_final.zkey');
const vk=JSON.parse(readFileSync(a+'verification_key.json')); console.log(await snarkjs.groth16.verify(vk,publicSignals,proof));
const w=v=>BigInt(v).toString(16).padStart(64,'0'), g1=x=>w(x[0])+w(x[1]), g2=x=>w(x[0][1])+w(x[0][0])+w(x[1][1])+w(x[1][0]);
const o={A:g1(proof.pi_a),B:g2(proof.pi_b),C:g1(proof.pi_c),ALPHA:g1(vk.vk_alpha_1),BETA:g2(vk.vk_beta_2),GAMMA:g2(vk.vk_gamma_2),DELTA:g2(vk.vk_delta_2)};
vk.IC.forEach((x,i)=>o['IC'+i]=g1(x)); leaves.forEach((x,i)=>o['LEAF'+i]=w(x)); o.NULLIFIER=w(publicSignals[0]); o.ROOT=w(publicSignals[1]);
let out="//! A withdrawal proof for the third of three notes, with its verification key,\n//! hex-encoded in the contract's wire format.\n\npub const RECIPIENT: &str = \""+recipient+"\";\n";
for(const[k,v]of Object.entries(o)) out+=`\npub const ${k}: &str = concat!(\n${v.match(/.{64}/g).map(x=>`    "${x}",\n`).join('')});\n`;
writeFileSync(root+'packages/contract/src/fixture.rs',out); process.exit(0)
