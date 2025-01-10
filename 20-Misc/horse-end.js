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
const projectionXform = Mat4.perspective(Math.PI / 4, gl.canvas.width / gl.canvas.height, 0.1, 14.);
onResize(() =>
{
    projectionXform.perspective(Math.PI / 4, gl.canvas.width / gl.canvas.height, 0.1, 14.);
});

// =====================================================================
// Geometry
// =====================================================================

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

    void main()
    {
        vec4 worldPosition = u_modelXform * vec4(a_pos, 1.0);
        f_worldPosition = worldPosition.xyz;
        f_normal = (u_modelXform * vec4(a_normal, 0.0)).xyz;
        f_texCoord = a_texCoord;
        gl_Position = u_projectionXform * u_viewXform * (worldPosition + vec4(f_normal * 0.07, 0.0));
    }
`;

// Fragment Shader Source
const geoFSSource = `#version 300 es
    precision mediump float;

    uniform float u_ambient;
    uniform float u_specularPower;
    uniform float u_specularIntensity;
    uniform vec3 u_lightDirection;
    uniform vec3 u_viewPosition;
    uniform sampler2D u_texDiffuse;

    in vec3 f_worldPosition;
    in vec3 f_normal;
    in vec2 f_texCoord;

    out vec4 o_fragColor;

    void main() {
        //vec3 normal = normalize(f_normal);
        // Instead of using the normal from the vertex shader, we calculate it here.
        // See: https://catlikecoding.com/unity/tutorials/advanced-rendering/flat-and-wireframe-shading/
        vec3 dpdx = dFdx(f_worldPosition);
        vec3 dpdy = dFdy(f_worldPosition);
        vec3 normal = normalize(cross(dpdx, dpdy));

        float diffuse = u_ambient + max(0.0, dot(u_lightDirection, normal)) * (1.0 - u_ambient);

        vec3 viewDirection = normalize(u_viewPosition - f_worldPosition);
        vec3 halfway = normalize(viewDirection + u_lightDirection);
        float specular = max(0.0, dot(normal, halfway));

        vec3 diffuseColor = texture(u_texDiffuse, f_texCoord).rgb;
        vec3 color = diffuseColor * diffuse + vec3(1.0) * (pow(specular, u_specularPower) * u_specularIntensity);

        o_fragColor = vec4(color, 1.0);
    }
`;

// Shader Program
const geoProgram = glance.createProgram(gl, "geo-shader", geoVSSource, geoFSSource, {
    u_modelXform: Mat4.identity(),
    u_ambient: 0.35,
    u_specularPower: 16,
    u_specularIntensity: 0.2,
    u_lightDirection: Vec3.normalOf(Vec3.all(1)),
});

// Geometry
const geoGeo = await glance.loadObj("https://echtzeit-computergrafik-ws24.github.io/geo/horse.obj");

// Draw Call
const geo = glance.createDrawCall(gl, "geo",
    glance.createVertexArrayObject(gl, "geo-vao",
        geoGeo.indices,
        {
            a_pos: { data: geoGeo.positions, height: 3 },
            a_normal: { data: geoGeo.normals, height: 3 },
            a_texCoord: { data: geoGeo.texCoords, height: 2 },
        },
        geoProgram,
    ),
    geoProgram,
    {
        cullFace: gl.BACK,
        depthTest: gl.LESS,
        textures: {
            u_texDiffuse: await glance.loadTexture(gl, "https://echtzeit-computergrafik-ws24.github.io/img/horse-diffuse.png"),
        }
    }
);

// =====================================================================
// Skybox
// =====================================================================

/// Skybox
const skybox = await glance.createSkybox(gl,
    [
        "https://echtzeit-computergrafik-ws24.github.io/img/envmap-prairie-px.webp",
        "https://echtzeit-computergrafik-ws24.github.io/img/envmap-prairie-nx.webp",
        "https://echtzeit-computergrafik-ws24.github.io/img/envmap-prairie-py.webp",
        "https://echtzeit-computergrafik-ws24.github.io/img/envmap-prairie-ny.webp",
        "https://echtzeit-computergrafik-ws24.github.io/img/envmap-prairie-pz.webp",
        "https://echtzeit-computergrafik-ws24.github.io/img/envmap-prairie-nz.webp",
    ],
);

// =====================================================================
// Render Loop
// =====================================================================

setRenderLoop(() =>
{
    // Update the user camera
    const viewPos = Vec3.of(0, 0, orbitDistance.get()).rotateX(orbitTilt.get()).rotateY(orbitPan.get());
    const viewXform = Mat4.lookAt(viewPos, Vec3.zero(), Vec3.yAxis());

    // Clear the scene
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Render the geometry
    geo.uniform.u_viewPosition = viewPos;
    geo.uniform.u_viewXform = viewXform;
    geo.uniform.u_projectionXform = projectionXform;
    glance.draw(gl, geo);

    // Render the skybox.
    skybox.uniform.u_viewXform = viewXform;
    skybox.uniform.u_projectionXform = projectionXform;
    glance.draw(gl, skybox);
});
