const PALM_LANDMARKS = [5, 9, 13, 17]; // index/middle/ring/pinky MCP knuckles -- base of fingers, bordering the palm
const TIP_LANDMARKS = [8, 12, 16, 20]; // index/middle/ring/pinky tips
const TIP_BLEND = 0.7; // 0 = palm-center point, 1 = fingertip-center point
const FORCE_MULTIPLIER = 4;
const MOTION_THRESHOLD = 0.0015; // minimum per-frame displacement (UV units) before splatting -- filters out ML jitter from a still hand
const RADIUS_SCALE = 0.05; // tuned so a typical-distance hand gives a splat slightly smaller than the palm
const RIPPLE_LANDMARK = 8; // index fingertip
const RIPPLE_STRENGTH_SCALE = 0.05;
const RIPPLE_MAX_STRENGTH = 1.2;
// Linear radius as a multiple of hand size. Ripple's shader compares this
// directly to a UV distance, unlike the fluid's radius which feeds an
// exponential falloff (exp(-dist^2/radius)) -- reusing the fluid's radius
// here made ripples stay tiny no matter how much we scaled it up.
const RIPPLE_RADIUS_FACTOR = 0.16;
// A real fingertip can't teleport across the frame in one step -- a jump
// bigger than this (UV units/frame) is almost always a tracking glitch
// (lost/reacquired hand, two hands swapping array order) rather than real
// motion, and dropping a ripple at the glitched position is what made ripples
// sometimes appear somewhere you didn't touch.
const RIPPLE_MAX_JUMP = 0.2;
const FLUID_RIPPLE_STRENGTH_SCALE = 0.4; // fluid mode's secondary ripple layer is much subtler than ripple mode's own
const INDEX_MCP = 5; // index finger knuckle -- base of the same finger as RIPPLE_LANDMARK
// When the index finger is curled (knuckle facing the camera instead of the
// tip), MediaPipe's tip landmark becomes unreliable and can drift toward the
// knuckle -- ripples would then appear there instead of the true fingertip.
// Only trust the tip when it's a reasonable distance from its own knuckle,
// i.e. the finger actually looks extended.
const RIPPLE_MIN_EXTENSION = 0.5;



function averageLandmark(hand, indices) {
    let x = 0, y = 0;
    indices.forEach((i) => {
        x += hand[i].x;
        y += hand[i].y;
    });
    return { x: x / indices.length, y: y / indices.length };
}

function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function handPoint(hand) {
    const palm = averageLandmark(hand, PALM_LANDMARKS);
    const tips = averageLandmark(hand, TIP_LANDMARKS);
    return {
        x: palm.x + (tips.x - palm.x) * TIP_BLEND,
        y: palm.y + (tips.y - palm.y) * TIP_BLEND,
    };
}

export class HandSplatter{
    constructor(){
        this.previousLandmarks = [];
    }
    update(landmarks, fluidSim, rippleSim, mode, dt){
        landmarks.forEach((hand, handIndex) =>{
            const previousHand = this.previousLandmarks[handIndex];
            if(!previousHand) return;

            const current = handPoint(hand);
            const previous = handPoint(previousHand);

            const point = { x: current.x, y:1-current.y};
            const previousPoint = {x:previous.x, y:1-previous.y};

            const dx = point.x - previousPoint.x;
            const dy = point.y - previousPoint.y;
            if (Math.sqrt(dx * dx + dy * dy) < MOTION_THRESHOLD) return;

            const handSize = distance(hand[5], hand[17]); // palm width: index MCP to pinky MCP

            // The fluid solver only runs while fluid mode is on screen (it's
            // the expensive one, ~19 passes/frame), but the ripple sim is
            // cheap (1 pass) so we keep it running in both modes -- as the
            // main effect in ripple mode, and as a subtle secondary trailing
            // displacement layered into the fluid composite.
            const tip = hand[RIPPLE_LANDMARK];
            const previousTip = previousHand[RIPPLE_LANDMARK];
            const tipPoint = { x: tip.x, y: 1 - tip.y };
            const tipDx = tip.x - previousTip.x;
            const tipDy = tip.y - previousTip.y;
            const tipJump = Math.sqrt(tipDx * tipDx + tipDy * tipDy);
            const tipExtension = distance(tip, hand[INDEX_MCP]) / handSize;

            if (tipJump < RIPPLE_MAX_JUMP && tipExtension >= RIPPLE_MIN_EXTENSION) {
                const tipSpeed = tipJump / dt;
                const rippleScale = mode === 'fluid' ? FLUID_RIPPLE_STRENGTH_SCALE : 1;
                const strength = Math.min(tipSpeed * RIPPLE_STRENGTH_SCALE, RIPPLE_MAX_STRENGTH) * rippleScale;
                rippleSim.drop(tipPoint, strength, handSize * RIPPLE_RADIUS_FACTOR);
            }

            if (mode === 'fluid') {
                const velocity = {
                    x: (dx/dt) * FORCE_MULTIPLIER,
                    y: (dy/dt) * FORCE_MULTIPLIER,
                };
                const radius = handSize * handSize * RADIUS_SCALE;
                fluidSim.splat(point, velocity, radius);
            }
        });
        this.previousLandmarks = landmarks.map((hand) =>
            hand.map((landmark) => ({x:landmark.x, y:landmark.y}))
        );
    }
}