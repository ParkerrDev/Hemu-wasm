// build.mjs — compile the hemu snapshot resumer (HolyC) to WASM using the merged holyc-wasm
// compiler, writing snapshot.wasm next to this file (fetched by ../hemu.html).
//   node build.mjs
import { compileHolyC } from "../holyc-wasm/src/compiler.js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(dir, "src");
const src = readFileSync(resolve(srcDir, "snapshot.HC"), "latin1");
const r = compileHolyC(src, {
  filename: "snapshot.HC",
  lenient: false,
  includeResolver: (p) => { try { return readFileSync(resolve(srcDir, p), "latin1"); } catch { return null; } },
});
writeFileSync(resolve(dir, "snapshot.wasm"), Buffer.from(r.bytes));
console.log(`snapshot.wasm: ${r.bytes.length} bytes, ${r.warnings.length} warnings`);
for (const w of r.warnings) console.log("  warn:", w);

// SMP build: shared (imported) memory + multi-core snapshot regs + RunCore export — the engine the
// browser SMP workers (BSP + APs over one shared WebAssembly.Memory) load. Single-core build above is
// unchanged. Saved as snapshot-smp.wasm; needs the SMP snapshot (multi-core capture) + per-core wiring.
const smp = compileHolyC(src, {
  filename: "snapshot.HC", lenient: false, sharedMemory: true, defines: { SMP_SNAP: "1" }, exports: ["RunCore"],
  includeResolver: (p) => { try { return readFileSync(resolve(srcDir, p), "latin1"); } catch { return null; } },
});
writeFileSync(resolve(dir, "snapshot-smp.wasm"), Buffer.from(smp.bytes));
console.log(`snapshot-smp.wasm: ${smp.bytes.length} bytes (shared memory, SMP), ${smp.warnings.length} warnings`);
// Sidecar: the linear-memory addresses the browser SMP workers need to wire the APs (the per-core JIT
// offsets + IPI mailbox + guest-RAM base), since a fetched .wasm carries no compiler globals map. Mirrors
// what smpmt.mjs reads from r.globals. CCpuState field offsets are fixed (see snapshot.HC), stride 440.
const G = {}; for (const n of ["icount","g_ncore","g_ipi_pending","g_cpu_st","tsc","g_xmm_lo","g_xmm_hi","mem"]) { const g = smp.globals.get(n); if (g) G[n] = Number(g.addr); }
const sidecar = { globals: G, ccpu: { stride: 440, reg: 0, rip: 128, rfl: 136, fpr: 232, fsp: 296, x87_cw: 304, x87_sw: 312, fsbase: 320, gsbase: 328 }, xmmStride: 128 };
writeFileSync(resolve(dir, "snapshot-smp.json"), JSON.stringify(sidecar, null, 1));
console.log(`snapshot-smp.json: SMP globals + CCpuState offsets (browser AP-wiring sidecar)`);
// Segment/TSC addresses flow to the JIT at runtime via the __jit_seg handoff (per-core CCpuState),
// so there are no hardcoded offsets to keep in sync anymore.
