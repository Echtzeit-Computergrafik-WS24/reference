//!
//! Exercise Time!
//! ==============
//! The goal of this exercise is to add a reflection of the skybox to the torus
//! knot (the object in the center of the screen). The torus knot will not
//! reflect itself, only the environment, but that's okay. The torus knot has a
//! fragment shader with a basic blinn-phong lighting model, which you are free
//! to modify or replace.
//!
//! You will only need to modify the torus knot's fragment shader.
//! Everything else is already set up.
//!
//! Note that the program will throw an error when run unchanged, because the
//! `u_skybox` uniform is being optimized away.
//!
//! Hints:
//! ======
//! - The reflection is a single texture lookup in the skybox texture.
//! - The reflection direction is the mirror of the view direction.
//! - GLSL has a built-in function to reflect a vector, called `reflect`.
//!   See https://registry.khronos.org/OpenGL-Refpages/gl4/html/reflect.xhtml
//!


const torusFSSource = `#version 300 es
	precision mediump float;

    /// World-space position of the camera.
    uniform vec3 u_viewPosition;

    /// Skybox texture (cubemap-)sampler
    uniform samplerCube u_skybox;

    /// Interpolated normal of the fragment in world-space.
    in vec3 f_normal;

    /// Interpolated position of the fragment in world-space.
    in vec3 f_position;

    /// Output color of the fragment.
	out vec4 o_fragColor;

	void main() {
        // Constants
        vec3 lightDirection = normalize(vec3(-1.0, 1.0, -1.0));
        float ambient = 0.07;   // Ambient intensity in range [0, 1]
        float shininess = 64.0; // Specular shininess

        vec3 normal = normalize(f_normal);
        vec3 viewDirection = normalize(u_viewPosition - f_position);
        vec3 halfWay = normalize(viewDirection + lightDirection);

        float diffuse = max(0.0, dot(normal, lightDirection));
        float specular = pow(max(0.0, dot(normal, halfWay)), shininess);

        o_fragColor = vec4(vec3(ambient + diffuse + specular), 1.0);
	}
`;


//!
//! The rest of the code is written using the Glance library, which is different
//! from the WebGL code you've seen so far. The Glance library is a thin layer
//! on top of WebGL that simplifies the process of creating and managing
//! resources like shaders, buffers, and textures.
//! Feel free to have a look, but you don't need to understand it to complete
//! this exercise.
//!

// =====================================================================
// Skybox
// =====================================================================

/// Skybox
const skybox = await glance.createSkybox(gl,
    [
        "https://echtzeit-computergrafik-ws24.github.io/img/envmap-berlin-px.webp",
        "https://echtzeit-computergrafik-ws24.github.io/img/envmap-berlin-nx.webp",
        "https://echtzeit-computergrafik-ws24.github.io/img/envmap-berlin-py.webp",
        "https://echtzeit-computergrafik-ws24.github.io/img/envmap-berlin-ny.webp",
        "https://echtzeit-computergrafik-ws24.github.io/img/envmap-berlin-pz.webp",
        "https://echtzeit-computergrafik-ws24.github.io/img/envmap-berlin-nz.webp",
    ],
);

// =====================================================================
// Torus
// =====================================================================

/// Torus Vertex Shader.
const torusVSSource = `#version 300 es
	precision highp float;

    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;

	in vec3 a_pos;
    in vec3 a_normal;

    out vec3 f_normal;
    out vec3 f_position;

    void main() {
        vec4 worldPosition = vec4(a_pos, 1.0);
        f_position = worldPosition.xyz;
        f_normal = a_normal;

 		gl_Position = u_projectionMatrix * u_viewMatrix * worldPosition;
	}
`;

/// Torus Shader Program.
const torusProgram = glance.createProgram(gl, 'torus-shader', torusVSSource, torusFSSource);

/// Torus Geometry.
const torusGeo = glance.createTorusKnot("torus-geo", {
    knotRadius: .6,
    tubeRadius: .2,
    tubeSegments: 128,
    radialSegments: 24,
});

/// Torus Draw Call.
const torus = glance.createDrawCall(gl, "geo",
    glance.createVertexArrayObject(gl, "geo-vao",
        torusGeo.indices,
        {
            a_pos: { data: torusGeo.positions, height: 3 },
            a_normal: { data: torusGeo.normals, height: 3 },
            a_texCoord: { data: torusGeo.texCoords, height: 2 },
        },
        torusProgram,
    ),
    torusProgram,
    {
        textures: {
            u_skybox: skybox.textures.u_skybox,
        },
        cullFace: gl.BACK,
        depthTest: gl.LESS,
    }
);

// =====================================================================
// Interaction
// =====================================================================

// The user can orbit the camera around the world origin...
const orbitPan = Sticky("orbitPan", 0);
const orbitTilt = Sticky("orbitTilt", 0);
onMouseDrag((e) =>
{
    orbitPan.update((v) => v - e.movementX * 0.008);
    orbitTilt.update((v) => glance.clamp(v - e.movementY * 0.008, -Math.PI / 2, Math.PI / 2));
});
// ... and zoom in and out.
const orbitDistance = Sticky("orbitDistance", 4.5);
onMouseWheel((e) =>
{
    orbitDistance.update((v) => glance.clamp(v * (1 + e.deltaY * 0.001), 1.5, 10.0));
});

// Resizing the viewport will update the projection matrix.
const projectionMatrix = Mat4.perspective(Math.PI / 4, gl.canvas.width / gl.canvas.height, 0.1, 14.);
onResize(() =>
{
    projectionMatrix.perspective(Math.PI / 4, gl.canvas.width / gl.canvas.height, 0.1, 14.);
});

// =====================================================================
// Rendering
// =====================================================================

setRenderLoop(() =>
{
    // Update the user camera
    const viewPos = Vec3.of(0, 0, orbitDistance.get()).rotateX(orbitTilt.get()).rotateY(orbitPan.get());
    const viewMatrix = Mat4.lookAt(viewPos, Vec3.zero(), Vec3.yAxis());

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Render the torus.
    torus.uniform.u_viewMatrix = viewMatrix;
    torus.uniform.u_projectionMatrix = projectionMatrix;
    torus.uniform.u_viewPosition = viewPos;
    glance.draw(gl, torus);

    // Render the skybox.
    skybox.uniform.u_viewXform = viewMatrix;
    skybox.uniform.u_projectionXform = projectionMatrix;
    glance.draw(gl, skybox);
});