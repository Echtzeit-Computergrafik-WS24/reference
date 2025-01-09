// Load textures with flipped Y coordinates.
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

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
        f_texCoord = a_texCoord;
        gl_Position = u_projectionXform * u_viewXform * worldPosition;
    }`;

// Fragment Shader Source
const fragmentShaderSource = `#version 300 es
    precision mediump float;

    uniform vec3 u_lightDirection;
    uniform vec3 u_cameraPosition;
    uniform sampler2D u_texDiffuse;
    uniform sampler2D u_texSpecular;
    uniform sampler2D u_texAmbient;

    in vec3 f_worldPosition;
    in vec3 f_normal;
    in vec2 f_texCoord;

    out vec4 o_fragColor;

    void main() {
        vec3 ambientColor = texture(u_texAmbient, f_texCoord).rgb;
        vec3 diffuseColor = texture(u_texDiffuse, f_texCoord).rgb;
        vec3 specularColor = texture(u_texSpecular, f_texCoord).rgb;
        vec3 normal = normalize(f_normal);

        float diffuseFactor = max(0.0, dot(u_lightDirection, normal));

        vec3 viewDirection = normalize(u_cameraPosition - f_worldPosition);
        vec3 halfway = normalize(viewDirection + u_lightDirection);
        float specularFactor = max(0.0, dot(normal, halfway));
        specularFactor = pow(specularFactor, 128.0);

        vec3 color = ambientColor + diffuseColor * diffuseFactor + specularColor * specularFactor;
        o_fragColor = vec4(color, 1.0);
    }`;

// Geometry.
const geo = glance.createSphere('my geo', { widthSegments: 64, heightSegments: 32 });
//const geo = await glance.loadObj("https://echtzeit-computergrafik-ws24.github.io/geo/horse.obj");

// Texture.
const diffuseTexture = await glance.loadTexture(gl, "https://echtzeit-computergrafik-ws24.github.io/img/earth-diffuse.png");
const specularTexture = await glance.loadTexture(gl, "https://echtzeit-computergrafik-ws24.github.io/img/earth-specular.png");
const ambientTexture = await glance.loadTexture(gl, "https://echtzeit-computergrafik-ws24.github.io/img/earth-ambient.png");

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
const quad = glance.createDrawCall(gl, 'my draw call', vao, program, {
    textures: {
        u_texDiffuse: diffuseTexture,
        u_texSpecular: specularTexture,
        u_texAmbient: ambientTexture,
    }
});

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

    const camPos = glance.Vec3.translateZ(orbitDistance.get()).rotateX(orbitTilt.get()).rotateY(orbitPan.get());
    quad.uniform.u_viewXform = glance.Mat4.lookAt(camPos, glance.Vec3.zero(), glance.Vec3.yAxis());
    quad.uniform.u_projectionXform = glance.Mat4.perspective(Math.PI / 4, 1, 0.1, 10);
    quad.uniform.u_lightDirection = lightDirection;
    quad.uniform.u_cameraPosition = camPos;
    quad.uniform.u_modelXform = glance.Mat4.rotateY(globalTime / 3000);
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