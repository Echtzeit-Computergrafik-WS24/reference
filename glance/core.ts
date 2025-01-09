export
{
    createAttributeBuffer,
    createDrawCall,
    createFramebuffer,
    createIndexBuffer,
    createProgram,
    createRenderbuffer,
    createShader,
    createTexture,
    createVertexArrayObject,
    draw,
    getContext,
    resetContext,
    updateFramebufferLayer,
    updateTextureData,
};


import
{
    areEqual,
    assert,
    assertUnreachable,
    clone,
    logInfo,
    logWarning,
    throwError,
    GLANCE_DEBUG,
} from "./dev.js";
import
{
    clamp,
} from "./math/common.js";
import
{
    AttachmentType,
    AttributeDataType,
    BlendEquation,
    BlendFunc,
    BufferUsage,
    CullFace,
    DepthTest,
    DrawMode,
    IndexDataType,
    RenderbufferInternalFormat,
    ShaderStage,
    TextureCompareFunc,
    TextureDataTarget,
    TextureFilter,
    TextureInternalFormat,
    TextureSrcDataType,
    TextureTarget,
    TextureWrap,
} from "./types.js";
import type {
    AttachmentDefinition,
    AttributeBuffer,
    AttributeLayout,
    AttributeReference,
    AttributeSize,
    Cached,
    DrawCall,
    FragmentShader,
    Framebuffer,
    FramebufferAttachment,
    GlslAttributeDataType,
    GlslPrecision,
    GlslUniformDataType,
    IndexBuffer,
    Program,
    Renderbuffer,
    Shader,
    Texture,
    TextureUnit,
    TextureUnitId,
    Uniform,
    UniformValue,
    VAO,
    VertexShader,
    WebGL2,
} from "./types.js";


// =============================================================================
// Core Functions
// =============================================================================


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
function getContext(canvas: string | HTMLCanvasElement, options: {
    alpha?: boolean,
    depth?: boolean,
    stencil?: boolean,
    antialias?: boolean,
    premultipliedAlpha?: boolean,
    preserveDrawingBuffer?: boolean,
    powerPreference?: 'high-performance' | 'low-power' | 'default',
    desynchronized?: boolean,
} = {}): WebGL2
{
    // Get the canvas element.
    let canvasElement: HTMLCanvasElement | null = null;
    if (typeof canvas === 'string') {
        canvasElement = document.querySelector(`#${canvas}`);
        if (canvasElement == null) {
            throwError(() => `Could not find canvas element with id "${canvas}"`);
        }
    } else if (canvas instanceof HTMLCanvasElement) {
        canvasElement = canvas;
    }
    else {
        throwError(() => `Invalid canvas element "${canvas}"`);
    }
    const canvasId = canvasElement.id ?? 'unnamed canvas';

    // Create the WebGL2 context.
    const gl: WebGL2RenderingContext | null = canvasElement.getContext('webgl2', {
        alpha: options.alpha ?? true,
        depth: options.depth ?? true,
        stencil: options.stencil ?? false,
        antialias: options.antialias ?? false,
        premultipliedAlpha: options.premultipliedAlpha ?? false,
        preserveDrawingBuffer: options.preserveDrawingBuffer ?? true,
        powerPreference: options.powerPreference ?? 'high-performance',
        desynchronized: options.desynchronized ?? true,
    });
    if (gl === null) {
        throwError(() => `Could not acquire a WebGL2 context from canvas "${canvasId}"`);
    }

    // Test various WebGL2 extensions.
    if (gl.getExtension('EXT_color_buffer_float') === null) {
        logWarning(() => `Extension 'EXT_color_buffer_float' is not supported.`);
    }
    if (gl.getExtension('OES_texture_float_linear') === null) {
        logWarning(() => `Extension 'OES_texture_float_linear' is not supported.`);
    }
    if (gl.getExtension('EXT_float_blend') === null) {
        logWarning(() => `Extension 'EXT_float_blend' is not supported.`);
    }
    if (gl.getExtension('EXT_texture_filter_anisotropic') === null) {
        logWarning(() => `Extension 'EXT_texture_filter_anisotropic' is not supported.`);
    }

    // Add the __glance object to the WebGL2 context.
    (gl as WebGL2).__glance = {
        generation: 1,
        shaders: new Map(),
        programs: new Map(),
        buffers: new Array(),
        vaos: new Array(),
        textures: new Array(),
        renderbuffers: new Array(),
        framebuffers: new Array(),
    };

    return gl as WebGL2;
}


/// Create a shader object from a source string.
/// @param gl The WebGL context.
/// @param name The name of the shader program.
/// @param stage The stage of the shader (vertex or fragment).
/// @param source The GLSL source code of the shader.
function createShader(
    gl: WebGL2, name: string, stage: ShaderStage.VERTEX, source: string): VertexShader;
function createShader(
    gl: WebGL2, name: string, stage: ShaderStage.FRAGMENT, source: string): FragmentShader;
function createShader(
    gl: WebGL2,
    name: string,
    stage: ShaderStage,
    source: string,
): VertexShader | FragmentShader
{
    // First, ensure that the shader stage is valid.
    if (stage !== gl.VERTEX_SHADER && stage !== gl.FRAGMENT_SHADER) {
        throwError(() => `Invalid shader stage ${stage} for shader "${name}"`);
    }
    const stageName = stage === gl.VERTEX_SHADER ? "vertex" : "fragment";

    {// Look for the shader in the cache.
        const cached = gl.__glance.shaders.get(source);
        if (cached) {
            const cachedShader = cached.object;
            if (cachedShader.stage !== stage) {
                throwError(() => `Shader "${name}" already exists as a ${cachedShader.stage === gl.VERTEX_SHADER ? "vertex" : "fragment"} shader.`);
            }
            cached.generation = gl.__glance.generation;
            logInfo(() => `Reusing cached ${stageName} shader "${name}"`);
            return cachedShader;
        }
    }

    // Next, create the shader object.
    const glShader: WebGLShader | null = gl.createShader(stage);
    if (!glShader) {
        throwError(() => `Failed to create ${stageName} shader "${name}"`);
    }

    // Upload the shader source and compile it.
    gl.shaderSource(glShader, source);
    gl.compileShader(glShader);

    // Check for compilation errors.
    if (!gl.getShaderParameter(glShader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(glShader);
        gl.deleteShader(glShader);
        throwError(() => `Failed to compile ${stageName} shader "${name}": ${info}`);
    }

    // Wrap the WebGL shader in a glance Shader Object.
    const shader: Shader = {
        glo: glShader,
        name,
        stage,
        source,
    };
    logInfo(() => `Created ${stageName} shader "${name}"`);

    // Cache it for later use.
    gl.__glance.shaders.set(source, { object: shader, generation: gl.__glance.generation });

    // Return the shader object.
    return shader;
}


/// Create a shader program from a vertex and fragment shader.
/// @param gl The WebGL context.
/// @param name The name of the shader program.
/// @param vertexShader The vertex shader.
/// @param fragmentShader The fragment shader.
function createProgram(
    gl: WebGL2,
    name: string,
    vertex: VertexShader | string,
    fragment: FragmentShader | string,
    uniforms?: Record<string, UniformValue>,
): Program
{
    // TODO: support asynchronous building of programs if the shaders are not yet compiled

    // The concatenation of the vertex and fragment shader source code uniquely identifies the program.
    const programSource = `${typeof vertex === 'string' ? vertex : vertex.source}\n${typeof fragment === 'string' ? fragment : fragment.source}`;

    // Look for the program in the cache.
    const cached = gl.__glance.programs.get(programSource);
    if (cached) {
        cached.generation = gl.__glance.generation;

        // Update the uniforms if provided.
        if (uniforms !== undefined) {
            updateUniforms(gl, cached.object, uniforms);
        }

        logInfo(() => `Reusing cached program "${name}"`);
        return cached.object;
    }

    // The user is allowed to pass the source code of the shaders directly.
    // In that case, we need to create the shader objects first.
    // Otherwise, we check if the provided objects are valid.
    const shortName = name.replace(/(-program|-shader)$/, ''); // Remove trailing "-program" or "-shader".
    if (typeof vertex === 'string') {
        vertex = createShader(gl, `${shortName}-vertex`, gl.VERTEX_SHADER, vertex);
    }
    else if (!gl.isShader(vertex.glo) || vertex.stage !== gl.VERTEX_SHADER) {
        throwError(() => `Invalid vertex shader for program "${name}"`);
    }
    if (typeof fragment === 'string') {
        fragment = createShader(gl, `${shortName}-fragment`, gl.FRAGMENT_SHADER, fragment);
    }
    else if (!gl.isShader(fragment.glo) || fragment.stage !== gl.FRAGMENT_SHADER) {
        throwError(() => `Invalid fragment shader for program "${name}"`);
    }

    // Create the program object.
    const glProgram: WebGLProgram | null = gl.createProgram();
    if (!glProgram) {
        throwError(() => `Failed to create program "${name}"`);
    }

    // Attach the shaders and link the program.
    gl.attachShader(glProgram, vertex.glo);
    gl.attachShader(glProgram, fragment.glo);
    gl.linkProgram(glProgram);

    try {
        // Check for linking errors.
        if (!gl.getProgramParameter(glProgram, gl.LINK_STATUS)) {
            throwError(() => `Failed to link shader program "${name}": ${gl.getProgramInfoLog(glProgram!)}`
                + `\nVertex Shader log: ${gl.getShaderInfoLog((vertex as VertexShader).glo)}`
                + `\nFragent Shader log: ${gl.getShaderInfoLog((fragment as FragmentShader).glo)}`);
        }

        // Store the WebGL program in a Program object.
        const program: Program = {
            name,
            vertex,
            fragment,
            glo: glProgram,
            // Initialize the attribute and uniform maps, which will be filled in the next step.
            attributes: new Map(),
            uniforms: new Map(),
        };

        // Discover all attributes and uniforms of the program.
        discoverAttributes(gl, program);
        updateUniforms(gl, program, uniforms ?? {}); // Also uploads the default uniform values.

        logInfo(() => `Created program "${name}"`);

        // Cache the program for later use.
        gl.__glance.programs.set(programSource, { object: program, generation: gl.__glance.generation });

        // Return the linked program, wrapped in a Program object.
        return program;
    }

    // Clean up on error.
    catch (error) {
        gl.deleteProgram(glProgram);
        throw error;
    }
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
    gl: WebGL2,
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
    // Ensure the optional arguments are valid.
    usage = usage ?? BufferUsage.STATIC_DRAW;

    // Create the attribute layout definitions, and validate the attribute data.
    const layoutDefinitions = new Map<string, AttributeLayout>();
    let vertexCount: number | undefined;
    let vertexStride: number = 0;
    for (const [attributeName, attribute] of Object.entries(attributes)) {
        // Create the attribute layout definition for each attribute.
        const layoutDefinition: AttributeLayout = {
            type: attribute.type ?? AttributeDataType.FLOAT,
            height: attribute.height,
            width: attribute.width ?? 1,
            normalized: attribute.normalized,
            divisor: attribute.divisor,
        };

        // Validate the attribute data.
        const attributeSize = layoutDefinition.height * layoutDefinition.width;
        if (attributeSize === 0) {
            throwError(() => `Invalid size ${attributeSize} for Attribute "${attributeName}" of ABO "${name}"`);
        }
        const attributeVertexCount = attribute.data.length / attributeSize;
        if (attributeVertexCount === 0) {
            throwError(() => `The data for Attribute "${attributeName}" of ABO "${name}" must not be empty.`);
        }
        if (attributeVertexCount % 1 !== 0) {
            throwError(() => `The data length for Attribute "${attributeName}" of ABO "${name}" must be a multiple of the number of scalars required per attribute. Data length is ${attribute.data.length}, attribute length is ${attributeSize}.`);
        }

        // Packed integers must have a height of 3 or 4 and a width of 1.
        // Strictly speaking, only a height of 4 is allowed, but since this type of data is mostly used for colors, and
        // the 4th component is often used for alpha (with a tiny precision), we allow a height of 3 as well, in which
        // case the 4th component is assumed to be 1.0.
        // See https://registry.khronos.org/OpenGL-Refpages/es3.0/html/glVertexAttribPointer.xhtml
        if (isPackedAttribute(layoutDefinition.type)) {
            if (layoutDefinition.height !== 3 && layoutDefinition.height !== 4) {
                throwError(() => `Attribute "${attributeName}" of ABO "${name}" must have a height of 3 or 4 when using packed integer data.`);
            }
            if (layoutDefinition.width !== 1) {
                throwError(() => `Attribute "${attributeName}" of ABO "${name}" must have a width of 1 when using packed integer data.`);
            }
        }

        // Ensure that all attributes have the same number of elements.
        if (vertexCount === undefined) {
            vertexCount = attributeVertexCount;
        } else if (vertexCount !== attributeVertexCount) {
            throwError(() => `Attribute buffer "${name}" has inconsistent vertex counts`);
        }

        // TODO: throw if not all attributes satisfy the alignment (cannot have 3 half floats + 3 floats for example)

        // Store the attribute layout definition.
        layoutDefinitions.set(attributeName, layoutDefinition);

        // Add the attribute's byte size to the stride.
        vertexStride += attributeSize * getAttributeDataByteSize(layoutDefinition.type);
    }
    if (vertexCount === undefined) {
        throwError(() => `Attribute Buffer "${name}" must have at least one attribute.`);
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
            [AttributeDataType.HALF_FLOAT, (offset: number, value: number): void => dataView.setUint16(offset, float32ToFloat16(value), true)],
        ]);

    // Write each attribute's data to the array buffer, interleaved.
    let startOffset = 0;
    for (const [attributeName, layoutDefinition] of layoutDefinitions.entries()) {
        const attributeData = attributes[attributeName].data;
        const scalarCount = layoutDefinition.height * layoutDefinition.width;
        const scalarByteSize = getAttributeDataByteSize(layoutDefinition.type);
        const attributeByteSize = scalarCount * scalarByteSize;
        const attributeStep = vertexStride - attributeByteSize;
        let byteOffset = startOffset;

        const writer = writers.get(layoutDefinition.type);
        if (writer) {
            // If there is a writer for the attribute type, we can convert each attribute value individually.
            for (let i = 0; i < attributeData.length; i++) {
                assert(byteOffset < arrayBuffer.byteLength, () => `Attribute "${attributeName}" of ABO "${name}" is out of bounds.`);
                writer(byteOffset, attributeData[i], /* little endian = */ true);
                byteOffset += scalarByteSize; // Move to the next scalar.
                if ((i + 1) % scalarCount === 0) {
                    byteOffset += attributeStep; // Move to the next vertex.
                }
            }
        }
        else {
            // If there is no writer available, we might be dealing with packed data.
            // In that case, we have to combine 3 values from the attribute data array
            // into one packed value.
            let pack: (r: number, g: number, b: number, a: number) => number;
            switch (layoutDefinition.type) {
                case AttributeDataType.INT_2_10_10_10_REV: {
                    pack = encodeU2101010REV;
                    break;
                }
                case AttributeDataType.UNSIGNED_INT_2_10_10_10_REV: {
                    pack = encodeI2101010REV;
                    break;
                }
                default: {
                    throwError(() => `Unsupported data type for attribute "${attributeName}" of buffer "${name}"`);
                }
            }
            if (layoutDefinition.height === 3) {
                for (let i = 0; i < attributeData.length; i += 3) {
                    dataView.setUint32(byteOffset, pack(attributeData[i], attributeData[i + 1], attributeData[i + 2], 1), /* littleEndian = */ false);
                    byteOffset += attributeStep;
                }
            } else {
                for (let i = 0; i < attributeData.length; i += 4) {
                    dataView.setUint32(byteOffset, pack(attributeData[i], attributeData[i + 1], attributeData[i + 2], attributeData[i + 3]), /* littleEndian = */ false);
                    byteOffset += attributeStep;
                }
            }
        }
        startOffset += attributeByteSize;
    }

    // Create the WebGL buffer object.
    const glBuffer = gl.createBuffer();
    if (!glBuffer) {
        throwError(() => `Failed to create attribute buffer "${name}"`);
    }

    // Bind the buffer and upload the data.
    try {
        gl.bindBuffer(gl.ARRAY_BUFFER, glBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, arrayBuffer, usage);

        logInfo(() => `Created Attribute Buffer "${name}" with ${layoutDefinitions.size} attributes for ${vertexCount} vertices and a size of ${arrayBuffer.byteLength} bytes.`);

        // Keep track of the buffer for automatic cleanup.
        gl.__glance.buffers.push(glBuffer);

        // Return the attribute buffer object.
        return {
            glo: glBuffer,
            name,
            vertexCount,
            attributes: layoutDefinitions,
            usage,
        };
    }
    catch (error) {
        // Clean up and rethrow any errors.
        gl.deleteBuffer(glBuffer);
        throw error;
    }
    finally {
        // Always unbind the buffer when done.
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
}


/// Create a new Index Buffer Object (IBO).
/// @param gl The WebGL context.
/// @param indices A JavaScript array containing the indices.
function createIndexBuffer(
    gl: WebGL2,
    name: string,
    indices: Array<number>,
    options: {
        /// The data type of an index.
        type?: IndexDataType,
        /// The usage pattern of the buffer.
        usage?: BufferUsage;
        /// Draw mode to use with the buffer.
        drawMode?: DrawMode;
    } = {},
): IndexBuffer
{
    // Ensure that the indicies are valid.
    const drawMode = options.drawMode ?? DrawMode.TRIANGLES;
    assert(indices.length > 0, () => `Index buffer "${name}" must have at least one index.`);
    switch (drawMode) {
        case (DrawMode.TRIANGLES):
            assert(indices.length % 3 === 0, () => `Size of Index buffer "${name}" with draw mode 'TRIANGLES' must be a multiple of 3.`);
            break;
        case (DrawMode.TRIANGLE_STRIP):
            assert(indices.length >= 3, () => `Size of Index buffer "${name}" draw mode 'TRIANGLE_STRIP' must be at least 3.`);
            break;
        case (DrawMode.LINES):
            assert(indices.length % 2 === 0, () => `Size of Index buffer "${name}" with draw mode 'LINES' must be a multiple of 2.`);
            break;
        case (DrawMode.LINE_STRIP):
            assert(indices.length >= 2, () => `Size of Index buffer "${name}" with draw mode 'LINE_STRIP' must be at least 2.`);
            break;
        case (DrawMode.LINE_LOOP):
            assert(indices.length >= 2, () => `Size of Index buffer "${name}" with draw mode 'LINE_LOOP' must be at least 2.`);
            break;
        case (DrawMode.POINTS):
            break;
        default:
            throwError(() => `Index buffer "${name}" has invalid draw mode: ${drawMode}.`);
    }
    if (indices.some((index) => !Number.isSafeInteger(index))) {
        throwError(() => `Index buffer "${name}" must contain only (safe) integers.`);
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
        throwError(() => `Index ${highestIndex} does not fit in a 32-bit unsigned integer.`);
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
        throwError(() => `Failed to create index buffer "${name}"`);
    }

    // Bind the buffer and upload the data.
    const usage = options.usage ?? BufferUsage.STATIC_DRAW;
    try {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, usage);

        logInfo(() => `Created Index Buffer "${name}" with ${indices.length} indices and a size of ${data.byteLength} bytes.`);

        // Keep track of the buffer for automatic cleanup.
        gl.__glance.buffers.push(glBuffer);

        // Return the Index Buffer object.
        return {
            glo: glBuffer,
            name,
            type,
            size: indices.length,
            usage,
            drawMode,
        };
    }
    catch (error) {
        // Clean up and rethrow any errors.
        gl.deleteBuffer(glBuffer);
        throw error;
    }
    finally {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    }
}


/// Create a new Vertex Array Object (VAO).
/// @param gl The WebGL context.
/// @param name The name of the VAO.
/// @param ibo The index buffer.
/// @param attributeBuffers The attribute buffers.
function createVertexArrayObject(
    gl: WebGL2,
    name: string,
    ibo: IndexBuffer | Array<number>,
    attributeBuffers: Parameters<typeof createAttributeBuffer>[2] | AttributeBuffer | Array<AttributeBuffer>,
    program: Program,
): VAO
{
    const shortName = name.replace(/-vao$/, ''); // Remove trailing "-vao".

    // If the index buffer is an array of indices, create an index buffer from it.
    if (Array.isArray(ibo)) {
        ibo = createIndexBuffer(gl, `${shortName}-ibo`, ibo);
    }

    if (Array.isArray(attributeBuffers)) {
        // Check that there is at least one attribute buffer
        if (attributeBuffers.length === 0) {
            throwError(() => `Need at least one Attribute Buffer for VAO "${name}"`);
        }
    } else {
        // If the `attributeBufers` parameter is simply a description of a
        // default attribute buffer, create it.
        if (!attributeBuffers.hasOwnProperty('glo')) {
            attributeBuffers = createAttributeBuffer(gl, `${shortName}-abo`, attributeBuffers as any);
        }

        // Normalize the attribute buffers argument to an array.
        attributeBuffers = [attributeBuffers as any];
    }

    // Create the Vertex Array Object.
    const vao = gl.createVertexArray();
    if (!vao) {
        throwError(() => `Failed to create VAO "${name}"`);
    }

    // Define the attribute bindings.
    const attributes: Map<number, AttributeReference> = new Map();
    try {
        // Bind the VAO.
        gl.bindVertexArray(vao);

        // Bind the index buffer.
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo.glo);

        // Get the maximum number of vertex attributes.
        const maxVertexAttributes = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);

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
                    const otherBuffer: AttributeBuffer = attributes.get(shaderAttribute.location)!.buffer;
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
                    if (location >= maxVertexAttributes) {
                        throwError(() => `Attribute "${attributeName}" of VAO "${name}" cannot be bound to location ${location}, because it would exceed the maximum number of vertex attributes (${maxVertexAttributes}).`);
                    }

                    const offset = attributeOffset + (locationOffset * attributeByteHeight);
                    gl.enableVertexAttribArray(location);
                    // Integer attributes have their own pointer function...
                    if (isIntegerAttribute(attributeLayout.type)) {
                        gl.vertexAttribIPointer(
                            location,
                            attributeLayout.height,
                            attributeLayout.type,
                            stride,
                            offset,
                        );
                    } else {
                        gl.vertexAttribPointer(
                            location,
                            attributeLayout.height,
                            attributeLayout.type,
                            attributeLayout.normalized || false,
                            stride,
                            offset,
                        );
                    }
                    // The attribute divisor is used for instancing.
                    gl.vertexAttribDivisor(location, attributeLayout.divisor || 0);
                }
            }
        }

        logInfo(() => `Created Vertex Array Object "${name}" with ${attributes.size} attributes.`);

        // Keep track of the VAO for automatic cleanup.
        gl.__glance.vaos.push(vao);

        // Return the VAO object.
        return {
            glo: vao,
            name,
            ibo,
            attributes,
        };
    }
    // Report any errors.
    catch (error) {
        gl.deleteVertexArray(vao);
        throw error;
    }

    // Reset the WebGL state.
    finally {
        // Unbind the VAO first...
        gl.bindVertexArray(null);
        /// .. so the VAO remembers the bound buffers.
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    }
}


/// Creates a new (empty) texture object.
/// Afterwards, you will need to call `updateTextureData` to fill it with data.
/// @param gl The WebGL context.
/// @param name The name of the texture.
/// @param width The width of the texture, must be larger than zero.
/// @param height The height of the texture, must be larger than zero.
/// @param options Additional options for the texture:
/// - `target`:  The texture target, defaults to `TEXTURE_2D`.
/// - `depth`: The depth of the texture, defaults to `null` for 2D and cubemap textures.
/// - `levels`: The number of mipmap levels to create. Defaults to the maximum possible number of levels.
/// - `useAnisotropy`: Whether to enable anisotropic filtering. Defaults to `true` iff levels > 1.
/// - `wipTextureUnit`: The texture unit to use for the WIP texture. Defaults to the highest texture unit available.
/// - `internalFormat`: The internal format of the texture. Defaults to `RGBA8`.
/// - `filter`: The texture (min/mag) filter(s) to use. Defaults to (tri-)linear filtering.
/// - `wrap`: The texture wrap mode(s) to use. Defaults to `CLAMP_TO_EDGE`.
/// - `compareFunc`: The comparison function to use for depth textures. Defaults to `NONE`.
/// @returns The texture object.
function createTexture(
    gl: WebGL2,
    name: string,
    width: number,
    height: number,
    options: {
        target?: TextureTarget,
        depth?: number | null,
        levels?: number,
        useAnisotropy?: boolean,
        wipTextureUnit?: TextureUnitId,
        internalFormat?: TextureInternalFormat,
        filter?: TextureFilter | [TextureFilter, TextureFilter],
        wrap?: TextureWrap | [TextureWrap, TextureWrap] | [TextureWrap, TextureWrap, TextureWrap],
        compareFunc?: TextureCompareFunc,
    } = {}
): Texture
{
    // Ensure the optional arguments are valid.
    const target: TextureTarget = options.target ?? TextureTarget.TEXTURE_2D;

    // Ensure that the depth is valid.
    if (options.depth !== undefined) {
        if (!Number.isSafeInteger(options.depth) || options.depth! < 1) {
            throwError(() => `Invalid depth ${options.depth} for texture "${name}"`);
        }
    }
    const depth: number = options.depth ?? 1;

    // Validate the dimensions of the texture.
    const textureKind: string = getTextureKind(target);
    if (target == TextureTarget.TEXTURE_2D || target == TextureTarget.TEXTURE_CUBE_MAP) {
        if (depth !== 1) {
            logWarning(() => `Ignoring given depth ${depth} of ${textureKind} texture "${name}".`);
        }
        if (width < 1 || height < 1 || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
            throwError(() => `Invalid texture dimensions: ${width}x${height} of ${textureKind} texture "${name}".`);
        }
    } else {
        if (width < 1 || height < 1 || depth < 1 || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || !Number.isSafeInteger(depth)) {
            throwError(() => `Invalid texture dimensions: ${width}x${height}x${depth} of ${textureKind} texture "${name}".`);
        }
    }

    // Determine the number of levels to create.
    const maxLevels: number = Math.floor(Math.log2(Math.max(width, height, depth))) + 1;
    if (options.levels !== undefined) {
        if (options.levels < 1 || !Number.isSafeInteger(options.levels)) {
            throwError(() => `Invalid number of levels for ${textureKind} texture "${name}": ${options.levels}.`);
        }
        if (options.levels > maxLevels) {
            logWarning(() => `Ignoring given number of levels for ${textureKind} texture "${name}" because ${options.levels} is larger than the maximum possible number of levels ${maxLevels}.`);
            options.levels = maxLevels;
        }
    }
    const levels: number = options.levels ?? maxLevels;

    // Comparison functions are only supported for depth textures.
    const internalFormat: TextureInternalFormat = options.internalFormat ?? TextureInternalFormat.RGBA8;
    if (options.compareFunc && !isDepthFormat(internalFormat)) {
        logWarning(() => `Ignoring given comparison function for ${textureKind} texture "${name}" because it is not a depth texture.`);
        options.compareFunc = TextureCompareFunc.NONE;
    }
    const compareFunc: TextureCompareFunc = options.compareFunc ?? TextureCompareFunc.NONE;

    // Create the new texture
    const glTexture = gl.createTexture();
    if (glTexture === null) {
        throwError(() => `Failed to create WebGL texture for ${textureKind} texture "${name}"`);
    }

    // Define the texture
    try {
        const wipTextureUnit = options.wipTextureUnit ?? getWIPTextureUnit(gl, options.wipTextureUnit);
        gl.activeTexture(gl.TEXTURE0 + wipTextureUnit);
        gl.bindTexture(target, glTexture);

        // 2D and Cube Map textures
        if (depth === 1) {
            gl.texStorage2D(target, levels, internalFormat, width, height);

            // It is perfectly valid to create a texture with a non-zero size but without any data.
            // Firefox however produces a warning: "Tex ... is incurring lazy initialization." when doing so.
            // Which, apparently, is correct but not actually an issue because the "fix" would be worse
            // than the problem. See:
            //  https://stackoverflow.com/a/57734917
            // Still, I am developing on Firefox and I don't want to see warnings in the console, so glance
            // will create a zeroed-out data array explicitly - but only in debug mode.
            if (GLANCE_DEBUG) {
                if (internalFormat === TextureInternalFormat.RGBA8) {
                    const emptyData = new Uint8Array(width * height * 4);
                    if (target === TextureTarget.TEXTURE_2D) {
                        gl.texSubImage2D(target, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, emptyData);
                    }
                    else {
                        for (let i = 0; i < 6; ++i) {
                            gl.texSubImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, emptyData);
                        }
                    }
                    if (levels > 1) {
                        gl.generateMipmap(target);
                    }
                }
            }

            // Enable depth texture comparison if requested.
            if (compareFunc !== TextureCompareFunc.NONE) {
                gl.texParameteri(target, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
                gl.texParameteri(target, gl.TEXTURE_COMPARE_FUNC, compareFunc as number);
            }
        }
        // 3D and 2D Array textures
        else {
            gl.texStorage3D(target, levels, internalFormat, width, height, depth);
        }

        // Define the min- and magnification filter.
        let minFilter: TextureFilter;
        let magFilter: TextureFilter;
        if (options.filter === undefined) {
            if (levels > 1) {
                minFilter = TextureFilter.LINEAR_MIPMAP_LINEAR;
            } else {
                minFilter = TextureFilter.LINEAR;
            }
            magFilter = TextureFilter.LINEAR;
        } else if (Array.isArray(options.filter)) {
            minFilter = options.filter[0];
            magFilter = options.filter[1];
        } else {
            minFilter = options.filter;
            magFilter = options.filter;
        }
        if (levels === 1) {
            if (![TextureFilter.NEAREST, TextureFilter.LINEAR].includes(minFilter)) {
                logWarning(() => `Ignoring given minification filter for ${textureKind} texture "${name}" because it has only one level.`);
                if ([TextureFilter.NEAREST_MIPMAP_NEAREST, TextureFilter.NEAREST_MIPMAP_LINEAR].includes(minFilter)) {
                    minFilter = TextureFilter.NEAREST;
                } else {
                    minFilter = TextureFilter.LINEAR;
                }
            }
        }
        if (![TextureFilter.NEAREST, TextureFilter.LINEAR].includes(magFilter)) {
            logWarning(() => `Ignoring given magnification filter for ${textureKind} texture "${name}".`);
            if ([TextureFilter.NEAREST_MIPMAP_NEAREST, TextureFilter.NEAREST_MIPMAP_LINEAR].includes(magFilter)) {
                magFilter = TextureFilter.NEAREST;
            } else {
                magFilter = TextureFilter.LINEAR;
            }
        }
        if (isFloatFormat(internalFormat)) {
            if (![TextureFilter.NEAREST, TextureFilter.NEAREST_MIPMAP_NEAREST].includes(minFilter)
                || magFilter !== TextureFilter.NEAREST) {
                const extension = gl.getExtension("OES_texture_float_linear");
                if (extension === null) {
                    logWarning(() => `Linear filtering for floating point textures is not supported on this system.`);
                    minFilter = TextureFilter.NEAREST;
                    magFilter = TextureFilter.NEAREST;
                }
            }
        }
        gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, minFilter);
        gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, magFilter);

        // Define wrapping behavior.
        let wrapS: TextureWrap;
        let wrapT: TextureWrap;
        let wrapR: TextureWrap;
        if (options.wrap === undefined) {
            wrapS = TextureWrap.CLAMP_TO_EDGE;
            wrapT = TextureWrap.CLAMP_TO_EDGE;
            wrapR = TextureWrap.CLAMP_TO_EDGE;
        }
        else if (Array.isArray(options.wrap)) {
            wrapS = options.wrap[0];
            wrapT = options.wrap[1];
            wrapR = options.wrap[2] ?? TextureWrap.CLAMP_TO_EDGE;
            if (target === TextureTarget.TEXTURE_2D && options.wrap.length > 2) {
                logWarning(() => `Ignoring given wrap R mode for ${textureKind} texture "${name}" because it has only two dimensions.`);
            }
        }
        else {
            wrapS = options.wrap;
            wrapT = options.wrap;
            wrapR = options.wrap;
        }
        gl.texParameteri(target, gl.TEXTURE_WRAP_S, wrapS);
        gl.texParameteri(target, gl.TEXTURE_WRAP_T, wrapT);
        if (target !== TextureTarget.TEXTURE_2D) { // TODO: can I set the wrap mode for 2D Array Textures?
            gl.texParameteri(target, gl.TEXTURE_WRAP_R, wrapR);
        }

        // Enable anisotropic filtering if supported and requested.
        if (options.useAnisotropy || (options.useAnisotropy === undefined && levels > 1)) {
            const anisotropyExtension = gl.getExtension("EXT_texture_filter_anisotropic");
            if (!anisotropyExtension) {
                if (options.useAnisotropy) {
                    logWarning(() => 'Anisotropic filtering is not supported.');
                }
            }
            else {
                gl.texParameterf(target, anisotropyExtension.TEXTURE_MAX_ANISOTROPY_EXT,
                    gl.getParameter(anisotropyExtension.MAX_TEXTURE_MAX_ANISOTROPY_EXT));
            }
        }

        logInfo(() => `Created ${textureKind} texture "${name}" with dimensions ${width}x${height}x${depth} and ${levels} levels.`);

        // Keep track of the texture for automatic cleanup.
        gl.__glance.textures.push(glTexture);

        // Return the texture.
        return {
            glo: glTexture,
            name,
            target,
            width,
            height,
            depth,
            levels,
            internalFormat,
            compareFunc,
            attachmentType: AttachmentType.TEXTURE,
        };
    }
    catch (error) {
        gl.deleteTexture(glTexture);
        (error as Error).message = `Failed to create ${textureKind} texture "${name}": ${(error as Error).message}`;
        throw error;
    }
    finally {
        gl.bindTexture(target, null);
        gl.activeTexture(gl.TEXTURE0);
    }
}


/// Updates the contents of an existing Texture object.
/// Since textures in glance are immutable, this cannot redefine the size or format of the texture.
/// @param gl The WebGL context.
/// @param texture The texture object to update.
/// @param data The pixel or image data.
/// @param options Additional options for the texture:
/// - `target`: The texture target, defaults to the texture's target.
/// - `level`: The mipmap level to update, defaults to 0.
/// - `createMipMaps`: Whether to generate mipmaps, defaults to `true` iff the texture has more than one level.
/// - `wipTextureUnit`: The texture unit to use for the WIP texture. Defaults to the highest texture unit available.
/// - `srcDataType`: The data type of the source data. Defaults to the data type of the given data.
/// - `flipY`: Whether to flip the image vertically, defaults to `true` for 2D textures and `false` otherwise.
/// The `options` argument shares almost none of its properties with the `createTexture` parameter of the same name.
/// This is on purpose, so we can define the `loadTexture` function (in the core_patterns module) that takes a single,
/// combined `options` object for both `createTexture` and `updateTextureData`.
function updateTextureData(
    gl: WebGL2,
    texture: Texture,
    data: TexImageSource | ArrayBufferView,
    options: {
        dataTarget?: TextureDataTarget,
        level?: number,
        createMipMaps?: boolean,
        wipTextureUnit?: TextureUnitId,
        srcDataType?: TextureSrcDataType,
        flipY?: boolean,
    } = {}
): void
{
    // When updating cubemap faces, we must know which one.
    if (options.dataTarget === undefined) {
        if (texture.target === TextureTarget.TEXTURE_CUBE_MAP) {
            throwError(() => `You need to specify an explicit target when updating a face of cube map texture "${texture.name}".`);
        }
    } else if (texture.target === TextureTarget.TEXTURE_CUBE_MAP) {
        if (!(options.dataTarget >= TextureDataTarget.TEXTURE_CUBE_MAP_POSITIVE_X
            && options.dataTarget <= TextureDataTarget.TEXTURE_CUBE_MAP_NEGATIVE_Z)) {
            throwError(() => `Invalid data target '${options.dataTarget}' for cube map texture: "${texture.name}".`);
        }
    }
    const dataTarget = options.dataTarget ?? texture.target as number;

    // The Mipmap level defaults to zero.
    if (options.level !== undefined && (options.level < 0 || !Number.isSafeInteger(options.level))) {
        throwError(() => `Invalid mipmap level: ${options.level}.`);
    }
    const level = options.level ?? 0;

    // Use the highest texture unit as the WIP unit by default.
    const wipTextureUnit = getWIPTextureUnit(gl, options.wipTextureUnit);

    // Determine the source data type.
    if (options.srcDataType === undefined) {
        if (ArrayBuffer.isView(data)) {
            options.srcDataType = getDefaultSrcDataType(data);
        } else {
            options.srcDataType = TextureSrcDataType.UNSIGNED_BYTE;
        }
    } else {
        if (ArrayBuffer.isView(data)) {
            validateSrcDataType(data, options.srcDataType);
        } else {
            if (options.srcDataType !== TextureSrcDataType.UNSIGNED_BYTE) {
                throwError(() => `When defining a texture with a 'TexImageSource', the source data type must be 'UNSIGNED_BYTE'`);
            }
        }
    }
    const srcDataType = options.srcDataType;
    if (!matchInternalFormatAndDataType(texture.internalFormat, srcDataType)) {
        throwError(() => GLANCE_DEBUG ? `Invalid combination of internal format ${texture.internalFormat} and source data type ${srcDataType}. See https://registry.khronos.org/webgl/specs/latest/2.0/#TEXTURE_TYPES_FORMATS_FROM_DOM_ELEMENTS_TABLE` : "error");
    }

    // Determine the `format` argument for `texSubImage2D` based on the given internal format.
    const format = getTextureFormat(gl, texture.internalFormat);

    // 2D Textures are flipped by default, other textures are not.
    const flipY = options.flipY ?? (texture.target === TextureTarget.TEXTURE_2D);

    // Generate mipmaps, if the texture has more than one level.
    const createMipmaps = options.createMipMaps ?? (texture.levels > 1);

    try {
        gl.activeTexture(gl.TEXTURE0 + wipTextureUnit);
        gl.bindTexture(texture.target, texture.glo);
        if (flipY) {
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        }

        // 3D and 2D Array textures
        if (texture.depth > 1) {
            gl.texSubImage3D(
                dataTarget,
                level,
                0,
                0,
                0,
                texture.width,
                texture.height,
                texture.depth,
                format,
                srcDataType,
                data as any);
        }

        // 2D and Cube Map textures
        else {
            gl.texSubImage2D(
                dataTarget,
                level,
                0, // TODO: support partial texture updates
                0,
                texture.width,
                texture.height,
                format,
                srcDataType,
                data as any);
        }

        // Update the mipmaps.
        if (createMipmaps) {
            gl.generateMipmap(texture.target);
        }

    } catch (error) {
        (error as Error).message = `Failed to define texture "${texture.name}": ${(error as Error).message}`;
        throw error;

    } finally {
        // Always reset the WebGL state.
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE0);
    }
}


/// Creates a new Renderbuffer object.
/// @param gl The WebGL context.
/// @param name The name of the Renderbuffer.
/// @param width The width of the Renderbuffer, must be larger than zero.
/// @param height The height of the Renderbuffer, must be larger than zero.
/// @param internalFormat The internal format of the Renderbuffer.
/// @returns The Renderbuffer object.
function createRenderbuffer(
    gl: WebGL2,
    name: string,
    width: number,
    height: number,
    internalFormat: RenderbufferInternalFormat,
): Renderbuffer
{
    // Validate the parameters.
    if (width < 1 || height < 1 || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
        throwError(() => `Invalid renderbuffer dimensions: ${width}x${height} of renderbuffer "${name}".`);
    }
    if (internalFormat === undefined) {
        throwError(() => `Missing internal format for renderbuffer "${name}".`);
    }
    // Check that the dimensions are less than or equal to the value of GL_MAX_RENDERBUFFER_SIZE
    // See https://registry.khronos.org/OpenGL-Refpages/es3.0/html/glRenderbufferStorageMultisample.xhtml
    const maxRenderBufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
    if (width > maxRenderBufferSize || height > maxRenderBufferSize) {
        throwError(() => `Renderbuffer "${name}" exceeds the maximum renderbuffer size of ${maxRenderBufferSize}.`);
    }

    // Create the Renderbuffer.
    const glRenderbuffer: WebGLRenderbuffer | null = gl.createRenderbuffer();
    if (glRenderbuffer === null) {
        throwError(() => `Failed to create a new WebGL renderbuffer object for "${name}".`);
    }

    // Define the Renderbuffer.
    try {
        gl.bindRenderbuffer(gl.RENDERBUFFER, glRenderbuffer);
        // TODO: Multisampled Renderbuffers
        // Also check max samples with // const maxSamples = gl.getParameter(gl.MAX_SAMPLES);
        gl.renderbufferStorage(gl.RENDERBUFFER, internalFormat, width, height);

        logInfo(() => `Created Renderbuffer "${name}" with dimensions ${width}x${height} and internal format ${internalFormat}.`);

        // Keep track of the Renderbuffer for automatic cleanup.
        gl.__glance.renderbuffers.push(glRenderbuffer);

        // Return the finished Renderbuffer object.
        return {
            glo: glRenderbuffer,
            name,
            width,
            height,
            internalFormat,
            attachmentType: AttachmentType.RENDERBUFFER,
        };
    }

    // Delete the Renderbuffer again if anything goes wrong.
    catch (e) {
        gl.deleteRenderbuffer(glRenderbuffer);
        throw e;
    }

    // Always restore the WebGL state.
    finally {
        gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    }
}


/// Create and define a new Framebuffer object.
/// @param gl The WebGL context.
/// @param name The name of the Framebuffer.
/// @param color All color attachments.
/// @param depth The depth attachment.
/// @param stencil The stencil attachment.
/// @returns The Framebuffer object.
function createFramebuffer(
    gl: WebGL2,
    name: string,
    color: AttachmentDefinition | FramebufferAttachment | Array<AttachmentDefinition | FramebufferAttachment> | null = null,
    depth: AttachmentDefinition | FramebufferAttachment | null = null,
    stencil: AttachmentDefinition | FramebufferAttachment | null = null,
): Framebuffer
{
    const isFramebufferAttachment = (obj: any): obj is FramebufferAttachment => Object.hasOwn(obj, "attachmentType");

    // Ensure that the color attachments are valid.
    const colorAttachments: Array<AttachmentDefinition> = (
        Array.isArray(color) ? color : color === null ? [] : [color]
    ).map((obj) =>
        (isFramebufferAttachment(obj) ? { attachment: obj } : obj) as AttachmentDefinition
    );
    const depthAttachment: AttachmentDefinition | null = depth === null ? null : isFramebufferAttachment(depth) ? { attachment: depth } : depth;
    const stencilAttachment: AttachmentDefinition | null = stencil === null ? null : isFramebufferAttachment(stencil) ? { attachment: stencil } : stencil;

    // Check that we don't exceed the maximum number of color attachments.
    const maxColorAttachmentCount = gl.getParameter(gl.MAX_COLOR_ATTACHMENTS);
    if (colorAttachments.length > maxColorAttachmentCount) {
        throwError(() => `Framebuffer "${name}" has ${colorAttachments.length} color attachments, but the maximum is ${maxColorAttachmentCount}.`);
    }

    // Check that all attachments have the same size.
    let framebufferSize: [number, number] | undefined = undefined; // [height, width]
    for (let i = 0; i < colorAttachments.length; ++i) {
        const attachment: FramebufferAttachment = colorAttachments[i].attachment;
        if (framebufferSize === undefined) {
            framebufferSize = [attachment.width, attachment.height];
        }
        else if (attachment.width !== framebufferSize[0] || attachment.height !== framebufferSize[1]) {
            throwError(() => `Framebuffer "${name}" has color attachments with different dimensions.`);
        }
    }
    if (depthAttachment !== null) {
        const attachment = depthAttachment.attachment;
        if (framebufferSize === undefined) {
            framebufferSize = [attachment.width, attachment.height];
        } else if (attachment.width !== framebufferSize[0] || attachment.height !== framebufferSize[1]) {
            throwError(() => `Framebuffer "${name}" has color/depth attachments with different dimensions.`);
        }
    }

    // Create the Framebuffer.
    const glFramebuffer: WebGLFramebuffer | null = gl.createFramebuffer();
    if (glFramebuffer === null) {
        throwError(() => `Failed to create a new WebGL framebuffer object for "${name}".`);
    }

    // Helper functions for creating attachments.
    function attach(definition: AttachmentDefinition, location: number): void
    {
        const kind = location === gl.DEPTH_ATTACHMENT ? "depth" : `color[${location - gl.COLOR_ATTACHMENT0}]`;

        // Attachment is a Texture.
        if (definition.attachment.attachmentType === AttachmentType.TEXTURE) {
            const texture = definition.attachment as Texture;

            // Attachment is a 2D Texture.
            if (texture.target === TextureTarget.TEXTURE_2D) {
                if ((definition.target ?? TextureDataTarget.TEXTURE_2D) !== TextureDataTarget.TEXTURE_2D) {
                    logWarning(() => `Ignoring the target "${definition.target}" for ${kind} attachment of framebuffer "${name}", using 'gl.TEXTURE_2D' instead.`);
                }
                gl.framebufferTexture2D(
                    gl.FRAMEBUFFER,
                    location,
                    gl.TEXTURE_2D,
                    texture.glo,
                    definition.level ?? 0,
                );
            }

            // Attachment is a Cube Map Texture.
            else if (texture.target === TextureTarget.TEXTURE_CUBE_MAP) {
                if (definition.target === undefined) {
                    throwError(() => `Missing target for cubemap ${kind} attachment of framebuffer "${name}".`);
                }
                if (!(definition.target >= TextureDataTarget.TEXTURE_CUBE_MAP_POSITIVE_X
                    && definition.target <= TextureDataTarget.TEXTURE_CUBE_MAP_NEGATIVE_Z)) {
                    throwError(() => `Invalid data target for cube map texture: ${definition.target}.`);
                }
                gl.framebufferTexture2D(
                    gl.FRAMEBUFFER,
                    location,
                    definition.target,
                    texture.glo,
                    definition.level ?? 0,
                );
            }

            // Attachment is a 3D or 2D Array Texture.
            else {
                if (definition.target ?? texture.target !== texture.target) {
                    const textureTarget = texture.target === TextureTarget.TEXTURE_2D_ARRAY ? 'gl.TEXTURE_2D_ARRAY' : 'gl.TEXTURE_3D';
                    logWarning(() => `Ignoring the target "${definition.target}" for ${kind} attachment of framebuffer "${name}", using ${textureTarget} instead.`);
                }
                if (definition.layer === undefined) {
                    const textureKind = texture.target === TextureTarget.TEXTURE_2D_ARRAY ? "2D array" : "3D";
                    logWarning(() => `Missing layer for ${kind} attachment (which is a ${textureKind} texture) of framebuffer "${name}", using layer 0 by default.`);
                }
                gl.framebufferTextureLayer(
                    gl.FRAMEBUFFER,
                    location,
                    texture.glo,
                    definition.level ?? 0,
                    definition.layer ?? 0,
                );
            }
        }

        // Attachment is a Renderbuffer.
        else {
            const renderbuffer = definition.attachment as Renderbuffer;
            if (definition.level !== undefined) {
                logWarning(() => `Ignoring given level ${definition.level} for renderbuffer ${kind} attachment of framebuffer "${name}".`);
            }
            if (definition.target !== undefined) {
                logWarning(() => `Ignoring given target ${definition.target} for renderbuffer ${kind} attachment of framebuffer "${name}".`);
            }
            gl.framebufferRenderbuffer(
                gl.FRAMEBUFFER,
                location,
                gl.RENDERBUFFER,
                renderbuffer.glo,
            );
        }
    }

    // Define the Framebuffer.
    try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, glFramebuffer);

        // Attach the color attachments.
        if (colorAttachments.length === 0) {
            gl.drawBuffers([gl.NONE]);
            gl.readBuffer(gl.NONE);
        } else {
            const drawBuffers: Array<GLenum> = [];
            for (let i = 0; i < colorAttachments.length; ++i) {
                const location = gl.COLOR_ATTACHMENT0 + i;
                attach(colorAttachments[i], location);
                drawBuffers.push(location);
            }
            gl.drawBuffers(drawBuffers);
        }

        // Attach the depth attachment.
        if (depthAttachment !== null) {
            attach(depthAttachment, gl.DEPTH_ATTACHMENT);
        }

        // TODO: support stencil (and depth/stencil combination) attachments
        if (stencilAttachment !== null) {
            throwError(() => `Stencil attachments are not supported yet.`);
        }

        // Check that the framebuffer is complete.
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            throwError(() =>
            {
                switch (status) {
                    case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
                        return `Incomplete framebuffer '${name}'! One or more framebuffer attachment points are incomplete.`;
                    case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
                        return `Incomplete framebuffer '${name}'! One or more of the framebuffer attachment's dimensions are not the same.`;
                    case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
                        return `Incomplete framebuffer '${name}'! No images are attached to the framebuffer.`;
                    case gl.FRAMEBUFFER_UNSUPPORTED:
                        return `Incomplete framebuffer '${name}'! The combination of internal formats of the attached images violates an implementation-dependent set of restrictions.`;
                    case gl.FRAMEBUFFER_INCOMPLETE_MULTISAMPLE:
                        return `Incomplete framebuffer '${name}'! The value of GL_FRAMEBUFFER_ATTACHMENT_TEXTURE_SAMPLES is not the same for all attached textures.`;
                    default:
                        return `Incomplete framebuffer '${name}'! Unknown error code ${status}.`;
                }
            });
        }

        if (depthAttachment !== null) {
            if (stencilAttachment !== null) {
                logInfo(() => `Created Framebuffer "${name}" with ${colorAttachments.length} color attachments, and a depth- and stencil attachment.`);
            } else {
                logInfo(() => `Created Framebuffer "${name}" with ${colorAttachments.length} color attachments and a depth attachment.`);
            }
        } else if (stencilAttachment !== null) {
            logInfo(() => `Created Framebuffer "${name}" with ${colorAttachments.length} color attachments and a stencil attachment.`);
        } else {
            logInfo(() => `Created Framebuffer "${name}" with ${colorAttachments.length} color attachments.`);
        }

        // Keep track of the Framebuffer for automatic cleanup.
        gl.__glance.framebuffers.push(glFramebuffer);

        // Return the Framebuffer object
        return {
            glo: glFramebuffer,
            name,
            color: colorAttachments,
            depth: depthAttachment,
            stencil: stencilAttachment,
        };
    }

    // Delete the Framebuffer on error.
    catch (error) {
        gl.deleteFramebuffer(glFramebuffer);
        (error as Error).message = `Failed to define framebuffer "${name}": ${(error as Error).message}`;
        throw error;
    }

    // Always restore the WebGL state.
    finally {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
}


/// Updates the layer of a 3D or 2D Array Texture attachment of a Framebuffer.
/// Use this to render slices into a volumetric texture.
/// @param gl The WebGL context.
/// @param framebuffer The Framebuffer to update.
/// @param location WebGL location constant of the attachment to update.
/// @param layer New layer to render into.
/// @param level (optional) Mipmap level to update, defaults to 0.
function updateFramebufferLayer(
    gl: WebGL2,
    framebuffer: Framebuffer,
    location: number,
    layer: number,
    level: number = 0,
): void
{
    // Find the attachment at the given location.
    let attachment: AttachmentDefinition;
    let locationName: string;
    switch (location) {
        case gl.DEPTH_ATTACHMENT:
            attachment = framebuffer.depth ?? throwError(() => `Framebuffer "${framebuffer.name}" has no depth attachment.`);
            locationName = "depth";
            break;
        case gl.STENCIL_ATTACHMENT:
            attachment = framebuffer.stencil ?? throwError(() => `Framebuffer "${framebuffer.name}" has no stencil attachment.`);
            locationName = "stencil";
            break;
        default:
            attachment = framebuffer.color[location - gl.COLOR_ATTACHMENT0] ?? throwError(() => `Framebuffer "${framebuffer.name}" has no color attachment at location ${location}.`);
            locationName = `color[${location - gl.COLOR_ATTACHMENT0}]`;
    }

    // Maybe the attachment is already correct.
    if (attachment.layer === layer && attachment.level === (level ?? attachment.level)) {
        return;
    }

    // Check that the attachment is a 3D or 2D Array Texture with the correct depth.
    if (attachment.attachment.attachmentType !== AttachmentType.TEXTURE) {
        throwError(() => `Framebuffer "${framebuffer.name}" has no texture as its ${locationName} attachment, but a renderbuffer.`);
    }
    const texture = attachment.attachment as Texture;
    if (texture.target !== TextureTarget.TEXTURE_2D_ARRAY && texture.target !== TextureTarget.TEXTURE_3D) {
        const textureKind = texture.target === TextureTarget.TEXTURE_2D ? "2D" : "cubemap";
        throwError(() => `Framebuffer "${framebuffer.name}" has no 3D or 2D array texture as its ${locationName} attachment, but a ${textureKind} texture.`);
    }
    if (layer < 0 || layer >= texture.depth) {
        throwError(() => `Invalid layer ${layer} for ${locationName} attachment of framebuffer "${framebuffer.name}", which has a depth of ${texture.depth}.`);
    }

    // Keep track of the current WebGL state.
    const currentFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);

    // Update the framebuffer.
    try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer.glo);
        gl.framebufferTextureLayer(
            gl.FRAMEBUFFER,
            location,
            texture.glo,
            level ?? attachment.level ?? 0,
            layer,
        );
    }

    // Always restore the WebGL state.
    finally {
        gl.bindFramebuffer(gl.FRAMEBUFFER, currentFramebuffer);
    }
}


/// Create a new draw call.
/// @param gl The WebGL context.
/// @param name The name of the draw call.
/// @param vao The VAO to use or a description of a VAO to create.
/// @param program The shader program to use.
/// @param options Additional options for the draw call:
/// - `blendFunc`: The blend function to use. Defaults to `undefined`.
/// - `cullFace`: The cull face mode to use. Defaults to `undefined`.
/// - `depthTest`: The depth test function to use. Defaults to `undefined`.
/// - `drawModeOverride`: Override the draw mode of the VAO's index buffer.
/// - `indexCount`: The number of indices to draw. Defaults to the size of the index buffer.
/// - `indexOffset`: The offset into the index buffer. Defaults to 0.
/// - `instances`: The number of instances to render. Defaults to 1.
/// - `uniforms`: A mapping from uniform names to values.
///   As a convenience, you can also pass a Texture here, which will be moved to the `textures` mapping instead.
///   If you want to modify both the texture unit and the texture, define the unit here and the texture in `textures`.
/// - `textures`: A mapping from uniform names to textures.
/// - `updateDepthBuffer`: Whether to update the depth buffer. Defaults to `undefined`.
/// @returns The DrawCall object.
function createDrawCall(
    gl: WebGL2,
    name: string,
    vao: VAO | {
        ibo: Parameters<typeof createVertexArrayObject>[2],
        attributes: Parameters<typeof createVertexArrayObject>[3];
    },
    program: Program,
    options: {
        blendFunc?: [BlendFunc, BlendFunc] | [BlendFunc, BlendFunc, BlendFunc, BlendFunc],
        blendEquation?: BlendEquation | [BlendEquation, BlendEquation],
        cullFace?: CullFace,
        depthTest?: DepthTest,
        drawModeOverride?: DrawMode,
        indexCount?: number,
        indexOffset?: number,
        instances?: number,
        uniforms?: Record<string, UniformValue | Texture>,
        textures?: Record<string, Texture>,
        updateDepthBuffer?: boolean,
    } = {}
): DrawCall
{
    // If the vao argument is only a description of a VAO, build it first
    if (!Object.hasOwn(vao, 'glo')) {
        vao = createVertexArrayObject(gl, `${name}-vao`, vao.ibo, vao.attributes as any, program);
    }
    vao = vao as VAO;

    // Validate the index count and -offset.
    if (options.indexCount !== undefined && options.indexCount <= 0) {
        throwError(() => `Invalid index count: ${options.indexCount}.`);
    }
    if (options.indexOffset !== undefined) {
        if (options.indexOffset < 0) {
            throwError(() => `Invalid index offset: ${options.indexOffset}.`);
        }
        options.indexOffset = Math.ceil(options.indexOffset);
    }
    const indexCount = options.indexCount ?? vao.ibo.size;
    const indexOffset = options.indexOffset ?? 0;
    if (indexOffset + indexCount > vao.ibo.size) {
        throwError(() => `Index offset ${indexOffset} and count ${indexCount} exceed the size of the index buffer (${vao.ibo.size}).`);
    }

    // Validate the number of instances.
    if (options.instances !== undefined) {
        if (options.instances <= 0) {
            throwError(() => `Instance count cannot be <= 0, is: ${options.instances}.`);
        }
        if (!Number.isSafeInteger(options.instances)) {
            logWarning(() => `Instance count is not an integer, is: ${options.instances}.`);
        }
        options.instances = Math.ceil(options.instances);
    }

    // Ensure that the attribute locations of the VAO match the shader program.
    for (const [attributeName, shaderAttribute] of program.attributes.entries()) {
        const vaoAttributeRef = vao.attributes.get(shaderAttribute.location);
        if (vaoAttributeRef === undefined) {
            throwError(() => `VAO "${vao.name}" does not provide an attribute for "${attributeName}" (at location ${shaderAttribute.location}) of shader program "${program.name}"!`);
        }
        const vaoAttribute = vaoAttributeRef.buffer.attributes.get(vaoAttributeRef.name);
        if (vaoAttribute === undefined) {
            throwError(() => `Missing attribute "${vaoAttributeRef.name}" in VBO "${vaoAttributeRef.buffer.name}"!`);
        }
        if (!matchAttributeType(vaoAttribute, shaderAttribute.type)) {
            throwError(() =>
            {
                const attributeType = attributeToGLSLType(vaoAttribute);
                return `Attribute "${vaoAttributeRef.name}" in VBO "${vaoAttributeRef.buffer.name}" has type '${attributeType}' but shader program "${program.name}" expects type '${shaderAttribute.type} at location ${shaderAttribute.location}'!`;
            });
        }
        if (attributeName != vaoAttributeRef.name) {
            logWarning(() => `Attribute "${attributeName}" of shader program "${program.name}" at location ${shaderAttribute.location} is bound to attribute "${vaoAttributeRef.name}" in VBO "${vaoAttributeRef.buffer.name}"!`);
        }
    }

    // Both the uniforms and texture records are optional but must be objects.
    if (options.uniforms === undefined) {
        options.uniforms = {};
    }
    if (options.textures === undefined) {
        options.textures = {};
    }

    // Ensure that all uniforms actually exist in the shader program
    for (const [uniformName, value] of Object.entries(options.uniforms)) {
        const uniform = program.uniforms.get(uniformName);
        if (uniform === undefined) {
            logWarning(() => `Uniform "${uniformName}" of Draw Call "${name}" not found in shader program "${program.name}"!`);
            continue;
        }

        // Move all textures from the uniforms to the textures option object.
        if (isSamplerType(uniform.type)) {
            if (typeof value !== 'number') {
                if ((value as Texture)?.attachmentType !== AttachmentType.TEXTURE) {
                    throwError(() => `Uniform "${uniformName}" is not a texture or a number.`);
                }
                options.textures[uniformName] = value as Texture;
                delete options.uniforms![uniformName];
            }
        }
    }

    // Create the texture unit mapping.
    for (const uniformName of Object.keys(options.textures ?? {})) {
        if (!program.uniforms.has(uniformName)) {
            logWarning(() => `Sampler Uniform "${uniformName}" of Draw Call "${name}" not found in shader program "${program.name}"!`);
        }
    }

    // The draw call is simply a collection of values used in `draw()`.
    return {
        name,
        vao,
        program,
        indexCount,
        indexOffset,
        drawMode: options.drawModeOverride ?? vao.ibo.drawMode,
        instances: options.instances ?? 1,
        uniform: options.uniforms as Record<string, UniformValue>,
        textures: options.textures,
        cullFace: options.cullFace,
        depthTest: options.depthTest,
        blendFunc: options.blendFunc,
        blendEquation: options.blendEquation,
        updateDepthBuffer: options.updateDepthBuffer,
    };
}


/// Execute a draw call.
/// This function always changes which VAO and shader program are bound.
/// Depending on the draw call parameters, it might also change other state, but
/// it will minimize the changes to allow for better mixing of glance- and raw
/// WebGL-code.
/// @param gl The WebGL context.
/// @param drawCall The draw call to execute.
function draw(gl: WebGL2, drawCall: DrawCall): void
{
    const vao = drawCall.vao;
    const program = drawCall.program;

    let useDefaultBlendFunc: boolean = true;
    let useDefaultBlendEquation: boolean = true;
    try {
        // Bind the shader program and VAO.
        gl.bindVertexArray(vao.glo);
        gl.useProgram(program.glo);

        // Selectively set up up the WebGL state for the draw call.
        if (drawCall.cullFace !== undefined) {
            if (drawCall.cullFace === CullFace.NONE) {
                gl.disable(gl.CULL_FACE);
            } else {
                gl.enable(gl.CULL_FACE);
                gl.cullFace(drawCall.cullFace);
            }
        }
        if (drawCall.depthTest !== undefined) {
            if (drawCall.depthTest === DepthTest.NONE) {
                gl.disable(gl.DEPTH_TEST);
            } else {
                gl.enable(gl.DEPTH_TEST);
                gl.depthFunc(drawCall.depthTest);
            }
        }

        // Set up blending.
        if (drawCall.blendFunc !== undefined) {
            if (drawCall.blendFunc.length === 2) {
                if (drawCall.blendFunc[0] !== BlendFunc.ONE || drawCall.blendFunc[1] !== BlendFunc.ZERO) {
                    gl.enable(gl.BLEND);
                    gl.blendFunc(drawCall.blendFunc[0], drawCall.blendFunc[1]);
                    useDefaultBlendFunc = false;
                }
            }
            else if (drawCall.blendFunc.length === 4) {
                if (
                    drawCall.blendFunc[0] !== BlendFunc.ONE || drawCall.blendFunc[1] !== BlendFunc.ZERO &&
                    drawCall.blendFunc[2] !== BlendFunc.ONE || drawCall.blendFunc[3] !== BlendFunc.ZERO
                ) {
                    gl.enable(gl.BLEND);
                    gl.blendFuncSeparate(
                        drawCall.blendFunc[0], drawCall.blendFunc[1],
                        drawCall.blendFunc[2], drawCall.blendFunc[3]);
                    useDefaultBlendFunc = false;
                }
            }
            else {
                throwError(() => `Invalid blend function array length: ${drawCall.blendFunc!.length}.`);
            }
        }
        if (drawCall.blendEquation !== undefined) {
            if (Array.isArray(drawCall.blendEquation)) {
                if (drawCall.blendEquation[0] !== BlendEquation.FUNC_ADD || drawCall.blendEquation[1] !== BlendEquation.FUNC_ADD) {
                    if (useDefaultBlendFunc) {
                        gl.enable(gl.BLEND);
                    }
                    gl.blendEquationSeparate(drawCall.blendEquation[0], drawCall.blendEquation[1]);
                    useDefaultBlendEquation = false;
                }
            } else {
                if (drawCall.blendEquation !== BlendEquation.FUNC_ADD) {
                    if (useDefaultBlendFunc) {
                        gl.enable(gl.BLEND);
                    }
                    gl.blendEquation(drawCall.blendEquation);
                    useDefaultBlendEquation = false;
                }
            }
        }

        if (drawCall.updateDepthBuffer !== undefined) {
            gl.depthMask(drawCall.updateDepthBuffer);
        }

        // Update the draw call's uniform values.
        for (const [uniformName, newValue] of Object.entries(drawCall.uniform)) {
            const uniform = program.uniforms.get(uniformName);
            if (!uniform) {
                // TODO: a logWarning(once) would be nice
                throwError(() => `Uniform "${uniformName}" not found in program "${program.name}"`);
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

        { // Bind the textures
            const maxTextureUnits = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
            const usedTextureUnits: Map<TextureUnitId, TextureUnit> = new Map();
            for (const [name, texture] of Object.entries(drawCall.textures)) {
                const uniform = program.uniforms.get(name);
                if (!uniform) {
                    throwError(() => `Sampler Uniform "${name}" not found in program "${program.name}"`);
                }
                if (!isSamplerType(uniform.type)) {
                    throwError(() => `Uniform "${name}" in program "${program.name}" is not a sampler.`);
                }
                const unit: number = uniform.value as number;
                if (unit === undefined || typeof unit !== 'number' || !Number.isSafeInteger(unit)) {
                    throwError(() => `Value of Uniform "${name}" in program "${program.name}" is not a texture unit.`);
                }
                if (unit < 0 || unit >= maxTextureUnits) {
                    throwError(() => `Invalid texture unit ${unit} for uniform "${name}" in program "${program.name}".`);
                }

                const textureUnit = usedTextureUnits.get(unit) || {};
                gl.activeTexture(gl.TEXTURE0 + unit);
                switch (texture.target) {
                    case TextureTarget.TEXTURE_2D: {
                        if (textureUnit.texture_2d !== undefined) {
                            throwError(() => `Texture unit ${unit} is already used by another 2D texture.`);
                        }
                        gl.bindTexture(gl.TEXTURE_2D, texture.glo);
                        textureUnit.texture_2d = texture;
                        break;
                    }
                    case TextureTarget.TEXTURE_3D: {
                        if (textureUnit.texture_3d !== undefined) {
                            throwError(() => `Texture unit ${unit} is already used by another 3D texture.`);
                        }
                        gl.bindTexture(gl.TEXTURE_3D, texture.glo);
                        textureUnit.texture_3d = texture;
                        break;
                    }
                    case TextureTarget.TEXTURE_CUBE_MAP: {
                        if (textureUnit.texture_cube !== undefined) {
                            throwError(() => `Texture unit ${unit} is already used by another cube map texture.`);
                        }
                        gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture.glo);
                        textureUnit.texture_cube = texture;
                        break;
                    }
                    case TextureTarget.TEXTURE_2D_ARRAY: {
                        if (textureUnit.texture_2d_array !== undefined) {
                            throwError(() => `Texture unit ${unit} is already used by another 2D array texture.`);
                        }
                        gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture.glo);
                        textureUnit.texture_2d_array = texture;
                        break;
                    }
                    default: assertUnreachable(texture.target);
                }
                usedTextureUnits.set(unit, textureUnit);
            }
        }

        // Find out how many instances to draw.
        let instances: number = drawCall.instances ?? 1;
        if (isNaN(instances) || !isFinite(instances) || instances < 1) {
            throwError(() => `Invalid instance count: ${instances}.`);
        }
        instances = Math.ceil(instances);

        // Perform the draw call.
        if (instances == 1) {
            gl.drawElements(
                drawCall.drawMode,
                drawCall.indexCount,
                drawCall.vao.ibo.type,
                drawCall.indexOffset
            );
        } else {
            gl.drawElementsInstanced(
                drawCall.drawMode,
                drawCall.indexCount,
                drawCall.vao.ibo.type,
                drawCall.indexOffset,
                instances
            );
        }
    }

    // Always reset the WebGL state, if you modified it.
    finally {
        if (Object.keys(drawCall.textures).length > 0) {
            gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
            gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
            gl.bindTexture(gl.TEXTURE_3D, null);
            gl.bindTexture(gl.TEXTURE_2D, null);
            gl.activeTexture(gl.TEXTURE0);
        }
        if (drawCall.updateDepthBuffer !== undefined) {
            gl.depthMask(true);
        }
        if (!useDefaultBlendFunc || !useDefaultBlendEquation) {
            gl.disable(gl.BLEND);
            if (!useDefaultBlendFunc) {
                gl.blendFunc(gl.ONE, gl.ZERO);
            }
            if (!useDefaultBlendEquation) {
                gl.blendEquation(gl.FUNC_ADD);
            }
        }
        if (drawCall.depthTest !== undefined) {
            gl.depthFunc(gl.ALWAYS);
            gl.disable(gl.DEPTH_TEST);
        }
        if (drawCall.cullFace !== undefined) {
            gl.cullFace(gl.BACK);
            gl.disable(gl.CULL_FACE);
        }
        gl.useProgram(null);
        gl.bindVertexArray(null);
    }
}
// TODO: function to perform a sequence of draw calls, which can be optimized with fewer state changes?
// TODO: Callback with debug information for draw calls (e.g. number of vertices, number of instances, how many textures exist, are being used etc.)


/// Completely reset the WebGL state.
/// Also removes all resources created by Glance.
/// If you specify a `keepLast` value of 1, then all cached resources that were
/// accessed within the last frame will be kept alive.
/// @param gl The WebGL context.
/// @param keepLast The number of generations to keep, defaults to 0.
function resetContext(gl: WebGL2, keepLast: number = 0): void
{
    // Keep track of whether any resources were removed.
    let anyRemovals: boolean = false;

    // Remove all cached resources that are older than `keepLast`.
    const removeGeneration = gl.__glance.generation - keepLast;

    /// Helper function to delete all resources of a certain type from a map, that are older than a certain generation.
    const deleteOld = (map: Map<any, Cached<any>>, deleteFunc: (object: any) => void): number =>
    {
        let removed = 0;
        for (const [key, cached] of map.entries()) {
            if (cached.generation <= removeGeneration) {
                deleteFunc(cached.object);
                map.delete(key);
                removed++;
                anyRemovals = true;
            }
        }
        return removed;
    };

    // Helper function to delete all resources of a certain type from an array.
    const deleteAll = (array: Array<any>, deleteFunc: (object: any) => void): number =>
    {
        const removed = array.length;
        for (let i = 0; i < removed; ++i) {
            deleteFunc(array[i]);
            anyRemovals = true;
        }
        array.length = 0;
        return removed;
    };


    // Remove expired resources created by Glance.
    const shadersRemoved = deleteOld(gl.__glance.shaders, (shader: Shader) => gl.deleteShader(shader.glo));
    const programsRemoved = deleteOld(gl.__glance.programs, (program: Program) => gl.deleteProgram(program.glo));
    const buffersRemoved = deleteAll(gl.__glance.buffers, (buffer: WebGLBuffer) => gl.deleteBuffer(buffer));
    const vaosRemoved = deleteAll(gl.__glance.vaos, (vao: WebGLVertexArrayObject) => gl.deleteVertexArray(vao));
    const texturesRemoved = deleteAll(gl.__glance.textures, (texture: WebGLTexture) => gl.deleteTexture(texture));
    const renderbuffersRemoved = deleteAll(gl.__glance.renderbuffers, (renderbuffer: WebGLRenderbuffer) => gl.deleteRenderbuffer(renderbuffer));
    const framebuffersRemoved = deleteAll(gl.__glance.framebuffers, (framebuffer: WebGLFramebuffer) => gl.deleteFramebuffer(framebuffer));

    // Log the cleanup.
    if (anyRemovals) {
        let message = `Cleaned up WebGL resources:\n`;
        if (shadersRemoved > 0) {
            message += ` - ${shadersRemoved} shader${shadersRemoved > 1 ? 's' : ''}\n`;
        }
        if (programsRemoved > 0) {
            message += ` - ${programsRemoved} program${programsRemoved > 1 ? 's' : ''}\n`;
        }
        if (buffersRemoved > 0) {
            message += ` - ${buffersRemoved} buffer${buffersRemoved > 1 ? 's' : ''}\n`;
        }
        if (vaosRemoved > 0) {
            message += ` - ${vaosRemoved} VAO${vaosRemoved > 1 ? 's' : ''}\n`;
        }
        if (texturesRemoved > 0) {
            message += ` - ${texturesRemoved} texture${texturesRemoved > 1 ? 's' : ''}\n`;
        }
        if (renderbuffersRemoved > 0) {
            message += ` - ${renderbuffersRemoved} renderbuffer${renderbuffersRemoved > 1 ? 's' : ''}\n`;
        }
        if (framebuffersRemoved > 0) {
            message += ` - ${framebuffersRemoved} framebuffer${framebuffersRemoved > 1 ? 's' : ''}\n`;
        }
        logInfo(() => message.slice(0, -1));
    }

    // Increment the generation counter for the next run.
    gl.__glance.generation += 1;

    // Reset the WebGL state.
    resetToInitialState(gl);
}


// =============================================================================
// Helper Functions
// =============================================================================

// Attributes =============================================================== //


/// Find and update all attributes in a compiled shader program.
function discoverAttributes(gl: WebGL2, program: Program): void
{
    const regex = /^\s*(?:layout\s*\(location\s*=\s*(?<location>\d+)\)\s*)?in\s+(?:(?<precision>lowp|mediump|highp)\s+)?(?<type>\w+)\s+(?<name>\w+)\s*;/gm;

    // Check if the attributes are already defined.
    if (program.attributes.size > 0) {
        logWarning(() => `Attributes of shader program "${program.name}" are already defined.`);
        return;
    }

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

        // Warn if the attribute location does not match the expected location.
        if (location !== undefined && attributeLocation !== parseInt(location)) {
            logWarning(() => `Vertex shader of shader program "${name}" specifies the location of attribute "${name}" to be ${location}, but it was found at ${attributeLocation}.`);
        }

        // Fail if any attribute names start with "webgl_" or "_webgl_":
        // https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/bindAttribLocation#name
        if (name.startsWith("webgl_") || name.startsWith("_webgl_")) {
            throwError(() => `Attribute name "${name}" is reserved by WebGL.`);
        }

        // Store the attribute information.
        program.attributes.set(name, {
            type,
            location: attributeLocation,
            precision,
        });
    }
}


/// Tests if the given attribute data type is an integer.
/// /// https://developer.mozilla.org/en-US/docs/Web/API/WebGL2/vertexAttribIPointer#type
function isIntegerAttribute(type: AttributeDataType): boolean
{
    switch (type) {
        case AttributeDataType.BYTE:
        case AttributeDataType.UNSIGNED_BYTE:
        case AttributeDataType.SHORT:
        case AttributeDataType.UNSIGNED_SHORT:
        case AttributeDataType.INT:
        case AttributeDataType.UNSIGNED_INT:
            return true;
        default:
            return false;
    }
}


/// Tests if the given attribute data type is packed.
/// https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/vertexAttribPointer
function isPackedAttribute(type: AttributeDataType): boolean
{
    switch (type) {
        case AttributeDataType.INT_2_10_10_10_REV:
        case AttributeDataType.UNSIGNED_INT_2_10_10_10_REV:
            return true;
        default:
            return false;
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
function getAttributeByteSize(description: AttributeLayout): number
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


/// Checks if the given attribute type matches the given GLSL type.
/// With matnxm types, the n signifies the number of columns and the m the number
/// of rows. See https://www.khronos.org/opengl/wiki/Data_Type_(GLSL)#Matrices
/// @param attr Attribute description.
/// @param glslType GLSL type name.
/// @returns True if the attribute type matches the GLSL type.
function matchAttributeType(attr: AttributeLayout, glslType: GlslAttributeDataType): boolean
{
    switch (attr.type) {
        case AttributeDataType.BYTE:
        case AttributeDataType.UNSIGNED_BYTE:
        case AttributeDataType.SHORT:
        case AttributeDataType.UNSIGNED_SHORT:
        case AttributeDataType.INT:
        case AttributeDataType.UNSIGNED_INT:
            switch (glslType) {
                case 'int':
                case 'uint':
                    return attr.height === 1 && attr.width === 1;
                case 'ivec2':
                case 'uvec2':
                    return attr.height === 2 && attr.width === 1;
                case 'ivec3':
                case 'uvec3':
                    return attr.height === 3 && attr.width === 1;
                case 'ivec4':
                case 'uvec4':
                    return attr.height === 4 && attr.width === 1;
                default:
                    return false;
            }
        case AttributeDataType.INT_2_10_10_10_REV:
            return glslType === 'int';
        case AttributeDataType.UNSIGNED_INT_2_10_10_10_REV:
            return glslType === 'uint';
        case AttributeDataType.FLOAT:
        case AttributeDataType.HALF_FLOAT:
            switch (glslType) {
                case 'float':
                    return attr.height === 1 && attr.width === 1;
                case 'vec2':
                    return attr.height === 2 && attr.width === 1;
                case 'vec3':
                    return attr.height === 3 && attr.width === 1;
                case 'vec4':
                    return attr.height === 4 && attr.width === 1;
                case 'mat2':
                case 'mat2x2':
                    return attr.height === 2 && attr.width === 2;
                case 'mat2x3':
                    return attr.height === 3 && attr.width === 2;
                case 'mat2x4':
                    return attr.height === 4 && attr.width === 2;
                case 'mat3x2':
                    return attr.height === 2 && attr.width === 3;
                case 'mat3':
                case 'mat3x3':
                    return attr.height === 3 && attr.width === 3;
                case 'mat3x4':
                    return attr.height === 4 && attr.width === 3;
                case 'mat4x2':
                    return attr.height === 2 && attr.width === 4;
                case 'mat4x3':
                    return attr.height === 3 && attr.width === 4;
                case 'mat4':
                case 'mat4x4':
                    return attr.height === 4 && attr.width === 4;
                default:
                    return false;
            }
        default:
            assertUnreachable(attr.type);
    }
}


/// Produces the appropriate GLSL type for the given attribute.
/// @param attr Attribute description.
/// @returns The GLSL type name.
/// @throws If the attribute type is invalid.
function attributeToGLSLType(attr: AttributeLayout): GlslAttributeDataType
{
    switch (attr.type) {
        case AttributeDataType.BYTE:
        case AttributeDataType.SHORT:
        case AttributeDataType.INT:
            switch (attr.width) {
                case 1:
                    switch (attr.height) {
                        case 1: return 'int';
                        case 2: return 'ivec2';
                        case 3: return 'ivec3';
                        case 4: return 'ivec4';
                    }
            }
            break;
        case AttributeDataType.INT_2_10_10_10_REV:
            return 'int';
        case AttributeDataType.UNSIGNED_INT_2_10_10_10_REV:
            return 'uint';
        case AttributeDataType.UNSIGNED_BYTE:
        case AttributeDataType.UNSIGNED_SHORT:
        case AttributeDataType.UNSIGNED_INT:
            switch (attr.width) {
                case 1:
                    switch (attr.height) {
                        case 1: return 'uint';
                        case 2: return 'uvec2';
                        case 3: return 'uvec3';
                        case 4: return 'uvec4';
                    }
            }
            break;
        case AttributeDataType.FLOAT:
        case AttributeDataType.HALF_FLOAT:
            switch (attr.width) {
                case 1:
                    switch (attr.height) {
                        case 1: return 'float';
                        case 2: return 'vec2';
                        case 3: return 'vec3';
                        case 4: return 'vec4';
                    }
                    break;
                case 2:
                    switch (attr.height) {
                        case 2: return 'mat2';
                        case 3: return 'mat2x3';
                        case 4: return 'mat2x4';
                    }
                    break;
                case 3:
                    switch (attr.height) {
                        case 2: return 'mat3x2';
                        case 3: return 'mat3';
                        case 4: return 'mat3x4';
                    }
                    break;
                case 4:
                    switch (attr.height) {
                        case 2: return 'mat4x2';
                        case 3: return 'mat4x3';
                        case 4: return 'mat4';
                    }
                    break;
            }
    }
    throwError(() => `Invalid attribute type: ${attr.type} with a size of ${attr.height} and a width of ${attr.width}.`);
}


/// Converts a 32-bit float to a 16-bit float.
/// @param float32 A 32-bit float.
/// @returns A 16-bit float.
function float32ToFloat16(float32: number): number
{
    let float32View = new Float32Array(1);
    let uint16View = new Uint16Array(float32View.buffer);

    float32View[0] = float32;
    const float32Int = uint16View[1] << 16 | uint16View[0];
    const sign = (float32Int >> 31) << 15;
    let exponent = ((float32Int >> 23) & 0xFF) - 127 + 15;
    let fraction = float32Int & 0x7FFFFF;

    if (exponent < 0) {
        exponent = 0;
        fraction = (fraction | 0x800000) >> (1 - exponent);
    } else if (exponent > 0x1F) {
        exponent = 0x1F;
        fraction = 0;
    }

    return sign | (exponent << 10) | (fraction >> 13);
}


/// Packs three 10-bit + one 2-bit unsigned integers into a 32-bit unsigned integer.
function encodeU2101010REV(r: number, g: number, b: number, a: number): number // UNTESTED
{
    return (clamp(Math.round(a), 0, 3) << 30)
        | (clamp(Math.round(b), 0, 1023) << 20)
        | (clamp(Math.round(g), 0, 1023) << 10)
        | clamp(Math.round(r), 0, 1023);
}


/// Packs three 10-bit + one 2-bit signed integers into a 32-bit unsigned integer.
function encodeI2101010REV(r: number, g: number, b: number, a: number): number // UNTESTED
{
    return Math.sign(a) << 31 | (clamp(Math.round(Math.abs(a)), 0, 1) << 30)
        | Math.sign(b) << 29 | (clamp(Math.round(Math.abs(b)), 0, 511) << 20)
        | Math.sign(g) << 19 | (clamp(Math.round(Math.abs(g)), 0, 511) << 10)
        | Math.sign(r) << 9 | clamp(Math.round(Math.abs(r)), 0, 511);
}


// Uniforms ================================================================= //


/// Find and update all uniforms in a compiled shader program.
function updateUniforms(gl: WebGL2, program: Program, defaults: Record<string, UniformValue>): void
{
    const regex = /^\s*uniform\s+(?<precision>lowp|mediump|highp)?\s*(?<type>\w+)\s+(?<name>\w+)(?:\s*\[\s*(?<sizeString>\d+)\s*\])?\s*;/gm;

    // Remove existing uniforms.
    program.uniforms.clear();

    // Texture samplers are assigned to texture units automatically.
    // In order to respect manually assigned texture units though, we have to
    // do that _after_ all of the manually assigned uniforms have been set.
    // So we collect all texture samplers here and assign them later.
    const maxTextureUnits: number = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
    const textureSamplers: Array<[string, Uniform]> = [];
    const usedTextureUnits: Set<number> = new Set();

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

            // Determine the default value for the uniform.
            let value: UniformValue | undefined = defaults[name];
            if (value === undefined) {
                // ... unless it is a sampler, in which case we store it for later.
                if (isSamplerType(type)) {
                    textureSamplers.push([name, { type, location, size, value, precision }]);
                    continue;
                }
                value = getDefaultUniformValue(type, size);
            }
            else if (isSamplerType(type)) {
                if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value >= maxTextureUnits) {
                    throwError(() => `Invalid texture unit id: ${value}. Valid range is [0, ${maxTextureUnits}).`);
                }
                usedTextureUnits.add(value as number);
            }

            // Store the uniform information.
            program.uniforms.set(name, { type, location, size, value, precision });
        }
    }

    // Once all of the samplers with user-assigned texture units have been set,
    // we can assign the remaining samplers to the next available texture units.
    for (const [name, uniform] of textureSamplers) {
        let unitId = 0;
        while (usedTextureUnits.has(unitId)) {
            unitId++;
            if (unitId >= maxTextureUnits) {
                throwError(() => `No more texture units available for sampler "${name}".`);
            }
        }
        usedTextureUnits.add(unitId);
        uniform.value = unitId;
        logInfo(() => `Auto-assigning texture sampler "${name}" to texture unit ${unitId}.`);
        program.uniforms.set(name, uniform);
    }

    // Upload the uniform values.
    try {
        gl.useProgram(program.glo);
        for (const uniform of program.uniforms.values()) {
            uploadUniform(gl, uniform);
        }
    } finally {
        // Always unbind the program when done.
        gl.useProgram(null);
    }
}


/// Check if a uniform data type is a sampler type.
function isSamplerType(type: GlslUniformDataType)
{
    return type.indexOf('sampler') !== -1;
}


/// Produce a reasonable default value for a uniform based on its type.
/// @param type GLSL type of the uniform.
/// @param size Size of the uniform (for arrays).
/// @returns A default value for the uniform.
function getDefaultUniformValue(type: GlslUniformDataType, size: number): number | Array<number>
{
    let defaultValue: number | Array<number>;
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
                0, 1];
            break;
        case 'mat3':
        case 'mat3x3':
            defaultValue = [
                1, 0, 0,
                0, 1, 0,
                0, 0, 1];
            break;
        case 'mat4':
        case 'mat4x4':
            defaultValue = [
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                0, 0, 0, 1];
            break;
        case 'mat2x3':
            defaultValue = [
                1, 0,
                0, 1,
                0, 0];
            break;
        case 'mat2x4':
            defaultValue = [
                1, 0,
                0, 1,
                0, 0,
                0, 0];
            break;
        case 'mat3x2':
            defaultValue = [
                1, 0, 0,
                0, 1, 0];
            break;
        case 'mat3x4':
            defaultValue = [
                1, 0, 0,
                0, 1, 0,
                0, 0, 1,
                0, 0, 0];
            break;
        case 'mat4x2':
            defaultValue = [
                1, 0, 0, 0,
                0, 1, 0, 0];
            break;
        case 'mat4x3':
            defaultValue = [
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0];
            break;
        default:
            assertUnreachable(type);
    }

    // If the uniform is an array of size n, repeat the default value n times.
    if (size === 1) {
        return defaultValue;
    } else {
        return Array(size).fill(defaultValue).flat() as Array<number>;
    }
}


// Debug checks for setting uniforms.
// They should have been removed in production builds.
const isNumber = (val: any) => typeof val === 'number';
const isInt = (val: any) => Number.isSafeInteger(val);
const isUint = (val: any) => isInt(val) && val >= 0;
const isBool = (val: any) => typeof val === 'boolean' || (isInt(val) && (val === 0 || val === 1));
const isArray = (val: any): val is [] => Array.isArray(val) || ArrayBuffer.isView(val);
const isArrayOfNumbers = (uniform: Uniform, size: number) =>
    isArray(uniform.value) && uniform.value.length == size * uniform.size && uniform.value.every(val => isNumber(val));
const isArrayOfBools = (uniform: Uniform, size: number) =>
    isArray(uniform.value) && uniform.value.length == size * uniform.size && uniform.value.every(val => isBool(val));
const isArrayOfInts = (uniform: Uniform, size: number) =>
    isArray(uniform.value) && uniform.value.length == size * uniform.size && uniform.value.every(val => isInt(val));
const isArrayOfUints = (uniform: Uniform, size: number) =>
    isArray(uniform.value) && uniform.value.length == size * uniform.size && uniform.value.every(val => isUint(val));
const isVec2 = (uniform: Uniform) => ((uniform.value as any).isVec2 ?? false) || isArrayOfNumbers(uniform, 2);
const isVec3 = (uniform: Uniform) => ((uniform.value as any).isVec3 ?? false) || isArrayOfNumbers(uniform, 3);
const isMat3 = (uniform: Uniform) => ((uniform.value as any).isMat3 ?? false) || isArrayOfNumbers(uniform, 9);
const isMat4 = (uniform: Uniform) => ((uniform.value as any).isMat4 ?? false) || isArrayOfNumbers(uniform, 16);
const uniformUpdateError = (uniform: Uniform, size: number, type: string) => `Value of uniform must be an array of ${size * uniform.size} ${type}s, but is: ${JSON.stringify(uniform.value)}.`;


/// Helper function to call the correct gl.uniform* function based on the uniform type.
/// @param gl The WebGL context.
/// @param uniform The uniform info with the value to set.
function uploadUniform(gl: WebGL2, uniform: Uniform): void
{
    switch (uniform.type) {
        case 'float':
            assert(isNumber(uniform.value), () => `Value of uniform must be a number!`);
            return gl.uniform1f(uniform.location, uniform.value as number);
        case 'vec2':
            assert(isVec2(uniform), () => uniformUpdateError(uniform, 2, 'number'));
            return gl.uniform2fv(uniform.location, uniform.value as number[]);
        case 'vec3':
            assert(isVec3(uniform), () => uniformUpdateError(uniform, 3, 'number'));
            return gl.uniform3fv(uniform.location, uniform.value as number[]);
        case 'vec4':
            assert(isArrayOfNumbers(uniform, 4), () => uniformUpdateError(uniform, 4, 'number'));
            return gl.uniform4fv(uniform.location, uniform.value as number[]);
        case 'mat2':
        case 'mat2x2':
            assert(isArrayOfNumbers(uniform, 4), () => uniformUpdateError(uniform, 4, 'number'));
            return gl.uniformMatrix2fv(uniform.location, false, uniform.value as number[]);
        case 'mat3':
        case 'mat3x3':
            assert(isMat3(uniform), () => uniformUpdateError(uniform, 9, 'number'));
            return gl.uniformMatrix3fv(uniform.location, false, uniform.value as number[]);
        case 'mat4':
        case 'mat4x4':
            assert(isMat4(uniform), () => uniformUpdateError(uniform, 16, 'number'));
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
            assert(isInt(uniform.value), () => `Value of uniform must be an integer!`);
            return gl.uniform1i(uniform.location, uniform.value as number);
        case 'uint':
            assert(isUint(uniform.value), () => `Value of uniform must be a positive integer!`);
            return gl.uniform1ui(uniform.location, uniform.value as number);
        case 'bool':
            assert(isBool(uniform.value), () => `Value of uniform must be a boolean, zero or one!`);
            return gl.uniform1i(uniform.location, uniform.value ? 1 : 0);
        case 'mat2x3':
            assert(isArrayOfNumbers(uniform, 6), () => uniformUpdateError(uniform, 6, 'number'));
            return gl.uniformMatrix2x3fv(uniform.location, false, uniform.value as number[]);
        case 'mat3x2':
            assert(isArrayOfNumbers(uniform, 6), () => uniformUpdateError(uniform, 6, 'number'));
            return gl.uniformMatrix3x2fv(uniform.location, false, uniform.value as number[]);
        case 'mat2x4':
            assert(isArrayOfNumbers(uniform, 8), () => uniformUpdateError(uniform, 8, 'number'));
            return gl.uniformMatrix2x4fv(uniform.location, false, uniform.value as number[]);
        case 'mat4x2':
            assert(isArrayOfNumbers(uniform, 8), () => uniformUpdateError(uniform, 8, 'number'));
            return gl.uniformMatrix4x2fv(uniform.location, false, uniform.value as number[]);
        case 'mat3x4':
            assert(isArrayOfNumbers(uniform, 12), () => uniformUpdateError(uniform, 12, 'number'));
            return gl.uniformMatrix3x4fv(uniform.location, false, uniform.value as number[]);
        case 'mat4x3':
            assert(isArrayOfNumbers(uniform, 12), () => uniformUpdateError(uniform, 12, 'number'));
            return gl.uniformMatrix4x3fv(uniform.location, false, uniform.value as number[]);
        case 'ivec2':
            assert(isArrayOfInts(uniform, 2), () => uniformUpdateError(uniform, 2, 'integer'));
            return gl.uniform2iv(uniform.location, uniform.value as number[]);
        case 'ivec3':
            assert(isArrayOfInts(uniform, 3), () => uniformUpdateError(uniform, 3, 'integer'));
            return gl.uniform3iv(uniform.location, uniform.value as number[]);
        case 'ivec4':
            assert(isArrayOfInts(uniform, 4), () => uniformUpdateError(uniform, 4, 'integer'));
            return gl.uniform4iv(uniform.location, uniform.value as number[]);
        case 'uvec2':
            assert(isArrayOfUints(uniform, 2), () => uniformUpdateError(uniform, 2, 'positive integer'));
            return gl.uniform2uiv(uniform.location, uniform.value as number[]);
        case 'uvec3':
            assert(isArrayOfUints(uniform, 3), () => uniformUpdateError(uniform, 3, 'positive integer'));
            return gl.uniform3uiv(uniform.location, uniform.value as number[]);
        case 'uvec4':
            assert(isArrayOfUints(uniform, 4), () => uniformUpdateError(uniform, 4, 'positive integer'));
            return gl.uniform4uiv(uniform.location, uniform.value as number[]);
        case 'bvec2':
            assert(isArrayOfBools(uniform, 2), () => uniformUpdateError(uniform, 2, 'boolean'));
            return gl.uniform2iv(uniform.location, uniform.value as number[]);
        case 'bvec3':
            assert(isArrayOfBools(uniform, 3), () => uniformUpdateError(uniform, 3, 'boolean'));
            return gl.uniform3iv(uniform.location, uniform.value as number[]);
        case 'bvec4':
            assert(isArrayOfBools(uniform, 4), () => uniformUpdateError(uniform, 4, 'boolean'));
            return gl.uniform4iv(uniform.location, uniform.value as number[]);
        default:
            throwError(() => `Unsupported uniform type "${uniform.type}"`);
    }
}


// Textures ================================================================= //


/// Get the name of the texture kind for logging.
function getTextureKind(target: TextureTarget): string
{
    switch (target) {
        case TextureTarget.TEXTURE_2D: return "2D";
        case TextureTarget.TEXTURE_3D: return "3D";
        case TextureTarget.TEXTURE_CUBE_MAP: return "cubemap";
        case TextureTarget.TEXTURE_2D_ARRAY: return "2D array";
    }
}


/// Determines the WIP texture unit.
/// By default, we are using the highest texture unit available, in order to
/// avoid conflicts with user-defined textures.
/// If an explicit texture unit is given, it is validated and returned.
function getWIPTextureUnit(gl: WebGL2, givenUnit?: number): number
{
    const textureUnitCount: number = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
    if (givenUnit === undefined) {
        return textureUnitCount - 1;
    } else {
        if (givenUnit < 0) {
            throwError(() => `WIP texture unit cannot be negative, got: ${givenUnit}.`);
        }
        if (givenUnit >= textureUnitCount) {
            throwError(() => `Invalid WIP texture unit: ${givenUnit}, maximal texture unit available is ${textureUnitCount - 1}.`);
        }
        return givenUnit;
    }
}


/// Given a TypedArray, this function returns the corresponding default texture source data type.
function getDefaultSrcDataType(data: ArrayBufferView): TextureSrcDataType
{
    if (data instanceof Uint8Array) {
        return TextureSrcDataType.UNSIGNED_BYTE;
    } else if (data instanceof Uint16Array) {
        return TextureSrcDataType.UNSIGNED_SHORT;
    } else if (data instanceof Uint32Array) {
        return TextureSrcDataType.UNSIGNED_INT;
    } else if (data instanceof Float32Array) {
        return TextureSrcDataType.FLOAT;
    } else if (data instanceof Int8Array || data instanceof Int16Array || data instanceof Int32Array) {
        throwError(() => `Signed integer buffers are not supported when defining a texture.`);
    } else {
        throwError(() => `Invalid data type: ${data.constructor.name}.`);
    }
}


/// There exist a strict set of rules for which source data types are allowed for which internal formats.
/// See https://registry.khronos.org/webgl/specs/latest/2.0/#3.7.6
/// @param data Data to define the texture with.
/// @param srcDataType Explicitly given source data type.
function validateSrcDataType(data: ArrayBufferView, srcDataType: TextureSrcDataType): void
{
    if (data instanceof Uint8Array) {
        if (srcDataType !== TextureSrcDataType.UNSIGNED_BYTE) {
            throwError(() => `When defining a texture with a 'Uint8Array', the source data type must be 'UNSIGNED_BYTE'`);
        }
    }
    else if (data instanceof Uint8ClampedArray) {
        if (srcDataType !== TextureSrcDataType.UNSIGNED_BYTE) {
            throwError(() => `When defining a texture with a 'Uint8ClampedArray'source data type must be 'UNSIGNED_BYTE'`);
        }
    }
    else if (data instanceof Float32Array) {
        if (srcDataType !== TextureSrcDataType.FLOAT) {
            throwError(() => `When defining a texture with a 'Float32Array', the source data type must be 'FLOAT'`);
        }
    }
    else if (data instanceof Uint16Array) {
        if (![
            TextureSrcDataType.UNSIGNED_SHORT,
            TextureSrcDataType.UNSIGNED_SHORT_5_6_5,
            TextureSrcDataType.UNSIGNED_SHORT_5_5_5_1,
            TextureSrcDataType.UNSIGNED_SHORT_4_4_4_4,
            TextureSrcDataType.HALF_FLOAT,
        ].includes(srcDataType)) {
            throwError(() => `When defining a texture with a 'Uint16Array', the source data type must be one of 'UNSIGNED_SHORT', 'UNSIGNED_SHORT_5_6_5', 'UNSIGNED_SHORT_5_5_5_1', 'UNSIGNED_SHORT_4_4_4_4', or 'HALF_FLOAT'`);
        }
    }
    else if (data instanceof Uint32Array) {
        if (![
            TextureSrcDataType.UNSIGNED_INT,
            TextureSrcDataType.UNSIGNED_INT_5_9_9_9_REV,
            TextureSrcDataType.UNSIGNED_INT_2_10_10_10_REV,
            TextureSrcDataType.UNSIGNED_INT_10F_11F_11F_REV,
            TextureSrcDataType.UNSIGNED_INT_24_8,
        ].includes(srcDataType)) {
            throwError(() => `When defining a texture with a 'Uint32Array', the source data type must be one of 'UNSIGNED_INT', 'UNSIGNED_INT_5_9_9_9_REV', 'UNSIGNED_INT_2_10_10_10_REV', 'UNSIGNED_INT_10F_11F_11F_REV', or'UNSIGNED_INT_24_8'`);
        }
    }
    else if (data instanceof Int8Array || data instanceof Int16Array || data instanceof Int32Array) {
        throwError(() => `Signed integer buffers are not supported when defining a texture.`);
    }
    else {
        throwError(() => `Invalid data type for texture: ${data.constructor.name}`);
    }
}


/// Given the internal format of a texture, and a source data type, this function returns whether the combination is valid, based on the WebGL specification.
/// See https://registry.khronos.org/webgl/specs/latest/2.0/#TEXTURE_TYPES_FORMATS_FROM_DOM_ELEMENTS_TABLE
function matchInternalFormatAndDataType(internalFormat: TextureInternalFormat, dataType: TextureSrcDataType): boolean
{
    switch (internalFormat) {
        case TextureInternalFormat.R8:
            return dataType === TextureSrcDataType.UNSIGNED_BYTE;
        case TextureInternalFormat.R16F:
            return [TextureSrcDataType.HALF_FLOAT, TextureSrcDataType.FLOAT].includes(dataType);
        case TextureInternalFormat.R32F:
            return dataType == TextureSrcDataType.FLOAT;
        case TextureInternalFormat.R8UI:
            return dataType === TextureSrcDataType.UNSIGNED_BYTE;
        case TextureInternalFormat.RG8:
            return dataType === TextureSrcDataType.UNSIGNED_BYTE;
        case TextureInternalFormat.RG16F:
            return [TextureSrcDataType.HALF_FLOAT, TextureSrcDataType.FLOAT].includes(dataType);
        case TextureInternalFormat.RG32F:
            return dataType == TextureSrcDataType.FLOAT;
        case TextureInternalFormat.RG8UI:
            return dataType === TextureSrcDataType.UNSIGNED_BYTE;
        case TextureInternalFormat.RGB8:
            return dataType === TextureSrcDataType.UNSIGNED_BYTE;
        case TextureInternalFormat.SRGB8:
            return dataType === TextureSrcDataType.UNSIGNED_BYTE;
        case TextureInternalFormat.RGB565:
            return [TextureSrcDataType.UNSIGNED_BYTE, TextureSrcDataType.UNSIGNED_SHORT_5_6_5].includes(dataType);
        case TextureInternalFormat.R11F_G11F_B10F:
            return [TextureSrcDataType.UNSIGNED_INT_10F_11F_11F_REV, TextureSrcDataType.HALF_FLOAT, TextureSrcDataType.FLOAT].includes(dataType);
        case TextureInternalFormat.RGB9_E5:
            return [TextureSrcDataType.HALF_FLOAT, TextureSrcDataType.FLOAT].includes(dataType);
        case TextureInternalFormat.RGB16F:
            return [TextureSrcDataType.HALF_FLOAT, TextureSrcDataType.FLOAT].includes(dataType);
        case TextureInternalFormat.RGB32F:
            return dataType == TextureSrcDataType.FLOAT;
        case TextureInternalFormat.RGB8UI:
            return dataType === TextureSrcDataType.UNSIGNED_BYTE;
        case TextureInternalFormat.RGBA8:
            return dataType === TextureSrcDataType.UNSIGNED_BYTE;
        case TextureInternalFormat.SRGB8_ALPHA8:
            return dataType === TextureSrcDataType.UNSIGNED_BYTE;
        case TextureInternalFormat.RGB5_A1:
            return [TextureSrcDataType.UNSIGNED_BYTE, TextureSrcDataType.UNSIGNED_SHORT_5_5_5_1].includes(dataType);
        case TextureInternalFormat.RGB10_A2:
            return dataType === TextureSrcDataType.UNSIGNED_INT_2_10_10_10_REV;
        case TextureInternalFormat.RGBA4:
            return [TextureSrcDataType.UNSIGNED_BYTE, TextureSrcDataType.UNSIGNED_SHORT_4_4_4_4].includes(dataType);
        case TextureInternalFormat.RGBA16F:
            return [TextureSrcDataType.HALF_FLOAT, TextureSrcDataType.FLOAT].includes(dataType);
        case TextureInternalFormat.RGBA32F:
            return dataType == TextureSrcDataType.FLOAT;
        case TextureInternalFormat.RGBA8UI:
            return dataType === TextureSrcDataType.UNSIGNED_BYTE;
        case TextureInternalFormat.DEPTH_COMPONENT16:
            return dataType === TextureSrcDataType.UNSIGNED_SHORT;
        case TextureInternalFormat.DEPTH_COMPONENT24:
            return dataType === TextureSrcDataType.UNSIGNED_INT;
        case TextureInternalFormat.DEPTH_COMPONENT32F:
            return dataType === TextureSrcDataType.FLOAT;
    }
    return false;
}


/// Determine the `format` argument for `texImage2D` based on the given internal format.
/// See https://registry.khronos.org/webgl/specs/latest/2.0/#TEXTURE_TYPES_FORMATS_FROM_DOM_ELEMENTS_TABLE
function getTextureFormat(gl: WebGL2, internalFormat: TextureInternalFormat): GLenum
{
    switch (internalFormat) {
        case TextureInternalFormat.R8:
            return gl.RED;
        case TextureInternalFormat.R16F:
            return gl.RED;
        case TextureInternalFormat.R32F:
            return gl.RED;
        case TextureInternalFormat.R8UI:
            return gl.RED_INTEGER;
        case TextureInternalFormat.RG8:
            return gl.RG;
        case TextureInternalFormat.RG16F:
            return gl.RG;
        case TextureInternalFormat.RG32F:
            return gl.RG;
        case TextureInternalFormat.RG8UI:
            return gl.RG_INTEGER;
        case TextureInternalFormat.RGB8:
            return gl.RGB;
        case TextureInternalFormat.SRGB8:
            return gl.RGB;
        case TextureInternalFormat.RGB565:
            return gl.RGB;
        case TextureInternalFormat.R11F_G11F_B10F:
            return gl.RGB;
        case TextureInternalFormat.RGB9_E5:
            return gl.RGB;
        case TextureInternalFormat.RGB16F:
            return gl.RGB;
        case TextureInternalFormat.RGB32F:
            return gl.RGB;
        case TextureInternalFormat.RGB8UI:
            return gl.RGB_INTEGER;
        case TextureInternalFormat.RGBA8:
            return gl.RGBA;
        case TextureInternalFormat.SRGB8_ALPHA8:
            return gl.RGBA;
        case TextureInternalFormat.RGB5_A1:
            return gl.RGBA;
        case TextureInternalFormat.RGB10_A2:
            return gl.RGBA;
        case TextureInternalFormat.RGBA4:
            return gl.RGBA;
        case TextureInternalFormat.RGBA16F:
            return gl.RGBA;
        case TextureInternalFormat.RGBA32F:
            return gl.RGBA;
        case TextureInternalFormat.RGBA8UI:
            return gl.RGBA_INTEGER;
        case TextureInternalFormat.DEPTH_COMPONENT16:
        case TextureInternalFormat.DEPTH_COMPONENT24:
        case TextureInternalFormat.DEPTH_COMPONENT32F:
            return gl.DEPTH_COMPONENT;
        default:
            throwError(() => `Invalid internal format: ${internalFormat}.`);
    }
}


/// Tests if the given internal Format is a Depth format.
/// As per https://registry.khronos.org/OpenGL-Refpages/gl4/html/glTexParameter.xhtml
/// (under GL_TEXTURE_COMPARE_MODE), this includes any format beginning with
/// `DEPTH_COMPONENT_`.
function isDepthFormat(internalFormat: TextureInternalFormat): boolean
{
    switch (internalFormat) {
        case TextureInternalFormat.DEPTH_COMPONENT16:
        case TextureInternalFormat.DEPTH_COMPONENT24:
        case TextureInternalFormat.DEPTH_COMPONENT32F:
            return true;
        default:
            return false;
    }
}


/// Checks, if a given internal format is a floating point format.
function isFloatFormat(internalFormat: TextureInternalFormat): boolean
{
    switch (internalFormat) {
        case TextureInternalFormat.R16F:
        case TextureInternalFormat.R32F:
        case TextureInternalFormat.RG16F:
        case TextureInternalFormat.RG32F:
        case TextureInternalFormat.RGB16F:
        case TextureInternalFormat.RGB32F:
        case TextureInternalFormat.RGBA16F:
        case TextureInternalFormat.RGBA32F:
        case TextureInternalFormat.DEPTH_COMPONENT32F:
            return true;
        default:
            return false;
    }
}


/// Resets the WebGL context to its initial state.
/// Copied from:
/// https://github.com/KhronosGroup/WebGLDeveloperTools/blob/main/src/debug/webgl-debug.js
function resetToInitialState(gl: WebGL2RenderingContext): void
{
    const isWebGL2RenderingContext = !!gl.createTransformFeedback;

    if (isWebGL2RenderingContext) {
        gl.bindVertexArray(null);
    }

    const numAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
    const tmp = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, tmp);
    for (let ii = 0; ii < numAttribs; ++ii) {
        gl.disableVertexAttribArray(ii);
        gl.vertexAttribPointer(ii, 4, gl.FLOAT, false, 0, 0);
        gl.vertexAttrib1f(ii, 0);
        if (isWebGL2RenderingContext) {
            gl.vertexAttribDivisor(ii, 0);
        }
    }
    gl.deleteBuffer(tmp);

    const numTextureUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    for (let ii = 0; ii < numTextureUnits; ++ii) {
        gl.activeTexture(gl.TEXTURE0 + ii);
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        if (isWebGL2RenderingContext) {
            gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
            gl.bindTexture(gl.TEXTURE_3D, null);
            gl.bindSampler(ii, null);
        }
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.useProgram(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.DITHER);
    gl.disable(gl.SCISSOR_TEST);
    gl.blendColor(0, 0, 0, 0);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ZERO);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clearStencil(-1);
    gl.colorMask(true, true, true, true);
    gl.cullFace(gl.BACK);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.depthRange(0, 1);
    gl.frontFace(gl.CCW);
    gl.hint(gl.GENERATE_MIPMAP_HINT, gl.DONT_CARE);
    gl.lineWidth(1);
    gl.pixelStorei(gl.PACK_ALIGNMENT, 4);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
    gl.polygonOffset(0, 0);
    gl.sampleCoverage(1, false);
    gl.scissor(0, 0, gl.canvas.width, gl.canvas.height);
    gl.stencilFunc(gl.ALWAYS, 0, 0xFFFFFFFF);
    gl.stencilMask(0xFFFFFFFF);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

    if (isWebGL2RenderingContext) {
        gl.drawBuffers([gl.BACK]);
        gl.readBuffer(gl.BACK);
        gl.bindBuffer(gl.COPY_READ_BUFFER, null);
        gl.bindBuffer(gl.COPY_WRITE_BUFFER, null);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
        const numTransformFeedbacks = gl.getParameter(gl.MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS);
        for (let ii = 0; ii < numTransformFeedbacks; ++ii) {
            gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, ii, null);
        }
        const numUBOs = gl.getParameter(gl.MAX_UNIFORM_BUFFER_BINDINGS);
        for (let ii = 0; ii < numUBOs; ++ii) {
            gl.bindBufferBase(gl.UNIFORM_BUFFER, ii, null);
        }
        gl.disable(gl.RASTERIZER_DISCARD);
        gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, 0);
        gl.pixelStorei(gl.UNPACK_SKIP_IMAGES, 0);
        gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
        gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
        gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
        gl.pixelStorei(gl.PACK_ROW_LENGTH, 0);
        gl.pixelStorei(gl.PACK_SKIP_ROWS, 0);
        gl.pixelStorei(gl.PACK_SKIP_PIXELS, 0);
        gl.hint(gl.FRAGMENT_SHADER_DERIVATIVE_HINT, gl.DONT_CARE);
    }
}