// 1. Data /////////////////////////////////////////////////////////////////

// Vertex Shader Source
const vertexShaderSource = `#version 300 es
    precision highp float;

    uniform mat4 u_modelXform;
    uniform mat4 u_viewXform;
    uniform mat4 u_projectionXform;

    in vec3 a_pos;
    in vec3 a_color;

    out vec4 v_color;

    void main() {
        gl_Position = u_projectionXform * u_viewXform * u_modelXform * vec4(a_pos, 1.0);
        v_color = vec4(a_color, 0.6);
    }`;

// Fragment Shader Source
const fragmentShaderSource = `#version 300 es
    precision mediump float;

    in vec4 v_color;

    out vec4 o_fragColor;

    void main() {
        o_fragColor = v_color;
    }`;

const box = glance.createTorusKnot();

// Attributes
const attributes = {
    a_pos: {
        data: box.positions,
        height: 3
    },
    a_color: {
        data: [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
        ].flatMap((t) => Array(box.positions.length / 9).fill(t).flat()),
        height: 3,
    }
};

// Indices
const indices = box.indices;

// 2. WebGL 'Building Blocks' //////////////////////////////////////////////

// Basic
const vs = glance.createShader(gl, 'my vertex shader', glance.ShaderStage.VERTEX, vertexShaderSource);
const fs = glance.createShader(gl, 'my fragment shader', glance.ShaderStage.FRAGMENT, fragmentShaderSource);
const abo = glance.createAttributeBuffer(gl, 'my abo', attributes);
const ibo = glance.createIndexBuffer(gl, 'my ibo', indices);

// Compound
const program = glance.createProgram(gl, 'my program', vs, fs);
const vao = glance.createVertexArrayObject(gl, 'my vao', ibo, abo, program);

// Draw Call
const quad = glance.createDrawCall(gl, 'my draw call', vao, program);

// 3. Render Loop //////////////////////////////////////////////////////////

gl.enable(gl.CULL_FACE);
gl.cullFace(gl.BACK);

gl.enable(gl.DEPTH_TEST);

let orbitPan = 0;
let orbitTilt = 0;
let orbitDistance = 4;

function myRenderLoop({ time })
{
    // Always clear the canvas before drawing on it.
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const camPos = glance.Vec3.translateZ(orbitDistance).rotateX(orbitTilt).rotateY(orbitPan);
    quad.uniform.u_viewXform = glance.Mat4.lookAt(camPos, glance.Vec3.zero(), glance.Vec3.yAxis());
    quad.uniform.u_projectionXform = glance.Mat4.perspective(Math.PI / 4, 1, 0.1, 10);

    quad.uniform.u_modelXform = glance.Mat4.identity();
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