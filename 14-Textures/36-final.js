// Load textures with flipped Y coordinates.
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);


/// Create a new, empty WebGL texture of a given size.
function createTexture(gl, name, width, height)
{
    // Create the texture object
    const texture = gl.createTexture();
    if (texture === null) {
        throw new Error(`Failed to create WebGL texture object for "${name}"`);
    }

    // Define the texture.
    try {
        gl.bindTexture(gl.TEXTURE_2D, texture);

        // Allocate the texture storage.
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);

        // Repeat the texture coordinates.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    }
    catch (error) {
        gl.deleteTexture(texture);
        throw new Error(`Failed to create texture "${name}": ${error.message}`);
    }
    finally {
        // Always unbind the texture
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    // Return the texture object
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

    } finally {
        // Always unbind the texture
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
        // Get the image from the URL
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
const vertexShaderSource = `#version 300 es
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
const fragmentShaderSource = `#version 300 es
    precision mediump float;

    uniform vec3 u_lightDirection;
    uniform vec3 u_cameraPosition;
    uniform sampler2D u_texDiffuse;

    in vec3 f_worldPosition;
    in vec3 f_normal;
    in vec2 f_texCoord;

    out vec4 o_fragColor;

    void main() {
        vec3 ambientColor = vec3(0.01);
        vec3 diffuseColor = texture(u_texDiffuse, f_texCoord).rgb;
        vec3 specularColor = vec3(1.0); // white
        vec3 normal = normalize(f_normal);

        float diffuseFactor = max(0.0, dot(u_lightDirection, normal));

        vec3 viewDirection = normalize(u_cameraPosition - f_worldPosition);
        vec3 halfway = normalize(viewDirection + u_lightDirection);
        float specularFactor = max(0.0, dot(normal, halfway));
        specularFactor = pow(specularFactor, 128.0) * 0.4;

        vec3 color = ambientColor + diffuseColor * diffuseFactor + specularColor * specularFactor;
        o_fragColor = vec4(color, 1.0);
    }`;

// Geometry.
const geo = glance.createSphere('my geo', { widthSegments: 64, heightSegments: 32 });

// Texture.
const diffuseTexture = await loadTexture(gl, "https://echtzeit-computergrafik-ws24.github.io/img/test.png");

// 2. WebGL 'Building Blocks' //////////////////////////////////////////////

// Basic
const vs = glance.createShader(gl, 'my vertex shader', glance.ShaderStage.VERTEX, vertexShaderSource);
const fs = glance.createShader(gl, 'my fragment shader', glance.ShaderStage.FRAGMENT, fragmentShaderSource);
const abo = glance.createAttributeBuffer(gl, 'my abo', {
    a_pos: {
        data: geo.positions,
        height: 3
    },
    a_normal: {
        data: geo.normals,
        height: 3
    },
    a_texCoord: {
        data: geo.texCoords,
        height: 2
    },
});
const ibo = glance.createIndexBuffer(gl, 'my ibo', geo.indices);

// Compound
const program = glance.createProgram(gl, 'my program', vs, fs);
const vao = glance.createVertexArrayObject(gl, 'my vao', ibo, abo, program);

// Draw Call
const quad = glance.createDrawCall(gl, 'my draw call', vao, program);

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

    gl.activeTexture(gl.TEXTURE0 + 0);
    gl.bindTexture(gl.TEXTURE_2D, diffuseTexture.glo);

    const camPos = glance.Vec3.translateZ(orbitDistance.get()).rotateX(orbitTilt.get()).rotateY(orbitPan.get());
    quad.uniform.u_viewXform = glance.Mat4.lookAt(camPos, glance.Vec3.zero(), glance.Vec3.yAxis());
    quad.uniform.u_projectionXform = glance.Mat4.perspective(Math.PI / 4, 1, 0.1, 10);
    quad.uniform.u_lightDirection = lightDirection;
    quad.uniform.u_cameraPosition = camPos;
    quad.uniform.u_modelXform = glance.Mat4.rotateY(globalTime / 3000);
    quad.uniform.u_texDiffuse = 0; // texture unit 0
    glance.draw(gl, quad);
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