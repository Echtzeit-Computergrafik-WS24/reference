// 1. Data /////////////////////////////////////////////////////////////////

// Create a Vertex Array Object (VAO) to store the Attribute bindings.
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);

// Define the vertex positions of a triangle as a flat buffer of 2d
// coordinates in a space ranging from -1 to +1 in both X and Y.
const vertexAttributes = new Float32Array([
    -1, -1, 1, 0, 0, // bottom left
    +1, -1, 0, 1, 0, // bottom right
    -1, +1, 0, 0, 1, // top left
    +1, +1, 1, 1, 0, // top right
]);

// Create the position buffer in WebGL...
const attributeBuffer = gl.createBuffer();
// ... bind it to the ARRAY_BUFFER target ...
gl.bindBuffer(gl.ARRAY_BUFFER, attributeBuffer);
// ... and upload the data to it.
gl.bufferData(gl.ARRAY_BUFFER, vertexAttributes, gl.STATIC_DRAW);

// Face indices define triangles, the index number corresponds to
// a vertex defined in the bound ARRAY_BUFFER target.
const faceIndices = new Uint16Array([
    0, 1, 2, // first triangle
    1, 3, 2, // second triangle
]);

// Upload the indices to a buffer bound on the ELEMENT_ARRAY_BUFFER
// target.
const indexBuffer = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, faceIndices, gl.STATIC_DRAW);

// 2. Shader ///////////////////////////////////////////////////////////////

// Define the Vertex Shader Source, ignoring the details for now.
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
    }
    `;

// Create the vertex shader object in WebGL...
const vertexShader = gl.createShader(gl.VERTEX_SHADER);
// ... upload the source into the shader ...
gl.shaderSource(vertexShader, vertexShaderSource);
// ... and compile the shader. We ignore potential errors here.
gl.compileShader(vertexShader);

// Define the Fragment Shader Source.
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
    }
    `;

// Compile the fragment shader in WebGL.
const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
gl.shaderSource(fragmentShader, fragmentShaderSource);
gl.compileShader(fragmentShader);

// In order to use them, we have to link the two shaders together into
// a Shader Program.
// Create one first,
const shaderProgram = gl.createProgram();
// attach the two shaders (the order of attachment does not matter),
gl.attachShader(shaderProgram, vertexShader);
gl.attachShader(shaderProgram, fragmentShader);
// link the program, also ignoring errors
gl.linkProgram(shaderProgram);
// ... and tell WebGL to use the program for all future draw calls,
// or at least until we tell it to use another program instead.
gl.useProgram(shaderProgram);

// 3. Attribute Mapping ////////////////////////////////////////////////////

// So far, we've given WebGL a buffer of numbers and a shader that takes
// a vec2 as input. We now need to tell WebGL how to get the 2D
// coordinates out of the buffer, so the shader can use them.

// First, get the "attribute" (vertex shader input) location from the
// shader, so we can address it
const positionAttribute = gl.getAttribLocation(shaderProgram, 'a_pos');
// We need to enable the attribute location (ignore this for now).
gl.enableVertexAttribArray(positionAttribute);
// Here we tell WebGL how it can extract the attribute from the buffer
// bound on the ARRAY_BUFFER target.
gl.vertexAttribPointer(
    positionAttribute, // We want to define the 'a_pos' attribute
    2,               // It has two components (x, y)
    gl.FLOAT,        // We are using a 32bit float to store the number
    false,           // It is not normalized (ignore this)
    20,              // Stride in bytes (see below)
    0                // Offset in bytes (see below)
);
// The Stride is the width of a vertex in the ARRAY_BUFFER.
// In this case we only have 2 components à 4 bytes = 8.
// The Offset is the offset of *this* particular attribute within the
// width of the vertex.
// If we had two 2D attributes, the Stride would be 16 for both,
// and the second attribute would have an Offset of 8.

const colorAttribute = gl.getAttribLocation(shaderProgram, 'a_color');
gl.enableVertexAttribArray(colorAttribute);
gl.vertexAttribPointer(
    colorAttribute,  // We want to define the 'a_color' attribute
    3,               // It has three components (r, g, b)
    gl.FLOAT,        // We are using a 32bit float to store the number
    false,           // It is not normalized (ignore this)
    20,              // Stride in bytes
    8                // Offset in bytes
);

// 4. Second Object ////////////////////////////////////////////////////////

const vao2 = gl.createVertexArray();
gl.bindVertexArray(vao2);

const attributeBuffer2 = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, attributeBuffer2);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, +1, -1, +0, +1]), gl.STATIC_DRAW);

const indexBuffer2 = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer2);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2]), gl.STATIC_DRAW);

const vertexShader2 = gl.createShader(gl.VERTEX_SHADER);
gl.shaderSource(vertexShader2, `#version 300 es
    precision highp float;
    in vec2 a_pos;
    in vec3 a_color;
    out vec4 v_color;
    void main() {
        gl_Position = vec4(a_pos, 0.0, 1.0);
        v_color = vec4(a_color, 1.0);
    }`);
gl.compileShader(vertexShader2);

const fragmentShader2 = gl.createShader(gl.FRAGMENT_SHADER);
gl.shaderSource(fragmentShader2, `#version 300 es
    precision mediump float;
    in vec4 v_color;
    out vec4 o_fragColor;
    void main() { o_fragColor = v_color; }`);
gl.compileShader(fragmentShader2);

const shaderProgram2 = gl.createProgram();
gl.attachShader(shaderProgram2, vertexShader2);
gl.attachShader(shaderProgram2, fragmentShader2);
gl.linkProgram(shaderProgram2);
gl.useProgram(shaderProgram2);

const positionAttribute2 = gl.getAttribLocation(shaderProgram2, 'a_pos');
gl.enableVertexAttribArray(positionAttribute2);
gl.vertexAttribPointer(positionAttribute2, 2, gl.FLOAT, false, 8, 0);

gl.bindBuffer(gl.ARRAY_BUFFER, attributeBuffer);
const colorAttribute2 = gl.getAttribLocation(shaderProgram2, 'a_color');
gl.enableVertexAttribArray(colorAttribute2);
gl.vertexAttribPointer(colorAttribute2, 3, gl.FLOAT, false, 20, 8);

// 5. Rendering ////////////////////////////////////////////////////////////

// Get the location of the uniforms from the shader so we can address them
const timeUniform = gl.getUniformLocation(shaderProgram, "u_time");

/// The render loop function is called every frame.
/// The `time` parameter contains a timestamp in milliseconds.
function myRenderLoop({ time })
{
    // Set up the pipeline to render the quad
    gl.useProgram(shaderProgram);
    gl.bindVertexArray(vao);

    // Update the uniform values
    gl.uniform1f(timeUniform, time);

    /// Draw the quad.
    gl.drawElements(
        gl.TRIANGLES,       // We want to draw triangles (always use this)
        faceIndices.length, // Draw all vertices from the index buffer
        gl.UNSIGNED_SHORT,  // Data type used in the index buffer
        0                   // Offset (in bytes) in the index buffer
    );

    // Set up the pipeline to render the triangle
    gl.useProgram(shaderProgram2);
    gl.bindVertexArray(vao2);

    /// Draw the triangle.
    gl.drawElements(gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, 0);
}
setRenderLoop(myRenderLoop);