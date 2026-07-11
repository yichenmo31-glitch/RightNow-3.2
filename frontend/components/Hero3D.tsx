import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, useGLTF } from '@react-three/drei';

const modelUrl = `${import.meta.env.BASE_URL}assets/model.glb`;

// ------------------------------------------------------------------
// Custom GLB Model Component
// ------------------------------------------------------------------
const Model = () => {
    // Load the model from the public folder
    const { scene } = useGLTF(modelUrl);

    return (
        <primitive
            object={scene}
            scale={2.5}  // Adjust scale as needed based on the model size
            position={[0, -2, 0]} // Adjust position to center it
        />
    );
};

// Preload the model to avoid pop-in
useGLTF.preload(modelUrl);

// ------------------------------------------------------------------
// Main Scene Component
// ------------------------------------------------------------------
const Hero3D: React.FC = () => {
    return (
        <div className="w-full h-full relative">
            <Canvas>
                <PerspectiveCamera makeDefault position={[0, 1, 5]} fov={50} />

                {/* Lighting */}
                <ambientLight intensity={0.5} />
                <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
                <pointLight position={[-10, 5, 2]} intensity={2} color="#B8FF00" />

                {/* Environment Reflections */}
                <Environment preset="city" />

                {/* 3D Content with Suspense for async loading */}
                <Suspense fallback={null}>
                    <Model />
                </Suspense>

                {/* Interaction */}
                <OrbitControls
                    enableZoom={true}
                    enablePan={false}
                    minPolarAngle={Math.PI / 4}
                    maxPolarAngle={Math.PI / 1.5}
                    autoRotate={true}
                    autoRotateSpeed={0.5}
                />
            </Canvas>
        </div>
    );
};

export default Hero3D;
