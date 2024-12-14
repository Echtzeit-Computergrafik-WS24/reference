/// Change this to `false` to produce a leaner production build.
declare const DEBUG: boolean;
export const GLANCE_DEBUG = (typeof DEBUG === 'undefined') ? true : DEBUG;

// =============================================================================
// Logging
// =============================================================================


/// Logs a message to the console if GLANCE_DEBUG is true.
export function logInfo(message: () => string): void
{
    if (GLANCE_DEBUG) {
        console.log(message());
    }
}
// TODO: apparently the pruning works even if the message is not a function


/// Logs a warning to the console if GLANCE_DEBUG is true.
export function logWarning(message: () => string): void
{
    if (GLANCE_DEBUG) {
        console.warn(message());
    }
}


/// Logs an error to the console if GLANCE_DEBUG is true.
export function logError(message: () => string): void
{
    if (GLANCE_DEBUG) {
        console.error(message());
        console.trace();
    }
}


/// Throws an error with a detailed message if GLANCE_DEBUG is true,
/// otherwise throws a generic error.
export function throwError(message: () => string): never
{
    if (GLANCE_DEBUG) {
        throw new Error(message());
    }
    else { // LATER: Add error ids for release mode.
        throw new Error("An error occurred.");
    }
}
// TODO: I cannot get this function to prune away, maybe remove it and throw raw errors instead?
// Actually no, as a function this can be mimized further than a raw throw.
// The best way to avoid having the error strings in the final build is to use:
//     GLANCE_DEBUG ? `Long error here` : "Short error here"


/// Throws an error if the given condition is false.
/// @param condition Condition funtion producing a truth value and error message.
///  Is a function to avoid evaluating the condition if GLANCE_DEBUG is false.
// @ts-ignore: Unused function
export function assert(condition: any, message?: () => string): asserts condition
{
    if (GLANCE_DEBUG) {
        if (!condition) {
            throw new Error(message ? message() : "Assertion failed.");
        }
    }
}


/// Ensures that the given value is not undefined.
export function assertDefined<T>(value: T): asserts value is NonNullable<T>
{
    if (value === undefined || value === null) {
        throw new Error(
            `Expected 'val' to be defined, but received ${value}`
        );
    }
}


// =============================================================================
// Javascript
// =============================================================================


// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncFunction
export const AsyncFunction = async function () { }.constructor;


/// Returns true if the given value is a primitive.
export function isPrimitive(value: any): value is null | undefined | string | number | boolean
{
    return value === null || value === undefined || typeof value !== "object";
}


/// Deep comparison between two objects.
export function areEqual<T>(a: T, b: T): boolean
{
    if (a === b) return true;
    if (a === null || b === null || a === undefined || b === undefined) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a !== "object") return false;
    if (Array.isArray(a)) {
        if (!Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!areEqual(a[i], b[i])) return false;
        }
    } else {
        const keysA = Object.keys(a);
        if (keysA.length !== Object.keys(b).length) return false;
        for (const key of keysA) {
            if (!areEqual((a as any)[key], (b as any)[key])) return false;
        }
    }
    return true;
}

/// Return a deep copy of the given value.
/// This is copied from klona © MIT
/// See https://github.com/lukeed/klona/blob/master/src/index.js
export function clone<T>(value: T): T
{
    if (typeof value !== 'object') return value;
    if (value === null) return value;

    let k, tmp: any;
    const str: string = Object.prototype.toString.call(value);

    if (str === '[object Object]') {
        if (value.constructor !== Object && typeof value.constructor === 'function') {
            tmp = new (value as any).constructor();
            for (k in value) {
                if (value.hasOwnProperty(k) && tmp[k] !== (value as any)[k]) {
                    tmp[k] = clone((value as any)[k]);
                }
            }
        } else {
            tmp = {}; // null
            for (k in value) {
                if (k === '__proto__') {
                    Object.defineProperty(tmp, k, {
                        value: clone((value as any)[k]),
                        configurable: true,
                        enumerable: true,
                        writable: true,
                    });
                } else {
                    tmp[k] = clone((value as any)[k]);
                }
            }
        }
        return tmp;
    }

    if (str === '[object Array]') {
        k = (value as Array<any>).length;
        for (tmp = Array(k); k--;) {
            tmp[k] = clone((value as any)[k]);
        }
        return tmp;
    }

    if (str === '[object Set]') {
        tmp = new Set;
        (value as any).forEach(function (val: any)
        {
            tmp.add(clone(val));
        });
        return tmp;
    }

    if (str === '[object Map]') {
        tmp = new Map;
        (value as any).forEach(function (val: any, key: any)
        {
            tmp.set(clone(key), clone(val));
        });
        return tmp;
    }

    if (str === '[object Date]') {
        return new Date(+value) as T;
    }

    if (str === '[object RegExp]') {
        tmp = new RegExp((value as any).source, (value as any).flags);
        tmp.lastIndex = (value as any).lastIndex;
        return tmp;
    }

    if (str === '[object DataView]') {
        return new (value as any).constructor(clone((value as any).buffer));
    }

    if (str === '[object ArrayBuffer]') {
        return (value as any).slice(0);
    }

    // ArrayBuffer.isView(x)
    // ~> `new` bcuz `Buffer.slice` => ref
    if (str.slice(-6) === 'Array]') {
        return new (value as any).constructor(value);
    }

    return value;
}

/// Perform a shallow copy from the origin to the target in-place.
export function shallowCopy<T extends {}>(target: T, origin: T): void
{
    // If the target is a primitive, we cannot update it in-place.
    if (isPrimitive(target)) {
        throwError(() => `Cannot copy to a null / undefined value in-place.`);
    }
    // If the target has a `copy` method, use it.
    if (typeof (target as any).copy === 'function') {
        (target as any).copy(origin);
    }
    // If the target is an array create a shallow copy.
    else if (Array.isArray(target)) {
        if (Array.isArray(origin)) {
            target.splice(0, target.length, ...origin);
        } else if ((origin as any).isMathPrimitive) { // glance.Vec2, glance.Vec3, etc.
            target.splice(0, target.length, ...(origin as any));
        } else {
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


/// See https://stackoverflow.com/a/6713782
export function objectEquals(x: Record<string, any>, y: Record<string, any>): boolean
{
    if (x === y) return true;
    // if both x and y are null or undefined and exactly the same

    if (!(x instanceof Object) || !(y instanceof Object)) return false;
    // if they are not strictly equal, they both need to be Objects

    if (x.constructor !== y.constructor) return false;
    // they must have the exact same prototype chain, the closest we can do is
    // test there constructor.

    for (var p in x) {
        if (!x.hasOwnProperty(p)) continue;
        // other properties were tested using x.constructor === y.constructor

        if (!y.hasOwnProperty(p)) return false;
        // allows to compare x[ p ] and y[ p ] when set to undefined

        if (x[p] === y[p]) continue;
        // if they have the same strict value or identity then they are equal

        if (typeof (x[p]) !== "object") return false;
        // Numbers, Strings, Functions, Booleans must be strictly equal

        if (!objectEquals(x[p], y[p])) return false;
        // Objects and Arrays must be tested recursively
    }

    for (p in y)
        if (y.hasOwnProperty(p) && !x.hasOwnProperty(p))
            return false;
    // allows x[ p ] to be set to undefined

    return true;
}

// =============================================================================
// Typescript
// =============================================================================


/// Use this function to assert that a value is unreachable.
/// This is useful to check that all cases of a switch statement are handled.
export function assertUnreachable(x: never): never
{
    throw new Error(`Unexpected object: ${x}`);
}


/// Type extensions
declare global
{
    /// The Array.at method is not yet supported by TypeScript.
    interface Array<T>
    {
        at(index: number): T;
    }

    /// Extract the K from Map<K,V>.
    type KeyOf<T> = T extends Map<infer I, any> ? I : never;

    /// Extract the V from Map<K,V> or Record<K,V>.
    type ValueOf<T> =
        T extends Map<any, infer I> ? I :
        T extends Record<string, infer I> ? I :
        never;

    /// Turns a ReadonlyMap<K,V> into a Map<K,V>.
    type MutableMap<T> = Map<
        T extends ReadonlyMap<infer I, any> ? I : never,
        T extends ReadonlyMap<any, infer I> ? I : never>;

    /// At least one, but can be more. Never empty.
    type Some<T> = [T, ...T[]];

    /// A sequence needs at least two elements.
    type Sequence<T> = [T, T, ...T[]];

    /// A fixed-size Array type.
    /// See https://stackoverflow.com/a/52490977
    type Tuple<T, N extends number> = N extends N ? number extends N ? T[] : _TupleOf<T, N, []> : never;
    type _TupleOf<T, N extends number, R extends unknown[]> = R['length'] extends N ? R : _TupleOf<T, N, [T, ...R]>;

    /// A type that can be used to create a new instance. For example a class.
    type Type<T> = { new(...args: any[]): T; };

    /// Helper types for Branded types.
    /// Use to create a new type that is a subtype of `T` and is distinguishable
    /// from `T` by the type`B`.
    /// Example:
    /// ```typescript
    ///     type Email = Branded<string, "Email">;
    ///     function sendEmail(email: Email) { ... }
    ///     sendEmail("test") // Error
    ///     sendEmail("test" as Email) // OK
    /// ```
    /// See https://egghead.io/blog/using-branded-types-in-typescript
    type Branded<T, B> = T & Brand<B>;

    /// Extract a data-only subset of a (class) type.
    /// Discards all methods from the type.
    type DataOnly<T> = Pick<T, {
        [K in keyof T]: T[K] extends Function ? never : K;
    }[keyof T]>;

    /// Simulating static_assert in TypeScript.
    /// Use by declaring a new type with the condition,
    /// e.g. `type MyType = StaticAssert<true>;`.
    type StaticAssert<Condition extends true> = Condition;

    /// Make selected properties of T optional.
    /// Use like: `MakeOptional<OriginalType, "optional1" | "optional2">`.
    type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
}

/// See `Branded<T, B>` for more information.
declare const __brand: unique symbol;
type Brand<B> = { [__brand]: B; };
