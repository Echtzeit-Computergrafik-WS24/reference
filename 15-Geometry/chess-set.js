// Load textures with flipped Y coordinates.
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

const lightDirection = Vec3.of(1, 1, 1).normalize();
const projectionMatrix = glance.Mat4.perspective(Math.PI / 4, 1, 0.1, 15);

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

    in vec3 f_worldPosition;
    in vec3 f_normal;
    in vec2 f_texCoord;

    out vec4 o_fragColor;

    void main() {
        float ambient = 0.15;
        vec3 diffuseColor = texture(u_texDiffuse, f_texCoord).rgb;
        vec3 specularColor = texture(u_texSpecular, f_texCoord).rgb;
        vec3 normal = normalize(f_normal);

        float diffuseFactor = ambient + max(0.0, dot(u_lightDirection, normal)) * (1.0 - ambient);

        vec3 viewDirection = normalize(u_cameraPosition - f_worldPosition);
        vec3 halfway = normalize(viewDirection + u_lightDirection);
        float specularFactor = max(0.0, dot(normal, halfway));
        specularFactor = pow(specularFactor, 128.0) * 0.8;

        vec3 color = diffuseColor * diffuseFactor + specularColor * specularFactor;
        o_fragColor = vec4(color, 1.0);
    }`;

// Geometry.
const boardGeo = await glance.loadObj("https://echtzeit-computergrafik-ws24.github.io/geo/chess-board.obj");
const pawnGeo = await glance.loadObj("https://echtzeit-computergrafik-ws24.github.io/geo/chess-pawn.obj");
const rookGeo = await glance.loadObj("https://echtzeit-computergrafik-ws24.github.io/geo/chess-rook.obj");
const knightGeo = await glance.loadObj("https://echtzeit-computergrafik-ws24.github.io/geo/chess-knight.obj");
const bishopGeo = await glance.loadObj("https://echtzeit-computergrafik-ws24.github.io/geo/chess-bishop.obj");
const queenGeo = await glance.loadObj("https://echtzeit-computergrafik-ws24.github.io/geo/chess-queen.obj");
const kingGeo = await glance.loadObj("https://echtzeit-computergrafik-ws24.github.io/geo/chess-king.obj");

// Texture.
const boardDiffuse = await glance.loadTexture(gl, "https://echtzeit-computergrafik-ws24.github.io/img/chess-board-diffuse.webp");
const boardSpecular = await glance.loadTexture(gl, "https://echtzeit-computergrafik-ws24.github.io/img/chess-board-specular.webp");
const piecesWhiteDiffuse = await glance.loadTexture(gl, "https://echtzeit-computergrafik-ws24.github.io/img/chess-pieces-white-diffuse.webp");
const piecesWhiteSpecular = await glance.loadTexture(gl, "https://echtzeit-computergrafik-ws24.github.io/img/chess-pieces-white-specular.webp");
const piecesBlackDiffuse = await glance.loadTexture(gl, "https://echtzeit-computergrafik-ws24.github.io/img/chess-pieces-black-diffuse.webp");
const piecesBlackSpecular = await glance.loadTexture(gl, "https://echtzeit-computergrafik-ws24.github.io/img/chess-pieces-black-specular.webp");

// 2. WebGL 'Building Blocks' //////////////////////////////////////////////

// Basic
const vs = glance.createShader(gl, 'my vertex shader', glance.ShaderStage.VERTEX, vertexShaderSource);
const fs = glance.createShader(gl, 'my fragment shader', glance.ShaderStage.FRAGMENT, fragmentShaderSource);

// 3. Helper ////////////////////////////////////////////////////////////////

function createDrawCall(geo)
{
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
    // TODO: This creates a new program for each draw call!

    // Draw Call
    const drawCall = glance.createDrawCall(gl, 'my draw call', vao, program, {
        cullFace: gl.BACK,
        depthTest: gl.LESS,
    });

    drawCall.uniform.u_projectionXform = projectionMatrix;
    drawCall.uniform.u_lightDirection = lightDirection;
    drawCall.uniform.u_texDiffuse = 0; // texture unit 0
    drawCall.uniform.u_texSpecular = 1;

    return drawCall;
}

function renderDrawCall(drawCall, camPos, diffuse, specular, modelXform)
{
    gl.activeTexture(gl.TEXTURE0 + 0);
    gl.bindTexture(gl.TEXTURE_2D, diffuse.glo);
    gl.activeTexture(gl.TEXTURE0 + 1);
    gl.bindTexture(gl.TEXTURE_2D, specular.glo);

    drawCall.uniform.u_modelXform = modelXform;
    drawCall.uniform.u_viewXform = glance.Mat4.lookAt(camPos, glance.Vec3.zero(), glance.Vec3.yAxis());
    drawCall.uniform.u_cameraPosition = camPos;

    glance.draw(gl, drawCall);
}

// 4. Render Loop //////////////////////////////////////////////////////////

const board = createDrawCall(boardGeo);
const pawn = createDrawCall(pawnGeo);
const rook = createDrawCall(rookGeo);
const knight = createDrawCall(knightGeo);
const bishop = createDrawCall(bishopGeo);
const queen = createDrawCall(queenGeo);
const king = createDrawCall(kingGeo);

gl.enable(gl.DEPTH_TEST);
gl.enable(gl.CULL_FACE);

const orbitPan = Sticky("orbitPan", 0);
const orbitTilt = Sticky("orbitTilt", 0);
const orbitDistance = Sticky("orbitDistance", 3);

function myRenderLoop({ globalTime })
{
    // Always clear the canvas before drawing on it.
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // This is the same for all geometry.
    const camPos = glance.Vec3.translateZ(orbitDistance.get()).rotateX(orbitTilt.get()).rotateY(orbitPan.get());

    // The board rotates very slowly around the y-axis.
    const boardMatrix = glance.Mat4.rotateY(globalTime / 60000);

    // Board
    renderDrawCall(board, camPos, boardDiffuse, boardSpecular, boardMatrix);

    // Pieces
    for (const [diff, spec] of [[piecesWhiteDiffuse, piecesWhiteSpecular], [piecesBlackDiffuse, piecesBlackSpecular]]) {
        // Rooks
        renderDrawCall(rook, camPos, diff, spec, glance.Mat4.translate(-2, 0.17, 2).preMultiply(boardMatrix));
        renderDrawCall(rook, camPos, diff, spec, glance.Mat4.translate(2, 0.17, 2).preMultiply(boardMatrix));

        // Knighs
        renderDrawCall(knight, camPos, diff, spec, glance.Mat4.translate(-1.45, 0.17, 2).preMultiply(boardMatrix));
        renderDrawCall(knight, camPos, diff, spec, glance.Mat4.translate(+1.45, 0.17, 2).preMultiply(boardMatrix));

        // Bishops
        renderDrawCall(bishop, camPos, diff, spec, glance.Mat4.translate(-0.9, 0.17, 2).preMultiply(boardMatrix));
        renderDrawCall(bishop, camPos, diff, spec, glance.Mat4.translate(+0.9, 0.17, 2).preMultiply(boardMatrix));

        // Queen
        renderDrawCall(queen, camPos, diff, spec, glance.Mat4.translate(-0.3, 0.17, 2).preMultiply(boardMatrix));

        // King
        renderDrawCall(king, camPos, diff, spec, glance.Mat4.translate(+0.3, 0.17, 2).preMultiply(boardMatrix));

        // Pawns
        for (let i = 0; i < 8; ++i) {
            renderDrawCall(pawn, camPos, diff, spec, glance.Mat4.translate(-2 + (i * 0.58), 0.17, 1.5).preMultiply(boardMatrix));
        }

        // The trick is to simply rotate the entire board matrix by 180 degrees
        // and then draw the opponent's pieces.
        boardMatrix.rotateY(Math.PI);
    }
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