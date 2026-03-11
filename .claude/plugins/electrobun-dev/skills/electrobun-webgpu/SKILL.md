---
name: Electrobun WebGPU
description: Use when working with WebGPU in Electrobun — GpuWindow, WGPUView, WGSL shaders, KEEPALIVE pattern, render loops, FFI pointer management, and GPU buffer serialization.
version: 1.0.0
---

# Electrobun WebGPU Patterns

Electrobun wraps WGPU (a Rust WebGPU abstraction) via Bun FFI. GPU windows bypass the webview entirely — they render directly to a native surface.

## Config Requirement

**Always required before WebGPU code will work:**
```typescript
// electrobun.config.ts
mac: { bundleWGPU: true },
win: { bundleWGPU: true },
linux: { bundleWGPU: true },
```

## GpuWindow Setup

```typescript
import { GpuWindow } from "electrobun/bun";

const gpuWin = new GpuWindow({
  title: "GPU App",
  frame: { width: 800, height: 600 },
  centered: true,
});

const view = gpuWin.createView(); // WGPUView
```

## KEEPALIVE — Critical Pattern

Bun's GC will collect FFI pointers unless you hold a reference to them. Without KEEPALIVE, your app will crash mid-render with a segfault.

```typescript
// ALWAYS create this array and push every GPU object into it
const KEEPALIVE: unknown[] = [];

const adapter = await navigator.gpu.requestAdapter();
KEEPALIVE.push(adapter);

const device = await adapter.requestDevice();
KEEPALIVE.push(device);

const pipeline = device.createRenderPipeline({ /* ... */ });
KEEPALIVE.push(pipeline);

const buffer = device.createBuffer({ /* ... */ });
KEEPALIVE.push(buffer);
```

## Render Loop Pattern

```typescript
const FRAME_MS = 16; // ~60fps

function renderFrame() {
  // 1. Update uniform buffer with current state
  const data = new ArrayBuffer(32);
  const view = new DataView(data);
  view.setFloat32(0, performance.now() / 1000, true); // time
  view.setFloat32(4, canvas.width, true);             // resolution.x
  view.setFloat32(8, canvas.height, true);            // resolution.y
  view.setFloat32(12, mouseX, true);                  // mouse.x
  view.setFloat32(16, mouseY, true);                  // mouse.y
  device.queue.writeBuffer(uniformBuffer, 0, data);

  // 2. Create command encoder
  const encoder = device.createCommandEncoder();
  KEEPALIVE.push(encoder);

  // 3. Begin render pass
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: "clear",
      storeOp: "store",
    }],
  });

  // 4. Draw
  pass.setPipeline(pipeline);
  pass.setVertexBuffer(0, vertexBuffer);
  pass.draw(3);
  pass.end();

  // 5. Submit
  device.queue.submit([encoder.finish()]);
}

setInterval(renderFrame, FRAME_MS);
```

## WGSL Shader Structure

```wgsl
// Vertex shader
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> VertexOutput {
  // Full-screen triangle
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
```

## Vertex Buffer with DataView

GPU structs must be manually serialized. Vertex layout: `[x, y, time, res.x, res.y, mouse.x, mouse.y]` (all f32).

```typescript
// 3 vertices × 7 floats × 4 bytes = 84 bytes
const vertexData = new ArrayBuffer(3 * 7 * 4);
const dv = new DataView(vertexData);

// Full-screen triangle vertices
const verts = [
  [-1, -1], [3, -1], [-1, 3],
];

verts.forEach(([x, y], i) => {
  const offset = i * 7 * 4;
  dv.setFloat32(offset + 0,  x, true);    // position.x
  dv.setFloat32(offset + 4,  y, true);    // position.y
  dv.setFloat32(offset + 8,  time, true); // time
  dv.setFloat32(offset + 12, width, true);
  dv.setFloat32(offset + 16, height, true);
  dv.setFloat32(offset + 20, mouseX, true);
  dv.setFloat32(offset + 24, mouseY, true);
});
```

## Common Mistakes

1. **No KEEPALIVE** → segfault or silent corruption mid-render.
2. **`bundleWGPU: false`** → runtime error; Electrobun won't include the WGPU native library.
3. **Not recreating swap chain on resize** → distorted rendering after window resize.
4. **Forgetting `little-endian: true`** in `DataView.setFloat32` → garbage GPU data on most platforms.
5. **Blocking the render loop** → use async I/O outside the render interval, never inside.
