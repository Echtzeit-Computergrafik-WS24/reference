// INTERNAL CODE
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

const geo = glance.createBox('my geo');

// Attributes
const attributes = {
    a_pos: {
        data: geo.positions,
        height: 3
    },
    a_color: {
        data: [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
            [1, 0, 1],
            [1, 1, 0],
            [0, 1, 1],
        ].flatMap((t) => Array(4).fill(t).flat()),
        height: 3,
    }
};

// Indices
const indices = geo.indices;

// 2. WebGL 'Building Blocks' //////////////////////////////////////////////

// Basic
const vs = glance.createShader(gl, '', glance.ShaderStage.VERTEX, vertexShaderSource);
const fs = glance.createShader(gl, '', glance.ShaderStage.FRAGMENT, fragmentShaderSource);
const abo = glance.createAttributeBuffer(gl, '', attributes);
const ibo = glance.createIndexBuffer(gl, '', indices);

// Compound
const program = glance.createProgram(gl, '', vs, fs);
const vao = glance.createVertexArrayObject(gl, '', ibo, abo, program);

// Draw Call
const quad = glance.createDrawCall(gl, '', vao, program);
quad.uniform.u_projectionXform = glance.Mat4.perspective(Math.PI / 4, 1, 0.1, 10);

// 3. Render Loop //////////////////////////////////////////////////////////

gl.enable(gl.DEPTH_TEST);
gl.enable(gl.CULL_FACE);

const orbitPan = Sticky("orbitPan", 0);
const orbitTilt = Sticky("orbitTilt", 0);
const orbitDistance = Sticky("orbitDistance", 3);
const rotation = Sticky("rotation", 0);

const zeroVec = glance.Vec3.zero();
const yAxis = glance.Vec3.yAxis();

function myRenderLoop({ deltaTime })
{
    rotation.update((v) => v - deltaTime * 0.0001);

    // Always clear the canvas before drawing on it.
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const camPos = glance.Vec3.translateZ(orbitDistance.getRef()).rotateX(orbitTilt.getRef()).rotateY(orbitPan.getRef());
    quad.uniform.u_viewXform = glance.Mat4.lookAt(camPos, zeroVec, yAxis);

    quad.uniform.u_modelXform = glance.Mat4.rotateY(rotation.getRef());
    glance.draw(gl, quad);
}
setRenderLoop(myRenderLoop);

onMouseDrag((e) =>
{
    orbitPan.update((v) => v - e.movementX * 0.01);
    orbitTilt.update((v) => glance.clamp(v - e.movementY * 0.01, -Math.PI / 2, Math.PI / 2));
});

onMouseWheel((e) =>
{
    const factor = 1 + e.deltaY * 0.001;
    orbitDistance.update((v) => glance.clamp(v * factor, 1.0, 9.0));
});
// INTERNAL CODE