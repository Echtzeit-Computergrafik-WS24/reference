/**
 * This file contains a simple WebGL 2.0 rendering engine.
 * It is meant to be used on the rt3d.dev website but can be used elsewhere.
 *
 * This file is split into 3 parts:
 *  1. Types and Constants
 *  2. API Functions
 *  3. Helper Functions
 *
 * Only the API functions are relevant to the user of the engine.
 * The Helper Functions are used internally by the API functions and the types
 * are only used to aid in development. They are omitted from the JavaScript
 * version of this file.
 *
 * The engine is not feature-complete. As we progress through the course, we
 * will add more features. I have however exposed all types and constants that
 * we will need in the future, so all that we will have to change are the API
 * functions. Do not be alarmed if you see types and constants that do not make
 * sense at the moment.
 */

// Constants ================================================================ //

/// WebGL2 Shader stages.
const ShaderStage = {
    VERTEX: 35633,
    FRAGMENT: 35632,
};

/// Data types for WebGL2 attributes.
/// https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/vertexAttribPointer#type
const AttributeDataType = {
    BYTE: 5120,
    UNSIGNED_BYTE: 5121,
    SHORT: 5122,
    UNSIGNED_SHORT: 5123,
    INT: 5124,
    UNSIGNED_INT: 5125,
    FLOAT: 5126,
    // These types are valid, but require bit-fiddling operations and we won't use them.
    // HALF_FLOAT: 5131,
    // INT_2_10_10_10_REV: 36255,
    // UNSIGNED_INT_2_10_10_10_REV: 33640,
};

/// Data types for WebGL2 indices.
/// https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/drawElements#type
const IndexDataType = {
    UNSIGNED_BYTE: 5121,
    UNSIGNED_SHORT: 5123,
    UNSIGNED_INT: 5125,
};

/// WebGL2 Buffer Usage.
/// See: https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/bufferData#usage
const BufferUsage = {
    STATIC_DRAW: 35044,
    STREAM_DRAW: 35040,
    DYNAMIC_DRAW: 35048,
    STATIC_READ: 35045,
    DYNAMIC_READ: 35049,
    STREAM_READ: 35041,
    STATIC_COPY: 35046,
    DYNAMIC_COPY: 35050,
    STREAM_COPY: 35042,
};


// Engine =================================================================== //


/// Create a shader object from a source string.
/// @param gl The WebGL context.
/// @param name The name of the shader program.
/// @param stage The stage of the shader (vertex or fragment).
/// @param source The GLSL source code of the shader.
function createShader(gl, name, stage, source)
{
    // First, ensure that the shader stage is valid.
    if (stage !== gl.VERTEX_SHADER && stage !== gl.FRAGMENT_SHADER) {
        throw new Error(`Invalid shader stage ${stage} for shader "${name}"`);
    }
    const stageName = stage === gl.VERTEX_SHADER ? "vertex" : "fragment";

    // Next, create the shader object.
    const glShader = gl.createShader(stage);
    if (!glShader) {
        throw new Error(`Failed to create ${stageName} shader "${name}"`);
    }

    // Upload the shader source and compile it.
    gl.shaderSource(glShader, source);
    gl.compileShader(glShader);

    // Check for compilation errors.
    if (!gl.getShaderParameter(glShader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(glShader);
        gl.deleteShader(glShader);
        throw new Error(`Failed to compile ${stageName} shader "${name}": ${info}`);
    }

    // Return the compiled shader, wrapped in a Shader object.
    return {
        name,
        stage,
        source,
        glo: glShader,
    };
}


/// Create a shader program from a vertex and fragment shader.
/// @param gl The WebGL context.
/// @param name The name of the shader program.
/// @param vertexShader The vertex shader.
/// @param fragmentShader The fragment shader.
function createProgram(gl, name, vertex, fragment)
{
    // Check the shader stages.
    if (!gl.isShader(vertex.glo) || vertex.stage !== gl.VERTEX_SHADER) {
        throw new Error(`Invalid vertex shader for program "${name}"`);
    }
    if (!gl.isShader(fragment.glo) || fragment.stage !== gl.FRAGMENT_SHADER) {
        throw new Error(`Invalid fragment shader for program "${name}"`);
    }

    // Create the program object.
    const glProgram = gl.createProgram();
    if (!glProgram) {
        throw new Error(`Failed to create program "${name}"`);
    }

    // Attach the shaders and link the program.
    gl.attachShader(glProgram, vertex.glo);
    gl.attachShader(glProgram, fragment.glo);
    gl.linkProgram(glProgram);

    // Check for linking errors.
    if (!gl.getProgramParameter(glProgram, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(glProgram);
        gl.deleteProgram(glProgram);
        throw new Error(`Failed to link program "${name}": ${info}`);
    }

    // Store the program in a Program object.
    const program = {
        name,
        vertex,
        fragment,
        glo: glProgram,
        // Initialize the attribute and uniform maps.
        attributes: new Map(),
        uniforms: new Map(),
    };

    // Discover all attributes and uniforms of the program.
    updateAttributes(gl, program);
    updateUniforms(gl, program); // Also uploads the default uniform values.

    // Return the linked program, wrapped in a Program object.
    return program;
}


/// Create a new Attribute Buffer Object (ABO).
/// @param gl The WebGL context.
/// @param name The name of the ABO.
/// @param attributes The Attributes to use, consisting of a name and a description with:
/// @param   * `data`: The data of the attribute.
/// @param   * `height`: The number of dimensions of the attribute (the height of a vector/matrix).
/// @param   * `width`: The number of locations used by the attribute (the width of a matrix), defaults to 1.
/// @param   * `type`: The WebGL data type of the attribute, defaults to `FLOAT`.
/// @param   * `normalized`: Whether integral data should be normalized, defaults to `false`.
/// @param usage The usage pattern of the buffer, defaults to STATIC_DRAW.
function createAttributeBuffer(gl, name, attributes, usage)
{
    // Create the attribute layout definitions, and validate the attribute data.
    const layoutDefinitions = new Map();
    let vertexCount;
    let vertexStride = 0;
    for (const [attributeName, attribute] of Object.entries(attributes)) {
        // Create the attribute layout definition for the attribute.
        const layoutDefinition = {
            type: attribute.type || AttributeDataType.FLOAT,
            height: attribute.height,
            width: attribute.width || 1,
            normalized: attribute.normalized
        };

        // Validate the attribute data.
        const attributeSize = layoutDefinition.height * layoutDefinition.width;
        const attributeVertexCount = attribute.data.length / attributeSize;
        if (attributeVertexCount % 1 !== 0) {
            throw new Error(`Attribute "${attributeName}" contains an incomplete vertex`);
        }
        if (vertexCount === undefined) {
            vertexCount = attributeVertexCount;
        }
        else if (vertexCount !== attributeVertexCount) {
            throw new Error(`Attribute buffer "${name}" has inconsistent vertex counts`);
        }
        if (vertexCount === 0) {
            throw new Error(`Attribute "${attributeName}" cannot be empty`);
        }

        // Store the attribute layout definition.
        layoutDefinitions.set(attributeName, layoutDefinition);

        // Add the attribute's byte size to the stride.
        vertexStride += attributeSize * getAttributeDataByteSize(layoutDefinition.type);
    }
    if (vertexCount === undefined) {
        throw new Error(`Attribute Buffer "${name}" must have at least one attribute.`);
    }

    // Create the JavaScript Array Buffer object to store the attribute data.
    const arrayBuffer = new ArrayBuffer(vertexCount * vertexStride);

    // Create various writer functions to define the data in the array buffer.
    const dataView = new DataView(arrayBuffer);
    const writers = new Map([
        [AttributeDataType.BYTE, dataView.setInt8.bind(dataView)],
        [AttributeDataType.UNSIGNED_BYTE, dataView.setUint8.bind(dataView)],
        [AttributeDataType.SHORT, dataView.setInt16.bind(dataView)],
        [AttributeDataType.UNSIGNED_SHORT, dataView.setUint16.bind(dataView)],
        [AttributeDataType.INT, dataView.setInt32.bind(dataView)],
        [AttributeDataType.UNSIGNED_INT, dataView.setUint32.bind(dataView)],
        [AttributeDataType.FLOAT, dataView.setFloat32.bind(dataView)],
    ]);

    // Write each attribute's data to the array buffer, interleaved.
    let startOffset = 0;
    for (const [attributeName, layoutDefinition] of layoutDefinitions.entries()) {
        const writer = writers.get(layoutDefinition.type);
        if (!writer) {
            throw new Error(`Unsupported data type for attribute "${attributeName}" of buffer "${name}"`);
        }
        const attributeData = attributes[attributeName].data;
        const scalarCount = layoutDefinition.height * layoutDefinition.width;
        const scalarByteSize = getAttributeDataByteSize(layoutDefinition.type);
        const attributeByteSize = scalarCount * scalarByteSize;
        const attributeStep = vertexStride - attributeByteSize;

        let byteOffset = startOffset;
        for (let i = 0; i < attributeData.length; i++) {
            writer(byteOffset, attributeData[i], true);
            byteOffset += scalarByteSize; // Move to the next scalar.
            if ((i + 1) % scalarCount === 0) {
                byteOffset += attributeStep; // Move to the next vertex.
            }
        }
        startOffset += attributeByteSize;
    }

    // Create the WebGL buffer object.
    const glBuffer = gl.createBuffer();
    if (!glBuffer) {
        throw new Error(`Failed to create attribute buffer "${name}"`);
    }

    // Bind the buffer and upload the data.
    usage = usage || BufferUsage.STATIC_DRAW;
    try {
        gl.bindBuffer(gl.ARRAY_BUFFER, glBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, arrayBuffer, usage);
    }
    finally {
        // Always unbind the buffer when done.
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }

    // Return the attribute buffer object.
    return {
        name,
        size: vertexCount,
        attributes: layoutDefinitions,
        usage,
        glo: glBuffer,
    };
}


/// Create a new Index Buffer Object (IBO).
/// @param gl The WebGL context.
/// @param indices A JavaScript array containing the indices.
function createIndexBuffer(gl, name, indices, usage)
{

    // Ensure that the indicies are valid.
    if (indices.length === 0) {
        throw new Error(`Index buffer "${name}" must have at least one index.`);
    }
    if (indices.length % 3 !== 0) {
        throw new Error(`Index buffer "${name}" size must be a multiple of 3.`);
    }

    // Find the highest index.
    let highestIndex = 0;
    for (const index of indices) {
        highestIndex = Math.max(highestIndex, index);
    }

    // Determine the best data type for the index buffer.
    let type;
    if (highestIndex < 256) {
        type = IndexDataType.UNSIGNED_BYTE;
    }
    else if (highestIndex < 65536) {
        type = IndexDataType.UNSIGNED_SHORT;
    }
    else if (highestIndex < 4294967296) {
        type = IndexDataType.UNSIGNED_INT;
    }
    else {
        throw new Error(`Index ${highestIndex} does not fit in a 32-bit unsigned integer.`);
    }

    // Create the data array.
    let data;
    switch (type) {
        case (IndexDataType.UNSIGNED_BYTE):
            data = new Uint8Array(indices);
            break;
        case (IndexDataType.UNSIGNED_SHORT):
            data = new Uint16Array(indices);
            break;
        case (IndexDataType.UNSIGNED_INT):
            data = new Uint32Array(indices);
            break;
    }

    // Create the buffer.
    const glBuffer = gl.createBuffer();
    if (!glBuffer) {
        throw new Error(`Failed to create index buffer "${name}"`);
    }

    // Bind the buffer and upload the data.
    usage = usage || BufferUsage.STATIC_DRAW;
    try {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, usage);
    }
    finally {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    }

    // Return the buffer information.
    return {
        type,
        size: indices.length,
        usage,
        glo: glBuffer,
    };
}


function createVertexArrayObject(gl, name, ibo, attributeBuffers, program)
{
    // Create the Vertex Array Object.
    const vao = gl.createVertexArray();
    if (!vao) {
        throw new Error(`Failed to create VAO "${name}"`);
    }

    // Define the attribute bindings.
    const attributes = new Map();
    try {
        // Bind the VAO.
        gl.bindVertexArray(vao);

        // Bind the index buffer.
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo.glo);

        // Normalize the attribute buffers array.
        if (!Array.isArray(attributeBuffers)) {
            attributeBuffers = [attributeBuffers];
        }

        // Go through all attribute buffers and match them with attributes
        // in the shader program.
        for (const attributeBuffer of attributeBuffers) {

            // Bind the attribute buffer.
            gl.bindBuffer(gl.ARRAY_BUFFER, attributeBuffer.glo);

            // Calculate the vertex stride of the buffer.
            const stride = calculateStride(attributeBuffer);
            let nextAttributeOffset = 0;

            // Go through all attributes in the buffer.
            for (const [attributeName, attributeLayout] of attributeBuffer.attributes) {

                // Calculate the offset of the attribute.
                const offset = nextAttributeOffset;
                nextAttributeOffset += getAttributeByteSize(attributeLayout);

                // Find the attribute in the shader program.
                const shaderAttribute = program.attributes.get(attributeName);
                if (!shaderAttribute) {
                    continue; // Skip attributes not used in the program.
                }

                // If the attribute has already been matched, two buffers define
                // the same attribute, which is okay but reason for a warning.
                if (attributes.has(shaderAttribute.location)) {
                    const otherBuffer = attributes.get(shaderAttribute.location).buffer;
                    console.warn(`Ignoring attribute "${attributeName}" in buffer "${attributeBuffer.name}" as the attribute is already bound to buffer "${otherBuffer.name}".`);
                    continue;
                }

                // These things are possible, but not supported yet in glance-dev.
                if (attributeLayout.width > 1) {
                    throw new Error("Matrix attributes are not yet supported in glance-dev");
                }
                if (isIntegerType(attributeLayout.type)) {
                    throw new Error("Integer attributes are not yet supported in glance-dev");
                }

                // Store the attribute reference.
                const location = shaderAttribute.location;
                attributes.set(location, {
                    buffer: attributeBuffer,
                    name: attributeName,
                });

                // Enable the attribute and define its layout.
                gl.enableVertexAttribArray(location);
                gl.vertexAttribPointer(
                    location,
                    attributeLayout.height,
                    attributeLayout.type,
                    attributeLayout.normalized || false,
                    stride,
                    offset,
                );
            }
        }
    }

    // Report any errors.
    catch (error) {
        gl.bindVertexArray(null);
        gl.deleteVertexArray(vao);
        throw error;
    }

    // Reset the WebGL state.
    finally {
        // Unbind the VAO before unbiding the IBO, so the VAO remembers the IBO.
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    }

    return {
        name,
        ibo,
        attributes,
        glo: vao,
    };
}


/// Create a new draw call.
function createDrawCall(name, vao, program, count = -1, offset = 0)
{
    // The draw call is simply a collection of values used in `draw()`.
    return {
        name,
        vao,
        program,
        count: count < 0 ? vao.ibo.size : count,
        offset,
        uniform: {},
    };
}


/// Execute a draw call.
function draw(gl, drawCall)
{
    // Use the program and VAO.
    const vao = drawCall.vao;
    const program = drawCall.program;
    gl.useProgram(program.glo);
    gl.bindVertexArray(vao.glo);

    // Update the draw call's uniform values.
    for (const [uniformName, newValue] of Object.entries(drawCall.uniform)) {
        const uniform = program.uniforms.get(uniformName);
        if (!uniform) {
            throw new Error(`Uniform "${uniformName}" not found in program "${program.name}"`);
        }
        if (!areEqual(uniform.value, newValue)) {
            uniform.value = newValue;
            uploadUniform(gl, uniform);
        }
    }

    // Perform the draw call.
    gl.drawElements(gl.TRIANGLES, drawCall.count, vao.ibo.type, drawCall.offset);
}


// Helper functions ========================================================= //


/// Find and update all attributes in a compiled shader program.
function updateAttributes(gl, program)
{
    const regex = /^\s*(?:layout\s*\(location\s*=\s*(?<location>\d+)\)\s*)?in\s+(?:(?<precision>lowp|mediump|highp)\s+)?(?<type>\w+)\s+(?<name>\w+)\s*;/gm;

    // Remove existing attributes.
    program.attributes.clear();

    // Find attributes in the vertex shader.
    let match;
    while ((match = regex.exec(program.vertex.source)) !== null) {

        // Extract the attribute information from the source.
        const { name, type, location, precision } = match.groups;

        // Skip attributes that are not used in the program.
        const attributeLocation = gl.getAttribLocation(program.glo, name);
        if (attributeLocation < 0) {
            continue;
        }

        // Store the attribute information.
        program.attributes.set(name, {
            type,
            location: attributeLocation,
            precision,
        });
    }
}


/// Find and update all uniforms in a compiled shader program.
function updateUniforms(gl, program)
{
    const regex = /^\s*uniform\s+(?<precision>lowp|mediump|highp)?\s*(?<type>\w+)\s+(?<name>\w+)(?:\s*\[\s*(?<sizeString>\d+)\s*\])?\s*;/gm;

    // Remove existing uniforms.
    program.uniforms.clear();

    // Find uniforms in both the vertex and fragment shaders.
    let match;
    for (const source of [program.vertex.source, program.fragment.source]) {
        while ((match = regex.exec(source)) !== null) {

            // Extract the uniform information from the source.
            const { name, type, precision, sizeString } = match.groups;

            // Skip known uniforms.
            if (program.uniforms.has(name)) {
                continue;
            }

            // Skip uniforms that are not used in the program.
            const location = gl.getUniformLocation(program.glo, name);
            if (!location) {
                continue;
            }

            // Non-array uniforms are always size 1.
            const size = sizeString ? parseInt(sizeString) : 1;

            // Store the uniform information.
            program.uniforms.set(name, {
                type,
                location,
                size,
                value: getDefaultUniformValue(type, size),
                precision,
            });
        }
    }

    // Upload the uniform values.
    try {
        gl.useProgram(program.glo);
        for (const uniform of program.uniforms.values()) {
            uploadUniform(gl, uniform);
        }
    }
    finally {
        // Always unbind the program when done.
        gl.useProgram(null);
    }
}


/// Produce a reasonable default value for a uniform based on its type.
/// @param type GLSL type of the uniform.
/// @param size Size of the uniform (for arrays).
/// @returns A default value for the uniform.
function getDefaultUniformValue(type, size)
{
    let defaultValue;
    switch (type) {
        case 'float':
        case 'int':
        case 'uint':
        case 'bool':
        case 'sampler2D':
        case 'sampler2DArray':
        case 'samplerCube':
        case 'sampler3D':
        case 'isampler2D':
        case 'isampler2DArray':
        case 'isamplerCube':
        case 'isampler3D':
        case 'usampler2D':
        case 'usampler2DArray':
        case 'usamplerCube':
        case 'usampler3D':
        case 'sampler2DShadow':
        case 'sampler2DArrayShadow':
        case 'samplerCubeShadow':
            defaultValue = 0;
            break;
        case 'vec2':
        case 'ivec2':
        case 'uvec2':
        case 'bvec2':
            defaultValue = [0, 0];
            break;
        case 'vec3':
        case 'ivec3':
        case 'uvec3':
        case 'bvec3':
            defaultValue = [0, 0, 0];
            break;
        case 'vec4':
        case 'ivec4':
        case 'uvec4':
        case 'bvec4':
            defaultValue = [0, 0, 0, 0];
            break;
        case 'mat2':
        case 'mat2x2':
            defaultValue = [
                1, 0,
                0, 1,
            ];
            break;
        case 'mat3':
        case 'mat3x3':
            defaultValue = [
                1, 0, 0,
                0, 1, 0,
                0, 0, 1,
            ];
            break;
        case 'mat4':
        case 'mat4x4':
            defaultValue = [
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                0, 0, 0, 1,
            ];
            break;
        case 'mat2x3':
            defaultValue = [
                1, 0,
                0, 1,
                0, 0,
            ];
            break;
        case 'mat2x4':
            defaultValue = [
                1, 0,
                0, 1,
                0, 0,
                0, 0,
            ];
            break;
        case 'mat3x2':
            defaultValue = [
                1, 0, 0,
                0, 1, 0,
            ];
            break;
        case 'mat3x4':
            defaultValue = [
                1, 0, 0,
                0, 1, 0,
                0, 0, 1,
                0, 0, 0,
            ];
            break;
        case 'mat4x2':
            defaultValue = [
                1, 0, 0, 0,
                0, 1, 0, 0,
            ];
            break;
        case 'mat4x3':
            defaultValue = [
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
            ];
            break;
    }
    // If the uniform is an array of size n, repeat the default value n times.
    if (size === 1) {
        return defaultValue;
    }
    else {
        return Array(size).fill(defaultValue).flat();
    }
}


/// Uploads a uniform to the GPU.
/// The shader program containing the uniform must be in use when calling this function.
function uploadUniform(gl, uniform)
{
    switch (uniform.type) {
        case 'float':
            return gl.uniform1f(uniform.location, uniform.value);
        case 'vec2':
            return gl.uniform2fv(uniform.location, uniform.value);
        case 'vec3':
            return gl.uniform3fv(uniform.location, uniform.value);
        case 'vec4':
            return gl.uniform4fv(uniform.location, uniform.value);
        case 'mat2':
        case 'mat2x2':
            return gl.uniformMatrix2fv(uniform.location, false, uniform.value);
        case 'mat3':
        case 'mat3x3':
            return gl.uniformMatrix3fv(uniform.location, false, uniform.value);
        case 'mat4':
        case 'mat4x4':
            return gl.uniformMatrix4fv(uniform.location, false, uniform.value);
        case 'int':
        case 'sampler2D':
        case 'sampler2DArray':
        case 'samplerCube':
        case 'sampler3D':
        case 'isampler2D':
        case 'isampler2DArray':
        case 'isamplerCube':
        case 'isampler3D':
        case 'usampler2D':
        case 'usampler2DArray':
        case 'usamplerCube':
        case 'usampler3D':
        case 'sampler2DShadow':
        case 'sampler2DArrayShadow':
        case 'samplerCubeShadow':
            return gl.uniform1i(uniform.location, uniform.value);
        case 'uint':
            return gl.uniform1ui(uniform.location, uniform.value);
        case 'bool':
            return gl.uniform1i(uniform.location, uniform.value ? 1 : 0);
        case 'mat2x3':
            return gl.uniformMatrix2x3fv(uniform.location, false, uniform.value);
        case 'mat3x2':
            return gl.uniformMatrix3x2fv(uniform.location, false, uniform.value);
        case 'mat2x4':
            return gl.uniformMatrix2x4fv(uniform.location, false, uniform.value);
        case 'mat4x2':
            return gl.uniformMatrix4x2fv(uniform.location, false, uniform.value);
        case 'mat3x4':
            return gl.uniformMatrix3x4fv(uniform.location, false, uniform.value);
        case 'mat4x3':
            return gl.uniformMatrix4x3fv(uniform.location, false, uniform.value);
        case 'ivec2':
            return gl.uniform2iv(uniform.location, uniform.value);
        case 'ivec3':
            return gl.uniform3iv(uniform.location, uniform.value);
        case 'ivec4':
            return gl.uniform4iv(uniform.location, uniform.value);
        case 'uvec2':
            return gl.uniform2uiv(uniform.location, uniform.value);
        case 'uvec3':
            return gl.uniform3uiv(uniform.location, uniform.value);
        case 'uvec4':
            return gl.uniform4uiv(uniform.location, uniform.value);
        case 'bvec2':
            return gl.uniform2iv(uniform.location, uniform.value);
        case 'bvec3':
            return gl.uniform3iv(uniform.location, uniform.value);
        case 'bvec4':
            return gl.uniform4iv(uniform.location, uniform.value);
    }
}

/// Get the size of an attribute data type in bytes.
function getAttributeDataByteSize(type)
{
    switch (type) {
        case (AttributeDataType.BYTE):
        case (AttributeDataType.UNSIGNED_BYTE):
            return 1;
        case (AttributeDataType.SHORT):
        case (AttributeDataType.UNSIGNED_SHORT):
            return 2;
        case (AttributeDataType.INT):
        case (AttributeDataType.UNSIGNED_INT):
        case (AttributeDataType.FLOAT):
            return 4;
    }
}


/// Calculate the byte size of an attribute in an attribute buffer.
function getAttributeByteSize(description)
{
    return getAttributeDataByteSize(description.type) * description.height * description.width;
}


/// Calculate the stride of an attribute buffer in bytes.
function calculateStride(buffer)
{
    let stride = 0;
    for (const attributeLayout of buffer.attributes.values()) {
        stride += getAttributeByteSize(attributeLayout);
    }
    return stride;
}


/// Check if an attribute data type is an integer type.
function isIntegerType(type)
{
    return type === AttributeDataType.BYTE
        || type === AttributeDataType.UNSIGNED_BYTE
        || type === AttributeDataType.SHORT
        || type === AttributeDataType.UNSIGNED_SHORT
        || type === AttributeDataType.INT
        || type === AttributeDataType.UNSIGNED_INT;
}

/// Deep value equality check for any two values.
function areEqual(a, b)
{
    if (a === b) return true;
    if (a === null || b === null || a === undefined || b === undefined) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a !== "object") return false;
    if (Array.isArray(a)) {
        if (!Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!areEqual(a[i], b[i])) return false;
        }
    } else {
        const keysA = Object.keys(a);
        if (keysA.length !== Object.keys(b).length) return false;
        for (const key of keysA) {
            if (!areEqual(a[key], b[key])) return false;
        }
    }
    return true;
}


// ========================================================================== //
// ========================================================================== //


// 1. Data /////////////////////////////////////////////////////////////////

// Vertex Shader Source
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

// Fragment Shader Source
const fragmentShaderSource = `#version 300 es
    precision mediump float;
    uniform float u_time;

    in vec4 v_color;
    in vec2 v_uv;

    out vec4 o_fragColor;

    void main() {
        float distance = sin(length(v_uv) * 8. - u_time * 0.0002) / 8.;
        float activation = smoothstep(0.0, 0.1, abs(distance));
        o_fragColor = activation * v_color;
    }`;

// Attributes
const attributes1 = {
    a_pos: {
        data: [
            -1, -1,
            +1, -1,
            -1, +1,
            +1, +1,
        ],
        height: 2
    },
    a_color: {
        data: [
            1, 0, 0,
            0, 1, 0,
            0, 0, 1,
            1, 1, 1,
        ],
        height: 3,
    }
};

// Indices
const indices = [0, 1, 2, 1, 3, 2];

// 2. WebGL "Building Blocks" //////////////////////////////////////////////

// Basic
const vs = createShader(gl, "my vertex shader", ShaderStage.VERTEX, vertexShaderSource);
const fs = createShader(gl, "my fragment shader", ShaderStage.FRAGMENT, fragmentShaderSource);
const abo1 = createAttributeBuffer(gl, "my abo", attributes1);
const ibo = createIndexBuffer(gl, "my ibo", indices);

// Compound
const program = createProgram(gl, "my program", vs, fs);
const vao = createVertexArrayObject(gl, "my vao", ibo, abo1, program);

// Draw Call
const quad = createDrawCall("my draw call", vao, program);


// Zweites Objekt (Dreieck) ////////////////////////////////////////////////

// Vertex Shader Source
const vertexShaderSource2 = `#version 300 es
    precision highp float;
    in vec2 a_pos;
    in vec3 a_color;
    out vec4 v_color;
    void main() {
        gl_Position = vec4(a_pos, 0.0, 1.0);
        v_color = vec4(a_color, 1.0);
    }`;

// Fragment Shader Source
const fragmentShaderSource2 = `#version 300 es
    precision mediump float;
    in vec4 v_color;
    out vec4 o_fragColor;
    void main() { o_fragColor = v_color; }`;

// Attributes
const attributes2 = {
    a_pos: {
        data: [-1, -1, +1, -1, 0, +1],
        height: 2
    }
};

// Indices
const indices2 = [0, 1, 2];

const vs2 = createShader(gl, "my vertex shader2", ShaderStage.VERTEX, vertexShaderSource2);
const fs2 = createShader(gl, "my fragment shader2", ShaderStage.FRAGMENT, fragmentShaderSource2);
const abo2 = createAttributeBuffer(gl, "my abo2", attributes2);
const ibo2 = createIndexBuffer(gl, "my ibo2", indices2);

// Compound
const program2 = createProgram(gl, "my program2", vs2, fs2);
const vao2 = createVertexArrayObject(gl, "my vao2", ibo2, [abo2, abo1], program2);

// Draw Call
const triangle = createDrawCall("my draw call2", vao2, program2);

// 3. Render Loop //////////////////////////////////////////////////////////

function myRenderLoop(time)
{
    quad.uniform.u_time = time;
    draw(gl, quad);
    draw(gl, triangle);
}
setRenderLoop(myRenderLoop);
