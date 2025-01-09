export
{
    loadHDR,
};

import
{
    logWarning,
    throwError,
} from '../dev';


/// High Dynamic Range (HDR) image with RGBE data with 4x8 bytes per texel.
type RGBEImage = {
    data: Uint8Array;
    width: number;
    height: number;
    exposure: number,
};


// =============================================================================
// Public
// =============================================================================

/// High Dynamic Range (HDR) image with floating point data.
type HDRImage = {
    /// The image data in float32 format.
    data: Float32Array;

    /// The width of the image in texels.
    width: number;

    /// The height of the image in texels.
    height: number;
};


/// Load an HDR image from a URL.
async function loadHDR(url: URL): Promise<HDRImage>
{
    const rgbe = await parseHDR(url);
    return {
        data: rgbeToFloat32(rgbe.data, rgbe.exposure),
        width: rgbe.width,
        height: rgbe.height,
    };
}


// =============================================================================
// Internal
// =============================================================================


/// This implements https://en.wikipedia.org/wiki/RGBE_image_format
/// For more information, see https://radsite.lbl.gov/radiance/refer/filefmts.pdf
/// (.pic chapter) and https://www.graphics.cornell.edu/~bjw/rgbe.html
/// Copied, adapted (and bug fixed) from
///     https://github.com/enkimute/hdrpng.js/blob/master/hdrpng.js
async function parseHDR(url: URL): Promise<RGBEImage>
{
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const array = new Uint8Array(buffer);

    // Ingest the header.
    let header: string = '';
    let readPos: number = 0;
    while (!header.match(/\n\n[^\n]+\n/g) && readPos < array.length) {
        header += String.fromCharCode(array[readPos++]);
    }
    if (readPos >= array.length) {
        throwError(() => 'HDR header not found');
    }
    if (!header.startsWith('#?RADIANCE\n')) {
        throwError(() => 'Missing #?RADIANCE identifier');
    }

    // Check for the RGBE format.
    const format = header.match(/FORMAT=(.*)$/m)?.[1];
    if (format != '32-bit_rle_rgbe') {
        if (format === '32-bit_rle_xyze') {
            throwError(() => 'XYZE HDR format is not supported');
        }
        throwError(() => `Not a valid HDR format: ${format}`);
    }

    // Check for EXPOSURE values.
    let exposure: number = 1;
    for (const match of header.matchAll(/EXPOSURE=([^\n]*)\n/gm)) {
        const value = parseFloat(match[1]);
        if (isNaN(value)) {
            throwError(() => 'Invalid HDR exposure');
        }
        exposure *= value;
    }

    // Parse the image resolution.
    const resolution = header.split(/\n/).reverse()[1].split(' ');
    const width = parseInt(resolution[3]);
    const height = parseInt(resolution[1]);
    if (width < 8 || width > 0x7fff || height < 8 || height > 0x7fff) {
        throwError(() => 'Invalid HDR resolution');
    }

    // Check for new run-length encoding (RLE).
    let useRunLengthEncoding = true;
    if (array[readPos] != 2 || array[readPos + 1] != 2 || (array[readPos + 2] & 0x80)) {
        useRunLengthEncoding = false;
    }

    // Read the scanlines into the image buffer.
    let image: Uint8Array;
    if (useRunLengthEncoding) {
        image = new Uint8Array(width * height * 4);

        let writePos: number = 0;
        for (let lineItr = 0; lineItr < height; lineItr++) {
            const rgbe = array.slice(readPos, readPos += 4);
            if ((rgbe[2] << 8) + rgbe[3] != width) {
                throwError(() => 'HDR line mismatch');
            }

            // Read the four channels into a single scanline buffer.
            const scanline = Array(width * 4);
            for (var i = 0; i < 4; i++) {
                let channelItr = i * width;
                const channelEnd = (i + 1) * width;
                while (channelItr < channelEnd) {
                    let [count, value] = array.slice(readPos, readPos += 2);
                    // A run of the same value.
                    if (count > 128) {
                        count -= 128;
                        while (count-- > 0) {
                            scanline[channelItr++] = value;
                        }
                    }
                    // A non-run of different values.
                    else {
                        count -= 1;
                        scanline[channelItr++] = value;
                        while (count-- > 0) {
                            scanline[channelItr++] = array[readPos++];
                        }
                    }
                }
            }

            // Interleave the scanlines into the image buffer.
            for (var i = 0; i < width; i++) {
                image[writePos++] = scanline[i + width * 0];
                image[writePos++] = scanline[i + width * 1];
                image[writePos++] = scanline[i + width * 2];
                image[writePos++] = scanline[i + width * 3];
            }
        }
    }

    // No RLE encoding.
    else {
        image = array.slice(readPos);

        // Check for old RLE encoding.
        for (let i = 0; i < image.length; i += 4) {
            if (image[i] == 1 && image[i + 1] == 1 && image[i + 2] == 1) {
                throwError(() => 'Old HDR RLE encoding is not supported');
                // If needed, see hdrpng.js for an implementation (and the docs for an explanation).
            }
        }
    }

    return { data: image, width, height, exposure };
}


/// Convert an RGBE buffer to float32.
/// @param rgbe The input buffer in RGBE format.
/// @returns The output buffer in float32 format.
function rgbeToFloat32(rgbe: Uint8Array, exposure: number): Float32Array
{
    const length = rgbe.byteLength / 4;
    const result = new Float32Array(length * 3);
    for (var i = 0; i < length; i++) {
        const e = rgbe[i * 4 + 3];
        if (e == 0) {
            result[i * 3 + 0] = 0;
            result[i * 3 + 1] = 0;
            result[i * 3 + 2] = 0;
        } else {
            const f = Math.pow(2, e - (128 + 8)) / exposure;
            result[i * 3 + 0] = rgbe[i * 4 + 0] * f;
            result[i * 3 + 1] = rgbe[i * 4 + 1] * f;
            result[i * 3 + 2] = rgbe[i * 4 + 2] * f;
        }
    }
    return result;
}


/// Convert a float buffer to a RGB9_E5 buffer.
/// See https://www.khronos.org/registry/OpenGL/extensions/EXT/EXT_texture_shared_exponent.txt
/// @param buffer Color input buffer with 16 bit floating point values (as 32bit float).
///    The buffer must be in RGB order and only contain positive values.
/// @returns A 32bit uint32 array in RGB9_E5
function floatToRgb9_e5(buffer: Float32Array): Uint32Array
{
    const maxInput = 65408.0;
    const pixelCount = buffer.length / 3;
    const result = new Uint32Array(pixelCount);
    for (let itr = 0; itr < pixelCount; itr++) {
        const r = Math.max(0, Math.min(maxInput, buffer[itr * 3 + 0]));
        const g = Math.max(0, Math.min(maxInput, buffer[itr * 3 + 1]));
        const b = Math.max(0, Math.min(maxInput, buffer[itr * 3 + 2]));
        const maxColor = Math.max(Math.max(r, g), b);
        let sharedExponent = Math.max(-16, Math.floor(Math.log2(maxColor))) + 16;
        let denom = Math.pow(2, sharedExponent - 24);
        if (Math.floor(maxColor / denom + 0.5) == 511) {
            denom *= 2;
            sharedExponent += 1;
        }
        result[itr] =
            (Math.floor(r / denom + 0.5) << 23) +
            (Math.floor(g / denom + 0.5) << 14) +
            (Math.floor(b / denom + 0.5) << 5) +
            (sharedExponent | 0);
    }
    return result;
}


/// Convert a RGB9_E5 buffer to a float buffer.
/// @param buffer The input buffer in RGB9_E5 format.
/// @returns The output buffer in float format.
function rgb9_e5ToFloat(buffer: Uint32Array): Float32Array
{
    const pixelCount = buffer.length;
    const result = new Float32Array(pixelCount * 3);
    for (let itr = 0; itr < pixelCount; itr++) {
        const value = buffer[itr];
        const sharedExponent = Math.pow(2, (value & 31) - 24);
        result[itr * 3 + 0] = ((value >>> 23)) * sharedExponent;
        result[itr * 3 + 1] = ((value >>> 14) & 511) * sharedExponent;
        result[itr * 3 + 2] = ((value >>> 5) & 511) * sharedExponent;
    }
    return result;
}


/// Convert an RGBE buffer to LDR with given exposure and display gamma.
/// @param rgbe The input buffer in RGBE format.
/// @param exposure Optional exposure value. (1=default, 2=1 step up, 3=2 steps up, -2 = 3 steps down)
/// @param gamma Optional display gamma to respect. (1.0 = linear, 2.2 = default monitor)
/// @returns The output buffer in RGBA8 format.
function rgbeToRgba(rgbe: Uint8Array, exposure: number = 1, gamma: number = 2.2): Uint8ClampedArray
{
    exposure = Math.pow(2, exposure) / 2;

    const one_over_gamma = 1 / gamma;
    const length = rgbe.byteLength / 4;
    const result = new Uint8ClampedArray(length * 4);
    for (let i = 0; i < length; i++) {
        const s = exposure * Math.pow(2, rgbe[i * 4 + 3] - (128 + 8));
        result[i * 4 + 0] = 255 * Math.pow(rgbe[i * 4 + 0] * s, one_over_gamma);
        result[i * 4 + 1] = 255 * Math.pow(rgbe[i * 4 + 1] * s, one_over_gamma);
        result[i * 4 + 2] = 255 * Math.pow(rgbe[i * 4 + 2] * s, one_over_gamma);
        result[i * 4 + 3] = 255;
    }
    return result;
}


/// Convert an float buffer to LDR with given exposure and display gamma.
/// @param buffer The input buffer in floating point format.
/// @param exposure Optional exposure value. (1=default, 2=1 step up, 3=2 steps up, -2 = 3 steps down)
/// @param gamma Optional display gamma to respect. (1.0 = linear, 2.2 = default monitor)
/// @returns The output buffer in RGBA8 format.
function floatToRgba(buffer: Float32Array, exposure: number = 1, gamma: number = 2.2): Uint8ClampedArray
{
    exposure = Math.pow(2, exposure) / 2;

    const one_over_gamma = 1 / gamma;
    const length = buffer.length / 3;
    const result = new Uint8ClampedArray(length * 4);
    for (let i = 0; i < length; i++) {
        result[i * 4 + 0] = 255 * Math.pow(buffer[i * 3 + 0] * exposure, one_over_gamma);
        result[i * 4 + 1] = 255 * Math.pow(buffer[i * 3 + 1] * exposure, one_over_gamma);
        result[i * 4 + 2] = 255 * Math.pow(buffer[i * 3 + 2] * exposure, one_over_gamma);
        result[i * 4 + 3] = 255;
    }
    return result;
}