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
const projectionMatrix = Mat4.perspective(Math.PI / 4, gl.canvas.width / gl.canvas.height, 0.1, 14.);
onResize(() =>
{
    projectionMatrix.perspective(Math.PI / 4, gl.canvas.width / gl.canvas.height, 0.1, 14.);
});

// =====================================================================
// Light Bulb
// =====================================================================

const lightBulb = await glance.createFlatGeometry(gl,
    glance.createSphere("lightbulb-geo", {
        radius: 0.02,
        widthSegments: 8,
        heightSegments: 5,
    })
);

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

    out vec3 f_worldPos;
    out vec3 f_normal;
    out vec2 f_texCoord;

    void main() {
        vec4 worldPosition = u_modelXform * vec4(a_pos, 1.0);
        f_worldPos = worldPosition.xyz;
        f_normal = (u_modelXform * vec4(a_normal, 0.0)).xyz;
        f_texCoord = a_texCoord;

        gl_Position = u_projectionXform * u_viewXform * worldPosition;
    }
`;

// Fragment Shader Source
const geoFSSource = `#version 300 es
    precision mediump float;

    uniform float u_ambientIntensity;
    uniform float u_specularPower;
    uniform float u_specularIntensity;
    uniform vec3 u_viewPosition;
    uniform vec3 u_lightPosition;
    uniform sampler2D u_texDiffuse;
    uniform sampler2D u_texSpecular;
    uniform sampler2D u_texNormal;

    in vec3 f_worldPos;
    in vec3 f_normal;
    in vec2 f_texCoord;

    out vec4 o_fragColor;

    void main() {
        // texture
        vec3 texDiffuse = texture(u_texDiffuse, f_texCoord).rgb;
        vec3 texSpecular = texture(u_texSpecular, f_texCoord).rgb;
        vec3 texNormal = texture(u_texNormal, f_texCoord).rgb;

        // lighting
        //vec3 normal = normalize(f_normal);
        vec3 normal = normalize(texNormal * (255./128.) - 1.0);
        vec3 lightDir = normalize(u_lightPosition - f_worldPos);
        vec3 viewDir = normalize(u_viewPosition - f_worldPos);
        vec3 halfWay = normalize(viewDir + lightDir);

        // diffuse
        float diffuseIntensity = u_ambientIntensity + max(dot(normal, lightDir), 0.0) * (1.0 - u_ambientIntensity);
        vec3 diffuse = texDiffuse * diffuseIntensity;

        // specular
        float specularFactor = pow(max(dot(normal, halfWay), 0.0), u_specularPower);
        vec3 specular = texSpecular * specularFactor * u_specularIntensity;

        // result
        o_fragColor = vec4(diffuse + specular, 1.0);
    }
`;

// Shader Program
const geoProgram = glance.createProgram(gl, "geo-shader", geoVSSource, geoFSSource, {
    u_ambientIntensity: 0.1,
    u_specularIntensity: 0.15,
    u_specularPower: 128,
});

// Geometry
const geoGeo = glance.createPlane("geo-geo");
geoGeo.texCoords = geoGeo.texCoords.map((c) => c * 2); // repeat the texture twice in each axis

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
        textures: {
            u_texDiffuse: await glance.loadTexture(gl, "/img/rockwall-diffuse.webp", { wrap: gl.REPEAT }),
            u_texSpecular: await glance.loadTexture(gl, "/img/rockwall-specular.webp", { wrap: gl.REPEAT }),
            u_texNormal: await glance.loadTexture(gl, "/img/rockwall-normal.webp", { wrap: gl.REPEAT }),
        },
        // cullFace: gl.BACK,
        depthTest: gl.LESS,
    }
);

// =====================================================================
// Render Loop
// =====================================================================

// Constants.
const geoXform = Mat4.identity();
const lightDistance = 0.25;
const lightRadius = 0.8;
const lightSpeed = 0.0005;

setRenderLoop(({ globalTime }) =>
{
    // Update the user camera
    const viewPos = Vec3.of(0, 0, orbitDistance.get()).rotateX(orbitTilt.get()).rotateY(orbitPan.get());
    const viewXform = Mat4.lookAt(viewPos, Vec3.zero(), Vec3.yAxis());

    // Update the light position
    const lightPos = Vec3.of(
        Math.sin(globalTime * lightSpeed) * lightRadius,
        Math.cos(globalTime * lightSpeed) * lightRadius,
        lightDistance,
    );
    const lightXform = Mat4.fromTranslation(lightPos);

    // Clear the scene
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Render the light bulb
    lightBulb.uniform.u_modelXform = lightXform;
    lightBulb.uniform.u_viewXform = viewXform;
    lightBulb.uniform.u_projectionXform = projectionMatrix;
    glance.draw(gl, lightBulb);

    // Render the geometry
    geo.uniform.u_modelXform = geoXform;
    geo.uniform.u_viewXform = viewXform;
    geo.uniform.u_projectionXform = projectionMatrix;
    geo.uniform.u_viewPosition = viewPos;
    geo.uniform.u_lightPosition = lightPos;
    glance.draw(gl, geo);
});
