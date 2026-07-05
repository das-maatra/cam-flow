export const fragmentShader = `
varying vec2 vUv;

uniform sampler2D uVelocity;
uniform vec2 uPoint;
uniform vec2 uValue;
uniform float uRadius;
uniform float uAspectRatio;

void main(){
    vec2 p = vUv - uPoint;
    p.x *= uAspectRatio;
    float falloff = exp(-dot(p,p)/uRadius);
    vec2 base = texture2D(uVelocity, vUv).xy;
    gl_FragColor = vec4(base + falloff * uValue, 0.0, 1.0);
}
`;