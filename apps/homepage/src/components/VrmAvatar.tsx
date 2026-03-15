import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { retargetMixamoGltfToVrm } from "./vrm/retargetMixamoGltfToVrm";

export function VrmAvatar({ url }: { url: string }) {
    const [vrm, setVrm] = useState<VRM | null>(null);
    const { camera } = useThree();
    const vrmRef = useRef<VRM | null>(null);
    const mixerRef = useRef<THREE.AnimationMixer | null>(null);

    useEffect(() => {
        let isDisposed = false;

        async function load() {
            const loader = new GLTFLoader();
            // @ts-ignore version mismatch between three-vrm and @types/three
            loader.register((parser) => new VRMLoaderPlugin(parser));

            try {
                const gltf = await loader.loadAsync(url);
                if (isDisposed) return;

                const loadedVrm = gltf.userData.vrm;
                if (loadedVrm) {
                    VRMUtils.removeUnnecessaryVertices(gltf.scene);
                    VRMUtils.removeUnnecessaryJoints(gltf.scene);

                    loadedVrm.scene.traverse((obj: THREE.Object3D) => {
                        obj.frustumCulled = false;
                    });

                    // Initial face orientation
                    loadedVrm.scene.rotation.y = Math.PI;

                    try {
                        const gltfLoader = new GLTFLoader();
                        const idleGltf = await gltfLoader.loadAsync("/animations/idle.glb");
                        if (isDisposed) return;

                        idleGltf.scene.updateMatrixWorld(true);
                        loadedVrm.scene.updateMatrixWorld(true);

                        const clip = retargetMixamoGltfToVrm(
                            { scene: idleGltf.scene, animations: idleGltf.animations },
                            loadedVrm
                        );

                        const mixer = new THREE.AnimationMixer(loadedVrm.scene);
                        const action = mixer.clipAction(clip);
                        action.reset();
                        action.setLoop(THREE.LoopRepeat, Infinity);
                        action.fadeIn(0.25);
                        action.play();

                        mixerRef.current = mixer;
                    } catch (animErr) {
                        console.error("Failed to load or retarget idle animation:", animErr);
                    }

                    setVrm(loadedVrm);
                    vrmRef.current = loadedVrm;
                }
            } catch (err) {
                console.error("Failed to load VRM:", err);
            }
        }

        load();

        return () => {
            isDisposed = true;
            if (vrmRef.current) {
                VRMUtils.deepDispose(vrmRef.current.scene);
            }
            if (mixerRef.current) {
                mixerRef.current.stopAllAction();
            }
        };
    }, [url]);

    useFrame((state, delta) => {
        if (vrm) {
            vrm.update(delta);

            if (mixerRef.current) {
                mixerRef.current.update(delta);
            }

            // Head and Neck tracking based on state.pointer (normalized -1 to 1)
            const neck = vrm.humanoid?.getNormalizedBoneNode('neck');
            const head = vrm.humanoid?.getNormalizedBoneNode('head');
            const spine = vrm.humanoid?.getNormalizedBoneNode('spine');

            if (neck && head) {
                // target values based on pointer position
                const targetYaw = state.pointer.x * 1.0;
                const targetPitch = state.pointer.y * 0.6; // Inverted Y-axis to correctly look up/down

                // Interpolate bone rotations smoothly
                neck.rotation.y = THREE.MathUtils.lerp(neck.rotation.y, targetYaw * 0.4, 0.1);
                neck.rotation.x = THREE.MathUtils.lerp(neck.rotation.x, targetPitch * 0.4, 0.1);

                head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, targetYaw * 0.6, 0.1);
                head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, targetPitch * 0.6, 0.1);

                if (spine) {
                    spine.rotation.y = THREE.MathUtils.lerp(spine.rotation.y, targetYaw * 0.2, 0.05);
                    spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, targetPitch * 0.2, 0.05);
                }
            }

            // Also make the eyes look at the pointer
            const lookAtTarget = new THREE.Vector3(
                state.pointer.x * 2,
                state.pointer.y * 2 + 1.5,
                camera.position.z - 2
            );

            if (vrm.lookAt) {
                vrm.lookAt.lookAt(lookAtTarget);
            }
        }
    });

    return vrm ? <primitive object={vrm.scene} /> : null;
}
