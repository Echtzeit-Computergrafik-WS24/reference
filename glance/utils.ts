import
{
    throwError,
} from "./dev.js";


// =============================================================================
// Array Functions
// =============================================================================


/// Creates a new array with the given pattern repeated the given number of times.
export function repeat(pattern: any[], times: number): any[]
{
    return Array.from({ length: times }, () => pattern).flat();
}


/// Like Array.slice, but takes a width of the slice instead of and end position.
export function slice<T, N extends number>(array: Array<T>, start: number, width: N): Tuple<T, N>
{
    return array.slice(start, start + width) as Tuple<T, N>;
}


/// Interleave the given arrays, taking a number of elements (quantity) from each array in turn.
/// @param arrays An array of arrays to interleave.
/// @param quantities Either an array of quantities to take from each array,
/// or a single quantity to take from each array. Defaults to 1.
/// @returns A new array with the interleaved values.
export function interleaveArrays(arrays: any[][], quantities: number | number[] = 1): any[]
{
    // Ensure that all arrays are the same size.
    if (arrays.length === 0) {
        return [];
    }

    // If there is only one array, return it.
    if (arrays.length === 1) {
        return arrays[0];
    }

    // Ensure that quantities is an array of the correct size.
    if (!Array.isArray(quantities)) {
        quantities = repeat([quantities], arrays.length);
    } else if (quantities.length !== arrays.length) {
        throwError(() => `'quantities' must be either a number or an array with the same length as 'arrays'.\n` +
            `    'quantities' length: ${(quantities as number[]).length}\n` +
            `    'arrays' length: ${arrays.length}`
        );
    }

    // Ensure that the every quantity is valid.
    const bandCount = arrays[0].length / quantities[0];
    for (let i = 0; i < arrays.length; i++) {
        const quantity = quantities[i];
        if (quantity < 1) {
            throwError(() => `'quantity' must be greater than 0, but the value at index ${i} is ${quantity}`);
        }
        if (quantity % 1 !== 0) {
            throwError(() => `'quantity' must be an integer, but the value at index ${i} is ${quantity}`);
        }
        if (arrays[i].length % quantity !== 0) {
            throwError(() => `The length of the corresponding array must be a multiple of 'quantity'\n` +
                `    but the quantity at index ${i} is ${quantity}\n` +
                `    whereas the length of the corresponding array is ${arrays[i].length}`
            );
        }
        if (arrays[i].length / quantity !== bandCount) {
            throwError(() => `All arrays must have the same number of quantities,\n` +
                `    but array ${i} of size ${arrays[i].length} contains ${arrays[i].length / quantity} times ${quantity} quantities,\n` +
                `    whereas the first array conttains ${arrays[0].length / quantity} times ${(quantities as number[])[0]} quantities.`
            );
        }
    }

    // Interleave the arrays.
    const interleaved: any[] = [];
    for (let band = 0; band < bandCount; band++) {
        for (let arrayIndex = 0; arrayIndex < arrays.length; arrayIndex++) {
            const array = arrays[arrayIndex];
            const quantity = quantities[arrayIndex];
            interleaved.push(...array.slice(band * quantity, (band + 1) * quantity));
        }
    }

    return interleaved;
}


// =============================================================================
// Web
// =============================================================================


/// Loads the code snippet from the given URL.
/// @param url URL of the code snippet.
/// @returns The code snippet.
export async function loadCodeSnippet(url: string): Promise<string>
{
    try {
        const response = await fetch(url);
        return await response.text();
    } catch (error) {
        throw new Error(`Failed to load code snippet from ${url}: ${error}`);
    }
}