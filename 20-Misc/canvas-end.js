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

const canvas = new OffscreenCanvas(canvasTexture.width, canvasTexture.height);
const ctx = canvas.getContext("2d");
if (ctx === null) {
    throw new Error("Failed to create OffscreenCanvasRenderingContext2D");
}

function drawStar(cx, cy, spikes, outerRadius, innerRadius)
{
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius;
        y = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(x, y);
        rot += step;

        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(x, y);
        rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
}

// Fill the entire canvas with a black background
ctx.fillStyle = '#000000';
ctx.fillRect(0, 0, canvas.width, canvas.height);

// Draw a gold star.
ctx.fillStyle = '#FFD700';
ctx.strokeStyle = '#FFD700';
drawStar(512, 512, 11, 400, 200);

// Update the texture data.
glance.updateTextureData(gl, canvasTexture, canvas);


// =====================================================================
// 3D
// =====================================================================

// Plane
const geo = await glance.createFlatGeometry(gl, glance.createPlane('geo-plane'), canvasTexture);
geo.cullFace = gl.NONE;

// Skybox
const skybox = await glance.createSkybox(gl,
    [
        "/img/envmap-prairie-px.webp",
        "/img/envmap-prairie-nx.webp",
        "/img/envmap-prairie-py.webp",
        "/img/envmap-prairie-ny.webp",
        "/img/envmap-prairie-pz.webp",
        "/img/envmap-prairie-nz.webp",
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
