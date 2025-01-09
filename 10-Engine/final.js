const vertexShaderSource = `#version 300 es
    precision highp float;
    in vec2 a_pos;
    in vec3 a_color;

    out vec4 v_color;
    out vec2 v_uv;

    void main() {
        gl_Position = vec4(a_pos, 0.0, 1.0);
        v_color = vec4(a_color, 1);
        v_uv = a_pos;
    }`;

const fragmentShaderSource = `#version 300 es
    precision mediump float;
    uniform float u_time;

    in vec4 v_color;
    in vec2 v_uv;

    out vec4 o_fragColor;

    void main() {
        float distance = sin(length(v_uv) * 8. - u_time * 0.0005) / 8.;
        float activation = smoothstep(0.0, 0.1, abs(distance));
        o_fragColor = activation * v_color;
    }`;

const vs = glance.createShader(gl, "vertex shader", glance.ShaderStage.VERTEX, vertexShaderSource);
const fs = glance.createShader(gl, "fragment shader", glance.ShaderStage.FRAGMENT, fragmentShaderSource);
const program = glance.createProgram(gl, "program", vs, fs);
const abo = glance.createAttributeBuffer(gl, "abo", {
    a_pos: {
        data: [
            -1, -1,
            +1, -1,
            -1, +1,
            +1, +1
        ],
        height: 2
    },
    a_color: {
        data: [
            1, 0, 0,
            0, 1, 0,
            0, 0, 1,
            1, 1, 1
        ],
        height: 3
    }
});
const ibo = glance.createIndexBuffer(gl, "ibo", [0, 1, 2, 1, 3, 2]);
const vao = glance.createVertexArrayObject(gl, "vao", ibo, abo, program);
const quad = glance.createDrawCall(gl, 'quad', vao, program);

function myRenderLoop({ time })
{
    quad.uniform.u_time = time;
    glance.draw(gl, quad);
}
setRenderLoop(myRenderLoop);