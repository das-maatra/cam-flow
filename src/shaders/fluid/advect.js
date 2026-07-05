export const fragmentShader = `
varying vec2 vUv;

uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform float uDt;
uniform float uDissipation;

void main(){
    vec2 coord = vUv - uDt * texture2D(uVelocity, vUv).xy;
    gl_FragColor = texture2D(uSource, coord) * uDissipation;
}
`
