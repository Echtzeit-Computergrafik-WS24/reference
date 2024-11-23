import { areEqual, assertUnreachable, clone, logWarning, throwError, } from "./dev.js";
import { AttributeDataType, BlendFunc, BufferUsage, CullFace, DepthTest, DrawMode, IndexDataType, } from "./types.js";
export { getContext, createShader, createProgram, createAttributeBuffer, createIndexBuffer, createVertexArrayObject, createDrawCall, draw, };
// Core ===================================================================== //
/// Get the WebGL2 context from a canvas element in the DOM.
/// The defaults followed by this call do not match the defaults of the WebGL2 context but instead reflect an
/// opintionated set for the expected glance use-cases.
/// See https://registry.khronos.org/webgl/specs/latest/1.0/index.html#5.1 an explanation of the arguments.
/// The option `failIfMajorPerformanceCaveat` is always set to `false` because glance is essential where used.
/// @param canvas The canvas element or its id.
/// @param options The WebGL2 context options:
///  - `alpha`: Whether to enable alpha. Defaults to `true` because it is expensive to disable.
///      See https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#avoid_alphafalse_which_can_be_expensive)
///  - `depth`: Whether to enable depth. Defaults to `true`.
///  - `stencil`: Whether to enable stencil. Defaults to `false`.
///  - `antialias`: Whether to enable antialiasing. Defaults to `false` because it is expensive.
///  - `premultipliedAlpha`: Whether to enable premultiplied alpha. Defaults to `false` because we do not pre-multiply
///      our alpha in a teaching context and setting this to `true` results in unexpected blending with the background.
///  - `preserveDrawingBuffer`: Whether to preserve the drawing buffer. Defaults to `true`,
///      because it is useful for debugging and follows OpenGL's behavior
///  - `powerPreference`: The power preference. Defaults to `high-performance`, because we want to use the dedicated GPU
///      See: https://toji.dev/webgpu-best-practices/webgl-performance-comparison
///  - `desynchronized`: Whether to enable desynchronized. Defaults to `true` for performance reasons,
///      until we have a reason to change it (tearing)
/// @return The WebGL2 context.
/// @throws If the canvas element could not be found or if WebGL2 is not supported.
function getContext(canvas, options = {}) {
    // Get the canvas element.
    let canvasElement = null;
    if (typeof canvas === 'string') {
        canvasElement = document.querySelector(`#${canvas}`);
        if (canvasElement == null) {
            throwError(() => `Could not find canvas element with id "${canvas}"`);
        }
    }
    else if (canvas instanceof HTMLCanvasElement) {
        canvasElement = canvas;
    }
    else {
        throwError(() => `Invalid canvas element "${canvas}"`);
    }
    const canvasId = canvasElement.id ?? 'unnamed canvas';
    const gl = canvasElement.getContext('webgl2', {
        alpha: options.alpha ?? true,
        depth: options.depth ?? true,
        stencil: options.stencil ?? false,
        antialias: options.antialias ?? false,
        premultipliedAlpha: options.premultipliedAlpha ?? false,
        preserveDrawingBuffer: options.preserveDrawingBuffer ?? true,
        powerPreference: options.powerPreference ?? 'high-performance',
        desynchronized: options.desynchronized ?? true,
    });
    if (gl == null) {
        throwError(() => `Could not acquire a WebGL2 context from canvas "${canvasId}"`);
    }
    // Test various WebGL2 extensions.
    if (gl.getExtension('EXT_color_buffer_float') == null) {
        logWarning(() => 'EXT_color_buffer_float is not supported.');
    }
    return gl;
}
/// Create a shader object from a source string.
/// @param gl The WebGL context.
/// @param name The name of the shader program.
/// @param stage The stage of the shader (vertex or fragment).
/// @param source The GLSL source code of the shader.
function createShader(gl, name, stage, source) {
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
function createProgram(gl, name, vertex, fragment) {
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
/// @param   * `divisor`: Attribute divisor, used for attribute instances, defaults to zero.
/// @param usage The usage pattern of the buffer, defaults to STATIC_DRAW.
function createAttributeBuffer(gl, name, attributes, usage) {
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
            normalized: attribute.normalized,
            divisor: attribute.divisor,
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
        // TODO: this is missing the half float and packed types from the old core
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
        vertexCount,
        attributes: layoutDefinitions,
        usage,
        glo: glBuffer,
    };
}
/// Create a new Index Buffer Object (IBO).
/// @param gl The WebGL context.
/// @param indices A JavaScript array containing the indices.
function createIndexBuffer(gl, name, indices, usage) {
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
        drawMode: DrawMode.TRIANGLES,
        glo: glBuffer,
    };
}
/// Create a new Vertex Array Object (VAO).
/// @param gl The WebGL context.
/// @param name The name of the VAO.
/// @param ibo The index buffer.
/// @param attributeBuffers The attribute buffers.
function createVertexArrayObject(gl, name, ibo, attributeBuffers, program) {
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
                const attributeOffset = nextAttributeOffset;
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
                // Store the attribute reference.
                attributes.set(shaderAttribute.location, {
                    buffer: attributeBuffer,
                    name: attributeName,
                });
                const attributeByteHeight = attributeLayout.height * getAttributeDataByteSize(attributeLayout.type);
                // Enable the attribute and set up the pointer.
                // If an attribute is a matrix, it will be split into multiple
                // locations. Therefore we need to keep track not only of the
                // "height" of an attribute (float: 1, vec2: 2, vec3: 3, etc.),
                // but also of its "width". The width of a scalar or vector is
                // 1, the width of a matrix is the number of columns.
                for (let locationOffset = 0; locationOffset < attributeLayout.width; ++locationOffset) {
                    const location = shaderAttribute.location + locationOffset;
                    const offset = attributeOffset + (locationOffset * attributeByteHeight);
                    gl.enableVertexAttribArray(location);
                    // Integer attributes have their own pointer function...
                    if (isIntegerType(attributeLayout.type)) {
                        gl.vertexAttribIPointer(location, attributeLayout.height, attributeLayout.type, stride, offset);
                    }
                    else {
                        gl.vertexAttribPointer(location, attributeLayout.height, attributeLayout.type, attributeLayout.normalized || false, stride, offset);
                    }
                    // The attribute divisor is used for instancing.
                    gl.vertexAttribDivisor(location, attributeLayout.divisor || 0);
                }
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
function createDrawCall(name, vao, program, indexCount = -1, indexOffset = 0) {
    // The draw call is simply a collection of values used in `draw()`.
    return {
        name,
        program,
        vao,
        textures: new Map(),
        enabled: true,
        indexCount: indexCount < 0 ? vao.ibo.size : indexCount,
        indexOffset,
        cullFace: CullFace.NONE,
        depthTest: DepthTest.ALWAYS,
        blendFunc: [BlendFunc.ONE, BlendFunc.ZERO],
        updateDepthBuffer: true,
        instances: 1,
        uniform: {},
    };
}
/// Execute a draw call.
function draw(gl, drawCall) {
    // Return early if the draw call is disabled.
    if (drawCall.enabled === false) {
        return;
    }
    try {
        // Bind the shader program and VAO.
        const vao = drawCall.vao;
        const program = drawCall.program;
        gl.useProgram(program.glo);
        gl.bindVertexArray(vao.glo);
        // TODO: commented out until we get there in the lecture
        // // Set up the WebGL state for the draw call.
        // if (drawCall.cullFace !== CullFace.NONE) {
        //     gl.enable(gl.CULL_FACE);
        //     gl.cullFace(drawCall.cullFace);
        // }
        // if (drawCall.depthTest !== DepthTest.NONE) {
        //     gl.enable(gl.DEPTH_TEST);
        //     gl.depthFunc(drawCall.depthTest);
        // }
        // if (drawCall.blendFunc[0] !== BlendFunc.ONE || drawCall.blendFunc[1] !== BlendFunc.ZERO) {
        //     gl.enable(gl.BLEND);
        //     if (drawCall.blendFunc.length === 4) {
        //         gl.blendFuncSeparate(
        //             drawCall.blendFunc[0], drawCall.blendFunc[1],
        //             drawCall.blendFunc[2], drawCall.blendFunc[3]);
        //     } else if (drawCall.blendFunc.length === 2) {
        //         gl.blendFunc(drawCall.blendFunc[0], drawCall.blendFunc[1]);
        //     } else {
        //         throwError(() => `Invalid blend function array length: ${drawCall.blendFunc.length}.`);
        //     }
        // }
        // gl.depthMask(drawCall.updateDepthBuffer);
        // Update the draw call's uniform values.
        for (const [uniformName, newValue] of Object.entries(drawCall.uniform)) {
            const uniform = program.uniforms.get(uniformName);
            if (!uniform) {
                throw new Error(`Uniform "${uniformName}" not found in program "${program.name}"`);
            }
            // Check if the new value is different from the current value.
            // We use a custom function to compare the values because `===` does not work for arrays.
            if (!areEqual(uniform.value, newValue)) {
                // Store a copy of the new value in the uniform.
                // Do not store the reference as it might be mutated later.
                uniform.value = clone(newValue);
                uploadUniform(gl, uniform);
            }
        }
        // // Bind the textures
        // for (const [id, unit] of drawCall.textures) {
        //     gl.activeTexture(gl.TEXTURE0 + id);
        //     if (unit.texture_2d !== undefined) {
        //         gl.bindTexture(gl.TEXTURE_2D, unit.texture_2d.glObject);
        //     }
        //     if (unit.texture_3d !== undefined) {
        //         gl.bindTexture(gl.TEXTURE_3D, unit.texture_3d.glObject);
        //     }
        //     if (unit.texture_cube !== undefined) {
        //         gl.bindTexture(gl.TEXTURE_CUBE_MAP, unit.texture_cube.glObject);
        //     }
        //     if (unit.texture_2d_array !== undefined) {
        //         gl.bindTexture(gl.TEXTURE_2D_ARRAY, unit.texture_2d_array.glObject);
        //     }
        // }
        // Find out how many instances to draw.
        let instances = drawCall.instances ?? 1;
        if (isNaN(instances) || !isFinite(instances) || instances < 1) {
            throwError(() => `Invalid instance count: ${instances}.`);
        }
        // Perform the draw call.
        if (instances == 1) {
            gl.drawElements(vao.ibo.drawMode, drawCall.indexCount, drawCall.vao.ibo.type, drawCall.indexOffset);
        }
        else {
            gl.drawElementsInstanced(vao.ibo.drawMode, drawCall.indexCount, drawCall.vao.ibo.type, drawCall.indexOffset, instances);
        }
    }
    // Always reset the WebGL state.
    finally {
        // gl.depthMask(true);
        // gl.blendFunc(gl.ONE, gl.ZERO);
        // gl.disable(gl.BLEND);
        // gl.depthFunc(gl.ALWAYS);
        // gl.disable(gl.DEPTH_TEST);
        // gl.cullFace(gl.BACK);
        // gl.disable(gl.CULL_FACE);
        gl.useProgram(null);
        gl.bindVertexArray(null);
    }
}
// Helper =================================================================== //
/// Find and update all attributes in a compiled shader program.
function updateAttributes(gl, program) {
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
function updateUniforms(gl, program) {
    const regex = /^\s*uniform\s+(?<precision>lowp|mediump|highp)?\s*(?<type>\w+)\s+(?<name>\w+)(?:\s*\[\s*(?<sizeString>\d+)\s*\])?\s*;/gm;
    // Remove existing uniforms.
    program.uniforms.clear();
    // Find uniforms in both the vertex and fragment shaders.
    let match;
    for (let source of [program.vertex.source, program.fragment.source]) {
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
function getDefaultUniformValue(type, size) {
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
                0, 1
            ];
            break;
        case 'mat3':
        case 'mat3x3':
            defaultValue = [
                1, 0, 0,
                0, 1, 0,
                0, 0, 1
            ];
            break;
        case 'mat4':
        case 'mat4x4':
            defaultValue = [
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                0, 0, 0, 1
            ];
            break;
        case 'mat2x3':
            defaultValue = [
                1, 0,
                0, 1,
                0, 0
            ];
            break;
        case 'mat2x4':
            defaultValue = [
                1, 0,
                0, 1,
                0, 0,
                0, 0
            ];
            break;
        case 'mat3x2':
            defaultValue = [
                1, 0, 0,
                0, 1, 0
            ];
            break;
        case 'mat3x4':
            defaultValue = [
                1, 0, 0,
                0, 1, 0,
                0, 0, 1,
                0, 0, 0
            ];
            break;
        case 'mat4x2':
            defaultValue = [
                1, 0, 0, 0,
                0, 1, 0, 0
            ];
            break;
        case 'mat4x3':
            defaultValue = [
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0
            ];
            break;
        default:
            assertUnreachable(type);
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
function uploadUniform(gl, uniform) {
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
        default:
            assertUnreachable(uniform.type);
    }
}
/// Get the size of an attribute data type in bytes.
function getAttributeDataByteSize(type) {
    switch (type) {
        case (AttributeDataType.BYTE):
        case (AttributeDataType.UNSIGNED_BYTE):
            return 1;
        case (AttributeDataType.SHORT):
        case (AttributeDataType.UNSIGNED_SHORT):
        case (AttributeDataType.HALF_FLOAT):
            return 2;
        case (AttributeDataType.INT):
        case (AttributeDataType.UNSIGNED_INT):
        case (AttributeDataType.FLOAT):
        case (AttributeDataType.INT_2_10_10_10_REV):
        case (AttributeDataType.UNSIGNED_INT_2_10_10_10_REV):
            return 4;
        default:
            assertUnreachable(type);
    }
}
/// Calculate the byte size of an attribute in an attribute buffer.
function getAttributeByteSize(description) {
    return getAttributeDataByteSize(description.type) * description.height * description.width;
}
/// Calculate the stride of an attribute buffer in bytes.
function calculateStride(buffer) {
    let stride = 0;
    for (const attributeLayout of buffer.attributes.values()) {
        stride += getAttributeByteSize(attributeLayout);
    }
    return stride;
}
/// Check if an attribute data type is an integer type.
function isIntegerType(type) {
    return type === AttributeDataType.BYTE
        || type === AttributeDataType.UNSIGNED_BYTE
        || type === AttributeDataType.SHORT
        || type === AttributeDataType.UNSIGNED_SHORT
        || type === AttributeDataType.INT
        || type === AttributeDataType.UNSIGNED_INT;
}
