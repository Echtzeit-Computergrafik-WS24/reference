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

    out vec2 f_sampleCoord;

    void main()
    {
        mat4 modelViewMatrix = u_viewXform * u_modelXform;
        vec4 viewPos = modelViewMatrix * vec4(a_pos, 1.);
        gl_Position = u_projectionXform * viewPos;

        // code from https://www.clicktorelease.com/blog/creating-spherical-environment-mapping-shader/
		vec3 viewDir = normalize(viewPos.xyz);
		vec3 viewNormal = normalize((modelViewMatrix * vec4(a_normal, 0.)).xyz);
		vec3 ray = reflect(viewDir, viewNormal);
        float m = 2. * sqrt(
            pow(ray.x, 2.) +
            pow(ray.y, 2.) +
            pow(ray.z + 1., 2.)
        );
		f_sampleCoord= ray.xy / m + .5;
    }
`;

// Fragment Shader Source
const geoFSSource = `#version 300 es
    precision mediump float;

    uniform sampler2D u_matcap;

    in vec2 f_sampleCoord;

    out vec4 o_fragColor;

    void main()
    {
        o_fragColor = texture(u_matcap, f_sampleCoord);
    }
`;

// Shader Program
const geoProgram = glance.createProgram(gl, "geo-shader", geoVSSource, geoFSSource, {
    u_modelXform: Mat4.identity(),
});

// Geometry
//const geoGeo = glance.createSphere("geo-geo");
const geoGeo = await glance.loadObj("/geo/suzanne.obj");

// Draw Call
const geo = glance.createDrawCall(gl, "geo",
    glance.createVertexArrayObject(gl, "geo-vao",
        geoGeo.indices,
        {
            a_pos: { data: geoGeo.positions, height: 3 },
            a_normal: { data: geoGeo.normals, height: 3 },
        },
        geoProgram,
    ),
    geoProgram,
    {
        cullFace: gl.BACK,
        depthTest: gl.LESS,
        textures: {
            u_matcap: await glance.loadTexture(gl, "/img/matcap-zbrush.webp", { wrap: gl.CLAMP_TO_EDGE }),
        }
    }
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
    geo.uniform.u_viewXform = viewXform;
    geo.uniform.u_projectionXform = projectionXform;
    glance.draw(gl, geo);
});
