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
// 2D
// =====================================================================

// The 2D Texture to display on the plane.
const canvasTexture = glance.createTexture(gl, "canvas-texture", 1024, 1024);

// =====================================================================
// 3D
// =====================================================================

// Plane
const geo = await glance.createFlatGeometry(gl, glance.createPlane('geo-plane'), canvasTexture);
geo.cullFace = gl.NONE;

// Skybox
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
    geo.uniform.u_viewXform = viewXform;
    geo.uniform.u_projectionXform = projectionXform;
    glance.draw(gl, geo);

    // Render the skybox.
    skybox.uniform.u_viewXform = viewXform;
    skybox.uniform.u_projectionXform = projectionXform;
    glance.draw(gl, skybox);
});
