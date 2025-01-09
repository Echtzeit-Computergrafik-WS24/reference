export
{
    createBPGeometry,
    createFlatGeometry,
    createScreenPass,
    createSkybox,
    FramebufferStack,
    loadCubemap,
    loadDataVolume,
    loadTexture,
    Profiler,
    WebGLTimer,
};


import
{
    logWarning,
    throwError,
} from "./dev";
import
{
    clamp
} from "./math/common.js";
import
{
    createDrawCall,
    createProgram,
    createShader,
    createTexture,
    createVertexArrayObject,
    updateTextureData,
} from "./core";
import
{
    createBox,
    createScreenQuad,
    loadObj,
} from "./assets/geo";
import
{
    loadHDR,
} from "./assets/hdr";
import
{
    CullFace,
    DepthTest,
    ShaderStage,
    TextureFilter,
    TextureInternalFormat,
} from "./types";
import type {
    DrawCall,
    FragmentShader,
    Framebuffer,
    Texture,
    WebGL2,
} from "./types";
import type
{
    Geometry,
} from "./assets/geo";
import { Vec3 } from "./math";


// =============================================================================
// Textures
// =============================================================================


/// Options for creating and updating a texture.
type TextureOptions = Parameters<typeof createTexture>[4] & Parameters<typeof updateTextureData>[3];


/// Options for creating a 3D texture from a series of 2D textures.
type DataVolumeOptions = TextureOptions & {
    /// The range of the input data.
    /// By default, this is the range of 8 bit unsigned integers (0-255).
    input_min?: number,
    input_max?: number,
    /// The range of the output data after normalization.
    /// By default, this is the range (0-1).
    output_min?: number,
    output_max?: number,
};


/// Load an image from an URL and create a WebGL texture from it.
/// @param gl The WebGL2 context.
/// @param url The URL of the image to load.
/// @param options Optional texture creation options, forwarded to `createTexture`.
/// @returns A promise that resolves to the loaded texture.
async function loadTexture(
    gl: WebGL2,
    url: string,
    options: TextureOptions = {}): Promise<Texture>
{
    // Extract the file name (without extension) from the URL.
    const name = url.split('/').at(-1).split('.').at(0);

    let texture: Texture | undefined;
    try {
        // Load an HDR texture if the URL ends with ".hdr".
        if (url.endsWith('.hdr')) {
            // The srcDataType option must be gl.FLOAT for HDR textures.
            if (options.srcDataType !== undefined && options.srcDataType !== gl.FLOAT) {
                logWarning(() => `Ignoring srcDataType option for HDR texture: ${options.srcDataType}`);
            }

            // The default internal format for HDR textures is R11F_G11F_B10F.
            if (options.internalFormat === undefined) {
                options.internalFormat = TextureInternalFormat.R11F_G11F_B10F;
            }

            // Load the HDR image and create the texture.
            const hdrImage = await loadHDR(new URL(url, window.location.href));
            texture = createTexture(gl, name, hdrImage.width, hdrImage.height, options);

            // Update the texture data.
            updateTextureData(gl, texture, hdrImage.data, { ...options, srcDataType: gl.FLOAT });
        }

        // Otherwise, load a regular image.
        else {
            // Load the image from the url.
            // The promise is not executed right away, so we will have to wait for it to resolve later.
            const loadImage: Promise<HTMLImageElement> = new Promise((resolve, reject) =>
            {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = reject;
                if ((new URL(url, window.location.href)).origin !== window.location.origin) {
                    image.crossOrigin = "anonymous";
                }
                image.src = url;
            });

            // Get the image from the URL
            const image: HTMLImageElement = await loadImage;

            // Once we have it, create the empty WebGL texture.
            texture = createTexture(gl, name, image.naturalWidth, image.naturalHeight, options);

            // Define the texture data.
            updateTextureData(gl, texture, image, options);
        }

        // Return the finished texture.
        return texture;
    }

    // If an error occurs, clean up and re-throw the error.
    catch (error) {
        if (texture !== undefined) {
            gl.deleteTexture(texture.glo);
        }
        throwError(() => `Failed to create texture from url: "${url}": ${(error as any).message}`);
    }
}

/// Load a cubemap texture from 6 URLs.
/// @param gl The WebGL2 context.
/// @param urls An array of 6 URLs, one for each face of the cubemap.
///  The order of the URLs should be:
///  - +X (right)
///  - -X (left)
///  - +Y (top)
///  - -Y (bottom)
///  - +Z (front)
///  - -Z (back)
/// @returns A promise that resolves to the loaded cubemap texture.
async function loadCubemap(
    gl: WebGL2,
    urls: [string, string, string, string, string, string],
    options: TextureOptions = {}): Promise<Texture>
{
    // Ensure that we have exactly 6 URLs.
    if (urls.length !== 6) {
        throw new Error(`loadCubemap requires 6 URLs, got ${urls.length}`);
    }

    // Load all images from the URLs.
    const loadImages: Array<Promise<HTMLImageElement>> = urls.map((url) =>
        new Promise((resolve, reject) =>
        {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = reject;
            if ((new URL(url, window.location.href)).origin !== window.location.origin) {
                image.crossOrigin = "anonymous";
            }
            image.src = url;
        }
        ));

    // Extract the file name (without extension) from the URL.
    let name = urls[0].split('/').at(-1).split('.').at(0);
    if (name.endsWith('-px')) {
        name = name.slice(0, -3);
    } else if (name.endsWith('-right')) {
        name = name.slice(0, -6);
    }

    try {
        // Get the image from the URL
        const images: Array<HTMLImageElement> = await Promise.all(loadImages);

        // Check that all images have the same dimensions.
        const [width, height] = [images[0].naturalWidth, images[0].naturalHeight];
        for (let i = 1; i < 6; i++) {
            if (images[i].naturalWidth !== width || images[i].naturalHeight !== height) {
                throwError(() => `Cubemap images at index 0 and ${i} have different dimensions: ${width}x${height} vs ${images[i].naturalWidth}x${images[i].naturalHeight}`);
            }
        }

        // Once we have it, create the empty WebGL texture.
        const texture: Texture = createTexture(gl, name, width, height, { ...options, target: gl.TEXTURE_CUBE_MAP });

        // Update the 6 sides of the cube map texture individually
        for (let i = 0; i < 6; i++) {
            updateTextureData(gl, texture, images[i], { ...options, dataTarget: gl.TEXTURE_CUBE_MAP_POSITIVE_X + i });
        }

        // Return the finished texture.
        return texture;

    } catch (error) {
        throwError(() => `Failed to create cubemap texture from urls: "${urls}": ${(error as any).message}`);
    }
}


/// Load the data of a 3D Texture from a series of "slices" (2D textures).
/// This has slightly different defaults than `loadTexture`.
/// @param gl WebGL2 context.
/// @param name Name of the volume.
/// @param urls URLs of the slices.
/// @param options Additional texture options, including those with different defaults:
/// - `levels`: Number of mipmap levels to create, defaults to 1.
/// - `filter`: Texture (min/mag) filter(s), defaults to `TextureFilter.LINEAR`.
/// - `internalFormat`: Texture internal format, defaults to `TextureInternalFormat.R16F`.
async function loadDataVolume(
    gl: WebGL2,
    urls: Array<string>,
    options: DataVolumeOptions = {}
): Promise<Texture>
{
    // Load all images from the URLs.
    let [width, height]: [number | undefined, number | undefined] = [undefined, undefined];
    const depth = urls.length;
    const images: Array<Promise<HTMLImageElement>> = [];
    for (let urlItr of urls) {
        images.push(new Promise((resolve, reject) =>
        {
            const url = urlItr; // local copy for closure
            let image: HTMLImageElement | null = new Image();
            image.onload = () =>
            {
                // Check that all images have the same dimensions.
                if (width === undefined && height === undefined) {
                    width = image!.naturalWidth;
                    height = image!.naturalHeight;
                } else {
                    if (image!.naturalWidth !== width || image!.naturalHeight !== height) {
                        reject(new Error(`Data volume slices must have the same dimensions, but slice ${url} has dimensions ${image!.naturalWidth}x${image!.naturalHeight} instead of ${width}x${height}`));
                    }
                }
                resolve(image);
            };
            image.onerror = reject;
            if ((new URL(url, window.location.href)).origin !== window.location.origin) {
                image.crossOrigin = "anonymous";
            }
            image.src = url;
        }));
    }

    // Extract the file name (without extension) from the URL.
    let name = urls[0].split('/').at(-1).split('.').at(0);
    name = name.replace(/[-_.]*\d+$/, ''); // remove trailing numbers including separators '-', '_' and '.'

    // Wait for all images to load.
    await Promise.all(images);
    if (width === undefined || height === undefined || images.length === 0) {
        throwError(() => "No slices were loaded");
    }

    // We need to draw the slices onto the canvas to access the pixel data.
    const drawCanvas = new OffscreenCanvas(width, height);
    let ctx: OffscreenCanvasRenderingContext2D | null = drawCanvas.getContext("2d", {
        willReadFrequently: true,
    });
    if (ctx === null) {
        throwError(() => "Failed to create 2D context for offscreen canvas");
    }

    // Create the volume texture.
    const volumeTexture = createTexture(gl, name, width, height,
        {
            target: gl.TEXTURE_3D,
            depth,
            levels: options.levels ?? 1,
            filter: options.filter ?? TextureFilter.LINEAR,
            internalFormat: options.internalFormat ?? TextureInternalFormat.R16F,
        },
    );

    // Define the data.
    try {
        gl.bindTexture(gl.TEXTURE_3D, volumeTexture.glo);

        // Define the input and output ranges for normalization.
        const input_min = options.input_min ?? 0;
        const input_max = options.input_max ?? 255;
        const output_min = options.output_min ?? 0;
        const output_max = options.output_max ?? 1;
        const inputRange = input_max - input_min;
        const outputRange = output_max - output_min;

        // Copy the normalized data into the volume texture.
        for (let sliceIdx = 0; sliceIdx < depth; sliceIdx++) {

            // Draw the slice onto the offscreen canvas to access the pixel data.
            const image = await images[sliceIdx];
            ctx.drawImage(image, 0, 0);
            const imageData: ImageData = ctx.getImageData(0, 0, width, height);
            const pixelData: Uint8ClampedArray = new Uint8ClampedArray(imageData.data.buffer);
            if (pixelData.length !== width * height * 4) {
                throwError(() => `Unexpected pixel data length: ${pixelData.length} instead of ${width! * height! * 4}`);
            }

            // Transform the 8 bit pixel data into 32 bit floating data.
            const realData: Float32Array = new Float32Array(width * height);
            for (let i = 0; i < realData.length; i++) {
                const value = clamp(pixelData[i * 4], input_min, input_max);
                realData[i] = output_min + ((value - input_min) / inputRange) * outputRange;
            }

            // Copy the normalized data into the volume texture.
            gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, sliceIdx, width, height, 1, gl.RED, gl.FLOAT, realData);
        }

        // Generate mipmaps if requested.
        if (options.levels !== 1) {
            gl.generateMipmap(gl.TEXTURE_3D);
        }

        // Return the finished volume texture.
        return volumeTexture;
    }

    // If an error occurs, clean up and re-throw the error.
    catch (error) {
        gl.deleteTexture(volumeTexture.glo);
        throwError(() => `Failed to create volume data texture "${name}": ${(error as any).message}`);
    }

    // Always clean up after yourself.
    finally {
        gl.bindTexture(gl.TEXTURE_3D, null);
    }
}


// =============================================================================
// Framebuffers
// =============================================================================


/// Helper class to manage a stack of framebuffers.
/// When a framebuffer is pushed onto the stack, it is bound and the viewport is set.
/// When a framebuffer is popped from the stack, the previous framebuffer is bound
/// and the viewport is set.
/// If the stack is empty, the default framebuffer is bound.
class FramebufferStack
{
    /// The stack of framebuffers.
    /// The first buffer is the read buffer, the second buffer is the draw buffer.
    /// The draw buffer can be explicitly set to `null` to write to the default framebuffer.
    /// If the draw buffer is undefined, the read buffer is also used as the draw buffer.
    private _stack: Array<[Framebuffer, Framebuffer | null | undefined]> = [];

    /// Pushes the given framebuffer onto the stack and binds it.
    /// @param gl The WebGL2 context.
    /// @param framebuffer The framebuffer to push.
    ///  Is only used as the read buffer if `drawBuffer` is defined.
    /// @param drawBuffer The framebuffer to draw into.
    ///  Can be explicitly set to `null` to write to the default framebuffer.
    ///  Undefined by default, which means that the `framebuffer` is bound as both
    ///  the read and draw framebuffer.
    public push(gl: WebGL2RenderingContext, framebuffer: Framebuffer, drawBuffer?: Framebuffer | null): void
    {
        // Passing the same framebuffer as read and draw buffer is the same as passing
        // only a single framebuffer.
        if (drawBuffer === framebuffer) {
            drawBuffer = undefined;
        }

        // If the given framebuffer setup is already bound, do nothing.
        const [currentReadBuffer, currentDrawBuffer] = this._stack.at(-1) ?? [null, undefined];
        if (currentReadBuffer === framebuffer && currentDrawBuffer === drawBuffer) {
            return;
        }// TODO: this is wrong. Always push, even if the same framebuffer is bound
        //  just don't re-bind it. Conversely, always pop and if the next framebuffer
        //  on the stack, just don't re-bind it.

        // Push the given framebuffer onto the stack.
        this._stack.push([framebuffer, drawBuffer]);

        // Bind the new framebuffer and set the viewport.
        try {
            this._bindFramebuffer(gl, framebuffer, drawBuffer);
        }
        // If an error occurs, pop the framebuffer from the stack and re-throw the error.
        catch (e) {
            this.pop(gl);
            throw e;
        }
    } // TODO: this design does not allow one to read from the default framebuffer

    /// Pops the top framebuffer from the stack and binds the previous framebuffer.
    /// If the stack is empty, the default framebuffer is bound.
    /// @param gl The WebGL2 context.
    /// @param count Number of framebuffers to pop, defaults to 1.
    public pop(gl: WebGL2RenderingContext, count: number = 1): void
    {
        count = Math.max(0, count);
        for (let i = 0; i < count; i++) {
            // Remove the top framebuffer from the stack.
            this._stack.pop();

            // Bind the previous framebuffer, or the default framebuffer if the stack is empty.
            // Any error doing so is not recoverable, so we do not try to handle it.
            const [previousReadBuffer, previousDrawBuffer] = this._stack.at(-1) ?? [null, undefined];
            this._bindFramebuffer(gl, previousReadBuffer, previousDrawBuffer);
        }
    }

    /// Bind the new framebuffer and set the viewport.
    private _bindFramebuffer(gl: WebGL2RenderingContext, readBuffer: Framebuffer | null, drawBuffer?: Framebuffer | null): void
    {
        // No separate read and draw buffers.
        if (drawBuffer === undefined) {
            const [width, height] = readBuffer === null
                ? [gl.canvas.width, gl.canvas.height]
                : getFramebufferSize(readBuffer);
            gl.bindFramebuffer(gl.FRAMEBUFFER, readBuffer?.glo ?? null);
            gl.viewport(0, 0, width, height);
        }
        // Separate read and draw buffers.
        else {
            const [width, height] = drawBuffer === null
                ? [gl.canvas.width, gl.canvas.height]
                : getFramebufferSize(drawBuffer);
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, readBuffer?.glo ?? null);
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, drawBuffer?.glo ?? null);
            gl.viewport(0, 0, width, height);
        }
    }
}


/// The size of the framebuffer is the size of any of its attachments.
function getFramebufferSize(framebuffer: Framebuffer): [number, number]
{
    if (framebuffer.color.length > 0) {
        const attachment = framebuffer.color[0].attachment;
        return [attachment.width, attachment.height];
    } else if (framebuffer.depth !== null) {
        const attachment = framebuffer.depth.attachment;
        return [attachment.width, attachment.height];
    } else if (framebuffer.stencil !== null) {
        const attachment = framebuffer.stencil.attachment;
        return [attachment.width, attachment.height];
    } else {
        throwError(() => `Framebuffer ${framebuffer.name} has no attachments`);
    }
}

// =============================================================================
// Profiling
// =============================================================================


class WebGLTimer
{
    private _ext: any;
    private _query: WebGLQuery | null;

    constructor(gl: WebGL2, ext: any)
    {
        this._ext = ext;
        this._query = gl.createQuery();
        gl.beginQuery(this._ext.TIME_ELAPSED_EXT, this._query as WebGLQuery);
    }

    public stop(gl: WebGL2, callback: (ms: number) => void): void
    {
        gl.endQuery(this._ext.TIME_ELAPSED_EXT);
        const checkResult = () =>
        {
            // If the query was deleted, do nothing.
            if (this._query === null) {
                logWarning(() => "WebGLTimer query has ended already");
                return;
            }

            const available = gl.getQueryParameter(this._query, gl.QUERY_RESULT_AVAILABLE);
            const disjoint = gl.getParameter(this._ext.GPU_DISJOINT_EXT);

            // If the result is available and not disjoint, call the callback.
            if (available && !disjoint) {
                const timeElapsed = gl.getQueryParameter(this._query, gl.QUERY_RESULT);
                callback(timeElapsed / 1000000);
            }

            // If the result is available, or something went wrong, delete the query.
            if (available || disjoint) {
                gl.deleteQuery(this._query);
                this._query = null;
                return;
            }

            // Otherwise, check again in the next frame.
            requestAnimationFrame(checkResult);
        };
        setTimeout(checkResult, 0);
    }
}

class Profiler
{
    private _ext: any;

    constructor(gl: WebGL2)
    {
        this._ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        if (this._ext === null) {
            this._ext = gl.getExtension('EXT_disjoint_timer_query');
        }
        if (this._ext === null) {
            throwError(() => "WebGL2 Timer Query extension not supported. In Firefox, enable `webgl.enable-privileged-extensions` in `about:config`");
        }
    }

    public start(gl: WebGL2): WebGLTimer
    {
        return new WebGLTimer(gl, this._ext);
    }
}

// =============================================================================
// Common Entities
// =============================================================================

/// Create a Blinn-Phong shaded geometry from an URL to a OBJ file, with textures.
/// @param gl   The WebGL2 context.
/// @param geo  The geometry to render.
///    Can be a Geometry object or a URL to an OBJ file.
/// @param textureURLs An object with the textures or URLs of the textures to load.
///  The object should have the following properties:
///  - `diffuse`: The diffuse texture (required).
///  - `specular`: The specular texture (optional).
///  - `ambient`: The ambient texture (optional).
/// @param options Optional settings:
///  - `renderNormals`: Whether to render normals to an additional color attachment (defaults to `false`).
///  - `renderDepth`: Whether to render depth to an additional color attachment (defaults to `false`).
/// The returned draw call will have the following uniforms:
///  - `u_modelXform`: The model transformation matrix.
///  - `u_viewXform`: The view transformation matrix.
///  - `u_projectionXform`: The projection transformation matrix.
///  - `u_ambient`: Ambient light intensity, defaults to 0.15.
///  - `u_specularPower`: Specular power, defaults to 64.
///  - `u_specularIntensity`: Specular intensity, defaults to 0.8.
///  - `u_lightDirection`: Direction of the light, defaults to `[1, 1, 1]`.
///  - `u_viewPosition`: Position of the viewer, defaults to `[0, 0, 0]`.
/// If the textures are not provided, an additional uniform will be:
///  - `u_diffuseColor`: Diffuse color, defaults to `[1, 1, 1]`.
/// If render normals and/or depth is enabled, the fragment shader will render up to two additional color attachments:
///  - normal at 1 (if enabled)
///  - depth either at 2 (if both are enabled) or at 1 (if only depth is enabled).
/// @returns A promise that resolves to the created draw call.
async function createBPGeometry(
    gl: WebGL2,
    geo: Geometry | string,
    textures: {
        diffuse: string | Texture,
        specular?: string | Texture,
        ambient?: string | Texture,
        // TODO: add optional normal map
    },
    options: {
        renderNormals?: boolean,
        renderDepth?: boolean,
        // TODO: option to decide between pointlight and directional light
    } = {}
): Promise<DrawCall>
{
    const vertexShader = `#version 300 es
precision highp float;

uniform mat4 u_modelXform;
uniform mat4 u_viewXform;
uniform mat4 u_projectionXform;

in vec3 a_pos;
in vec3 a_normal;
in vec2 a_texCoord;

out vec3 f_worldPosition;
out vec3 f_normal;
out vec2 f_texCoord;

void main() {
    vec4 worldPosition = u_modelXform * vec4(a_pos, 1.0);
    f_worldPosition = worldPosition.xyz;
    f_normal = (u_modelXform * vec4(a_normal, 0.0)).xyz;
    f_texCoord = a_texCoord;
    gl_Position = u_projectionXform * u_viewXform * worldPosition;
}`;

    const fragmentShader = `#version 300 es
precision mediump float;

#define HAS_DIFFUSE_TEXTURE ${textures.diffuse ? 1 : 0}
#define HAS_SPECULAR_TEXTURE ${textures.specular ? 1 : 0}
#define HAS_AMBIENT_TEXTURE ${textures.ambient ? 1 : 0}
#define RENDER_NORMALS ${options.renderNormals ? 1 : 0}
#define RENDER_DEPTH ${options.renderDepth ? 1 : 0}

uniform float u_ambient;
uniform float u_specularPower;
uniform float u_specularIntensity;
uniform vec3 u_lightDirection;
uniform vec3 u_viewPosition;
#if RENDER_DEPTH
    uniform float u_near;
    uniform float u_far;
#endif
#if HAS_DIFFUSE_TEXTURE
    uniform sampler2D u_texDiffuse;
#else
    uniform vec3 u_diffuseColor;
#endif
#if HAS_SPECULAR_TEXTURE
    uniform sampler2D u_texSpecular;
#endif
#if HAS_AMBIENT_TEXTURE
    uniform sampler2D u_texAmbient;
#endif

in vec3 f_worldPosition;
in vec3 f_normal;
in vec2 f_texCoord;

layout (location = 0) out vec4 o_fragColor;
#if RENDER_NORMALS
    layout (location = 1) out vec4 o_fragNormal;
    #if RENDER_DEPTH
        layout (location = 2) out vec4 o_fragDepth;
    #endif
#elif RENDER_DEPTH
    layout (location = 1) out vec4 o_fragDepth;
#endif

void main() {
#if HAS_DIFFUSE_TEXTURE
    vec3 diffuseColor = texture(u_texDiffuse, f_texCoord).rgb;
#else
    vec3 diffuseColor = u_diffuseColor;
#endif
#if HAS_SPECULAR_TEXTURE
    float specularFactor = texture(u_texSpecular, f_texCoord).r;
#else
    const float specularFactor = 1.0;
#endif
#if HAS_AMBIENT_TEXTURE
    float ambient = u_ambient + texture(u_texAmbient, f_texCoord).r * (1.0 - u_ambient);
#else
    float ambient = u_ambient;
#endif
    vec3 normal = normalize(f_normal);

    float diffuse = ambient + max(0.0, dot(u_lightDirection, normal)) * (1.0 - ambient);
    vec3 viewDirection = normalize(u_viewPosition - f_worldPosition);
    vec3 halfway = normalize(viewDirection + u_lightDirection);
    float specular = max(0.0, dot(normal, halfway));
    vec3 color = diffuseColor * diffuse + vec3(1.0) * (specularFactor * pow(specular, u_specularPower) * u_specularIntensity);
    o_fragColor = vec4(color, 1.0);

#if RENDER_NORMALS
    o_fragNormal = vec4(normal, 1.0);
#endif

#if RENDER_DEPTH
    float depth = gl_FragCoord.z * 2.0 - 1.0; // back to NDC
    depth = (2.0 * u_near * u_far) / (u_far + u_near - depth * (u_far - u_near));
    depth = depth / u_far;
    o_fragDepth = vec4(vec3(depth), 1.0);
#endif
}`;
    // Load the geometry and textures asynchronously.
    const geoPromise: Promise<Geometry> = typeof geo === 'string' ? loadObj(geo) : Promise.resolve(geo);
    const getTexture = (texture: string | Texture | undefined): Promise<Texture | null> =>
    {
        if (texture === undefined) {
            return Promise.resolve(null);
        }
        if (typeof texture === 'string') {
            return loadTexture(gl, texture, { wrap: gl.REPEAT });
        }
        return Promise.resolve(texture);
    };
    const texturesPromise = Promise.all([
        getTexture(textures.diffuse),
        getTexture(textures.specular),
        getTexture(textures.ambient),
    ]);

    // Create the program.
    const uniforms: Record<string, any> = {
        u_ambient: 0.15, // ambient floor
        u_specularPower: 64,
        u_specularFactor: 0.8,
        u_lightDirection: Vec3.normalOf(Vec3.all(1)),
        u_viewPosition: [0, 0, 0],
    };
    if (!textures.diffuse) {
        uniforms.u_diffuseColor = [1, 1, 1];
    }
    const program = createProgram(gl, '__glance-blinn-phong-program', vertexShader, fragmentShader, uniforms);
    geo = await geoPromise;
    const vao = createVertexArrayObject(gl, '__glance-blinn-phong-vao',
        geo.indices,
        {
            a_pos: { data: geo.positions, height: 3 },
            a_normal: { data: geo.normals, height: 3 },
            a_texCoord: { data: geo.texCoords, height: 2 },
        },
        program,
    );
    const loadedTextures = await texturesPromise;
    const drawCallTextures: Record<string, Texture> = {};
    if (loadedTextures[0] !== null) {
        drawCallTextures.u_texDiffuse = loadedTextures[0];
    }
    if (loadedTextures[1] !== null) {
        drawCallTextures.u_texSpecular = loadedTextures[1];
    }
    if (loadedTextures[2] !== null) {
        drawCallTextures.u_texAmbient = loadedTextures[2];
    }
    return createDrawCall(gl, geo.name, vao, program, {
        cullFace: CullFace.BACK,
        depthTest: DepthTest.LESS,
        textures: drawCallTextures,
    });
}


/// Create a flat-shaded geometry with a single color
/// @param gl The WebGL2 context.
/// @param geo The geometry to render.
///        Can be a Geometry object or a URL to an OBJ file.
/// @param color The RGB color of the geometry (defaults to white = [1, 1, 1]).
///        If a string is passed, it is interpreted as a URL to a texture.
/// The returned draw call will have the following uniforms:
/// - `u_modelXform`: The model transformation matrix.
/// - `u_viewXform`: The view transformation matrix.
/// - `u_projectionXform`: The projection transformation matrix.
/// If a color is provided, the following uniform will be added:
/// - `u_color`: Flat color.
/// If a texture is provided, the following uniform will be added:
/// - `u_texDiffuse`: Diffuse texture.
/// @returns The created draw call.
async function createFlatGeometry(
    gl: WebGL2,
    geo: Geometry | string,
    color?: [number, number, number] | string | Texture,
): Promise<DrawCall>
{
    const hasTexture = typeof color !== 'undefined' && !Array.isArray(color);

    const vertexShader = `#version 300 es
precision highp float;

#define HAS_TEXTURE ${hasTexture ? 1 : 0}

uniform mat4 u_modelXform;
uniform mat4 u_viewXform;
uniform mat4 u_projectionXform;

in vec3 a_pos;
#if HAS_TEXTURE
    in vec2 a_texCoord;
    out vec2 f_texCoord;
#endif

void main() {
    gl_Position = u_projectionXform * u_viewXform * u_modelXform * vec4(a_pos, 1.0);
#if HAS_TEXTURE
    f_texCoord = a_texCoord;
#endif
}`;

    const fragmentShader = `#version 300 es
precision mediump float;

#define HAS_TEXTURE ${hasTexture ? 1 : 0}

uniform vec3 u_color;
#if HAS_TEXTURE
    uniform sampler2D u_texDiffuse;
    in vec2 f_texCoord;
#endif

layout (location = 0) out vec4 o_fragColor;
void main() {
#if HAS_TEXTURE
    o_fragColor = texture(u_texDiffuse, f_texCoord);
#else
    o_fragColor = vec4(u_color, 1.0);
#endif
}`;

    if (typeof geo === 'string') {
        geo = await loadObj(geo);
    }

    const shortName = geo.name.replace(/(-geo)$/, ''); // Remove trailing "-geo".
    const program = createProgram(gl, '__glance-flat-program', vertexShader, fragmentShader);

    const attributes: Record<string, any> = {
        a_pos: { data: geo.positions, height: 3 },
    };
    if (hasTexture) {
        attributes.a_texCoord = { data: geo.texCoords, height: 2 };
    }
    const vao = createVertexArrayObject(gl, `${shortName}-vao`,
        geo.indices,
        attributes,
        program,
    );

    const uniforms: Record<string, any> = {};
    const textures: Record<string, Texture> = {};
    if (hasTexture) {
        if (typeof color === 'string') {
            textures.u_texDiffuse = await loadTexture(gl, color as string);
        } else {
            textures.u_texDiffuse = color as Texture;
        }
    } else {
        uniforms.u_color = color ?? [1, 1, 1];
    }
    return createDrawCall(gl, shortName, vao, program, {
        cullFace: CullFace.BACK,
        depthTest: DepthTest.LESS,
        uniforms,
        textures,
    });
}


/// Creates a Skybox draw call from 6 URLs.
/// @param gl The WebGL2 context.
/// @param urls An array of 6 URLs, one for each face of the cubemap.
///     See `loadCubemap` for details.
/// @param options Optional settings:
///  - `renderNormals`: Whether to render normals to an additional color attachment (defaults to `false`).
///  - `renderDepth`: Whether to render depth to an additional color attachment (defaults to `false`).
/// If render normals and/or depth is enabled, the fragment shader will render up to two additional color attachments:
/// - normal at 1 (if enabled)
/// - depth either at 2 (if both are enabled) or at 1 (if only depth is enabled).
/// @returns A promise that resolves to the created draw call.
async function createSkybox(
    gl: WebGL2,
    urls: [string, string, string, string, string, string],
    options: TextureOptions & {
        renderNormals?: boolean,
        renderDepth?: boolean,
    } = {}
): Promise<DrawCall>
{
    const vertexShader = `#version 300 es
precision highp float;
uniform mat4 u_viewXform;
uniform mat4 u_projectionXform;
in vec3 a_pos;
out vec3 f_texCoord;
void main() {
    f_texCoord = a_pos;
    vec4 ndcCoord = u_projectionXform * u_viewXform * vec4(a_pos, 0.0);
    gl_Position = ndcCoord.xyww;
}`;

    const fragmentShader = `#version 300 es
precision mediump float;

#define RENDER_NORMALS ${options.renderNormals ? 1 : 0}
#define RENDER_DEPTH ${options.renderDepth ? 1 : 0}

uniform samplerCube u_skybox;

in vec3 f_texCoord;

layout (location = 0) out vec4 o_fragColor;
#if RENDER_NORMALS
    layout (location = 1) out vec4 o_fragNormal;
    #if RENDER_DEPTH
        layout (location = 2) out vec4 o_fragDepth;
    #endif
#elif RENDER_DEPTH
    layout (location = 1) out vec4 o_fragDepth;
#endif

void main() {
    o_fragColor = texture(u_skybox, f_texCoord);
#if RENDER_NORMALS
    o_fragNormal = vec4(vec3(0), 1);
#endif
#if RENDER_DEPTH
    o_fragNormal = vec4(1);
#endif
}`;

    const cubemapPromise = loadCubemap(gl, urls, options);
    const geo = createBox('__glance-skybox-geo');
    const program = createProgram(gl, '__glance-skybox-program', vertexShader, fragmentShader);
    // TODO: caching of attribute buffers etc. would come in handy here
    // TODO: also, maybe a direct access to the cache for when I know what I'm doing
    const vao = createVertexArrayObject(gl, '__glance-skybox-vao',
        geo.indices,
        { a_pos: { data: geo.positions, height: 3 } },
        program,
    );
    const cubeMap = await cubemapPromise;
    return createDrawCall(gl, cubeMap.name, vao, program, {
        cullFace: CullFace.NONE,
        depthTest: DepthTest.LEQUAL,
        textures: {
            u_skybox: cubeMap,
        },
    });
}

/// Create a screen quad geometry with a given Fragment Shader.
/// The fragment shader can expect the following inputs:
/// - `f_texCoord`: The 2D texture coordinate of the fragment.
async function createScreenPass(
    gl: WebGL2,
    name: string,
    shader: FragmentShader | string,
    options: Parameters<typeof createDrawCall>[4] = {}
): Promise<DrawCall>
{

    const vertexShader = `#version 300 es
precision highp float;

in vec2 a_pos;
in vec2 a_texCoord;

out vec2 f_texCoord;

void main() {
    gl_Position = vec4(a_pos, 0.0, 1.0);
    f_texCoord = a_texCoord;
}`;

    if (typeof shader === 'string') {
        shader = createShader(gl, `${name}-fs`, ShaderStage.FRAGMENT, shader);
    }
    const program = createProgram(gl, '__glance-quad-program', vertexShader, shader);

    const geo = createScreenQuad('__glance-quad-geo');
    const vao = createVertexArrayObject(gl, `${name}-vao`,
        geo.indices,
        {
            a_pos: { data: geo.positions, height: 2 },
            a_texCoord: { data: geo.texCoords, height: 2 },
        },
        program,
    );

    return Promise.resolve(createDrawCall(gl, name, vao, program, {
        cullFace: CullFace.NONE,
        depthTest: DepthTest.NONE,
        ...options,
    }));
}