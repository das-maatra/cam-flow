export const fragmentShader = `

varying vec2 vUv;

uniform sampler2D uPressure;
uniform float uDecay;

void main(){
    gl_FragColor = vec4(texture2D(uPressure, vUv).x * uDecay, 0.0,0.0,1.0);
}
`