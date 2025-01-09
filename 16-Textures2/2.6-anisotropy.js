// Load textures with flipped Y coordinates.
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

/// Load the Anisotropy extension, if it is available.
const anisotropyExtension = gl.getExtension("EXT_texture_filter_anisotropic");
if (anisotropyExtension === null) {
    console.warn('Anisotropic filtering is not supported on this sytem.');
}
const anisotropyMax = anisotropyExtension ? gl.getParameter(anisotropyExtension.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 0;

/// Create a new, empty WebGL texture of a given size.
function createTexture(gl, name, width, height)
{
    // Create the texture object.
    const texture = gl.createTexture();
    if (texture === null) {
        throw new Error(`Failed to create WebGL texture object for "${name}"`);
    }

    // Define the texture.
    try {
        gl.bindTexture(gl.TEXTURE_2D, texture);

        // Determine the number of mipmap levels.
        const mipLevels = Math.floor(Math.log2(Math.max(width, height))) + 1;

        // Allocate the texture storage.
        gl.texStorage2D(gl.TEXTURE_2D, mipLevels, gl.RGBA8, width, height);

        // Repeat the texture coordinates.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Use highest quality min- and magnification.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        // Enable anisotropic filtering, if available
        if (anisotropyExtension) {
            gl.texParameterf(gl.TEXTURE_2D, anisotropyExtension.TEXTURE_MAX_ANISOTROPY_EXT, anisotropyMax);
        }
    }
    catch (error) {
        // Free the texture memory on error and report it to the user.
        gl.deleteTexture(texture);
        throw new Error(`Failed to create texture "${name}": ${error.message}`);
    }
    finally {
        // Always unbind the texture.
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    // Return the texture object.
    return {
        name,
        glo: texture,
        width,
        height
    };
}

/// (Re-)Define the data of a texture.
function updateTextureData(gl, texture, data)
{
    try {
        gl.bindTexture(gl.TEXTURE_2D, texture.glo);

        // Update the texture to the GPU.
        gl.texSubImage2D(gl.TEXTURE_2D,
            0, // 0 means the highest resolution mipap
            0, // xOffset
            0, // yOffset
            texture.width,
            texture.height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            data,
        );

        // Update the mipmap levels.
        gl.generateMipmap(gl.TEXTURE_2D);

    } finally {
        // Always unbind the texture.
        gl.bindTexture(gl.TEXTURE_2D, null);
    }
}

/// Load an image from an URL and create a WebGL texture from it.
async function loadTexture(gl, url)
{
    // Load the image from the url.
    // The promise is not executed right away, so we will have to wait for it to resolve later.
    const loadImage = new Promise((resolve, reject) =>
    {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.crossOrigin = "anonymous";
        image.src = url;
    });

    // Extract the file name (without extension) from the URL.
    const name = url.split('/').at(-1).split('.').at(0);

    try {
        // Get the image from the URL.
        const image = await loadImage;

        // Once we have it, create the empty WebGL texture.
        const texture = createTexture(gl, name, image.naturalWidth, image.naturalHeight);

        // Define the texture data.
        updateTextureData(gl, texture, image);

        // Return the finished texture.
        return texture;

    } catch (error) {
        throw new Error(`Failed to create texture from url: "${url}": ${error.message}`);
    }
}

// 1. Data /////////////////////////////////////////////////////////////////

// Vertex Shader Source
const geoVSSource = `#version 300 es
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
        f_texCoord = a_texCoord * 2.0 - 1.0;
        gl_Position = u_projectionXform * u_viewXform * worldPosition;
    }`;

// Fragment Shader Source
const geoFSSource = `#version 300 es
    precision mediump float;

    uniform vec3 u_lightDirection;
    uniform vec3 u_cameraPosition;
    uniform sampler2D u_texDiffuse;

    in vec3 f_worldPosition;
    in vec3 f_normal;
    in vec2 f_texCoord;

    out vec4 o_fragColor;

    void main() {
        const float ambient = 0.4;
        vec3 diffuseColor = texture(u_texDiffuse, f_texCoord).rgb;
        vec3 specularColor = vec3(1.0); // white
        vec3 normal = normalize(f_normal);

        float diffuseFactor = ambient + max(0.0, dot(u_lightDirection, normal)) * (1.0 - ambient);

        vec3 viewDirection = normalize(u_cameraPosition - f_worldPosition);
        vec3 halfway = normalize(viewDirection + u_lightDirection);
        float specularFactor = max(0.0, dot(normal, halfway));
        specularFactor = pow(specularFactor, 128.0) * 0.3;

        vec3 color = diffuseColor * diffuseFactor + specularColor * specularFactor;
        o_fragColor = vec4(color, 1.0);
    }`;

// Geometry.
const geoObj = glance.createSphere('geo', { widthSegments: 64, heightSegments: 32 });

// Texture.
const diffuseTexture = await loadTexture(gl, "https://echtzeit-computergrafik-ws24.github.io/img/test.webp");

// 2. WebGL 'Building Blocks' //////////////////////////////////////////////

// Geometry Draw Call.
const geoShader = glance.createProgram(gl, 'geoShader',
    glance.createShader(gl, 'geoVS', glance.ShaderStage.VERTEX, geoVSSource),
    glance.createShader(gl, 'geoFS', glance.ShaderStage.FRAGMENT, geoFSSource),
);
const geoVao = glance.createVertexArrayObject(gl, 'geoVAO',
    glance.createIndexBuffer(gl, 'geoIBO', geoObj.indices),
    glance.createAttributeBuffer(gl, 'geoABO', {
        a_pos: {
            data: geoObj.positions,
            height: 3
        },
        a_normal: {
            data: geoObj.normals,
            height: 3
        },
        a_texCoord: {
            data: geoObj.texCoords,
            height: 2
        },
    }),
    geoShader,
);
const geo = glance.createDrawCall(gl, 'geoDrawCall', geoVao, geoShader);

// 3. Render Loop //////////////////////////////////////////////////////////

gl.enable(gl.DEPTH_TEST);
gl.enable(gl.CULL_FACE);

const orbitPan = Sticky("orbitPan", 0);
const orbitTilt = Sticky("orbitTilt", 0);
const orbitDistance = Sticky("orbitDistance", 3);

const lightDirection = Vec3.of(1, 1, 1).normalize();

function myRenderLoop({ globalTime })
{
    // Always clear the canvas before drawing on it.
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // The camera position is the same for all draw calls.
    const camPos = glance.Vec3.translateZ(orbitDistance.get()).rotateX(orbitTilt.get()).rotateY(orbitPan.get());

    // geo
    gl.activeTexture(gl.TEXTURE0 + 0);
    gl.bindTexture(gl.TEXTURE_2D, diffuseTexture.glo);

    geo.uniform.u_viewXform = glance.Mat4.lookAt(camPos, glance.Vec3.zero(), glance.Vec3.yAxis());
    geo.uniform.u_projectionXform = glance.Mat4.perspective(Math.PI / 4, 1, 0.1, 10);
    geo.uniform.u_lightDirection = lightDirection;
    geo.uniform.u_cameraPosition = camPos;
    geo.uniform.u_modelXform = glance.Mat4.rotateY(globalTime / 3000);
    geo.uniform.u_texDiffuse = 0; // texture unit 0

    glance.draw(gl, geo);
}
setRenderLoop(myRenderLoop);

onMouseDrag((e) =>
{
    orbitPan.update((v) => v - e.movementX * 0.01);
    orbitTilt.update((v) => glance.clamp(v - e.movementY * 0.01, -Math.PI / 2, Math.PI / 2));
});

onMouseWheel((e) =>
{
    orbitDistance.update((v) => glance.clamp(v * (1 + e.deltaY * 0.001), 1.0, 9.0));
});