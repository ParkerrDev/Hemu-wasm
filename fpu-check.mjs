// FTST and FNSTSW drive TempleOS Sign(). Check both execution paths without a disk.
// Intel SDM, FTST: https://cdrdv2-public.intel.com/774492/325383-sdm-vol-2abcd.pdf
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileHolyC} from '../holyc-wasm/src/compiler.js';
import {createHost} from '../holyc-wasm/src/runtime/host.js';
import * as jit from './jit.js';
const dir=new URL('./src/',import.meta.url);
const source=readFileSync(new URL('snapshot.HC',dir),'latin1')+`
U0 FpuBegin(F64 value,U64 status) {
  fsp=3; FStset(0,value); x87_sw=status; rfl=0xAD7;
  reg[0]=0x123456789ABC0000; rip=4096; halted=0;
  mem[4096]=0xD9; mem[4097]=0xE4; mem[4098]=0xDF; mem[4099]=0xE0; mem[4100]=0xF4;
}
U64 FpuProbe(I64 n) {
  switch(n) {
    case 0:return x87_sw; case 1:return reg[0]; case 2:return rfl; case 3:return fsp;
    case 4:return F64ToBits(FStv(0)); case 5:return mem; case 6:return &reg[0];
    case 7:return &rfl; case 8:return &rip; case 9:return &fpr[0];
    case 10:return &fsp; case 11:return &x87_sw;
  }
  return 0;
}
`;
const c=compileHolyC(source,{filename:'snapshot.HC',lenient:false,exports:['InitMem','FpuBegin','FpuProbe'],includeResolver:p=>readFileSync(new URL(p,dir),'latin1')});
const host=createHost(),{instance}=await WebAssembly.instantiate(c.bytes,{env:host.env}),ex=instance.exports;
host.attach(instance);ex.__rt_init();ex.InitMem(8192n);
const probe=n=>ex.FpuProbe(BigInt(n));
jit.jitState(probe(6),probe(7),probe(8),Number(probe(5)),ex.memory,ex.RdMem,ex.WrMem);
jit.jitX87(probe(9),probe(10),probe(11));
for(const mode of ['interpreter','jit'])for(const [value,flags] of [[-2,0x100],[2,0],[0,0x4000],[-0,0x4000],[NaN,0x4500],[-Infinity,0x100],[Infinity,0]]) {
  ex.FpuBegin(value,0x47A5n);
  const bits=probe(4);
  if(mode==='jit'){jit.jitReset();assert.equal(jit.jitCompile(4096),2);assert.equal(jit.jitRun(4096),2);}
  else {ex.Step();ex.Step();}
  const status=BigInt(0xA5|flags);
  assert.equal(probe(0),status,`${mode} FTST ${value}`);
  assert.equal(probe(1),0x123456789ABC0000n|status,`${mode} FNSTSW preserves upper RAX`);
  assert.equal(probe(2),0xAD7n,'EFLAGS preserved');assert.equal(probe(3),3n,'stack top preserved');
  assert.equal(probe(4),bits,'operand preserved');
}
console.log('FTST/FNSTSW: negative, positive, both zeros, NaN and infinities match in interpreter and JIT.');
