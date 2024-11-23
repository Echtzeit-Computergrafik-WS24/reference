// =============================================================================
// Logging
// =============================================================================
/// The verbose code contains more and detailled log messages.
const VERBOSE = true;
/// Logs a message to the console if VERBOSE is true.
/// @param message Message to log if VERBOSE is true.
///  Is a function to avoid evaluating the condition if VERBOSE is false.
// @ts-ignore: Unused function
export function logInfo(message) {
    if (VERBOSE) {
        console.log(message());
    }
}
/// Logs a warning to the console if VERBOSE is true.
/// @param message Message to log if VERBOSE is true.
///  Is a function to avoid evaluating the condition if VERBOSE is false.
// @ts-ignore: Unused function
export function logWarning(message) {
    if (VERBOSE) {
        console.warn(message());
    }
}
/// Logs an error to the console if VERBOSE is true.
/// @param message Message to log if VERBOSE is true.
///  Is a function to avoid evaluating the condition if VERBOSE is false.
// @ts-ignore: Unused function
export function logError(message) {
    if (VERBOSE) {
        console.error(message());
        console.trace();
    }
}
/// Throws an error with a detailed message if VERBOSE is true,
/// otherwise throws a generic error.
/// @param message Error message to throw if VERBOSE is true.
///  Is a function to avoid evaluating the condition if VERBOSE is false.
// @ts-ignore: Unused function
export function throwError(message) {
    if (VERBOSE) {
        throw new Error(message());
    }
    else { // LATER: Add error ids for release mode.
        throw new Error("An error occurred.");
    }
}
/// Throws an error if the given condition is false.
/// @param condition Condition funtion producing a truth value and error message.
///  Is a function to avoid evaluating the condition if VERBOSE is false.
// @ts-ignore: Unused function
export function assert(condition, message) {
    if (VERBOSE) {
        if (!condition) {
            throw new Error(message ? message() : "Assertion failed.");
        }
    }
}
/// Ensures that the given value is not undefined.
export function assertDefined(value) {
    if (value === undefined || value === null) {
        throw new Error(`Expected 'val' to be defined, but received ${value}`);
    }
}
// =============================================================================
// Javascript
// =============================================================================
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncFunction
export const AsyncFunction = async function () { }.constructor;
/// Returns true if the given value is a primitive.
export function isPrimitive(value) {
    return value === null || value === undefined || typeof value !== "object";
}
/// Deep comparison between two objects.
export function areEqual(a, b) {
    if (a === b)
        return true;
    if (a === null || b === null || a === undefined || b === undefined)
        return false;
    if (typeof a !== typeof b)
        return false;
    if (typeof a !== "object")
        return false;
    if (Array.isArray(a)) {
        if (!Array.isArray(b))
            return false;
        if (a.length !== b.length)
            return false;
        for (let i = 0; i < a.length; i++) {
            if (!areEqual(a[i], b[i]))
                return false;
        }
    }
    else {
        const keysA = Object.keys(a);
        if (keysA.length !== Object.keys(b).length)
            return false;
        for (const key of keysA) {
            if (!areEqual(a[key], b[key]))
                return false;
        }
    }
    return true;
}
/// Return a deep copy of the given value.
/// This is copied from klona © MIT
/// See https://github.com/lukeed/klona/blob/master/src/index.js
export function clone(value) {
    if (typeof value !== 'object')
        return value;
    if (value === null)
        return value;
    let k, tmp;
    const str = Object.prototype.toString.call(value);
    if (str === '[object Object]') {
        if (value.constructor !== Object && typeof value.constructor === 'function') {
            tmp = new value.constructor();
            for (k in value) {
                if (value.hasOwnProperty(k) && tmp[k] !== value[k]) {
                    tmp[k] = clone(value[k]);
                }
            }
        }
        else {
            tmp = {}; // null
            for (k in value) {
                if (k === '__proto__') {
                    Object.defineProperty(tmp, k, {
                        value: clone(value[k]),
                        configurable: true,
                        enumerable: true,
                        writable: true,
                    });
                }
                else {
                    tmp[k] = clone(value[k]);
                }
            }
        }
        return tmp;
    }
    if (str === '[object Array]') {
        k = value.length;
        for (tmp = Array(k); k--;) {
            tmp[k] = clone(value[k]);
        }
        return tmp;
    }
    if (str === '[object Set]') {
        tmp = new Set;
        value.forEach(function (val) {
            tmp.add(clone(val));
        });
        return tmp;
    }
    if (str === '[object Map]') {
        tmp = new Map;
        value.forEach(function (val, key) {
            tmp.set(clone(key), clone(val));
        });
        return tmp;
    }
    if (str === '[object Date]') {
        return new Date(+value);
    }
    if (str === '[object RegExp]') {
        tmp = new RegExp(value.source, value.flags);
        tmp.lastIndex = value.lastIndex;
        return tmp;
    }
    if (str === '[object DataView]') {
        return new value.constructor(clone(value.buffer));
    }
    if (str === '[object ArrayBuffer]') {
        return value.slice(0);
    }
    // ArrayBuffer.isView(x)
    // ~> `new` bcuz `Buffer.slice` => ref
    if (str.slice(-6) === 'Array]') {
        return new value.constructor(value);
    }
    return value;
}
/// Perform a shallow copy from the origin to the target in-place.
export function shallowCopy(target, origin) {
    // If the target is a primitive, we cannot update it in-place.
    if (isPrimitive(target)) {
        throwError(() => `Cannot copy to a null / undefined value in-place.`);
    }
    // If the target has a `copy` method, use it.
    if (typeof target.copy === 'function') {
        target.copy(origin);
    }
    // If the target is an array create a shallow copy.
    else if (Array.isArray(target)) {
        if (Array.isArray(origin)) {
            target.splice(0, target.length, ...origin);
        }
        else if (origin.isMathPrimitive) { // glance.Vec2, glance.Vec3, etc.
            target.splice(0, target.length, ...origin);
        }
        else {
            throwError(() => `Cannot copy an array to a non-array.`);
        }
    }
    // Otherwise, the target has to be an object and we can update it in-place.
    else {
        for (var key in target) {
            delete target[key];
        }
        Object.assign(target, origin);
    }
}
// =============================================================================
// Typescript
// =============================================================================
/// Use this function to assert that a value is unreachable.
/// This is useful to check that all cases of a switch statement are handled.
export function assertUnreachable(x) {
    throw new Error(`Unexpected object: ${x}`);
}
