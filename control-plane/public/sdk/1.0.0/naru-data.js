/** Naru Data SDK 1.0.0. This release is still under active development. */
export class NaruDataError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = "NaruDataError";
    this.status = status;
    this.code =
      code || (status === 401 ? "OWNER_SESSION_EXPIRED" : "REQUEST_FAILED");
  }
}
// One scope keeps the deadline active until the response body has been read.
function requestScope({ signal, timeoutMs = 30000 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 2147483647)
    throw new TypeError(
      "timeoutMs must be an integer between 0 and 2147483647.",
    );
  if (signal !== undefined && !(signal instanceof AbortSignal))
    throw new TypeError("signal must be an AbortSignal.");
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timer = timeoutMs
    ? setTimeout(
        () =>
          controller.abort(
            new DOMException("Request timed out.", "TimeoutError"),
          ),
        timeoutMs,
      )
    : undefined;
  return {
    signal: controller.signal,
    check() {
      if (!controller.signal.aborted) return;
      const cause = controller.signal.reason;
      const timeout = cause?.name === "TimeoutError";
      const error = new NaruDataError(
        0,
        timeout ? "Request timed out." : "Request aborted.",
        timeout ? "REQUEST_TIMEOUT" : "REQUEST_ABORTED",
      );
      error.cause = cause;
      throw error;
    },
    close() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    },
  };
}
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const idValue = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
const timestamp = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
const written = (value) =>
  object(value) &&
  idValue(value.id) &&
  Number.isSafeInteger(value.version) &&
  value.version > 0;
const documentValue = (value) =>
  written(value) &&
  Object.hasOwn(value, "data") &&
  timestamp(value.created_at) &&
  timestamp(value.updated_at);
const fileValue = (value) =>
  object(value) &&
  idValue(value.id) &&
  value.status === "ready" &&
  typeof value.name === "string" &&
  typeof value.contentType === "string" &&
  Number.isSafeInteger(value.size) &&
  value.size > 0 &&
  typeof value.url === "string" &&
  Object.hasOwn(value, "metadata") &&
  timestamp(value.created_at) &&
  timestamp(value.updated_at);
const success = (value) => object(value) && value.success === true;
function invalidResponse(status) {
  return new NaruDataError(
    status,
    "Invalid response from the database.",
    "INVALID_RESPONSE",
  );
}
function validateResponse(url, method, body, result, status) {
  const path = url.pathname.split("/").slice(4);
  let valid;
  if (path[0] === "_batch") {
    valid =
      Array.isArray(result.results) &&
      result.results.length === body.operations.length &&
      result.results.every((item, index) =>
        body.operations[index].type === "delete"
          ? success(item)
          : written(item),
      );
  } else if (path[0] === "_files") {
    if (method === "DELETE") valid = success(result);
    else if (method === "POST") {
      let upload;
      try {
        upload = new URL(result.uploadUrl);
      } catch {
        /* invalid */
      }
      valid =
        object(result.file) &&
        idValue(result.file.id) &&
        result.file.status === "pending" &&
        result.method === "PUT" &&
        object(result.headers) &&
        Object.values(result.headers).every(
          (value) => typeof value === "string",
        ) &&
        upload &&
        !upload.username &&
        !upload.password &&
        (upload.protocol === "https:" ||
          (upload.protocol === "http:" &&
            ["localhost", "127.0.0.1", "[::1]"].includes(upload.hostname)));
    } else if (path.length > 1) valid = fileValue(result.file);
    else
      valid =
        Array.isArray(result.files) &&
        result.files.every(fileValue) &&
        object(result.usage) &&
        ["bytes", "count", "pending", "maxBytes"].every(
          (key) =>
            Number.isSafeInteger(result.usage[key]) && result.usage[key] >= 0,
        );
  } else if (method === "DELETE") valid = success(result);
  else if (method !== "GET") valid = written(result);
  else if (path.length > 1) valid = documentValue(result.document);
  else if (url.searchParams.get("count") === "1")
    valid = Number.isSafeInteger(result.count) && result.count >= 0;
  else
    valid =
      Array.isArray(result.documents) &&
      result.documents.every(documentValue) &&
      (result.nextCursor === null ||
        (typeof result.nextCursor === "string" &&
          result.nextCursor.length > 0));
  if (!valid) throw invalidResponse(status);
}
// Reject values JSON.stringify would silently discard or coerce.
function validateJson(value, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object" || ancestors.has(value))
    throw new TypeError(
      "Data must contain only finite JSON values without cycles.",
    );
  const array = Array.isArray(value);
  if (
    !array &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    throw new TypeError(
      "Data must use plain objects and arrays; convert dates to strings explicitly.",
    );
  ancestors.add(value);
  const keys = Reflect.ownKeys(value).filter(
    (key) => !(array && key === "length"),
  );
  if (array && keys.length !== value.length)
    throw new TypeError(
      "Data arrays must not contain holes or extra properties.",
    );
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      typeof key !== "string" ||
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      (array && !/^(0|[1-9][0-9]*)$/.test(key))
    )
      throw new TypeError(
        "Data must contain only enumerable JSON values, without getters or symbols.",
      );
    validateJson(descriptor.value, ancestors);
  }
  ancestors.delete(value);
}
// A phone camera hands over 40 MB and 8000 px for a cover image a site will
// display at 1200. Re-encoding before the authorization request keeps the
// declared size honest, so the server's finalize check still matches, and the
// original never crosses the wire.
const DECODABLE = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  // Safari decodes what iPhones actually store. The media library rejects
  // these types, so transcoding here is the only way such a photo lands.
  "image/heic",
  "image/heif",
]);
const ENCODABLE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
function imageSettings(image = {}, original = false) {
  if (typeof original !== "boolean")
    throw new TypeError("original must be a boolean.");
  if (original) return null;
  if (!object(image)) throw new TypeError("image must be an options object.");
  const {
    maxDimension = 2048,
    quality = 0.82,
    type = "image/webp",
    maxBytes = 500 * 1024,
  } = image;
  if (
    !Number.isInteger(maxDimension) ||
    maxDimension < 1 ||
    maxDimension > 16384
  )
    throw new TypeError("maxDimension must be an integer between 1 and 16384.");
  if (typeof quality !== "number" || !(quality > 0) || quality > 1)
    throw new TypeError(
      "quality must be a number greater than 0 and at most 1.",
    );
  if (!Object.hasOwn(ENCODABLE, type))
    throw new TypeError(
      "image type must be image/webp, image/jpeg or image/png.",
    );
  if (!Number.isInteger(maxBytes) || maxBytes < 1)
    throw new TypeError("maxBytes must be a positive integer.");
  return { maxDimension, quality, type, maxBytes };
}
// Browsers substitute image/png when they cannot encode the requested type, so
// callers check blob.type before trusting it.
function encodeCanvas(canvas, { type, quality }) {
  if (typeof canvas.convertToBlob === "function")
    return canvas.convertToBlob({ type, quality });
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
function newCanvas(width, height) {
  if (typeof OffscreenCanvas === "function")
    return new OffscreenCanvas(width, height);
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
// Quality alone rarely reaches a byte budget from a 12 megapixel photo, and
// pixels alone throw away detail the budget could have afforded. Spend quality
// first down to a floor worth looking at, then shed pixels.
const MIN_QUALITY = 0.4;
const QUALITY_STEP = 0.12;
const ATTEMPTS = 6;
async function encodeWithin(bitmap, settings, size) {
  let [width, height] = size;
  let quality = settings.quality;
  let best;
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const canvas = newCanvas(width, height);
    const context = canvas?.getContext("2d", {
      alpha: settings.type !== "image/jpeg",
    });
    if (!context) return best;
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await encodeCanvas(canvas, { type: settings.type, quality });
    // An encoder that ignored the requested type cannot be reasoned about, and
    // its bytes would be declared under a type they are not.
    if (!blob?.size || blob.type !== settings.type) return best;
    if (!best || blob.size < best.size) best = blob;
    if (blob.size <= settings.maxBytes) return blob;
    // PNG is lossless, so quality is not a dial it has; only fewer pixels help.
    if (quality > MIN_QUALITY && settings.type !== "image/png") {
      // Rounded so repeated subtraction does not drift into 0.45999999999999996.
      quality = Math.max(
        MIN_QUALITY,
        Math.round((quality - QUALITY_STEP) * 100) / 100,
      );
      continue;
    }
    // Bytes track area, so each edge moves by the square root of how far over
    // the last attempt landed: never more than half at a time, and never so
    // little that rounding cancels it — landing barely over budget is exactly
    // when a step of zero would strand the result above it.
    const ratio = Math.min(
      0.95,
      Math.max(0.5, Math.sqrt(settings.maxBytes / blob.size)),
    );
    const next = [
      Math.max(1, Math.round(width * ratio)),
      Math.max(1, Math.round(height * ratio)),
    ];
    // Rounding can stall on tiny images; stop rather than spin.
    if (next[0] === width && next[1] === height) return best;
    [width, height] = next;
  }
  return best;
}
// The object key takes its extension from the name while the content type is
// declared separately; a .heic key served as WebP is a confusing public URL.
function renameExtension(name, type) {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name).slice(
    0,
    254 - ENCODABLE[type].length,
  );
  return `${base}.${ENCODABLE[type]}`;
}
async function downscaleImage(file, settings) {
  if (
    !settings ||
    !DECODABLE.has(file.type) ||
    typeof createImageBitmap !== "function"
  )
    return file;
  let bitmap;
  try {
    // Canvas discards EXIF, so orientation is baked in here or every portrait
    // phone photo is published on its side.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Undecodable here is not undecodable everywhere; leave the verdict to the
    // server's own type check.
    return file;
  }
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (!longest) return file;
    const scale = Math.min(1, settings.maxDimension / longest);
    // A small hand-tuned PNG should survive byte-identical; only excess pixels
    // or excess bytes justify a lossy pass. Undecodable types have no such
    // choice, since uploading them unchanged is a rejection.
    if (
      scale === 1 &&
      file.size <= settings.maxBytes &&
      Object.hasOwn(ENCODABLE, file.type)
    )
      return file;
    const box = [
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)),
    ];
    let blob = await encodeWithin(bitmap, settings, box);
    // A browser that cannot encode the requested type quietly hands back PNG
    // instead, and giving up there would ship the untouched original — the one
    // outcome this whole path exists to avoid. JPEG is the lossy format every
    // canvas implementation can produce, so it is the fallback.
    if (!blob && settings.type !== "image/jpeg")
      blob = await encodeWithin(
        bitmap,
        { ...settings, type: "image/jpeg" },
        box,
      );
    // Re-encoding an already efficient file can cost bytes; keep the smaller of
    // the two. A budget that could not be met still yields the best attempt,
    // which beats sending the original.
    if (!blob?.size || blob.size >= file.size) return file;
    // The produced type is the authority now, not the requested one.
    return new File(
      [blob],
      renameExtension(
        typeof file.name === "string" && file.name ? file.name : "upload",
        blob.type,
      ),
      { type: blob.type },
    );
  } catch {
    return file;
  } finally {
    bitmap.close?.();
  }
}
const segment = (value) => {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(value))
    throw new TypeError("Invalid collection or document ID.");
  return encodeURIComponent(value);
};
// Conditional writes travel in the URL: DELETE has no body, and intermediaries
// are free to drop one.
const condition = (ifVersion) =>
  ifVersion === undefined ? "" : `?ifVersion=${checkVersion(ifVersion)}`;
const checkVersion = (value) => {
  if (!Number.isInteger(value) || value < 0)
    throw new TypeError("ifVersion must be a non-negative integer.");
  return value;
};
const checkPatch = (patch) => {
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    throw new TypeError("A merge patch must be a plain object.");
  return patch;
};
const checkUnset = (unset) => {
  if (!Array.isArray(unset) || unset.some((key) => typeof key !== "string"))
    throw new TypeError("unset must be an array of field names.");
  return unset;
};
const FIELD = /^[a-zA-Z0-9_-]{1,64}$/;
const COMPARISONS = ["gt", "gte", "lt", "lte"];
const ORDER_FIELDS = /^(id|created_at|updated_at|data\.[a-zA-Z0-9_-]{1,64})$/;
const isScalar = (value) =>
  value === null ||
  typeof value === "string" ||
  typeof value === "boolean" ||
  (typeof value === "number" && Number.isFinite(value));
// Mirrors the server's rules so mistakes surface before a round trip. The
// server revalidates; this never widens what the server will accept.
function filterJson(where) {
  if (!where || typeof where !== "object" || Array.isArray(where))
    throw new TypeError("where must be an object of filters.");
  let predicates = 0;
  for (const [field, value] of Object.entries(where)) {
    if (!FIELD.test(field))
      throw new TypeError(`Invalid filter field ${field}.`);
    if (isScalar(value)) {
      predicates += 1;
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new TypeError(
        "Filter values must be scalars or a comparison object.",
      );
    const bounds = Object.entries(value);
    if (!bounds.length)
      throw new TypeError("Comparison objects need at least one operator.");
    for (const [operator, bound] of bounds) {
      if (!COMPARISONS.includes(operator))
        throw new TypeError("Use gt, gte, lt or lte for range comparisons.");
      if (
        !(
          typeof bound === "string" ||
          (typeof bound === "number" && Number.isFinite(bound))
        )
      )
        throw new TypeError("Range bounds must be strings or finite numbers.");
      if (typeof bound !== typeof bounds[0][1])
        throw new TypeError("Range bounds on one field must share a type.");
      predicates += 1;
    }
  }
  if (predicates > 5) throw new TypeError("Use at most 5 filter predicates.");
  return JSON.stringify(where);
}
function queryOptions({ orderBy, direction } = {}) {
  if (
    orderBy !== undefined &&
    (typeof orderBy !== "string" || !ORDER_FIELDS.test(orderBy))
  )
    throw new TypeError(
      "orderBy must be id, created_at, updated_at or data.<field>.",
    );
  if (direction !== undefined && direction !== "asc" && direction !== "desc")
    throw new TypeError("direction must be asc or desc.");
}
function listOptions(options = {}) {
  queryOptions(options);
  if (
    options.limit !== undefined &&
    (!Number.isInteger(options.limit) ||
      options.limit < 1 ||
      options.limit > 100)
  )
    throw new TypeError("limit must be an integer between 1 and 100.");
  if (
    options.after !== undefined &&
    (typeof options.after !== "string" || options.after.length === 0)
  )
    throw new TypeError("after must be a non-empty cursor string.");
}
const base64url = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

export const CONTROL_PLANE_ORIGIN = "https://naru.pub";
export function createDatabase({
  site,
  controlPlaneOrigin = CONTROL_PLANE_ORIGIN,
  schemas = {},
}) {
  if (typeof site !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(site))
    throw new TypeError("A valid Naru site login name is required.");
  const base = new URL(controlPlaneOrigin);
  if (
    base.origin !== CONTROL_PLANE_ORIGIN &&
    !(
      base.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
    )
  )
    throw new TypeError(
      "controlPlaneOrigin must be https://naru.pub or an HTTP loopback origin.",
    );
  const root = `${base.origin}/api/data/${encodeURIComponent(site)}`;
  const storageKey = `naru:owner:${base.origin}:${site}`;
  if (!schemas || typeof schemas !== "object" || Array.isArray(schemas))
    throw new TypeError("schemas must be an object of validator functions.");
  // Snapshot own data properties without executing registry getters. Later
  // mutations of the caller's registry must not change a client's validators.
  const validators = new Map();
  for (const name of Reflect.ownKeys(schemas)) {
    segment(name);
    const descriptor = Object.getOwnPropertyDescriptor(schemas, name);
    if (!("value" in descriptor) || typeof descriptor.value !== "function")
      throw new TypeError(`Schema for ${name} must be a function property.`);
    validators.set(name, descriptor.value);
  }
  function validateDocument(collectionName, data) {
    validateJson(data);
    const validator = validators.get(collectionName);
    if (validator === undefined) return;
    const result = validator(data);
    if (result !== undefined && typeof result !== "boolean") {
      if (result !== null && typeof result.then === "function") {
        // An async validator may already have rejected. Observe that rejection
        // while rejecting the write synchronously, before any request is sent.
        Promise.resolve(result).catch(() => {});
      }
      throw new TypeError(
        `Schema for ${collectionName} must return a boolean or undefined synchronously.`,
      );
    }
    if (result === false)
      throw new TypeError(
        `Document does not match the ${collectionName} schema.`,
      );
    // Validators can mutate their argument; retain the lossless JSON contract.
    validateJson(data);
  }
  async function request(url, method = "GET", body, token, options) {
    const scope = requestScope(options);
    try {
      scope.check();
      // Serialize before awaiting so later caller mutations cannot change the write.
      const serialized = body === undefined ? undefined : JSON.stringify(body);
      let response;
      try {
        response = await fetch(url, {
          method,
          credentials: "omit",
          cache: "no-store",
          redirect: "error",
          headers: {
            ...(body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: serialized,
          signal: scope.signal,
        });
      } catch (cause) {
        scope.check();
        const error = new NaruDataError(
          0,
          "Network request failed. Check your connection before retrying.",
        );
        error.cause = cause;
        throw error;
      }
      let result;
      try {
        result = await response.json();
      } catch (cause) {
        scope.check();
        const error = new NaruDataError(
          response.status,
          response.ok
            ? "Invalid JSON response from the database."
            : `Database request failed (HTTP ${response.status}).`,
          response.ok ? "INVALID_RESPONSE" : undefined,
        );
        error.cause = cause;
        throw error;
      }
      scope.check();
      if (!response.ok)
        throw new NaruDataError(
          response.status,
          typeof result?.error === "string"
            ? result.error
            : `Database request failed (HTTP ${response.status}).`,
          typeof result?.code === "string" ? result.code : undefined,
        );
      if (!object(result)) throw invalidResponse(response.status);
      if (String(url).startsWith(`${root}/`))
        validateResponse(
          new URL(url),
          method,
          serialized === undefined ? undefined : JSON.parse(serialized),
          result,
          response.status,
        );
      return result;
    } finally {
      scope.close();
    }
  }
  function client(getToken = () => undefined, unauthorized = () => {}) {
    const send = async (url, method, body, options) => {
      try {
        return await request(url, method, body, getToken(), options);
      } catch (error) {
        if (error.status === 401) unauthorized();
        throw error;
      }
    };
    return {
      batch(operations, options) {
        if (
          !Array.isArray(operations) ||
          !operations.length ||
          operations.length > 100
        )
          throw new TypeError("Batch requires 1–100 operations.");
        const snapshot = operations.map((operation) => {
          if (
            !operation ||
            typeof operation !== "object" ||
            Array.isArray(operation)
          )
            throw new TypeError("Invalid batch operation.");
          const collection = operation.collection;
          segment(collection);
          if (operation.type === "add") {
            if (operation.id !== undefined)
              throw new TypeError("add assigns the document ID itself.");
            if (operation.ifVersion !== undefined)
              throw new TypeError("add cannot take ifVersion.");
            validateDocument(collection, operation.data);
            return { type: "add", collection, data: operation.data };
          }
          segment(operation.id);
          const base = { collection, id: operation.id };
          if (operation.ifVersion !== undefined)
            base.ifVersion = checkVersion(operation.ifVersion);
          if (operation.type === "set") {
            validateDocument(collection, operation.data);
            return { ...base, type: "set", data: operation.data };
          }
          if (operation.type === "update") {
            // A patch is a fragment, so whole-document schemas cannot judge it.
            validateJson(operation.data);
            checkPatch(operation.data);
            return {
              ...base,
              type: "update",
              data: operation.data,
              ...(operation.unset === undefined
                ? {}
                : { unset: checkUnset(operation.unset) }),
            };
          }
          if (operation.type !== "delete")
            throw new TypeError(
              "Batch operations must be add, set, update or delete.",
            );
          return { ...base, type: "delete" };
        });
        return send(
          `${root}/_batch`,
          "POST",
          { operations: snapshot },
          options,
        );
      },
      collection(collectionName, { parse } = {}) {
        const path = `${root}/${segment(collectionName)}`;
        if (parse !== undefined && typeof parse !== "function")
          throw new TypeError("parse must be a synchronous function.");
        const readDocument = (document) => {
          if (parse === undefined) return document;
          try {
            const data = parse(document.data);
            if (
              data !== null &&
              data !== undefined &&
              typeof data.then === "function"
            ) {
              Promise.resolve(data).catch(() => {});
              throw new TypeError("parse must return synchronously.");
            }
            return { ...document, data };
          } catch (cause) {
            const error = new NaruDataError(
              200,
              `Document ${collectionName}/${document.id} failed read validation.`,
              "DOCUMENT_VALIDATION_FAILED",
            );
            error.collection = collectionName;
            error.documentId = document.id;
            error.cause = cause;
            throw error;
          }
        };
        const query = ({ where, orderBy, direction }) => {
          queryOptions({ orderBy, direction });
          const parameters = new URLSearchParams();
          if (where !== undefined) parameters.set("where", filterJson(where));
          if (orderBy !== undefined) parameters.set("orderBy", orderBy);
          if (direction !== undefined) parameters.set("direction", direction);
          return parameters;
        };
        const list = (options = {}) => {
          listOptions(options);
          const parameters = query(options);
          parameters.set("limit", String(options.limit ?? 50));
          if (options.after !== undefined)
            parameters.set("after", options.after);
          return send(`${path}?${parameters}`, "GET", undefined, options).then(
            (page) =>
              parse === undefined
                ? page
                : {
                    ...page,
                    documents: page.documents.map(readDocument),
                  },
          );
        };
        return {
          async get(id, options) {
            return readDocument(
              (await send(`${path}/${segment(id)}`, "GET", undefined, options))
                .document,
            );
          },
          list,
          async count(options = {}) {
            queryOptions(options);
            const parameters = query(options);
            parameters.set("count", "1");
            return (
              await send(`${path}?${parameters}`, "GET", undefined, options)
            ).count;
          },
          async *all(options = {}) {
            let after;
            const seen = new Set();
            do {
              const page = await list({ limit: 100, ...options, after });
              if (page.nextCursor !== null && seen.has(page.nextCursor))
                throw new NaruDataError(
                  200,
                  "Pagination cursor repeated.",
                  "INVALID_PAGINATION",
                );
              if (page.nextCursor !== null) seen.add(page.nextCursor);
              for (const document of page.documents) {
                if (options.signal?.aborted) {
                  const scope = requestScope(options);
                  try {
                    scope.check();
                  } finally {
                    scope.close();
                  }
                }
                yield document;
              }
              after = page.nextCursor ?? undefined;
            } while (after);
          },
          add(data, options) {
            validateDocument(collectionName, data);
            return send(path, "POST", { data }, options);
          },
          set(id, data, { ifVersion, ...options } = {}) {
            validateDocument(collectionName, data);
            return send(
              `${path}/${segment(id)}${condition(ifVersion)}`,
              "PUT",
              { data },
              options,
            );
          },
          update(id, patch, { ifVersion, unset, ...options } = {}) {
            // A patch is a fragment, so whole-document schemas cannot judge it.
            validateJson(patch);
            checkPatch(patch);
            return send(
              `${path}/${segment(id)}${condition(ifVersion)}`,
              "PATCH",
              {
                data: patch,
                ...(unset === undefined ? {} : { unset: checkUnset(unset) }),
              },
              options,
            );
          },
          delete(id, { ifVersion, ...options } = {}) {
            return send(
              `${path}/${segment(id)}${condition(ifVersion)}`,
              "DELETE",
              undefined,
              options,
            );
          },
        };
      },
      files: {
        async get(id, options) {
          return (
            await send(
              `${root}/_files/${segment(id)}`,
              "GET",
              undefined,
              options,
            )
          ).file;
        },
        async list(options) {
          return (await send(`${root}/_files`, "GET", undefined, options))
            .files;
        },
        async usage(options) {
          return (await send(`${root}/_files`, "GET", undefined, options))
            .usage;
        },
        async upload(
          source,
          { image, original, onProgress, metadata = {}, ...options } = {},
        ) {
          if (!(source instanceof Blob))
            throw new TypeError("upload requires a File or Blob.");
          if (onProgress !== undefined && typeof onProgress !== "function")
            throw new TypeError("onProgress must be a function.");
          validateJson(metadata);
          const settings = imageSettings(image, original);
          // Shrinking precedes the limit check on purpose: a 40 MB photo the
          // site would downscale for display anyway should upload, not fail.
          // onProgress covers the transfer only, so callers see no movement
          // while this runs.
          const file = await downscaleImage(source, settings);
          if (!file.size || file.size > 25 * 1024 * 1024)
            throw new TypeError("File must be between 1 byte and 25 MiB.");
          const scope = requestScope({ timeoutMs: 120000, ...options });
          const transferOptions = { signal: scope.signal, timeoutMs: 0 };
          let authorization;
          try {
            scope.check();
            authorization = await send(
              `${root}/_files`,
              "POST",
              {
                name:
                  typeof file.name === "string" && file.name
                    ? file.name
                    : "upload",
                contentType: file.type || "application/octet-stream",
                size: file.size,
                metadata,
              },
              transferOptions,
            );
            scope.check();
            let response;
            if (onProgress && typeof XMLHttpRequest !== "undefined") {
              response = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                const abort = () => {
                  xhr.abort();
                  finish(reject, scope.signal.reason);
                };
                const finish = (settle, value) => {
                  scope.signal.removeEventListener("abort", abort);
                  xhr.onload =
                    xhr.onerror =
                    xhr.onabort =
                    xhr.upload.onprogress =
                      null;
                  settle(value);
                };
                try {
                  xhr.open(authorization.method, authorization.uploadUrl);
                  for (const [key, value] of Object.entries(
                    authorization.headers,
                  ))
                    xhr.setRequestHeader(key, value);
                  xhr.upload.onprogress = (event) => {
                    try {
                      onProgress({
                        loaded: event.loaded,
                        total: event.lengthComputable ? event.total : file.size,
                      });
                    } catch (error) {
                      finish(reject, error);
                      xhr.abort();
                    }
                  };
                  xhr.onload = () =>
                    finish(resolve, {
                      ok: xhr.status >= 200 && xhr.status < 300,
                      status: xhr.status,
                    });
                  xhr.onerror = () =>
                    finish(reject, new TypeError("Network request failed."));
                  xhr.onabort = () =>
                    finish(
                      reject,
                      new DOMException("Upload aborted.", "AbortError"),
                    );
                  scope.signal.addEventListener("abort", abort, { once: true });
                  scope.check();
                  xhr.send(file);
                } catch (error) {
                  finish(reject, error);
                }
              });
            } else {
              response = await fetch(authorization.uploadUrl, {
                method: authorization.method,
                headers: authorization.headers,
                credentials: "omit",
                redirect: "error",
                body: file,
                signal: scope.signal,
              });
            }
            scope.check();
            if (!response.ok)
              throw new NaruDataError(
                response.status,
                `File upload failed (HTTP ${response.status}).`,
              );
            return (
              await send(
                `${root}/_files/${segment(authorization.file.id)}`,
                "PUT",
                {},
                transferOptions,
              )
            ).file;
          } catch (cause) {
            let error = cause;
            try {
              scope.check();
            } catch (aborted) {
              error = aborted;
            }
            if (!(error instanceof NaruDataError)) {
              error = new NaruDataError(
                0,
                "File upload failed. Check your connection before retrying.",
              );
              error.cause = cause;
            }
            if (authorization) {
              error.fileId = authorization.file.id;
              // Cleanup gets its own bounded request, independent of cancellation.
              try {
                await send(
                  `${root}/_files/${segment(error.fileId)}`,
                  "DELETE",
                  undefined,
                  { timeoutMs: 10000 },
                );
              } catch (cleanupError) {
                error.cleanupError = cleanupError;
              }
            }
            throw error;
          } finally {
            scope.close();
          }
        },
        delete(id, options) {
          return send(
            `${root}/_files/${segment(id)}`,
            "DELETE",
            undefined,
            options,
          );
        },
      },
    };
  }
  // Each callback has an independent tab-scoped session. No localStorage or cookies.
  const sessionKey = () =>
    `${storageKey}:session:${window.location.origin}${window.location.pathname}`;
  let activeOwner = null;
  let completing = null;
  function ownerClient(saved, key) {
    let token = saved.accessToken;
    const expiresAt = saved.expiresAt;
    function clear() {
      const current = token;
      token = null;
      if (activeOwner === owner) activeOwner = null;
      // An older client must not erase a newer sign-in on the same page.
      try {
        const stored = window.sessionStorage.getItem(key);
        if (stored) {
          let parsed;
          try {
            parsed = JSON.parse(stored);
          } catch {
            // Malformed saved credentials cannot represent a newer login.
          }
          if (!parsed || parsed.accessToken === current)
            window.sessionStorage.removeItem(key);
        }
      } catch {
        // Storage may become unavailable after sign-in. Still revoke remotely
        // and invalidate this client instead of masking a 401 or blocking logout.
      }
    }
    const owner = {
      ...client(() => {
        if (!token || Date.now() >= expiresAt) {
          clear();
          throw new NaruDataError(
            401,
            "Owner session expired or signed out. Sign in again.",
          );
        }
        return token;
      }, clear),
      expiresAt,
      async signOut(options) {
        const current = token;
        clear();
        if (current)
          await request(
            `${base.origin}/api/data-auth/revoke`,
            "POST",
            undefined,
            current,
            options,
          );
      },
    };
    return owner;
  }
  function restoreOwner() {
    if (activeOwner && activeOwner.expiresAt > Date.now()) return activeOwner;
    activeOwner = null;
    const key = sessionKey();
    let saved;
    try {
      saved = JSON.parse(window.sessionStorage.getItem(key));
    } catch {
      /* malformed */
    }
    if (
      !saved ||
      !/^[A-Za-z0-9_-]{43}$/.test(saved.accessToken) ||
      saved.redirectUri !== window.location.origin + window.location.pathname ||
      !Number.isFinite(saved.expiresAt) ||
      saved.expiresAt <= Date.now() ||
      saved.expiresAt > Date.now() + 24 * 60 * 60 * 1000 + 60000
    ) {
      try {
        window.sessionStorage.removeItem(key);
      } catch {
        // Unavailable storage is not a usable owner session.
      }
      return null;
    }
    // Restoring never extends the deadline. The server checks authorization on every request.
    return (activeOwner = ownerClient(saved, key));
  }
  return {
    ...client(),
    async signInAsOwner({
      clientId,
      redirectUri = window.location.origin + window.location.pathname,
      collections,
      ...options
    }) {
      const scope = requestScope(options);
      try {
        scope.check();
        if (
          clientId !== undefined &&
          (typeof clientId !== "string" || !clientId || clientId.length > 64)
        )
          throw new TypeError(
            "clientId must be a non-empty string when provided.",
          );
        if (
          !Array.isArray(collections) ||
          !collections.length ||
          collections.length > 100 ||
          new Set(collections).size !== collections.length
        )
          throw new TypeError("Choose 1–100 unique collections.");
        collections.forEach(segment);
        const callback = new URL(redirectUri);
        if (
          callback.origin !== window.location.origin ||
          callback.search ||
          callback.hash ||
          callback.username ||
          callback.password
        )
          throw new TypeError(
            "Callback must be a registered URL on this origin without query or fragment.",
          );
        if (!clientId) {
          const discovery = new URL("/api/data-auth/discover", base.origin);
          discovery.search = new URLSearchParams({
            site,
            redirectUri: callback.href,
          }).toString();
          try {
            clientId = (
              await request(discovery.href, "GET", undefined, undefined, {
                signal: scope.signal,
                timeoutMs: 0,
              })
            ).clientId;
          } catch (error) {
            if (error instanceof NaruDataError && error.status === 404) {
              error.code = "UNREGISTERED_REDIRECT_URI";
              error.message = `Register ${callback.href} as an administrator callback in Naru.`;
            }
            throw error;
          }
          if (typeof clientId !== "string" || !clientId || clientId.length > 64)
            throw new NaruDataError(
              502,
              "Invalid owner client discovery response.",
              "INVALID_CLIENT_DISCOVERY",
            );
        }
        const verifier = random(),
          state = random();
        const challenge = base64url(
          new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(verifier),
            ),
          ),
        );
        scope.check();
        // Persist the short-lived PKCE transaction across the approval redirect.
        window.sessionStorage.setItem(
          storageKey,
          JSON.stringify({
            clientId,
            redirectUri: callback.href,
            verifier,
            state,
            startedAt: Date.now(),
          }),
        );
        const url = new URL("/database/authorize", base.origin);
        url.search = new URLSearchParams({
          site,
          clientId,
          redirectUri: callback.href,
          challenge,
          state,
          collections: collections.join(","),
        }).toString();
        window.location.assign(url.href);
      } finally {
        scope.close();
      }
    },
    completeOwnerSignIn(options) {
      if (!completing)
        completing = complete(options).finally(() => {
          completing = null;
        });
      return completing;
    },
  };
  async function complete(options) {
    const scope = requestScope(options);
    try {
      scope.check();
    } finally {
      scope.close();
    }
    const url = new URL(window.location.href);
    if (!url.searchParams.has("code") && !url.searchParams.has("error"))
      return restoreOwner();
    const code = url.searchParams.get("code"),
      state = url.searchParams.get("state"),
      error = url.searchParams.get("error");
    for (const key of ["code", "state", "error"]) url.searchParams.delete(key);
    // Remove the authorization response before fetching or rendering user content.
    window.history.replaceState(null, "", url.href);
    const saved = window.sessionStorage.getItem(storageKey);
    window.sessionStorage.removeItem(storageKey);
    let pending;
    try {
      pending = JSON.parse(saved);
    } catch {
      /* handled below */
    }
    if (
      !pending ||
      pending.state !== state ||
      pending.redirectUri !== url.href ||
      !Number.isFinite(pending.startedAt) ||
      Date.now() - pending.startedAt > 10 * 60 * 1000 ||
      pending.startedAt > Date.now()
    ) {
      throw new NaruDataError(
        401,
        "Owner sign-in state is missing, invalid or expired. Sign in again.",
      );
    }
    if (error) throw new NaruDataError(403, "Owner sign-in was denied.");
    const result = await request(
      `${base.origin}/api/data-auth/token`,
      "POST",
      {
        code,
        verifier: pending.verifier,
        clientId: pending.clientId,
        redirectUri: pending.redirectUri,
      },
      undefined,
      options,
    );
    if (
      !result ||
      !/^[A-Za-z0-9_-]{43}$/.test(result.accessToken) ||
      result.tokenType !== "Bearer" ||
      !Number.isInteger(result.expiresIn) ||
      result.expiresIn <= 0 ||
      result.expiresIn > 24 * 60 * 60 ||
      !Number.isFinite(result.expiresAt) ||
      result.expiresAt <= Date.now() ||
      result.expiresAt > Date.now() + 24 * 60 * 60 * 1000 + 60000
    )
      throw new NaruDataError(502, "Invalid owner token response.");
    const credentials = {
      accessToken: result.accessToken,
      expiresAt: result.expiresAt,
      redirectUri: pending.redirectUri,
    };
    const key = sessionKey();
    try {
      window.sessionStorage.setItem(key, JSON.stringify(credentials));
    } catch (error) {
      // If persistence fails, do not leave a newly issued token active unnecessarily.
      try {
        await request(
          `${base.origin}/api/data-auth/revoke`,
          "POST",
          undefined,
          result.accessToken,
        );
      } catch {}
      throw error;
    }
    return (activeOwner = ownerClient(credentials, key));
  }
}
