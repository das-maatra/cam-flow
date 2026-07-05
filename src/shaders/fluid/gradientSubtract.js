export const fragmentShader = `
varying vec2 vUv;

uniform sampler2D uVelocity;
uniform sampler2D uPressure;
uniform vec2 uTexelSize;

void main(){
    float left = texture2D(uPressure, vUv - vec2(uTexelSize.x, 0.0)).x;
    float right = texture2D(uPressure, vUv + vec2(uTexelSize.x, 0.0)).x;
    float bottom = texture2D(uPressure, vUv - vec2(0.0, uTexelSize.y)).x;
    float top = texture2D(uPressure, vUv + vec2(0.0, uTexelSize.y)).x;

    vec2 velocity = texture2D(uVelocity, vUv).xy;
    velocity -= 0.5 * vec2(right - left, top - bottom);
    gl_FragColor = vec4(velocity, 0.0, 1.0);
}
`;