export
{
    AttachmentType,
    AttributeDataType,
    BlendEquation,
    BlendFunc,
    BufferUsage,
    CullFace,
    DepthTest,
    DrawMode,
    IndexDataType,
    RenderbufferInternalFormat,
    ShaderStage,
    TextureCompareFunc,
    TextureDataTarget,
    TextureFilter,
    TextureInternalFormat,
    TextureSrcDataType,
    TextureTarget,
    TextureWrap,
};
export type
{
    AttachmentDefinition,
    AttributeBuffer,
    AttributeLayout,
    AttributeReference,
    AttributeSize,
    Cached,
    DrawCall,
    FragmentShader,
    Framebuffer,
    FramebufferAttachment,
    GlslAttributeDataType,
    GlslPrecision,
    GlslUniformDataType,
    IndexBuffer,
    Program,
    Renderbuffer,
    Shader,
    Texture,
    TextureUnit,
    TextureUnitId,
    Uniform,
    UniformValue,
    VAO,
    VertexShader,
    WebGL2
};


import type {
    Vec2,
    Vec3,
    Mat3,
    Mat4,
} from "./math/index.js";


// Constants ================================================================ //


/// Acceptable Vertex Shader Input (Attribute) types.
/// Note that `matnxm` means "A matrix with n columns and m rows"
/// See https://www.khronos.org/opengl/wiki/Data_Type_(GLSL)#Matrices
/// See chapter 4.3.4 of:
///  https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf
type GlslAttributeDataType =
    | "int" | "ivec2" | "ivec3" | "ivec4"
    | "uint" | "uvec2" | "uvec3" | "uvec4"
    | "float" | "vec2" | "vec3" | "vec4"
    | "mat2" | "mat2x2" | "mat2x3" | "mat2x4"
    | "mat3" | "mat3x2" | "mat3x3" | "mat3x4"
    | "mat4" | "mat4x2" | "mat4x3" | "mat4x4";


/// Acceptable Uniform Shader Input types.
/// See chapter 4.3.5 of:
///  https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf
/// Note that this does not cover the case where a Uniform is a struct or an
/// array of structs. See:
///  https://www.khronos.org/opengl/wiki/Uniform_(GLSL)#Uniform_management
type GlslUniformDataType = GlslAttributeDataType
    | "bool" | "bvec2" | "bvec3" | "bvec4"
    | "sampler2D" | "sampler2DArray" | "samplerCube" | "sampler3D"
    | "isampler2D" | "isampler2DArray" | "isamplerCube" | "isampler3D"
    | "usampler2D" | "usampler2DArray" | "usamplerCube" | "usampler3D"
    | "sampler2DShadow" | "sampler2DArrayShadow" | "samplerCubeShadow";


/// GLSL data precisions.
type GlslPrecision = "lowp" | "mediump" | "highp";


/// GLSL Attributes can be 1, 2, 3 or 4 dimensional.
/// https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/vertexAttribPointer#size
type AttributeSize = 1 | 2 | 3 | 4;


/// WebGL2 Shader Types.
const enum ShaderStage
{
    VERTEX = 0x8B31,
    FRAGMENT = 0x8B30,
}


/// Attachment type for the Framebuffer.
const enum AttachmentType
{
    TEXTURE = 1,
    RENDERBUFFER = 2,
}


/// Data types for WebGL2 attributes.
/// https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/vertexAttribPointer#type
const enum AttributeDataType
{
    BYTE = 0x1400,
    UNSIGNED_BYTE = 0x1401,
    SHORT = 0x1402,
    UNSIGNED_SHORT = 0x1403,
    INT = 0x1404,
    UNSIGNED_INT = 0x1405,
    FLOAT = 0x1406,
    HALF_FLOAT = 0x140B,
    INT_2_10_10_10_REV = 0x8D9F,
    UNSIGNED_INT_2_10_10_10_REV = 0x8368,
}


/// Data types for WebGL2 indices.
/// https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/drawElements#type
const enum IndexDataType
{
    UNSIGNED_BYTE = 0x1401,
    UNSIGNED_SHORT = 0x1403,
    UNSIGNED_INT = 0x1405,
}


/// WebGL2 Buffer Usage.
/// See: https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/bufferData#usage
const enum BufferUsage
{
    STATIC_DRAW = 0x88E4,   // The contents of the buffer are likely to be used often and not change often.
    STREAM_DRAW = 0x88E0,   // The contents of the buffer are likely to not be used often.
    DYNAMIC_DRAW = 0x88E8,  // The contents of the buffer are likely to be used often and change often.
    STATIC_READ = 0x88E5,   // The contents are intended to be specified once by reading data from WebGL, and queried many times by the application.
    DYNAMIC_READ = 0x88E9,  // The contents are intended to be respecified repeatedly by reading data from WebGL, and queried many times by the application.
    STREAM_READ = 0x88E1,   // The contents are intended to be specified once by reading data from WebGL, and queried at most a few times by the application
    STATIC_COPY = 0x88E6,   // The contents are intended to be specified once by reading data from WebGL, and used many times as the source for WebGL drawing and image specification commands.
    DYNAMIC_COPY = 0x88EA,  // The contents are intended to be respecified repeatedly by reading data from WebGL, and used many times as the source for WebGL drawing and image specification commands.
    STREAM_COPY = 0x88E2,   // The contents are intended to be specified once by reading data from WebGL, and used at most a few times as the source for WebGL drawing and image specification commands.
}


/// WebGL Texture targets.
/// See https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/bindTexture#target
const enum TextureTarget
{
    TEXTURE_2D = 0x0DE1,
    TEXTURE_3D = 0x806F,
    TEXTURE_CUBE_MAP = 0x8513,
    TEXTURE_2D_ARRAY = 0x8C1A,
}


/// All WebGL Texture data targets.
/// See https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texImage2D#target
/// and https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/texImage3D#target
const enum TextureDataTarget
{
    TEXTURE_2D = 0x0DE1,
    TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515,
    TEXTURE_CUBE_MAP_NEGATIVE_X = 0x8516,
    TEXTURE_CUBE_MAP_POSITIVE_Y = 0x8517,
    TEXTURE_CUBE_MAP_NEGATIVE_Y = 0x8518,
    TEXTURE_CUBE_MAP_POSITIVE_Z = 0x8519,
    TEXTURE_CUBE_MAP_NEGATIVE_Z = 0x851A,
    TEXTURE_3D = 0x806F,
    TEXTURE_2D_ARRAY = 0x8C1A,
}


/// Valid values for the srcData type parameter of texImage2D and texImage3D.
/// See https://registry.khronos.org/webgl/specs/latest/2.0/#3.7.6
/// Actually, I have removed the signed integer types, because they do not
/// appear in the table of valid internalFormat, format and type combinations as
/// seen here: https://registry.khronos.org/webgl/specs/latest/2.0/#TEXTURE_TYPES_FORMATS_FROM_DOM_ELEMENTS_TABLE
/// This might be an oversight in the WebGL2 spec, but I am not sure.
/// I also removed the FLOAT_32_UNSIGNED_INT_24_8_REV type because it too is
/// missing from the table.
const enum TextureSrcDataType
{
    UNSIGNED_BYTE = 0x1401,
    UNSIGNED_SHORT = 0x1403,
    UNSIGNED_SHORT_5_6_5 = 0x8363,
    UNSIGNED_SHORT_5_5_5_1 = 0x8034,
    UNSIGNED_SHORT_4_4_4_4 = 0x8033,
    UNSIGNED_INT = 0x1405,
    UNSIGNED_INT_5_9_9_9_REV = 0x8C3E,
    UNSIGNED_INT_2_10_10_10_REV = 0x8368,
    UNSIGNED_INT_10F_11F_11F_REV = 0x8C3B,
    UNSIGNED_INT_24_8 = 0x84FA,
    HALF_FLOAT = 0x140B,
    FLOAT = 0x1406,
}


/// Valid values for the internalFormat parameter of texStorage2D and texStorage3D.
/// See https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/texStorage2D#internalformat
/// In WebGL1, one could also "unsized" formats like RGB, RGBA, LUMINANCE, etc.
/// but I will ignore them.
/// The MDN page is missing RGB10_A2, but it is in the WebGL2 spec...
/// Also, I am ignoring the compressed formats for now.
/// I am however including some depth formats as they appear to be valid and are
/// required for shadow mapping.
const enum TextureInternalFormat
{
    R8 = 0x8229,
    R16F = 0x822D,
    R32F = 0x822E,
    R8UI = 0x8232,
    RG8 = 0x822B,
    RG16F = 0x822F,
    RG32F = 0x8230,
    RG8UI = 0x8238,
    RGB8 = 0x8051,
    SRGB8 = 0x8C41,
    RGB565 = 0x8D62,
    R11F_G11F_B10F = 0x8C3A,
    RGB9_E5 = 0x8C3D,
    RGB16F = 0x881B,
    RGB32F = 0x8815,
    RGB8UI = 0x8D7D,
    RGBA8 = 0x8058,
    SRGB8_ALPHA8 = 0x8C43,
    RGB5_A1 = 0x8057,
    RGBA4 = 0x8056,
    RGB10_A2 = 0x8059,
    RGBA16F = 0x881A,
    RGBA32F = 0x8814,
    RGBA8UI = 0x8D7C,
    DEPTH_COMPONENT16 = 0x81A5,
    DEPTH_COMPONENT24 = 0x81A6,
    DEPTH_COMPONENT32F = 0x8CAC,
    DEPTH24_STENCIL8 = 0x88F0,
    DEPTH32F_STENCIL8 = 0x8CAD,
    STENCIL_INDEX8 = 0x8D48,
}


/// Valid filter values for the min- and magFilter parameters of texParameteri.
/// See https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Constants#textures
const enum TextureFilter
{
    NEAREST = 0x2600,
    LINEAR = 0x2601,
    NEAREST_MIPMAP_NEAREST = 0x2700,
    LINEAR_MIPMAP_NEAREST = 0x2701,
    NEAREST_MIPMAP_LINEAR = 0x2702,
    LINEAR_MIPMAP_LINEAR = 0x2703,
}


/// Valid filter values for the texture wrap parameters of texParameteri.
/// See https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Constants#textures
const enum TextureWrap
{
    REPEAT = 0x2901,
    CLAMP_TO_EDGE = 0x812F,
    MIRRORED_REPEAT = 0x8370,
}


/// Anything but NONE implies that the TEXTURE_COMPARE_MODE of the texture is
/// set to COMPARE_REF_TO_TEXTURE.
/// Note that this requires the texture to be a depth texture.
/// See https://registry.khronos.org/OpenGL-Refpages/gl4/html/glTexParameter.xhtml
const enum TextureCompareFunc
{
    NONE = 0x0000,      // Disable depth comparison, implies TEXTURE_COMPARE_MODE = gl.NONE.
    NEVER = 0x0200,     // Always returns 0.
    LESS = 0x0201,      // Returns 1 if the new value is less than the stored value.
    EQUAL = 0x0202,     // Returns 1 if the new value is equal to the stored value.
    LEQUAL = 0x0203,    // Returns 1 if the new value not greater than the stored value.
    GREATER = 0x0204,   // Returns 1 if the new value is strictly greater than the stored value.
    NOTEQUAL = 0x0205,  // Returns 1 if the new value is not equal to the stored value.
    GEQUAL = 0x0206,    // Returns 1 if the new value is not less than the stored value.
    ALWAYS = 0x0207,    // Always returns 1.
}


/// Valid values for the internalFormat parameter of renderbufferStorage.
/// See https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/renderbufferStorage#internalformat
const enum RenderbufferInternalFormat
{
    RGBA4 = 0x8056,
    RGB565 = 0x8D62,
    RGB5_A1 = 0x8057,
    DEPTH_COMPONENT16 = 0x81A5,
    STENCIL_INDEX8 = 0x8D48,
    DEPTH_STENCIL = 0x84F9,
    // WebGL2 only
    R8 = 0x8229,
    R8UI = 0x8232,
    R8I = 0x8231,
    R16UI = 0x8234,
    R16I = 0x8233,
    R32UI = 0x8236,
    R32I = 0x8235,
    RG8 = 0x822B,
    RG8UI = 0x8238,
    RG8I = 0x8237,
    RG16UI = 0x823A,
    RG16I = 0x8239,
    RG32UI = 0x823C,
    RG32I = 0x823B,
    RGB8 = 0x8051,
    RGBA8 = 0x8058,
    SRGB8_ALPHA8 = 0x8C43,
    RGB10_A2 = 0x8059,
    RGBA8UI = 0x8D7C,
    RGBA8I = 0x8D8E,
    RGB10_A2UI = 0x906F,
    RGBA16UI = 0x8D76,
    RGBA16I = 0x8D88,
    RGBA32I = 0x8D82,
    RGBA32UI = 0x8D70,
    DEPTH_COMPONENT24 = 0x81A6,
    DEPTH_COMPONENT32F = 0x8CAC,
    DEPTH24_STENCIL8 = 0x88F0,
    DEPTH32F_STENCIL8 = 0x8CAD,
    // WebGL2 + EXT_color_buffer_float only
    R16F = 0x822D,
    RG16F = 0x822F,
    RGBA16F = 0x881A,
    R32F = 0x822E,
    RG32F = 0x8230,
    RGBA32F = 0x8814,
    R11F_G11F_B10F = 0x8C3A,
}


/// Front-/Backface culling modes.
/// See https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Constants#culling
const enum CullFace
{
    NONE = 0x0000,              // Disable culling altogether.
    FRONT = 0x0404,             // Cull front faces.
    BACK = 0x0405,              // Cull back faces. The default.
    FRONT_AND_BACK = 0x0408,    // Cull front and back faces.
}


/// Depth- and Stencil Tests
/// See https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Constants#depth_or_stencil_tests
const enum DepthTest
{
    NONE = 0x0000,      // Disable testing altogether, calls do not update the depth buffer.
    NEVER = 0x0200,     // Tests will never pass.
    LESS = 0x0201,      // Tests will pass if the new value is less than the stored value.
    EQUAL = 0x0202,     // Tests will pass if the new value is equal to the stored value.
    LEQUAL = 0x0203,    // Tests will pass if the new value is less than or equal to the stored value.
    GREATER = 0x0204,   // Tests will pass if the new value is greater than the stored value.
    NOTEQUAL = 0x0205,  // Tests will pass if the new value is not equal to the stored value.
    GEQUAL = 0x0206,    // Tests will pass if the new value is greater than or equal to the stored value.
    ALWAYS = 0x0207,    // Tests will always pass. The default.
}


/// Blend function multipliers.
/// See https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/blendFunc
const enum BlendFunc
{
    ZERO = 0x0000,                      // Multiplies all colors by 0.
    ONE = 0x0001,                       // Multiplies all colors by 1.
    SRC_COLOR = 0x0300,                 // Multiplies all colors by the source colors.
    ONE_MINUS_SRC_COLOR = 0x0301,       // Multiplies all colors by 1 minus each source color.
    DST_COLOR = 0x0306,                 // Multiplies all colors by the destination color.
    ONE_MINUS_DST_COLOR = 0x0307,       // Multiplies all colors by 1 minus each destination color.
    SRC_ALPHA = 0x0302,                 // Multiplies all colors by the source alpha value.
    ONE_MINUS_SRC_ALPHA = 0x0303,       // Multiplies all colors by 1 minus the source alpha value.
    DST_ALPHA = 0x0304,                 // Multiplies all colors by the destination alpha value.
    ONE_MINUS_DST_ALPHA = 0x0305,       // Multiplies all colors by 1 minus the destination alpha value.
    CONSTANT_COLOR = 0x8001,            // Multiplies all colors by a constant color.
    ONE_MINUS_CONSTANT_COLOR = 0x8002,  // Multiplies all colors by 1 minus a constant color.
    CONSTANT_ALPHA = 0x8003,            // Multiplies all colors by a constant alpha value.
    ONE_MINUS_CONSTANT_ALPHA = 0x8004,  // Multiplies all colors by 1 minus a constant alpha value.
    SRC_ALPHA_SATURATE = 0x0308,        // Multiplies the RGB colors by the smaller of either the source alpha value or the value of 1 minus the destination alpha value. The alpha value is multiplied by 1.
}


/// Blend function equations.
/// See https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/blendEquation
const enum BlendEquation
{
    FUNC_ADD = 0x8006,              // Adds the source and destination colors (default).
    FUNC_SUBTRACT = 0x800A,         // Subtracts the destination color from the source color.
    FUNC_REVERSE_SUBTRACT = 0x800B, // Subtracts the source color from the destination color.
    MIN = 0x8007,                   // Selects the minimum of the source and destination colors.
    MAX = 0x8008,                   // Selects the maximum of the source and destination colors.
}


/// Draw modes for drawElements.
/// https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/drawElements#mode
const enum DrawMode
{
    POINTS = 0x0000,            // Draws individual points.
    LINES = 0x0001,             // Draws lines between pairs of vertices.
    LINE_LOOP = 0x0002,         // Draws a straight line to the next vertex, and connects the last vertex to the first.
    LINE_STRIP = 0x0003,        // Draws a straight line to the next vertex.
    TRIANGLES = 0x0004,         // Draws triangles between triples of vertices (default).
    TRIANGLE_STRIP = 0x0005,    // Draws a triangle between the first vertex and the last two vertices.
}


// Types ==================================================================== //


/// A cached object in the glancified WebGL2 context.
type Cached<Type> = {
    /// The cached object.
    readonly object: Type,

    /// The generation when the object was last used.
    generation: number,
};


/// A "glancified" WebGL2 context that keeps track of all created objects.
type WebGL2 = WebGL2RenderingContext & {
    __glance: {
        /// The current generation of the context.
        generation: number,

        // Some of the objects can be cached, because they can be uniquely
        // identified by some keyable value. This is useful for reusing objects
        // across runs.

        /// All loaded shaders by source.
        shaders: Map<string, Cached<Shader>>,

        /// All linked programs by concatenated sources.
        programs: Map<string, Cached<Program>>,

        /// Other objects cannot be cached as they are not uniquely identifiable
        /// by some keyable value, or at least not without significant overhead.
        /// We still need to keep track of them though, to delete them later.

        /// All raw WebGL buffers.
        buffers: Array<WebGLBuffer>,

        /// All raw WebGL VAOs.
        vaos: Array<WebGLVertexArrayObject>,

        /// All raw WebGL textures.
        textures: Array<WebGLTexture>,

        /// All raw WebGL renderbuffers.
        renderbuffers: Array<WebGLRenderbuffer>,

        /// All raw WebGL framebuffers.
        framebuffers: Array<WebGLFramebuffer>,

        // TODO: at least for the uncached objects, I could also hijack the gl.create* functions
        // to automatically add the created object to the respective array. This would be a bit
        // more robust than manually adding them to the arrays. Then again, in order to co-exist
        // with raw OpenGL Code, maybe this is actually not a good idea?
        // TODO: we could cache the buffers and textures more agressively, by hashing their data
        // and using that as the key. Ideally we'd be able to cache all the things.

    },
};


/// The location of an Attribute in a Shader Program.
type AttributeLocation = number;


/// The ID of a WebGL Texture Unit.
type TextureUnitId = number;


/// Any value that can be assigned to a Uniform.
type UniformValue = number | Array<number> | Vec2 | Vec3 | Mat3 | Mat4;


/// All information about an Attribute in a Shader Program.
type ShaderAttribute = {
    /// The GLSL data type of the attribute.
    readonly type: GlslAttributeDataType,

    /// The location of the attribute on the shader program.
    readonly location: number,

    /// The precision qualifier of the attribute. Defaults to undefined.
    readonly precision?: GlslPrecision,
};


/// Information about the layout of an attribute in an attribute buffer.
type AttributeLayout = {
    /// WebGL data type of the Attribute.
    readonly type: AttributeDataType,

    /// Number of dimensions of the Attribute (the height of a vector/matrix).
    readonly height: AttributeSize,

    /// Number of locations used by the Attribute (the width of a matrix, = 1 for vectors).
    readonly width: AttributeSize,

    /// Whether integral data should be normalized. Defaults to false.
    readonly normalized?: boolean,

    /// Attribute divisor, used for attribute instances. Defaults to zero.
    readonly divisor?: number,
};


/// Reference to a single attribute in an attribute buffer.
type AttributeReference = {
    /// The name of the Attribute in the Buffer.
    readonly name: string,

    /// The Buffer containing this Attribute.
    readonly buffer: AttributeBuffer,
};


/// All information about a Uniform.
type Uniform = {
    /// The GLSL data type of the uniform.
    readonly type: GlslUniformDataType,

    /// The WebGL location of the uniform on the shader program.
    readonly location: WebGLUniformLocation,

    /// The size of the uniform (for arrays, =1 if it is a scalar).
    readonly size: number,

    /// The precision qualifier of the uniform. Defaults to undefined.
    readonly precision?: GlslPrecision,

    /// The current value of the uniform (mutable).
    value: UniformValue,
};


/// All information about a Shader (Stage).
type Shader = {
    /// The WebGL shader object.
    readonly glo: WebGLShader;

    /// The name of the shader.
    readonly name: string;

    /// The shader stage (vertex or fragment).
    readonly stage: ShaderStage;

    /// The shader source code.
    readonly source: string;
};


/// A vertex shader.
type VertexShader = Shader & { readonly stage: ShaderStage.VERTEX; };


/// A fragment shader.
type FragmentShader = Shader & { readonly stage: ShaderStage.FRAGMENT; };


/// All information about a Shader Program.
type Program = {
    /// The WebGL program object.
    readonly glo: WebGLProgram;

    /// The name of the program.
    readonly name: string;

    /// The vertex shader of the program.
    readonly vertex: VertexShader;

    /// The fragment shader of the program.
    readonly fragment: FragmentShader;

    /// All attributes of the program.
    readonly attributes: Map<string, ShaderAttribute>;

    /// All uniforms of the program.
    readonly uniforms: Map<string, Uniform>;
};


/// All information about a Vertex Buffer Object (VBO) containing attributes.
type AttributeBuffer = {
    /// The WebGL buffer object.
    readonly glo: WebGLBuffer,

    /// The name of the Attribute Buffer.
    readonly name: string,

    /// The number of Vertices defined in the buffer.
    readonly vertexCount: number,

    /// Interleaved Attributes defined in the buffer. Addressable by name.
    readonly attributes: ReadonlyMap<string, AttributeLayout>,

    /// How the buffer data will be used.
    readonly usage: BufferUsage,
};


/// All information about an Index Buffer Object (IBO) for drawing faces.
type IndexBuffer = {
    /// The WebGL buffer object.
    readonly glo: WebGLBuffer,

    /// The name of the Index Buffer.
    readonly name: string,

    /// The data type of an index.
    readonly type: IndexDataType,

    /// The number of Indices in the buffer.
    readonly size: number,

    /// How the buffer data will be used.
    readonly usage: BufferUsage,

    /// The draw mode (triangles by default).
    readonly drawMode: DrawMode,
};


/// All information about a WebGL Vertex Array Object (VAO).
type VAO = {
    /// The WebGL Vertex Array Object.
    readonly glo: WebGLVertexArrayObject,

    /// The name of the VAO.
    readonly name: string,

    /// The Index Buffer Object.
    readonly ibo: IndexBuffer,

    /// The Attribute Bindings.
    readonly attributes: ReadonlyMap<AttributeLocation, AttributeReference>,
};


/// A 2D, 3D or Cube Texture.
type Texture = {
    /// The WebGL texture object.
    readonly glo: WebGLTexture,

    /// The name of the Texture.
    readonly name: string,

    /// The target of the texture.
    readonly target: TextureTarget,

    /// The width of the texture. In Cubemaps this is the size of one face.
    readonly width: number,

    /// The height of the texture. In Cubemaps this is equal to the height.
    readonly height: number,

    /// The depth of the texture. 2D Textures have a depth of 1.
    readonly depth: number,

    /// The number of mipmap levels.
    readonly levels: number,

    /// The internal format of the texture.
    readonly internalFormat: TextureInternalFormat;

    /// Texture comparison format. Default is TextureCompareFunc.NONE.
    readonly compareFunc: TextureCompareFunc;

    /// The Renderbuffer attachment type.
    readonly attachmentType: AttachmentType.TEXTURE,
};


/// A WebGL Renderbuffer.
type Renderbuffer = {
    /// The WebGL Renderbuffer Object.
    readonly glo: WebGLRenderbuffer,

    /// The name of the Renderbuffer.
    readonly name: string,

    /// The width of the Renderbuffer.
    readonly width: number,

    /// The height of the Renderbuffer.
    readonly height: number,

    /// The internal format of the Renderbuffer.
    readonly internalFormat: RenderbufferInternalFormat;

    /// The Renderbuffer attachment type.
    readonly attachmentType: AttachmentType.RENDERBUFFER,
};


/// A single Attachment for the Framebuffer.
type FramebufferAttachment = Texture | Renderbuffer;


/// Description of an attachment for the Framebuffer.
/// Has a lof of optional fields, because it is user-defined.
type AttachmentDefinition = {
    /// The attachment.
    readonly attachment: FramebufferAttachment,

    /// Which mip-map to attach. Defaults to zero.
    readonly level?: number,

    /// Attachment target (only useful for cube maps).
    readonly target?: TextureDataTarget,

    /// Which layer to attach (only useful for 3D and 2D Array textures).
    readonly layer?: number,
};


/// A WebGL Framebuffer.
type Framebuffer = {
    /// The WebGL framebuffer.
    readonly glo: WebGLFramebuffer,

    /// The name of the framebuffer
    readonly name: string,

    /// Color attachements.
    readonly color: Array<AttachmentDefinition>,

    /// Depth attachment.
    readonly depth: AttachmentDefinition | null,

    /// Stencil attachment.
    readonly stencil: AttachmentDefinition | null,
};


/// A WebGL2 Texture Unit.
/// Is mutable because it is constructed piece by piece.
type TextureUnit = {
    /// Texture bound to the 2D texture target.
    texture_2d?: Texture,

    /// Texture bound to the 3D texture target.
    texture_3d?: Texture,

    /// Texture bound to the cube map texture target.
    texture_cube?: Texture,

    /// Texture bound to the 2D array texture target.
    texture_2d_array?: Texture,
};


/// Everything needed to define and execute a WebGL Draw Call.
type DrawCall = {
    /// The name of the Draw Call.
    readonly name: string,

    /// The Vertex Array Object to use.
    readonly vao: VAO,

    /// The Shader Program to use.
    readonly program: Program,

    /// The number of indices to draw.
    indexCount: number,

    /// The offset in the index buffer.
    indexOffset: number,

    /// The draw mode to use.
    drawMode: DrawMode,

    /// The number of instances to draw.
    instances: number,

    /// Uniform overrides.
    uniform: Record<string, UniformValue>,

    /// Textures bound to uniform sampler locations.
    textures: Record<string, Texture>,

    /// The front-/backface culling mode.
    cullFace?: CullFace,

    /// The depth test mode.
    depthTest?: DepthTest,

    /// The blend function.
    blendFunc?: [BlendFunc, BlendFunc] | [BlendFunc, BlendFunc, BlendFunc, BlendFunc],

    /// The blend equation.
    blendEquation?: BlendEquation | [BlendEquation, BlendEquation],

    /// Whether the draw call should update the depth buffer.
    updateDepthBuffer?: boolean,
};
