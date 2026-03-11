---
name: electrobun-wgpu
description: Set up a WebGPU rendering window in an Electrobun project. Creates a GpuWindow with WGPUView, a minimal WGSL pass-through shader, render loop, and KEEPALIVE array. Sets bundleWGPU: true in config. Usage: /electrobun-wgpu [name]
argument-hint: "[window-name]"
---

Add a WebGPU rendering window to the current Electrobun project.

## Steps

1. **Determine the window name** from the argument or ask the user (defaults to `gpu`).

2. **Read `electrobun.config.ts`** and check if `bundleWGPU` is set for each platform.
   - If not set or set to `false`, update the config to set `bundleWGPU: true` for mac, win, and linux.
   - Tell the user: "Set bundleWGPU: true in electrobun.config.ts — this is required for WebGPU to work."

3. **Create `src/bun/<name>.ts`** (or add to `src/bun/index.ts` if the project is small):

   ```typescript
   import { GpuWindow } from "electrobun/bun";

   // KEEPALIVE prevents Bun's GC from collecting FFI pointers mid-render
   const KEEPALIVE: unknown[] = [];

   // ── Window ────────────────────────────────────────────────────────────────
   const win = new GpuWindow({
     title: "<Name>",
     frame: { width: 800, height: 600 },
     centered: true,
   });

   // ── GPU Setup ─────────────────────────────────────────────────────────────
   const adapter = await navigator.gpu.requestAdapter();
   if (!adapter) throw new Error("WebGPU adapter not found. Is bundleWGPU: true set in config?");
   KEEPALIVE.push(adapter);

   const device = await adapter.requestDevice();
   KEEPALIVE.push(device);

   const context = win.getContext("webgpu")!;
   const format = navigator.gpu.getPreferredCanvasFormat();
   context.configure({ device, format });

   // ── Shader ────────────────────────────────────────────────────────────────
   const shaderCode = /* wgsl */`
   struct VertexOutput {
     @builtin(position) position: vec4f,
     @location(0) uv: vec2f,
   }

   @vertex
   fn vs_main(@builtin(vertex_index) idx: u32) -> VertexOutput {
     var positions = array<vec2f, 3>(
       vec2f(-1.0, -1.0),
       vec2f( 3.0, -1.0),
       vec2f(-1.0,  3.0),
     );
     var out: VertexOutput;
     out.position = vec4f(positions[idx], 0.0, 1.0);
     out.uv = (positions[idx] + vec2f(1.0)) * 0.5;
     return out;
   }

   @fragment
   fn fs_main(in: VertexOutput) -> @location(0) vec4f {
     // TODO: replace with your shader logic
     return vec4f(in.uv, 0.5, 1.0);
   }
   `;

   const shaderModule = device.createShaderModule({ code: shaderCode });
   KEEPALIVE.push(shaderModule);

   // ── Pipeline ──────────────────────────────────────────────────────────────
   const pipeline = device.createRenderPipeline({
     layout: "auto",
     vertex: {
       module: shaderModule,
       entryPoint: "vs_main",
     },
     fragment: {
       module: shaderModule,
       entryPoint: "fs_main",
       targets: [{ format }],
     },
     primitive: { topology: "triangle-list" },
   });
   KEEPALIVE.push(pipeline);

   // ── Render Loop ───────────────────────────────────────────────────────────
   setInterval(() => {
     const commandEncoder = device.createCommandEncoder();
     KEEPALIVE.push(commandEncoder);

     const passEncoder = commandEncoder.beginRenderPass({
       colorAttachments: [{
         view: context.getCurrentTexture().createView(),
         clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
         loadOp: "clear",
         storeOp: "store",
       }],
     });

     passEncoder.setPipeline(pipeline);
     passEncoder.draw(3);
     passEncoder.end();

     device.queue.submit([commandEncoder.finish()]);
   }, 16);
   ```

4. **Tell the user** what was created and point to the `// TODO` section in the fragment shader as the customization point.

5. **Remind the user**: run `bun run dev` and the black window with a UV gradient should appear. If it crashes immediately, confirm `bundleWGPU: true` is in the config.
