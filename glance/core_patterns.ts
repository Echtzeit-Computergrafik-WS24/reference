export
{
    createBPGeometry,
    createSkybox,
    FramebufferStack,
    loadCubemap,
    loadDataVolume,
    loadTexture,
};


import
{
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
    createTexture,
    createVertexArrayObject,
    updateTextureData,
} from "./core";
import
{
    createBox,
    loadObj,
} from "./assets/geo";
import
{
    CullFace,
    DepthTest,
    TextureFilter,
    TextureInternalFormat,
} from "./types";
import type {
    DrawCall,
    Framebuffer,
    Texture,
    WebGL2,
} from "./types";
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

    // Extract the file name (without extension) from the URL.
    const name = url.split('/').at(-1).split('.').at(0);

    try {
        // Get the image from the URL
        const image: HTMLImageElement = await loadImage;

        // Once we have it, create the empty WebGL texture.
        const texture: Texture = createTexture(gl, name, image.naturalWidth, image.naturalHeight, options);

        // Define the texture data.
        updateTextureData(gl, texture, image, options);

        // Return the finished texture.
        return texture;

    } catch (error) {
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
        }

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
// Common Entities
// =============================================================================

/// Create a Blinn-Phong shaded geometry from an URL to a OBJ file, with textures.
/// @param gl The WebGL2 context.
/// @param url The URL of the OBJ file to load.
/// @param textureURLs An object with the URLs of the textures to load.
///  The object should have the following properties:
///  - `diffuse`: URL of the diffuse texture (required).
///  - `specular`: URL of the specular texture (optional).
///  - `ambient`: URL of the ambient texture (optional).
/// @param options Optional settings:
///  - `renderNormals`: Whether to render normals to an additional color attachment (defaults to `false`).
///  - `renderDepth`: Whether to render depth to an additional color attachment (defaults to `false`).
/// The returned draw call will have the following uniforms:
/// - `u_modelXform`: The model transformation matrix.
/// - `u_viewXform`: The view transformation matrix.
/// - `u_projectionXform`: The projection transformation matrix.
/// - `u_ambient`: Ambient light intensity, defaults to 0.15.
/// - `u_specularPower`: Specular power, defaults to 64.
/// - `u_specularIntensity`: Specular intensity, defaults to 0.8.
/// - `u_lightDirection`: Direction of the light, defaults to `[1, 1, 1]`.
/// - `u_cameraPosition`: Position of the camera, defaults to `[0, 0, 0]`.
/// If the textures are not provided, an additional uniform will be:
/// - `u_diffuseColor`: Diffuse color, defaults to `[1, 1, 1]`.
/// If render normals and/or depth is enabled, the fragment shader will render up to two additional color attachments:
/// - normal at 1 (if enabled)
/// - depth either at 2 (if both are enabled) or at 1 (if only depth is enabled).
/// @returns A promise that resolves to the created draw call.
async function createBPGeometry(
    gl: WebGL2,
    objURL: string,
    textureURLs: {
        diffuse: string,
        specular?: string,
        ambient?: string,
    },
    options: {
        renderNormals?: boolean,
        renderDepth?: boolean,
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
    f_normal = (u_modelXform * vec4(a_normal, 0)).xyz;
    f_texCoord = a_texCoord;
    gl_Position = u_projectionXform * u_viewXform * worldPosition;
}`;

    const fragmentShader = `#version 300 es
precision mediump float;

#define HAS_DIFFUSE_TEXTURE ${textureURLs.diffuse ? 1 : 0}
#define HAS_SPECULAR_TEXTURE ${textureURLs.specular ? 1 : 0}
#define HAS_AMBIENT_TEXTURE ${textureURLs.ambient ? 1 : 0}
#define RENDER_NORMALS ${options.renderNormals ? 1 : 0}
#define RENDER_DEPTH ${options.renderDepth ? 1 : 0}

uniform float u_ambient;
uniform float u_specularPower;
uniform float u_specularIntensity;
uniform vec3 u_lightDirection;
uniform vec3 u_cameraPosition;
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
    vec3 viewDirection = normalize(u_cameraPosition - f_worldPosition);
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
    const geoPromise = loadObj(objURL);
    const texturesPromise = Promise.all([
        textureURLs.diffuse ? loadTexture(gl, textureURLs.diffuse) : null,
        textureURLs.specular ? loadTexture(gl, textureURLs.specular) : null,
        textureURLs.ambient ? loadTexture(gl, textureURLs.ambient) : null,
    ]);

    // Create the program.
    const uniforms: Record<string, any> = {
        u_ambient: 0.15, // ambient floor
        u_specularPower: 64,
        u_specularFactor: 0.8,
        u_lightDirection: Vec3.normalOf(Vec3.all(1)),
        u_cameraPosition: [0, 0, 0],
    };
    if (!textureURLs.diffuse) {
        uniforms.u_diffuseColor = [1, 1, 1];
    }
    const program = createProgram(gl, '__glance-blinn-phong-program', vertexShader, fragmentShader, uniforms);
    const geo = await geoPromise;
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
    const textures: Record<string, Texture> = {};
    if (loadedTextures[0] !== null) {
        textures.u_texDiffuse = loadedTextures[0];
    }
    if (loadedTextures[1] !== null) {
        textures.u_texSpecular = loadedTextures[1];
    }
    if (loadedTextures[2] !== null) {
        textures.u_texAmbient = loadedTextures[2];
    }
    return createDrawCall(gl, geo.name, vao, program, {
        cullFace: CullFace.BACK,
        depthTest: DepthTest.LESS,
        textures
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
    options: {
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

    const cubemapPromise = loadCubemap(gl, urls);
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