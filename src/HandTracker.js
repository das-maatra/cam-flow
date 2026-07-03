import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

export class HandTracker{
    constructor(){
        this.handLandmarker = null;
        this.numHands = 2;
    }
    async init(){
        const vision = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm'    
        );

        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions:{
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
                delegate:'GPU',
            },
            runningMode: 'VIDEO',
            numHands: this.numHands,
        });
    }
    detect(video){
        if(video.readyState < 2){
            return [];
        }
        const results = this.handLandmarker.detectForVideo(video, performance.now());
        return results.landmarks;
    } 
}