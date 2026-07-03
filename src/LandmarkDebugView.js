import * as THREE from 'three'

const LANDMARKS_PER_HAND = 21;

export class LandmarkDebugView{
    constructor(scene, maxHands){
        const geometry = new THREE.CircleGeometry(0.03, 16);
        const material = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false});
        
        this.dots = [];
        
        for(let i = 0; i<maxHands * LANDMARKS_PER_HAND; i++){
            const dot = new THREE.Mesh(geometry, material);
            dot.renderOrder = 1;
            dot.visible = false;
            scene.add(dot);
            this.dots.push(dot);
        }
    }

    update(hands, quad){
        let dotIndex = 0;

        for(const hand of hands){
            for(const landmark of hand){
                const dot = this.dots[dotIndex];
                dot.position.x = (landmark.x * 2 - 1) * quad.scale.x;
                dot.position.y = (1 - landmark.y * 2) * quad.scale.y;
                dot.visible = true;
                dotIndex++;
            }
        }

        for(; dotIndex < this.dots.length; dotIndex++){
            this.dots[dotIndex].visible = false;
        }
    }
}