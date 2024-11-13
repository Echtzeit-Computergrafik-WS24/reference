// 1. Data /////////////////////////////////////////////////////////////////

// Define the vertex positions of a triangle as a flat buffer of 2d
// coordinates in a space ranging from -1 to +1 in both X and Y.
const vertexPositions = new Float32Array([
    -1, -1, // bottom left
    +1, -1, // bottom right
    -1, +1, // top left
    +1, +1, // top right
]);

// Create the position buffer in WebGL...
const positionBuffer = gl.createBuffer();
// ... bind it to the ARRAY_BUFFER target ...
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
// ... and upload the data to it.
gl.bufferData(gl.ARRAY_BUFFER, vertexPositions, gl.STATIC_DRAW);

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
    uniform mediump float u_time;
    void main() {
        gl_Position = vec4(a_pos, 0.0, 1.0);
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
    
    uniform vec2 u_windowSize;
    uniform float u_time;
    
    out vec4 o_fragColor;
    
    void main() {
        vec2 uv = (gl_FragCoord.xy * 2.0 - u_windowSize) / u_windowSize.y;
        
        float distance = sin(length(uv) * 8. + u_time * 0.001) / 8.;
        float activation = smoothstep(0.0, 0.1, abs(distance));
        o_fragColor = vec4(activation, activation, activation, 1.0);
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
const vertexAttribute = gl.getAttribLocation(shaderProgram, 'a_pos');
// We need to enable the attribute location (ignore this for now).
gl.enableVertexAttribArray(vertexAttribute);
// Here we tell WebGL how it can extract the attribute from the buffer
// bound on the ARRAY_BUFFER target.
gl.vertexAttribPointer(
    vertexAttribute, // We want to define the 'a_pos' attribute
    2,               // It has two components (x, y)
    gl.FLOAT,        // We are using a 32bit float to store the number
    false,           // It is not normalized (ignore this)
    8,               // Stride in bytes (see below)
    0                // Offset in bytes (see below)
);
// The Stride is the width of a vertex in the ARRAY_BUFFER.
// In this case we only have 2 components à 4 bytes = 8.
// The Offset is the offset of *this* particular attribute within the
// width of the vertex.
// If we had two 2D attributes, the Stride would be 16 for both,
// and the second attribute would have an Offset of 8.

// 4. Rendering ////////////////////////////////////////////////////////////

// Get the location of the uniform from the shader so we can address it
const windowSizeUniform = gl.getUniformLocation(shaderProgram, "u_windowSize");
const timeUniform = gl.getUniformLocation(shaderProgram, "u_time");

/// The render loop function is called every frame.
/// The `time` parameter contains a timestamp in milliseconds.
function myRenderLoop(time) {
    // Update the uniform values
    gl.uniform2f(windowSizeUniform, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(timeUniform, time);

    /// Draw the triangle.
    gl.drawElements(
        gl.TRIANGLES,       // We want to draw triangles (always use this)
        faceIndices.length, // Draw all vertices from the index buffer
        gl.UNSIGNED_SHORT,  // Data type used in the index buffer
        0                   // Offset (in bytes) in the index buffer
    );
}
setRenderLoop(myRenderLoop);
