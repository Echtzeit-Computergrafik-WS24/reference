// 1. Data /////////////////////////////////////////////////////////////////

// Vertex Shader Source
const vertexShaderSource = `#version 300 es
    precision highp float;

    uniform mat4 u_modelXform;
    uniform mat4 u_viewXform;
    uniform mat4 u_projectionXform;

    in vec3 a_pos;
    in vec3 a_normal;

    out vec3 f_normal;

    void main() {
        vec4 worldPos = u_modelXform * vec4(a_pos, 1.0);
        f_normal = (u_modelXform * vec4(a_normal, 0)).xyz;
        gl_Position = u_projectionXform * u_viewXform * u_modelXform * vec4(a_pos, 1.0);
    }`;

// Fragment Shader Source
const fragmentShaderSource = `#version 300 es
    precision mediump float;

    uniform vec3 u_lightDirection;

    in vec3 f_normal;

    out vec4 o_fragColor;

    void main() {
        vec3 color = vec3(1.0); // white
        float lightIntensity = max(0.0, dot(u_lightDirection, normalize(f_normal)));
        color *= lightIntensity;
        o_fragColor = vec4(color, 1.0);
    }`;

// Geometry.
const geo = glance.createSphere('my geo', { widthSegments: 8, heightSegments: 4 });

// 2. WebGL 'Building Blocks' //////////////////////////////////////////////

// Basic
const vs = glance.createShader(gl, 'my vertex shader', glance.ShaderStage.VERTEX, vertexShaderSource);
const fs = glance.createShader(gl, 'my fragment shader', glance.ShaderStage.FRAGMENT, fragmentShaderSource);
const abo = glance.createAttributeBuffer(gl, 'my abo', {
    a_pos: {
        data: geo.positions,
        height: 3
    },
    a_normal: {
        data: geo.normals,
        height: 3
    },
});
const ibo = glance.createIndexBuffer(gl, 'my ibo', geo.indices);

// Compound
const program = glance.createProgram(gl, 'my program', vs, fs);
const vao = glance.createVertexArrayObject(gl, 'my vao', ibo, abo, program);

// Draw Call
const quad = glance.createDrawCall(gl, 'my draw call', vao, program);

// 3. Render Loop //////////////////////////////////////////////////////////

gl.enable(gl.DEPTH_TEST);
gl.enable(gl.CULL_FACE);

let orbitPan = 0;
let orbitTilt = 0;
let orbitDistance = 3;

const lightDirection = Vec3.of(1, 1, 1).normalize();

function myRenderLoop({ globalTime })
{
    // Always clear the canvas before drawing on it.
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const camPos = glance.Vec3.translateZ(orbitDistance).rotateX(orbitTilt).rotateY(orbitPan);
    quad.uniform.u_viewXform = glance.Mat4.lookAt(camPos, glance.Vec3.zero(), glance.Vec3.yAxis());
    quad.uniform.u_projectionXform = glance.Mat4.perspective(Math.PI / 4, 1, 0.1, 10);
    quad.uniform.u_lightDirection = lightDirection;
    quad.uniform.u_modelXform = glance.Mat4.rotateX(0.6).rotateY(globalTime / 2000);
    glance.draw(gl, quad);
}
setRenderLoop(myRenderLoop);

onMouseDrag((e) =>
{
    orbitPan -= e.movementX * 0.01;
    orbitTilt = glance.clamp(orbitTilt - e.movementY * 0.01, -Math.PI / 2, Math.PI / 2);
});

onMouseWheel((e) =>
{
    const factor = 1 + e.deltaY * 0.001;
    orbitDistance = glance.clamp(orbitDistance * factor, 1.0, 9.0);
});