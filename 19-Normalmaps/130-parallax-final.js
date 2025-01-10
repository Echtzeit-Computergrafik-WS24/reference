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
const orbitDistance = Sticky("orbitDistance", 3.0);
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
    uniform vec3 u_viewPosition;
    uniform vec3 u_lightPosition;

    in vec3 a_pos;
    in vec3 a_normal;
    in vec3 a_tangent;
    in vec2 a_texCoord;

    out vec3 f_worldPos;
    out vec3 f_viewPosition;
    out vec3 f_lightPosition;
    out vec2 f_texCoord;

    void main() {
        vec3 normal = (u_modelXform * vec4(a_normal, 0.0)).xyz;
        vec3 tangent = (u_modelXform * vec4(a_tangent, 0.0)).xyz;
        vec3 bitangent = cross(normal, tangent);
        mat3 tangentXform = transpose(mat3(tangent, bitangent, normal));

        vec4 worldPosition = u_modelXform * vec4(a_pos, 1.0);

        // Transform world space coords to tangent space
        f_worldPos = tangentXform * worldPosition.xyz;
        f_viewPosition = tangentXform * u_viewPosition;
        f_lightPosition = tangentXform * u_lightPosition;

        f_texCoord = a_texCoord;

        gl_Position = u_projectionXform * u_viewXform * worldPosition;
    }
`;

// Fragment Shader Source
const geoFSSource = `#version 300 es
    precision mediump float;

    uniform float u_ambientIntensity;
    uniform float u_specularIntensity;
    uniform float u_specularPower;
    uniform sampler2D u_texDiffuse;
    uniform sampler2D u_texSpecular;
    uniform sampler2D u_texNormal;
    uniform sampler2D u_texDepth;

    in vec3 f_worldPos;
    in vec3 f_viewPosition;
    in vec3 f_lightPosition;
    in vec2 f_texCoord;

    out vec4 o_fragColor;

    vec2 parallax_mapping(vec3 viewDir) {

        const float parallaxScale = 0.04;
        const float minLayers = 16.0;
        const float maxLayers = 64.0;

        float numLayers = mix(maxLayers, minLayers, smoothstep(0.0, 1.0, max(dot(vec3(0.0, 0.0, 1.0), viewDir), 0.0)));
        vec2 texCoordsDelta   = (viewDir.xy * parallaxScale) / (viewDir.z * numLayers);

        vec2 texCoord = f_texCoord;
        float depthSample = 1.0 - texture(u_texDepth, texCoord).r;
        float prevDepthMapValue    = depthSample;

        float i = 0.0;
        for(;i / numLayers < depthSample; i += 1.0)
        {
            prevDepthMapValue    = depthSample;
            texCoord    -= texCoordsDelta;
            depthSample = 1.0 - texture(u_texDepth, texCoord).r;
        }

        // get depth after and before collision for linear interpolation
        float afterDepth  = depthSample - i / numLayers;
        float beforeDepth = prevDepthMapValue - max(i - 1.0, 0.0) / numLayers;

        float fraction = afterDepth / (afterDepth - beforeDepth);
        return texCoord + (texCoordsDelta * fraction);
    }

    void main() {
        // parallax
        vec3 viewDir = normalize(f_viewPosition - f_worldPos);
        vec2 texCoord = parallax_mapping(viewDir);
        if(texCoord.x > 1.0
            || texCoord.y > 1.0
            || texCoord.x < 0.0
            || texCoord.y < 0.0) {
            discard;
        }

        // texture
        vec3 texDiffuse = texture(u_texDiffuse, texCoord).rgb;
        vec3 texSpecular = texture(u_texSpecular, texCoord).rgb;
        vec3 texNormal = texture(u_texNormal, texCoord).rgb;

        // lighting
        vec3 normal = normalize(texNormal * (255./128.) - 1.0);
        vec3 lightDir = normalize(f_lightPosition - f_worldPos);
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

// Draw Call
const geo = glance.createDrawCall(gl, "geo",
    glance.createVertexArrayObject(gl, "geo-vao",
        geoGeo.indices,
        {
            a_pos: { data: geoGeo.positions, height: 3 },
            a_normal: { data: geoGeo.normals, height: 3 },
            a_texCoord: { data: geoGeo.texCoords, height: 2 },
            a_tangent: { data: geoGeo.tangents, height: 3 },
        },
        geoProgram,
    ),
    geoProgram,
    {
        textures: {
            u_texDiffuse: await glance.loadTexture(gl, "https://echtzeit-computergrafik-ws24.github.io/img/pebbles-diffuse.webp"),
            u_texSpecular: await glance.loadTexture(gl, "https://echtzeit-computergrafik-ws24.github.io/img/pebbles-specular.webp"),
            u_texNormal: await glance.loadTexture(gl, "https://echtzeit-computergrafik-ws24.github.io/img/pebbles-normal.webp"),
            u_texDepth: await glance.loadTexture(gl, "https://echtzeit-computergrafik-ws24.github.io/img/pebbles-depth.webp"),
        },
        depthTest: gl.LESS,
        cullFace: gl.BACK,
    }
);

// =====================================================================
// Render Loop
// =====================================================================

// Constants.
const geoXform = Mat4.rotateX(-Math.PI / 2);
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
        Math.cos(globalTime * lightSpeed) * lightRadius,
        lightDistance,
        Math.sin(globalTime * lightSpeed) * lightRadius,
    );
    const lightXform = Mat4.fromTranslation(lightPos);

    // Clear the scene
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Render the light bulb
    lightBulb.uniform.u_modelXform = lightXform;
    lightBulb.uniform.u_viewXform = viewXform;
    lightBulb.uniform.u_projectionXform = projectionXform;
    glance.draw(gl, lightBulb);

    // Render the geometry
    geo.uniform.u_modelXform = geoXform;
    geo.uniform.u_viewXform = viewXform;
    geo.uniform.u_projectionXform = projectionXform;
    geo.uniform.u_viewPosition = viewPos;
    geo.uniform.u_lightPosition = lightPos;
    glance.draw(gl, geo);
});
