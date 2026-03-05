import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";

/**
 * Manages a soft radial shadow disc placed beneath the VRM avatar's feet.
 */
export class VrmFootShadow {
  private mesh: THREE.Mesh | null = null;

  /** Create (or recreate) the shadow disc and add it to `scene`. */
  create(scene: THREE.Scene): void {
    this.dispose(scene);

    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;

    const context = shadowCanvas.getContext("2d");
    if (!context) return;

    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(0, 0, 0, 0.4)");
    gradient.addColorStop(0.5, "rgba(0, 0, 0, 0.2)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);

    const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
    const shadowGeometry = new THREE.PlaneGeometry(2.2, 2.2);
    const shadowMaterial = new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      alphaTest: 0.001,
      depthWrite: false,
    });

    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, -0.82, 0);
    scene.add(shadow);
    this.mesh = shadow;
  }

  /** Update shadow position to follow the VRM on the ground plane. */
  update(vrm: VRM): void {
    if (!this.mesh) return;
    this.mesh.position.x = vrm.scene.position.x || 0;
    this.mesh.position.y = -0.82;
    this.mesh.position.z = vrm.scene.position.z || 0;
  }

  /** Remove and dispose of the shadow mesh, releasing GPU resources. */
  dispose(scene: THREE.Scene): void {
    if (!this.mesh) return;
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    const material = this.mesh.material;
    if (Array.isArray(material)) {
      for (const mat of material) {
        const meshMat = mat as THREE.MeshBasicMaterial;
        meshMat.map?.dispose();
        meshMat.dispose();
      }
    } else {
      const meshMat = material as THREE.MeshBasicMaterial;
      meshMat.map?.dispose();
      meshMat.dispose();
    }
    this.mesh = null;
  }
}
