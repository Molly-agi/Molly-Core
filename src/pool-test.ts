/* eslint-disable @typescript-eslint/no-explicit-any */
import { GgufFallbackLoader } from './ai/inference/gguf-fallback-loader';
import { parseGGUF } from './ai/engine-titan/gguf-ingest';

const GGUF = 'models/qwen2.5-72b-instruct-q4_k_m.gguf';

async function main() {
  console.log('Parsing GGUF...');
  const gguf = parseGGUF(GGUF);
  const fallback = new GgufFallbackLoader(GGUF, 5);

  const name = 'blk.0.attn_k.weight';
  const t = gguf.tensors.find((x: any) => x.name === name)!;
  const inDim = 8192;
  const outDim = t.elementCount / inDim;
  console.log('Tensor: ' + name + ' [' + inDim + ' x ' + outDim + ']');

  const input = new Float32Array(inDim);
  for (let i = 0; i < inDim; i++) input[i] = Math.random() - 0.5;

  console.log('Single-threaded...');
  const t0 = Date.now();
  const ref = fallback.forward(name, input, 1, inDim).output;
  const ms1 = Date.now() - t0;
  console.log('  ' + ms1 + 'ms, out[0]=' + ref[0].toFixed(6));

  console.log('Init pool...');
  await fallback.initPool();
  console.log('Parallel forward...');
  const t1 = Date.now();
  const par = await fallback.forwardAsync(name, input, inDim, outDim);
  const ms2 = Date.now() - t1;
  console.log('  ' + ms2 + 'ms, out[0]=' + par[0].toFixed(6));

  let maxD = 0;
  for (let i = 0; i < outDim; i++) {
    const d = Math.abs(ref[i] - par[i]);
    if (d > maxD) maxD = d;
  }
  console.log(
    'Max diff: ' + maxD.toExponential(3) + ', Match: ' + (maxD < 1e-5)
  );
  console.log('Speedup: ' + (ms1 / ms2).toFixed(1) + 'x');

  const { shutdownMatmulPool } = await import('./ai/inference/matmul-pool');
  await shutdownMatmulPool();
  process.exit(0);
}

main().catch((e: any) => {
  console.error(e);
  process.exit(1);
});
