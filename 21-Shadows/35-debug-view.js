// =====================================================================
// Constants
// =====================================================================

const verticalOffset = -0.75;
const lightRotationSpeed = -0.00002;
const lightTilt = 0.4;
const lightProjection = Mat4.ortho(-0.5, 0.5, -0.8, 0.95, -0.8, 3.1);

// =====================================================================
// Interactivity
// =====================================================================

/// The user can orbit the camera around the world origin...
const orbitPan = Sticky("orbitPan", 0);
const orbitTilt = Sticky("orbitTilt", 0);
onMouseDrag((e) =>
{
    orbitPan.update((v) => v - e.movementX * 0.008);
    orbitTilt.update((v) => glance.clamp(v - e.movementY * 0.008, -Math.PI / 2, Math.PI / 2));
});
/// ... and zoom in and out.
const orbitDistance = Sticky("orbitDistance", 4.5);
onMouseWheel((e) =>
{
    orbitDistance.update((v) => glance.clamp(v * (1 + e.deltaY * 0.001), 1.5, 10.0));
});

/// Resizing the viewport will update the projection matrix.
const cameraProjection = Mat4.perspective(Math.PI / 4, gl.canvas.width / gl.canvas.height, 0.1, 14.);
onResize(() =>
{
    cameraProjection.perspective(Math.PI / 4, gl.canvas.width / gl.canvas.height, 0.1, 14.);
});

// =====================================================================
// Resources
// =====================================================================

const marbleDiffuse = await glance.loadTexture(gl, "/img/marble-diffuse.webp", { wrap: gl.REPEAT });
const marbleSpecular = await glance.loadTexture(gl, "/img/marble-specular.webp", { wrap: gl.REPEAT });

const statueGeo = await glance.loadObj("/geo/lucy100k.obj");

const groundGeo = await glance.createCircularPlane("ground-geo", {
    radius: 3,
    segments: 64,
});
groundGeo.texCoords = groundGeo.texCoords.map((c) => c * 1.7); // repeat the texture in each axis

// =====================================================================
// Shadow Buffer
// =====================================================================

const shadowDepthTexture = glance.createTexture(gl, "shadow-depth", 512, 512, {
    useAnisotropy: false,
    internalFormat: gl.DEPTH_COMPONENT16,
    levels: 1,
    filter: gl.NEAREST,
});

const shadowFramebuffer = glance.createFramebuffer(gl, "shadow-framebuffer", null, shadowDepthTexture);

// =====================================================================
// Geometry
// =====================================================================

// Vertex Shader Source
const geoVSSource = `#version 300 es
    precision highp float;

    uniform mat4 u_modelMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_cameraProjection;

    in vec3 a_pos;
    in vec3 a_normal;
    in vec2 a_texCoord;

    out vec3 f_posWorldSpace;
    out vec3 f_normal;
    out vec2 f_texCoord;

    void main() {
        vec4 worldPosition = u_modelMatrix * vec4(a_pos, 1.0);
        f_posWorldSpace = worldPosition.xyz;
        f_normal = (u_modelMatrix * vec4(a_normal, 0.0)).xyz;
        f_texCoord = a_texCoord;

        gl_Position = u_cameraProjection * u_viewMatrix * worldPosition;
    }
`;

// Fragment Shader Source
const geoFSSource = `#version 300 es
    precision mediump float;

    uniform float u_ambientIntensity;
    uniform float u_specularPower;
    uniform float u_specularIntensity;
    uniform vec3 u_viewPosition;
    uniform vec3 u_lightDirection;
    uniform sampler2D u_texDiffuse;
    uniform sampler2D u_texSpecular;

    in vec3 f_posWorldSpace;
    in vec3 f_normal;
    in vec2 f_texCoord;

    out vec4 o_fragColor;

    void main() {
        // texture
        vec3 texDiffuse = texture(u_texDiffuse, f_texCoord).rgb;
        vec3 texSpecular = texture(u_texSpecular, f_texCoord).rgb;

        // lighting
        vec3 normal = normalize(f_normal);
        vec3 lightDir = u_lightDirection;
        vec3 viewDir = normalize(u_viewPosition - f_posWorldSpace);
        vec3 halfWay = normalize(viewDir + lightDir);

        // ambient
        vec3 ambient = texDiffuse * u_ambientIntensity;

        // diffuse
        float diffuseIntensity = max(dot(normal, lightDir), 0.0) * (1.0 - u_ambientIntensity);
        vec3 diffuse = texDiffuse * diffuseIntensity;

        // specular
        float specularFactor = pow(max(dot(normal, halfWay), 0.0), u_specularPower);
        vec3 specular = texSpecular * specularFactor * u_specularIntensity;

        // result
        o_fragColor = vec4(ambient + diffuse + specular, 1.0);
    }
`;

// Shader Program
const geoProgram = glance.createProgram(gl, "geo-shader", geoVSSource, geoFSSource, {
    u_ambientIntensity: 0.04,
    u_specularIntensity: 0.15,
    u_specularPower: 128,
});

// =====================================================================
// Beauty Pass
// =====================================================================

const statueVao = glance.createVertexArrayObject(gl, "statue-vao",
    statueGeo.indices,
    {
        a_pos: { data: statueGeo.positions, height: 3 },
        a_normal: { data: statueGeo.normals, height: 3 },
        a_texCoord: { data: statueGeo.texCoords, height: 2 },
    },
    geoProgram,
);

const statue = glance.createDrawCall(gl, "statue",
    statueVao,
    geoProgram,
    {
        uniforms: {
            u_modelMatrix: Mat4.identity(),
            u_texDiffuse: marbleDiffuse,
            u_texSpecular: marbleSpecular,
        },
        cullFace: gl.BACK,
        depthTest: gl.LESS,
    }
);

const ground = glance.createDrawCall(gl, "ground",
    {
        ibo: groundGeo.indices,
        attributes: {
            a_pos: { data: groundGeo.positions, height: 3 },
            a_normal: { data: groundGeo.normals, height: 3 },
            a_texCoord: { data: groundGeo.texCoords, height: 2 },
        }
    },
    geoProgram,
    {
        uniforms: {
            u_modelMatrix: Mat4.rotateX(Math.PI / -2),
            u_texDiffuse: marbleDiffuse,
            u_texSpecular: marbleSpecular,
        },
        cullFace: gl.BACK,
        depthTest: gl.LESS,
    }
);

const skybox = await glance.createSkybox(gl,
    [
        "/img/envmap-misty-field-px.webp",
        "/img/envmap-misty-field-nx.webp",
        "/img/envmap-misty-field-py.webp",
        "/img/envmap-misty-field-ny.webp",
        "/img/envmap-misty-field-pz.webp",
        "/img/envmap-misty-field-nz.webp",
    ],
);

// =====================================================================
// Shadow Mapping
// =====================================================================

const shadowVSSource = `#version 300 es
    precision highp float;

    uniform mat4 u_modelMatrix;
    uniform mat4 u_lightMatrix;
    uniform mat4 u_lightProjection;

    in vec3 a_pos;

    void main()
    {
        gl_Position = u_lightProjection * u_lightMatrix * u_modelMatrix * vec4(a_pos, 1.0);
    }
`;

const shadowFSSource = `#version 300 es
    precision mediump float;

    void main() {}
`;

const shadowProgram = glance.createProgram(gl, "shadow-shader", shadowVSSource, shadowFSSource, {
    u_lightProjection: lightProjection,
});

const shadowStatue = glance.createDrawCall(gl, 'shadow-statue', statueVao, shadowProgram, {
    uniforms: {
        u_modelMatrix: Mat4.identity(),
    },
    cullFace: gl.BACK,
    depthTest: gl.LESS,
});

// =====================================================================
// Debug View
// =====================================================================

const debugShader = `#version 300 es
precision mediump float;

uniform sampler2D u_sampler;

in vec2 f_texCoord;

out vec4 o_fragColor;

void main() {
    o_fragColor = vec4(vec3(texture(u_sampler, f_texCoord).r), 1.0);
}`;

const debugView = await glance.createScreenPass(gl, "debugview",
    debugShader,
    {
        textures: {
            u_sampler: shadowDepthTexture,
        },
    },
);

// =====================================================================
// Render Loop
// =====================================================================

// Framebuffer stack
const framebufferStack = new glance.FramebufferStack();

setRenderLoop(({ globalTime }) =>
{
    // Update the user camera
    const viewPos = Vec3.of(0, 0, orbitDistance.get()).rotateX(orbitTilt.get()).rotateY(orbitPan.get());
    const viewMatrix = Mat4.lookAt(viewPos, Vec3.zero(), Vec3.yAxis()).translateY(verticalOffset);

    // Update the light position
    const lightMatrix = Mat4.rotateX(lightTilt).rotateY(globalTime * -lightRotationSpeed).translateY(verticalOffset);
    const lightPos = Vec3.of(0, 0, 1).rotateMat4(Mat4.transposeOf(lightMatrix));

    { // Render the shadow map
        framebufferStack.push(gl, shadowFramebuffer);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        shadowStatue.uniform.u_lightMatrix = lightMatrix;
        glance.draw(gl, shadowStatue);
        framebufferStack.pop(gl);
    }

    const renderDebug = true;
    if (renderDebug) { // Render the debug view
        gl.clear(gl.DEPTH_BUFFER_BIT);
        glance.draw(gl, debugView);
    }
    else { // Render the Scene
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Render the geometry
        statue.uniform.u_viewMatrix = viewMatrix;
        statue.uniform.u_cameraProjection = cameraProjection;
        statue.uniform.u_viewPosition = viewPos;
        statue.uniform.u_lightDirection = lightPos;
        glance.draw(gl, statue);

        // Render the ground
        ground.uniform.u_viewMatrix = viewMatrix;
        ground.uniform.u_cameraProjection = cameraProjection;
        ground.uniform.u_viewPosition = viewPos;
        ground.uniform.u_lightDirection = lightPos;
        glance.draw(gl, ground);

        // Render the skybox.
        skybox.uniform.u_viewXform = viewMatrix;
        skybox.uniform.u_projectionXform = cameraProjection;
        glance.draw(gl, skybox);
    }
});
