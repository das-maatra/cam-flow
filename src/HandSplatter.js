const PALM_LANDMARKS = [5, 9, 13, 17]; // index/middle/ring/pinky MCP knuckles -- base of fingers, bordering the palm
const TIP_LANDMARKS = [8, 12, 16, 20]; // index/middle/ring/pinky tips
const TIP_BLEND = 0.7; // 0 = palm-center point, 1 = fingertip-center point
const FORCE_MULTIPLIER = 2.2; // lower = calmer, slower-moving fluid response to hand motion
const DEFAULT_MOTION_THRESHOLD = 0.0015; // minimum per-frame displacement (UV units) before splatting -- filters out ML jitter from a still hand. Live-tunable per effect from the UI (see fluidMotionThreshold/rippleMotionThreshold below).
const RADIUS_SCALE = 0.05; // tuned so a typical-distance hand gives a splat slightly smaller than the palm
// One ripple source per fingertip, paired with that finger's own base
// knuckle for the extension check below. minExtension is per-finger rather
// than one shared value -- the thumb and pinky have a much shorter
// tip-to-knuckle span relative to palm width than the other fingers, so a
// single threshold tuned for the index finger left them almost never
// passing even fully extended, which is why fingers didn't seem to activate
// together. Values are tuned by feel, not measured.
const FINGERTIPS = [
    { tip: 4, mcp: 2, minExtension: 0.35 },   // thumb -- shortest tip-to-knuckle span
    { tip: 8, mcp: 5, minExtension: 0.5 },    // index
    { tip: 12, mcp: 9, minExtension: 0.5 },   // middle
    { tip: 16, mcp: 13, minExtension: 0.45 }, // ring
    { tip: 20, mcp: 17, minExtension: 0.35 }, // pinky -- shortest full finger
];
// Single-finger mode's one active source: centered on the index fingertip
// (landmark 8), with the ripple radius sized from the index finger's own
// bone length -- a quarter of the distance between its tip (8) and knuckle
// (5) -- rather than overall hand size. Still gated on the index fingertip
// being extended relative to its own knuckle, same check as every other
// finger.
const SINGLE_FINGER_SOURCE = { tip: 8, mcp: 5, minExtension: 0.5, position: 8 };
const RIPPLE_STRENGTH_SCALE = 0.05;
const RIPPLE_MAX_STRENGTH = 1.2;
// Linear radius as a multiple of hand size. Ripple's shader compares this
// directly to a UV distance, unlike the fluid's radius which feeds an
// exponential falloff (exp(-dist^2/radius)) -- reusing the fluid's radius
// here made ripples stay tiny no matter how much we scaled it up.
const RIPPLE_RADIUS_FACTOR = 0.064; // 40% of the original 0.16 -- only used in multi-finger mode; single-finger's radius is computed from the middle finger's own bone length instead (see SINGLE_FINGER_SOURCE)
const RIPPLE_SMOOTHING_MULTI = 0.4; // matches the wave sim's original propagation coefficient
const RIPPLE_SMOOTHING_SINGLE = 0.4;
// A real fingertip can't teleport across the frame in one step -- a speed
// (UV units/sec, using real elapsed time rather than a fixed per-frame
// distance so it doesn't misfire under lag) above this is almost always a
// tracking glitch (lost/reacquired hand, two hands swapping array order)
// rather than real motion, and dropping a ripple at the glitched position is
// what made ripples sometimes appear somewhere you didn't touch. Generous on
// purpose -- a fast real drag should never look like a glitch.
const RIPPLE_MAX_SPEED = 10;
// Cap on how many ripple stamps one fingertip can lay down in a single frame
// while filling in a fast drag -- keeps a single wild swipe from eating the
// whole per-frame drop budget (see MAX_DROPS in RippleSim.js) at the expense
// of other fingers.
const MAX_RIPPLE_STAMPS = 8;
const FLUID_RIPPLE_STRENGTH_SCALE = 0.4; // fluid mode's secondary ripple layer is much subtler than ripple mode's own
// When a finger is curled (knuckle facing the camera instead of the tip),
// MediaPipe's tip landmark becomes unreliable and can drift toward the
// knuckle -- ripples would then appear there instead of the true fingertip.
// Only trust a tip when it's a reasonable distance from its own knuckle,
// i.e. that finger actually looks extended (see each finger's own
// minExtension in FINGERTIPS above).
// Palm width (hand[5]-to-hand[17] distance, same handSize used below) above
// which the hand is treated as too close to the camera to interact -- a
// closer hand looks bigger in frame, so this doubles as a "far enough away"
// gate: nothing up close triggers anything, only a hand held back from the
// camera does. No real depth data on a single camera, so this is a rough
// proxy tuned by feel, not a measured distance.
// A smaller handSize threshold requires the hand to look smaller in frame,
// i.e. be held FARTHER away -- raising this value shortens the required
// reach instead.
const MAX_HAND_SIZE = 0.214; // requires ~70% of the original 0.15 threshold's distance



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
        this.distanceGateEnabled = false; // off by default -- toggled from the UI
        this.multiFingerEnabled = true; // on by default -- app starts in multi-finger combined mode, toggled from the UI
        // Live-tunable from the UI sliders, applied on top of the tuned base
        // radius -- separate knobs because the two modes' base radius
        // formulas are on very different scales (finger-bone-length vs
        // hand-size derived).
        this.singleFingerRadiusMultiplier = 1;
        this.multiFingerRadiusMultiplier = 1;
        this.rippleStrengthMultiplier = 1; // live-tunable from the UI slider
        // How much motion is required before each effect triggers -- lower
        // is more sensitive (fires on smaller movements), higher requires a
        // bigger, more deliberate motion. Separate knobs since fluid and
        // ripple gate on different reference points (whole-hand vs
        // per-fingertip).
        this.fluidMotionThreshold = DEFAULT_MOTION_THRESHOLD;
        this.rippleMotionThreshold = DEFAULT_MOTION_THRESHOLD;
    }
    update(landmarks, fluidSim, rippleSim, mode, dt, realDt = dt){
        rippleSim.setSmoothing(this.multiFingerEnabled ? RIPPLE_SMOOTHING_MULTI : RIPPLE_SMOOTHING_SINGLE);
        const activeFingertips = this.multiFingerEnabled ? FINGERTIPS : [SINGLE_FINGER_SOURCE];

        const nextPrevious = [];
        landmarks.forEach((hand, handIndex) =>{
            const handSize = distance(hand[5], hand[17]); // palm width: index MCP to pinky MCP
            const active = !this.distanceGateEnabled || handSize <= MAX_HAND_SIZE;

            if (!active) {
                // Too close to the camera -- not far enough away to count as
                // active. Leaving no previous point here means that once the
                // hand moves back far enough, the next frame won't compute a
                // giant jump-splat from a stale position -- same effect as
                // if the hand had been lifted off entirely.
                nextPrevious[handIndex] = null;
                return;
            }

            const previousHand = this.previousLandmarks[handIndex];
            nextPrevious[handIndex] = hand.map((landmark) => ({ x: landmark.x, y: landmark.y }));
            if(!previousHand) return;

            const current = handPoint(hand);
            const previous = handPoint(previousHand);

            const point = { x: current.x, y:1-current.y};
            const previousPoint = {x:previous.x, y:1-previous.y};

            const dx = point.x - previousPoint.x;
            const dy = point.y - previousPoint.y;

            // Each fingertip's ripple is gated on that finger's own movement
            // (tipJump below), not the whole-hand blended point above -- a
            // single extended finger dragging while the rest of the hand
            // stays still (e.g. a pointing gesture) would otherwise get
            // diluted into the multi-tip average and silently dropped.
            activeFingertips.forEach(({ tip: tipIndex, mcp: mcpIndex, minExtension, position }) => {
                // `position` lets a source drop its ripple somewhere other
                // than the tip it's gated on (see SINGLE_FINGER_SOURCE) --
                // defaults to the tip itself for ordinary fingertip tracking.
                const sourceIndex = position ?? tipIndex;
                const source = hand[sourceIndex];
                const previousSource = previousHand[sourceIndex];
                const sourcePoint = { x: source.x, y: 1 - source.y };
                const sourceDx = source.x - previousSource.x;
                const sourceDy = source.y - previousSource.y;
                const sourceJump = Math.sqrt(sourceDx * sourceDx + sourceDy * sourceDy);
                if (sourceJump < this.rippleMotionThreshold) return;

                const tipExtension = distance(hand[tipIndex], hand[mcpIndex]) / handSize;
                const sourceRealSpeed = sourceJump / realDt;

                if (sourceRealSpeed < RIPPLE_MAX_SPEED && tipExtension >= minExtension) {
                    const sourceSpeed = sourceJump / dt;
                    const rippleScale = mode === 'fluid' ? FLUID_RIPPLE_STRENGTH_SCALE : 1;
                    const strength = Math.min(sourceSpeed * RIPPLE_STRENGTH_SCALE, RIPPLE_MAX_STRENGTH) * rippleScale * this.rippleStrengthMultiplier;
                    const radius = position != null
                        ? 0.25 * distance(hand[tipIndex], hand[mcpIndex]) * this.singleFingerRadiusMultiplier
                        : handSize * RIPPLE_RADIUS_FACTOR * this.multiFingerRadiusMultiplier;

                    // A single drop at the current position leaves a gap
                    // whenever the finger moves more than one radius between
                    // frames -- fast drags would read as a dotted trail
                    // instead of a continuous line. Stamp along the segment
                    // from the previous position instead, spaced at half a
                    // radius so consecutive stamps overlap.
                    const previousSourcePoint = { x: previousSource.x, y: 1 - previousSource.y };
                    const stamps = Math.min(Math.ceil(sourceJump / (radius * 0.5)), MAX_RIPPLE_STAMPS);
                    for (let s = 1; s <= stamps; s++) {
                        const t = s / stamps;
                        const stampPoint = {
                            x: previousSourcePoint.x + (sourcePoint.x - previousSourcePoint.x) * t,
                            y: previousSourcePoint.y + (sourcePoint.y - previousSourcePoint.y) * t,
                        };
                        rippleSim.drop(stampPoint, strength, radius);
                    }
                }
            });

            if ((mode === 'fluid' || mode === 'combined') && Math.sqrt(dx * dx + dy * dy) >= this.fluidMotionThreshold) {
                const velocity = {
                    x: (dx/dt) * FORCE_MULTIPLIER,
                    y: (dy/dt) * FORCE_MULTIPLIER,
                };
                const radius = handSize * handSize * RADIUS_SCALE;
                fluidSim.splat(point, velocity, radius);
            }
        });
        this.previousLandmarks = nextPrevious;
    }
}