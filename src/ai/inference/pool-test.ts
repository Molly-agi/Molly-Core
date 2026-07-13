// Minimal test: one matmul through the pool, no transformer overhead.
import { GgufFallbackLoader } from '/workspaces/Molly-Core/src/ai/inference/gguf-fallback-loader';
import { parseGGUF } from '/workspaces/Molly-Core/src/ai/engine-titan/gguf-ingest';

const GGUF_PATH =
  '/workspaces/Molly-Core/models/qwen2.5-72b-instruct-q4_k_m.gguf';

async function main() {
  console.log('Creating loader...');
  const gguf = parseGGUF(GGUF_PATH);
  const fallback = new GgufFallbackLoader(GGUF_PATH, 5);

  console.log('Loading a small weight tensor...');
  // Use a small tensor first: attn_k is 8192 → 1024
  const tensorName = 'blk.0.attn_k.weight';
  const tensor = gguf.tensors.find((t) => t.name === tensorName)!;
  console.log(`Tensor: ${tensorName}, elements: ${tensor.elementCount}`);

  const inDim = 8192;
  const outDim = tensor.elementCount / inDim;
  console.log(`inDim=${inDim}, outDim=${outDim}`);

  // Create a random input
  const input = new Float32Array(inDim);
  for (let i = 0; i < inDim; i++) input[i] = Math.random() - 0.5;

  // Single-threaded reference
  console.log('\n--- Single-threaded forward ---');
  const t0 = Date.now();
  const refOutput = fallback.forward(tensorName, input, 1, inDim).output;
  const singleTime = Date.now() - t0;
  console.log(
    `Time: ${singleTime}ms, output[0..4]: ${Array.from(refOutput.slice(0, 5)).map((v) => v.toFixed(4))}`
  );

  // Parallel forward
  console.log('\n--- Parallel forward (initializing pool) ---');
  await fallback.initPool();

  console.log('Running forwardAsync...');
  const t1 = Date.now();
  const parOutput = await fallback.forwardAsync(
    tensorName,
    input,
    inDim,
    outDim
  );
  const parTime = Date.now() - t1;
  console.log(
    `Time: ${parTime}ms, output[0..4]: ${Array.from(parOutput.slice(0, 5)).map((v) => v.toFixed(4))}`
  );

  // Compare
  let maxDiff = 0;
  for (let i = 0; i < outDim; i++) {
    const diff = Math.abs(refOutput[i] - parOutput[i]);
    if (diff > maxDiff) maxDiff = diff;
  }
  console.log(`\nMax diff: ${maxDiff.toExponential(3)}`);
  console.log(`Match: ${maxDiff < 1e-5 ? 'YES ✓' : 'NO ✗'}`);
  console.log(`Speedup: ${(singleTime / parTime).toFixed(1)}x`);

  const { shutdownMatmulPool } =
    await import('/workspaces/Molly-Core/src/ai/inference/matmul-pool');
  await shutdownMatmulPool();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
