export const fragmentShader = `
varying vec2 vUv;

uniform sampler2D uVelocity;
uniform vec2 uTexelSize;

void main(){
    float left = texture2D(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).x;
    float right = texture2D(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).x;
    float bottom = texture2D(uVelocity, vUv - vec2(0.0, uTexelSize.y)).y;
    float top = texture2D(uVelocity, vUv + vec2(0.0, uTexelSize.y)).y;

    float divergence = 0.5 * ((right - left) + (top - bottom));
    gl_FragColor = vec4(divergence, 0.0, 0.0, 1.0);
}
`;