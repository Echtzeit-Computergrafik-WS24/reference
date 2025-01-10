// =============================================================================
// Setup
// =============================================================================

let orbitCenter, orbitPan, orbitTilt, orbitDistance, alien, desert, camera, television, skybox, projectionXform;
{
    // Interactivity ///////////////////////////////////////////////////////////

    orbitCenter = Sticky("orbitCenter", Vec3.all(0));
    orbitPan = Sticky("orbitPan", 0);
    orbitTilt = Sticky("orbitTilt", 0);
    orbitDistance = Sticky("orbitDistance", 3);

    onMouseDrag((e) =>
    {
        orbitPan.update((v) => v - e.movementX * 0.01);
        orbitTilt.update((v) => glance.clamp(v - e.movementY * 0.01, -Math.PI / 2, Math.PI / 2));
    });

    onMouseWheel((e) =>
    {
        orbitDistance.update((v) => glance.clamp(v * (1 + e.deltaY * 0.001), 2.0, 18.0));
    });

    onKeyDown((e) =>
    {
        if (e.key === "ArrowRight") {
            orbitCenter.update((v) => v.set(3.8, 0.1, 1.6));
        } else if (e.key === "ArrowLeft") {
            orbitCenter.update((v) => v.set(0, 0.85, 0));
        }
    });

    projectionXform = glance.Mat4.perspective(Math.PI / 4, gl.canvas.width / gl.canvas.height, 0.1, 30);
    onResize(() =>
    {
        projectionXform.perspective(Math.PI / 4, gl.canvas.width / gl.canvas.height, 0.1, 30);
    });

    // Scene Setup /////////////////////////////////////////////////////////////

    alien = await glance.createBPGeometry(gl,
        "https://echtzeit-computergrafik-ws24.github.io/geo/fbcomp-alien.obj",
        { diffuse: "https://echtzeit-computergrafik-ws24.github.io/img/fbcomp-alien.webp" },
        { renderNormals: true },
    );
    alien.uniform.u_ambient = 0.4;
    alien.uniform.u_specularPower = 64;
    alien.uniform.u_specularIntensity = 0.3;

    desert = await glance.createBPGeometry(gl,
        "https://echtzeit-computergrafik-ws24.github.io/geo/fbcomp-desert.obj",
        { diffuse: "https://echtzeit-computergrafik-ws24.github.io/img/fbcomp-desert.webp" },
        { renderNormals: true },
    );
    desert.uniform.u_ambient = 0.35;
    desert.uniform.u_specularPower = 8;
    desert.uniform.u_specularIntensity = 0.3;
    desert.uniform.u_modelXform = glance.Mat4.identity();

    camera = await glance.createBPGeometry(gl,
        "https://echtzeit-computergrafik-ws24.github.io/geo/fbcomp-camera.obj",
        { diffuse: "https://echtzeit-computergrafik-ws24.github.io/img/fbcomp-camera.webp" },
        { renderNormals: true },
    );
    camera.uniform.u_ambient = 0.15;
    camera.uniform.u_specularPower = 64;
    camera.uniform.u_specularIntensity = 0.8;
    camera.uniform.u_modelXform = glance.Mat4.identity();

    television = await glance.createBPGeometry(gl,
        "https://echtzeit-computergrafik-ws24.github.io/geo/tv.obj",
        {
            diffuse: "https://echtzeit-computergrafik-ws24.github.io/img/tv-albedo.webp",
            ambient: "https://echtzeit-computergrafik-ws24.github.io/img/tv-ambient.webp",
        },
        { renderNormals: true },
    );
    television.uniform.u_ambient = 0.15;
    television.uniform.u_specularPower = 64;
    television.uniform.u_specularIntensity = 0.5;
    television.uniform.u_modelXform = glance.Mat4.translate(3.8, -0.9, 1.56).scale(0.055).rotateY(-0.2);

    skybox = await glance.createSkybox(gl,
        [
            "https://echtzeit-computergrafik-ws24.github.io/img/envmap-cartoon-desert-px.webp",
            "https://echtzeit-computergrafik-ws24.github.io/img/envmap-cartoon-desert-nx.webp",
            "https://echtzeit-computergrafik-ws24.github.io/img/envmap-cartoon-desert-py.webp",
            "https://echtzeit-computergrafik-ws24.github.io/img/envmap-cartoon-desert-ny.webp",
            "https://echtzeit-computergrafik-ws24.github.io/img/envmap-cartoon-desert-pz.webp",
            "https://echtzeit-computergrafik-ws24.github.io/img/envmap-cartoon-desert-nz.webp",
        ],
        { renderNormals: true },
    );
}

// =============================================================================
// Screen Draw Call
// =============================================================================

// The size of the screen in the scene.
const screenSize = new glance.Vec2(0.73, 0.72);

// The size of the texture displayed on the screen.
const screenBufferSize = new glance.Vec2(512, 512);

// Screen Vertex Shader.
const screenVSSource = `#version 300 es
    precision highp float;

    uniform mat4 u_modelXform;
    uniform mat4 u_viewXform;
    uniform mat4 u_projectionXform;

    in vec3 a_pos;
    in vec2 a_texCoord;

    out vec2 f_texCoord;

    void main()
    {
        f_texCoord = a_texCoord;
        gl_Position = u_projectionXform * u_viewXform * u_modelXform * vec4(a_pos, 1.0);
    }
`;

// Screen Fragment Shader.
const screenFSSource = `#version 300 es
    precision mediump float;

    uniform sampler2D u_texture;
    uniform float u_time;

    in vec2 f_texCoord;

    out vec4 o_fragColor;

    void main() {
        vec3 color = texture(u_texture, f_texCoord).rgb;

        o_fragColor = vec4(color, 1.0);
    }
`;

// Screen Shader Program.
const screenProgram = glance.createProgram(gl, "screen-shader", screenVSSource, screenFSSource);

// Screen Geometry (a simple plane).
const screenGeo = glance.createPlane("screen-geo", {
    width: screenSize.width,
    height: screenSize.height,
});

// Screen VAO
const screenVAO = glance.createVertexArrayObject(gl, 'screen-vao',
    screenGeo.indices,
    {
        a_pos: { data: screenGeo.positions, height: 3 },
        a_texCoord: { data: screenGeo.texCoords, height: 2 },
    },
    screenProgram,
);

// Screen Texture (into which we will render)
const screenColorTexture = glance.createTexture(gl, "screen-color",
    screenBufferSize.width,
    screenBufferSize.height,
    {
        useAnisotropy: false,
        internalFormat: gl.RGBA8,
        levels: 1,
    },
);

// Screen Draw Call.
const screen = glance.createDrawCall(gl, "screen", screenVAO, screenProgram, {
    textures: { u_texture: screenColorTexture, },
    uniforms: { u_modelXform: glance.Mat4.translate(3.75, 0.1, 1.9).rotateY(-0.2) },
    cullFace: gl.BACK,
    depthTest: gl.LESS,
});

// =============================================================================
// Screen Framebuffer
// =============================================================================

const screenFramebuffer = gl.createFramebuffer();
try {
    gl.bindFramebuffer(gl.FRAMEBUFFER, screenFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, screenColorTexture.glo, /* level= */ 0);
    const fbStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (fbStatus !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error("Framebuffer incomplete");
    }
} finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

// =============================================================================
// Render Loop
// =============================================================================

/// Most of the changing uniforms are the same for all draw calls, so we can
/// simplify the setup by assigning uniforms & rendering each draw call in a loop.
function renderScene(viewPos, viewXform)
{
    for (const drawCall of [television, alien, camera, desert, skybox]) {
        drawCall.uniform.u_viewXform = viewXform;
        drawCall.uniform.u_projectionXform = projectionXform;
        if (drawCall !== skybox) {
            drawCall.uniform.u_viewPosition = viewPos;
        }
        glance.draw(gl, drawCall);
    }
}

/// The main render loop.
function myRenderLoop({ globalTime })
{
    // Update the item positions (in this case, just the alien)
    alien.uniform.u_modelXform = glance.Mat4.translateY(Math.sin(globalTime / 800) * 0.1).rotateY(globalTime / 5000);

    // Clear the default framebuffer before drawing on it.
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Calculate uniforms that are the same for all draw calls to the default framebuffer.
    const viewPos = glance.Vec3.translateZ(orbitDistance.get()).rotateX(orbitTilt.get()).rotateY(orbitPan.get()).add(orbitCenter.getRef());
    const viewXform = glance.Mat4.lookAt(viewPos, orbitCenter.getRef(), glance.Vec3.yAxis());

    // Render the scene into the default framebuffer.
    renderScene(viewPos, viewXform);

    // Also render the screen to the default framebuffer.
    screen.uniform.u_viewXform = viewXform;
    screen.uniform.u_projectionXform = projectionXform;
    glance.draw(gl, screen);
}
setRenderLoop(myRenderLoop);