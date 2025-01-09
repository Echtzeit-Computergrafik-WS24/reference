// 1. Data /////////////////////////////////////////////////////////////////

// Vertex Shader Source
const vertexShaderSource = `#version 300 es
    precision highp float;

    uniform vec2 u_modelOffset;

    in vec2 a_pos;
    in vec3 a_color;

    out vec4 v_color;

    void main() {
        gl_Position = vec4(a_pos + u_modelOffset, 1.0, 1.0);
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

// Attributes
const attributes = {
    a_pos: {
        data: [
            -.5, -.5,
            +.5, -.5,
            -.5, +.5,
            +.5, +.5,
        ],
        height: 2
    },
    a_color: {
        data: [
            1, 0, 0,
            0, 1, 0,
            0, 0, 1,
            1, 1, 0,
        ],
        height: 3,
    }
};

// Indices
const indices = [0, 1, 2, 1, 3, 2];

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

function myRenderLoop({ time })
{
    gl.clear(gl.COLOR_BUFFER_BIT);

    const modelOffset = new glance.Vec2(0, Math.sin(time / 1000) * 0.5);
    quad.uniform.u_modelOffset = modelOffset;
    glance.draw(gl, quad);
}
setRenderLoop(myRenderLoop);