import { uv, vec2 } from 'three/tsl';

// The four-tap stencil that curl, divergence, pressure, gradient-subtract and
// vorticity confinement all read. Under the old GLSL pipeline each of those
// files spelled the same four texture2D() offsets out by hand; TSL lets the
// stencil exist once and be reused as a node graph.
export function neighbors(tex, texelSize, uvNode = uv()) {
    return {
        center: tex.sample(uvNode),
        left: tex.sample(uvNode.sub(vec2(texelSize.x, 0))),
        right: tex.sample(uvNode.add(vec2(texelSize.x, 0))),
        bottom: tex.sample(uvNode.sub(vec2(0, texelSize.y))),
        top: tex.sample(uvNode.add(vec2(0, texelSize.y))),
    };
}
