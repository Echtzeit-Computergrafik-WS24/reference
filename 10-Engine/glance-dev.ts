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

// Types and Constants ====================================================== //

/// Acceptable Vertex Shader Input (Attribute) types.
/// Note that `matnxm` means "A matrix with n columns and m rows"
/// See https://www.khronos.org/opengl/wiki/Data_Type_(GLSL)#Matrices
/// See chapter 4.3.4 of:
///  https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf
type GlslAttributeDataType =
    | "int" | "ivec2" | "ivec3" | "ivec4"
    | "uint" | "uvec2" | "uvec3" | "uvec4"
    | "float" | "vec2" | "vec3" | "vec4"
    | "mat2" | "mat2x2" | "mat2x3" | "mat2x4"
    | "mat3" | "mat3x2" | "mat3x3" | "mat3x4"
    | "mat4" | "mat4x2" | "mat4x3" | "mat4x4";

/// Acceptable Uniform Shader Input types.
/// See chapter 4.3.5 of:
///  https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf
/// Note that this does not cover the case where a Uniform is a struct or an
/// array of structs. See:
///  https://www.khronos.org/opengl/wiki/Uniform_(GLSL)#Uniform_management
type GlslUniformDataType = GlslAttributeDataType
    | "bool" | "bvec2" | "bvec3" | "bvec4"
    | "sampler2D" | "sampler2DArray" | "samplerCube" | "sampler3D"
    | "isampler2D" | "isampler2DArray" | "isamplerCube" | "isampler3D"
    | "usampler2D" | "usampler2DArray" | "usamplerCube" | "usampler3D"
    | "sampler2DShadow" | "sampler2DArrayShadow" | "samplerCubeShadow";

/// GLSL data precisions.
type GlslPrecision = "lowp" | "mediump" | "highp";

/// WebGL2 Shader stages.
const enum ShaderStage
{
    VERTEX = 0x8B31,
    FRAGMENT = 0x8B30,
}

/// GLSL Attributes can be 1, 2, 3 or 4 dimensional.
/// https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/vertexAttribPointer#size
type AttributeSize = 1 | 2 | 3 | 4;

/// Data types for WebGL2 attributes.
/// https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/vertexAttribPointer#type
const enum AttributeDataType
{
    BYTE = 0x1400,
    UNSIGNED_BYTE = 0x1401,
    SHORT = 0x1402,
    UNSIGNED_SHORT = 0x1403,
    INT = 0x1404,
    UNSIGNED_INT = 0x1405,
    FLOAT = 0x1406,
    // These types are valid, but require bit-fiddling operations and we won't use them.
    // HALF_FLOAT = 0x140B,
    // INT_2_10_10_10_REV = 0x8D9F,
    // UNSIGNED_INT_2_10_10_10_REV = 0x8368,
}

/// Data types for WebGL2 indices.
/// https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/drawElements#type
const enum IndexDataType
{
    UNSIGNED_BYTE = 0x1401,
    UNSIGNED_SHORT = 0x1403,
    UNSIGNED_INT = 0x1405,
}

/// WebGL2 Buffer Usage.
/// See: https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/bufferData#usage
const enum BufferUsage
{
    // The contents of the buffer are likely to be used often and not change often.
    STATIC_DRAW = 0x88E4,
    // The contents of the buffer are likely to not be used often.
    STREAM_DRAW = 0x88E0,
    // The contents of the buffer are likely to be used often and change often.
    DYNAMIC_DRAW = 0x88E8,
    // The contents are intended to be specified once by reading data from WebGL, and queried many times by the application.
    STATIC_READ = 0x88E5,
    // The contents are intended to be respecified repeatedly by reading data from WebGL, and queried many times by the application.
    DYNAMIC_READ = 0x88E9,
    // The contents are intended to be specified once by reading data from WebGL, and queried at most a few times by the application
    STREAM_READ = 0x88E1,
    // The contents are intended to be specified once by reading data from WebGL, and used many times as the source for WebGL drawing and image specification commands.
    STATIC_COPY = 0x88E6,
    // The contents are intended to be respecified repeatedly by reading data from WebGL, and used many times as the source for WebGL drawing and image specification commands.
    DYNAMIC_COPY = 0x88EA,
    // The contents are intended to be specified once by reading data from WebGL, and used at most a few times as the source for WebGL drawing and image specification commands.
    STREAM_COPY = 0x88E2,
}

/// All information about an Attribute in a Shader Program.
type ShaderAttribute = {
    /// The GLSL data type of the attribute.
    readonly type: GlslAttributeDataType,

    /// The location of the attribute on the shader program.
    readonly location: number,

    /// The precision qualifier of the attribute. Defaults to undefined.
    readonly precision?: GlslPrecision,
};

/// Information about the layout of an attribute in an attribute buffer.
type AttributeLayoutDefinition = {
    /// WebGL data type of the Attribute.
    readonly type: AttributeDataType,

    /// Number of dimensions of the Attribute (the height of a vector/matrix).
    readonly height: AttributeSize,

    /// Number of locations used by the Attribute (the width of a matrix).
    readonly width: AttributeSize,

    /// Whether integral data should be normalized. Defaults to false.
    readonly normalized?: boolean,

    /// Attribute divisor, used for attribute instances. Defaults to zero.
    readonly divisor?: number,
};

/// Types that can be used as the value of a uniform.
type UniformValue = number | Array<number>;

/// All information about a Uniform.
type Uniform = {
    /// The GLSL data type of the uniform.
    readonly type: GlslUniformDataType,

    /// The WebGL location of the uniform on the shader program.
    readonly location: WebGLUniformLocation,

    /// The size of the uniform (for arrays). Defaults to 1.
    readonly size: number,

    /// The current value of the uniform on the GPU (mutable).
    value: UniformValue,

    /// The precision qualifier of the uniform. Defaults to undefined.
    readonly precision?: GlslPrecision,
};

/// All information about a Shader (Stage).
type Shader = {
    /// The name of the shader.
    readonly name: string;

    /// The shader stage (vertex or fragment).
    readonly stage: ShaderStage;

    /// The shader source code.
    readonly source: string;

    /// The WebGL shader object.
    readonly glo: WebGLShader;
};

/// All information about a Shader Program.
type Program = {
    /// The name of the program.
    readonly name: string;

    /// The vertex shader of the program.
    readonly vertex: Shader;

    /// The fragment shader of the program.
    readonly fragment: Shader;

    /// All attributes of the program.
    readonly attributes: Map<string, ShaderAttribute>;

    /// All uniforms of the program.
    readonly uniforms: Map<string, Uniform>;

    /// The WebGL program object.
    readonly glo: WebGLProgram;
};

/// All information about an attribute buffer.
type AttributeBuffer = {
    /// The name of the Attribute Buffer.
    readonly name: string,

    /// The number of Vertices defined in the buffer.
    readonly size: number,

    /// Interleaved Attributes defined in the buffer. Addressable by name.
    readonly attributes: ReadonlyMap<string, AttributeLayoutDefinition>,

    /// How the buffer data will be used.
    readonly usage: BufferUsage,

    /// The WebGL buffer object.
    readonly glo: WebGLBuffer,
};

/// All information about an Index Buffer Object (IBO) for drawing faces.
type IndexBuffer = {
    /// The data type of an index.
    readonly type: IndexDataType,

    /// The number of Indices in the buffer.
    readonly size: number,

    /// How the buffer data will be used.
    readonly usage: BufferUsage,

    /// The WebGL buffer object.
    readonly glo: WebGLBuffer,
};

/// Reference to a single attribute in an attribute buffer.
type AttributeReference = {
    /// The Buffer containing this Attribute.
    readonly buffer: AttributeBuffer,

    /// The name of the Attribute in the Buffer.
    readonly name: string,
};

/// All information about a WebGL Vertex Array Object (VAO).
type VAO = {
    /// The name of the VAO.
    readonly name: string,

    /// The Index Buffer Object.
    readonly ibo: IndexBuffer,

    /// The Attribute Bindings.
    readonly attributes: ReadonlyMap<number, AttributeReference>,

    /// The WebGL Vertex Array Object.
    readonly glo: WebGLVertexArrayObject,
};

/// A single draw call to be executed.
type DrawCall = {
    /// The VAO to use for the draw call.
    readonly vao: VAO,

    /// The program to use for the draw call.
    readonly program: Program,

    /// The number of indices to draw.
    readonly count: number,

    /// The offset into the index buffer.
    readonly offset: number,

    /// Uniform overrides.
    uniform: Record<string, UniformValue>,
};


// Engine =================================================================== //


/// Create a shader object from a source string.
/// @param gl The WebGL context.
/// @param name The name of the shader program.
/// @param stage The stage of the shader (vertex or fragment).
/// @param source The GLSL source code of the shader.
function createShader(
    gl: WebGL2RenderingContext,
    name: string,
    stage: number,
    source: string,
): Shader
{
    // First, ensure that the shader stage is valid.
    if (stage !== gl.VERTEX_SHADER && stage !== gl.FRAGMENT_SHADER) {
        throw new Error(`Invalid shader stage ${stage} for shader "${name}"`);
    }
    const stageName = stage === gl.VERTEX_SHADER ? "vertex" : "fragment";

    // Next, create the shader object.
    const glShader: WebGLShader | null = gl.createShader(stage);
    if (!glShader) {
        throw new Error(`Failed to create ${stageName} shader "${name}"`);
    }

    // Add the necessary boilerplate to the shader source.
    const floatPrecision = stage === gl.VERTEX_SHADER ? "highp" : "mediump";
    const boilerplate = `#version 300 es\nprecision ${floatPrecision} float;\n`;

    // Upload the shader source and compile it.
    gl.shaderSource(glShader, boilerplate + source);
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
function createProgram(
    gl: WebGL2RenderingContext,
    name: string,
    vertex: Shader,
    fragment: Shader,
): Program
{
    // Check the shader stages.
    if (!gl.isShader(vertex.glo) || vertex.stage !== gl.VERTEX_SHADER) {
        throw new Error(`Invalid vertex shader for program "${name}"`);
    }
    if (!gl.isShader(fragment.glo) || fragment.stage !== gl.FRAGMENT_SHADER) {
        throw new Error(`Invalid fragment shader for program "${name}"`);
    }

    // Create the program object.
    const glProgram: WebGLProgram | null = gl.createProgram();
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
    const program: Program = {
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
function createAttributeBuffer(
    gl: WebGL2RenderingContext,
    name: string,
    attributes: Record<string, {
        data: Array<number>,
        height: AttributeSize,
        width?: AttributeSize,
        type?: AttributeDataType,
        normalized?: boolean,
        divisor?: number,
    }>,
    usage?: BufferUsage,
): AttributeBuffer
{
    // Create the attribute layout definitions, and validate the attribute data.
    const layoutDefinitions = new Map<string, AttributeLayoutDefinition>();
    let vertexCount: number | undefined;
    let vertexStride: number = 0;
    for (const [attributeName, attribute] of Object.entries(attributes)) {
        // Create the attribute layout definition for the attribute.
        const layoutDefinition: AttributeLayoutDefinition = {
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
        } else if (vertexCount !== attributeVertexCount) {
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
    const writers = new Map<AttributeDataType,
        (byteOffset: number, value: number, little_endian: boolean) => void>
        ([
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
function createIndexBuffer(
    gl: WebGL2RenderingContext,
    name: string,
    indices: Array<number>,
    usage?: number,
): IndexBuffer
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
    let type: IndexDataType.UNSIGNED_BYTE | IndexDataType.UNSIGNED_SHORT | IndexDataType.UNSIGNED_INT;
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
    let data: Uint8Array | Uint16Array | Uint32Array;
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
    const glBuffer: WebGLBuffer | null = gl.createBuffer();
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


function createVertexArrayObject(
    gl: WebGL2RenderingContext,
    name: string,
    ibo: IndexBuffer,
    attributeBuffers: AttributeBuffer | Array<AttributeBuffer>,
    program: Program,
): VAO
{
    // Create the Vertex Array Object.
    const vao = gl.createVertexArray();
    if (!vao) {
        throw new Error(`Failed to create VAO "${name}"`);
    }

    // Define the attribute bindings.
    let attributes: Map<number, AttributeReference> = new Map();
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
                    const otherBuffer: AttributeBuffer = attributes.get(shaderAttribute.location)!.buffer;
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
                if ((attributeLayout.divisor || 0) > 0) {
                    throw new Error("Instanced attributes are not yet supported in glance-dev");
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
function createDrawCall(
    vao: VAO,
    program: Program,
    count: number = -1,
    offset: number = 0,
): DrawCall
{
    // The draw call is simply a collection of values used in `draw()`.
    return {
        vao,
        program,
        count: count < 0 ? vao.ibo.size : count,
        offset,
        uniform: {},
    };
}

/// Execute a draw call.
function draw(gl: WebGL2RenderingContext, drawCall: DrawCall): void
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
function updateAttributes(gl: WebGL2RenderingContext, program: Program): void
{
    const regex = /^\s*(?:layout\s*\(location\s*=\s*(?<location>\d+)\)\s*)?in\s+(?:(?<precision>lowp|mediump|highp)\s+)?(?<type>\w+)\s+(?<name>\w+)\s*;/gm;

    // Remove existing attributes.
    program.attributes.clear();

    // Find attributes in the vertex shader.
    let match: RegExpExecArray | null;
    while ((match = regex.exec(program.vertex.source)) !== null) {

        // Extract the attribute information from the source.
        const { name, type, location, precision } = match.groups as {
            name: string,
            type: GlslAttributeDataType,
            location?: string,
            precision?: GlslPrecision,
        };

        // Skip attributes that are not used in the program.
        const attributeLocation: number = gl.getAttribLocation(program.glo, name);
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
function updateUniforms(gl: WebGL2RenderingContext, program: Program): void
{
    const regex = /^\s*uniform\s+(?<precision>lowp|mediump|highp)?\s*(?<type>\w+)\s+(?<name>\w+)(?:\s*\[\s*(?<sizeString>\d+)\s*\])?\s*;/gm;

    // Remove existing uniforms.
    program.uniforms.clear();

    // Find uniforms in both the vertex and fragment shaders.
    let match: RegExpExecArray | null;
    for (let source of [program.vertex.source, program.fragment.source]) {
        while ((match = regex.exec(source)) !== null) {

            // Extract the uniform information from the source.
            const { name, type, precision, sizeString } = match.groups as {
                name: string,
                type: GlslUniformDataType,
                precision?: GlslPrecision,
                sizeString?: string,
            };

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
function getDefaultUniformValue(type: GlslUniformDataType, size: number): UniformValue
{
    let defaultValue: UniformValue;
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
        default:
            assertUnreachable(type);
    }

    // If the uniform is an array of size n, repeat the default value n times.
    if (size === 1) {
        return defaultValue;
    }
    else {
        return Array(size).fill(defaultValue).flat() as Array<number>;
    }
}


/// Uploads a uniform to the GPU.
/// The shader program containing the uniform must be in use when calling this function.
function uploadUniform(gl: WebGL2RenderingContext, uniform: Uniform): void
{
    switch (uniform.type) {
        case 'float':
            return gl.uniform1f(uniform.location, uniform.value as number);
        case 'vec2':
            return gl.uniform2fv(uniform.location, uniform.value as number[]);
        case 'vec3':
            return gl.uniform3fv(uniform.location, uniform.value as number[]);
        case 'vec4':
            return gl.uniform4fv(uniform.location, uniform.value as number[]);
        case 'mat2':
        case 'mat2x2':
            return gl.uniformMatrix2fv(uniform.location, false, uniform.value as number[]);
        case 'mat3':
        case 'mat3x3':
            return gl.uniformMatrix3fv(uniform.location, false, uniform.value as number[]);
        case 'mat4':
        case 'mat4x4':
            return gl.uniformMatrix4fv(uniform.location, false, uniform.value as number[]);
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
            return gl.uniform1i(uniform.location, uniform.value as number);
        case 'uint':
            return gl.uniform1ui(uniform.location, uniform.value as number);
        case 'bool':
            return gl.uniform1i(uniform.location, uniform.value ? 1 : 0);
        case 'mat2x3':
            return gl.uniformMatrix2x3fv(uniform.location, false, uniform.value as number[]);
        case 'mat3x2':
            return gl.uniformMatrix3x2fv(uniform.location, false, uniform.value as number[]);
        case 'mat2x4':
            return gl.uniformMatrix2x4fv(uniform.location, false, uniform.value as number[]);
        case 'mat4x2':
            return gl.uniformMatrix4x2fv(uniform.location, false, uniform.value as number[]);
        case 'mat3x4':
            return gl.uniformMatrix3x4fv(uniform.location, false, uniform.value as number[]);
        case 'mat4x3':
            return gl.uniformMatrix4x3fv(uniform.location, false, uniform.value as number[]);
        case 'ivec2':
            return gl.uniform2iv(uniform.location, uniform.value as number[]);
        case 'ivec3':
            return gl.uniform3iv(uniform.location, uniform.value as number[]);
        case 'ivec4':
            return gl.uniform4iv(uniform.location, uniform.value as number[]);
        case 'uvec2':
            return gl.uniform2uiv(uniform.location, uniform.value as number[]);
        case 'uvec3':
            return gl.uniform3uiv(uniform.location, uniform.value as number[]);
        case 'uvec4':
            return gl.uniform4uiv(uniform.location, uniform.value as number[]);
        case 'bvec2':
            return gl.uniform2iv(uniform.location, uniform.value as number[]);
        case 'bvec3':
            return gl.uniform3iv(uniform.location, uniform.value as number[]);
        case 'bvec4':
            return gl.uniform4iv(uniform.location, uniform.value as number[]);
        default:
            assertUnreachable(uniform.type);
    }
}

/// Get the size of an attribute data type in bytes.
function getAttributeDataByteSize(type: AttributeDataType): number
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
        default:
            assertUnreachable(type);
    }
}


/// Calculate the byte size of an attribute in an attribute buffer.
function getAttributeByteSize(description: AttributeLayoutDefinition): number
{
    return getAttributeDataByteSize(description.type) * description.height * description.width;
}


/// Calculate the stride of an attribute buffer in bytes.
function calculateStride(buffer: AttributeBuffer): number
{
    let stride = 0;
    for (const attributeLayout of buffer.attributes.values()) {
        stride += getAttributeByteSize(attributeLayout);
    }
    return stride;
}


/// Check if an attribute data type is an integer type.
function isIntegerType(type: AttributeDataType)
{
    return type === AttributeDataType.BYTE
        || type === AttributeDataType.UNSIGNED_BYTE
        || type === AttributeDataType.SHORT
        || type === AttributeDataType.UNSIGNED_SHORT
        || type === AttributeDataType.INT
        || type === AttributeDataType.UNSIGNED_INT;
}

/// Deep value equality check for any two values.
function areEqual<T>(a: T, b: T): boolean
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
            if (!areEqual((a as any)[key], (b as any)[key])) return false;
        }
    }
    return true;
}

/// TypeScript utility to ensure that all cases of a switch statement are handled.
function assertUnreachable(x: never): never
{
    throw new Error(`Unexpected case: ${x}`);
}