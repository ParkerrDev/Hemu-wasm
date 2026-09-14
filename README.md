# HEMU: TempleOS in WebAssembly

HEMU runs the unmodified TempleOS V5.03 kernel from a saved RAM image. Its x86-64 interpreter is written in HolyC and compiled by [HolyC-wasm](https://github.com/ParkerrDev/HolyC-wasm). A JavaScript block JIT emits native WebAssembly for hot guest code. [TempleOS-Web](https://github.com/ParkerrDev/TempleOS-Web) supplies the browser UI, disk image, input and sound.

## Build and check

Clone HolyC-wasm as the sibling `../holyc-wasm`, or create a lowercase symlink to the checkout. Node.js needs no packages for these commands:

```sh
node build.mjs
node diskio-check.mjs
node fpu-check.mjs
node --max-old-space-size=3072 guestcheck.mjs
node --max-old-space-size=3072 input-check.mjs
node --max-old-space-size=3072 jitrecycle.mjs
node --max-old-space-size=3072 jitboot.mjs
```

The guest harnesses require `/tmp/live.bin` (decompress this repository's `live.bin.gz`) and `/tmp/templeos.raw` (decompress the site's `vendor/images/templeos-hd.qcow2.gz`, then convert with `qemu-img convert -O raw`). `LIVE` and `RAW` override the paths in guestcheck, input-check and jitrecycle. The input check also reads HolyCraft from the sibling TempleOS-Web checkout.

`build.mjs` produces both snapshot WASM engines and `snapshot-smp.json`. Rebuild after changing HolyC source. Ship the engines, sidecar, JIT and the matching HolyC runtime together; stale offsets are unsafe. Historical scripts under `tools/` contain machine-specific paths and are not the supported build path.

## Backend guest execution

`guestexec.js` resolves kernel functions and class layouts from the running OS's symbol tables. `src/guestcall.HC` injects a short kernel call at a core-zero interrupt boundary and restores the interrupted CPU state. TaskExe jobs perform normal guest work. The API exposes `exec`, `include`, `mkdir`, `writeFile`, and `launch`, with request IDs and queued/running/done/failed states.

Games start in a fresh Servant task through a short Adam job calling PopUp. No command typing or character-by-character TaskMsg injection is involved. FileWrite receives raw bytes staged above the guest allocator's RAM, preserving embedded DolDoc sprites. Already-compressed .Z uploads use FOpen/FBlkWrite so FileWrite cannot recompress them. Launches reject a second active game, report compile/runtime exceptions, and release their slot when the task ends. A running event means the task started; compilation can still fail afterward.

`guestcheck.mjs` exercises execution, failure reporting, directory creation, binary upload, independent persisted-sector readback, disk inclusion, launch cleanup, animation and busy refusal. `jitrecycle.mjs` checks repeated compilation into reused guest addresses. Each cached JIT block validates its decoded bytes at entry, including native dispatch-table calls, before executing.

`guestinput.js` resolves the keyboard bitmap and mouse state through `guestexec.js` metadata. Relative mouse deltas are applied once from the guest's current position, respecting games that call MsSet to recenter. The browser's held-key set is synchronized around each emulation slice, using atomic byte operations for shared memory. Capture hints follow the foreground task's mouse visibility and input ownership. Hosts forward these hints to the UI; pointer lock still requires a user gesture. Frame input polling stops when the 64-entry keyboard FIFO fills, leaving remaining events in the host queue. `input-check.mjs` checks HolyCraft's neutral spawn, idle camera, relative look, held movement, release and a 200-event burst in the live guest.

The catalog smoke harness needs the sibling TempleOS-Web checkout:

```sh
node --max-old-space-size=3072 game-suite.mjs Talons
node --max-old-space-size=3072 game-suite.mjs --all
```

It verifies every asset against its manifest, reads the persisted disk bytes back independently, launches through the public API, exercises game dialogs, and saves screenshots and JSON to `/tmp/hemu-games` (`OUT` overrides this). TOOM also checks movement/fire and its `in_level` state. These are smoke checks, not complete playthroughs.

## Devices and performance

The CPU implements the integer, x87 and SSE instructions used by this TempleOS image. FTST and FNSTSW are covered in both interpreter and JIT tests, including negative values, signed zeros, NaN and infinities; the missing FTST previously made native Sign return +1 for every input. The x87 register-destination subtraction and division encodings preserve Intel operand order in both engines; 432 arithmetic cases cover both signs, destination registers and wrapped stack tops. Reversing those operands produced negative game collision coordinates. ATA transfers support both 16-bit and 32-bit I/O, including REP INSD/OUTSD. VGA DAC reads and writes preserve the 16-color palette and notify the host when colors change. The host adapter must supply both diskRead and diskWrite.

Interpreter, block JIT and verified graphics HLE form separate execution layers. Keep the HLE candidate verification and rejection path intact. HLE shortcuts must agree with native guest output before activation. The standalone SMP engine shares WASM memory between workers; keep it under separate regression testing. Browser networking for TOOM multiplayer is not implemented.

These checks cover observed workloads and regressions, not complete x86 hardware conformance or complete game playthroughs.
