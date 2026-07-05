import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

export class HandTracker{
    constructor(){
        this.handLandmarker = null;
        this.numHands = 2;
    }
    async init(){
        const assetBase = `${import.meta.env.BASE_URL}mediapipe`;
        const vision = await FilesetResolver.forVisionTasks(`${assetBase}/wasm`);

        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions:{
                modelAssetPath: `${assetBase}/hand_landmarker.task`,
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