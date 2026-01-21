/**
 * Duck Decoder - Browser-based decoder for ss_tools encrypted images
 * 
 * Decodes images/videos hidden in "duck" images using LSB steganography.
 * Supports optional password protection (SHA256 + XOR stream cipher).
 */

// Constants matching ss_tools encoder
const WATERMARK_SKIP_W_RATIO = 0.40;
const WATERMARK_SKIP_H_RATIO = 0.08;

export interface DecodeResult {
    success: boolean;
    data?: Blob;
    extension?: string;
    error?: 'PASSWORD_REQUIRED' | 'WRONG_PASSWORD' | 'NOT_DUCK_IMAGE' | 'DECODE_FAILED';
    errorMessage?: string;
}

/**
 * Generate key stream for XOR decryption (matching Python implementation)
 */
async function generateKeyStream(password: string, salt: Uint8Array, length: number): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
    const keyMaterial = encoder.encode(password + saltHex);

    const out = new Uint8Array(length);
    let offset = 0;
    let counter = 0;

    while (offset < length) {
        const counterBytes = encoder.encode(String(counter));
        const combined = new Uint8Array(keyMaterial.length + counterBytes.length);
        combined.set(keyMaterial);
        combined.set(counterBytes, keyMaterial.length);

        const hashBuffer = await crypto.subtle.digest('SHA-256', combined.buffer.slice(combined.byteOffset, combined.byteOffset + combined.byteLength) as ArrayBuffer);
        const hashArray = new Uint8Array(hashBuffer);

        const copyLen = Math.min(hashArray.length, length - offset);
        out.set(hashArray.subarray(0, copyLen), offset);
        offset += copyLen;
        counter++;
    }

    return out;
}

/**
 * Compute SHA256 hash
 */
async function sha256(data: Uint8Array): Promise<Uint8Array> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hashBuffer);
}

/**
 * Extract LSB payload from image data with given bit width
 */
function extractPayloadWithK(imageData: ImageData, k: number): Uint8Array {
    const { width, height, data } = imageData;
    const skipW = Math.floor(width * WATERMARK_SKIP_W_RATIO);
    const skipH = Math.floor(height * WATERMARK_SKIP_H_RATIO);

    // Collect pixel values excluding watermark area (top-left corner)
    const values: number[] = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // Skip watermark area
            if (y < skipH && x < skipW) continue;

            const idx = (y * width + x) * 4;
            // Extract RGB channels (skip alpha)
            values.push(data[idx] & ((1 << k) - 1));     // R
            values.push(data[idx + 1] & ((1 << k) - 1)); // G
            values.push(data[idx + 2] & ((1 << k) - 1)); // B
        }
    }

    // Unpack bits
    const bits: number[] = [];
    for (const val of values) {
        for (let i = k - 1; i >= 0; i--) {
            bits.push((val >> i) & 1);
        }
    }

    if (bits.length < 32) {
        throw new Error('Insufficient image data');
    }

    // Read length prefix (32 bits, big-endian)
    let headerLen = 0;
    for (let i = 0; i < 32; i++) {
        headerLen = (headerLen << 1) | bits[i];
    }

    if (headerLen <= 0 || 32 + headerLen * 8 > bits.length) {
        throw new Error('Payload length invalid');
    }

    // Extract payload bytes
    const payloadBits = bits.slice(32, 32 + headerLen * 8);
    const payload = new Uint8Array(headerLen);
    for (let i = 0; i < headerLen; i++) {
        let byte = 0;
        for (let j = 0; j < 8; j++) {
            byte = (byte << 1) | payloadBits[i * 8 + j];
        }
        payload[i] = byte;
    }

    return payload;
}

/**
 * Parse header and extract original data
 */
async function parseHeader(header: Uint8Array, password: string): Promise<{ data: Uint8Array; ext: string }> {
    let idx = 0;

    if (header.length < 1) {
        throw new Error('Header corrupted');
    }

    const hasPwd = header[0] === 1;
    idx += 1;

    let pwdHash: Uint8Array | null = null;
    let salt: Uint8Array | null = null;

    if (hasPwd) {
        if (header.length < idx + 32 + 16) {
            throw new Error('Header corrupted');
        }
        pwdHash = header.slice(idx, idx + 32);
        idx += 32;
        salt = header.slice(idx, idx + 16);
        idx += 16;
    }

    if (header.length < idx + 1) {
        throw new Error('Header corrupted');
    }

    const extLen = header[idx];
    idx += 1;

    if (header.length < idx + extLen + 4) {
        throw new Error('Header corrupted');
    }

    const extBytes = header.slice(idx, idx + extLen);
    const ext = new TextDecoder().decode(extBytes);
    idx += extLen;

    // Read data length (4 bytes, big-endian)
    const dataLen = (header[idx] << 24) | (header[idx + 1] << 16) | (header[idx + 2] << 8) | header[idx + 3];
    idx += 4;

    const data = header.slice(idx);

    if (data.length !== dataLen) {
        throw new Error('Data length mismatch');
    }

    // Handle password
    if (!hasPwd) {
        return { data, ext };
    }

    if (!password) {
        throw { type: 'PASSWORD_REQUIRED', message: 'Password required' };
    }

    // Verify password
    const encoder = new TextEncoder();
    const saltHex = Array.from(salt!).map(b => b.toString(16).padStart(2, '0')).join('');
    const checkHash = await sha256(encoder.encode(password + saltHex));

    if (!arraysEqual(checkHash, pwdHash!)) {
        throw { type: 'WRONG_PASSWORD', message: 'Wrong password' };
    }

    // Decrypt with XOR stream
    const keyStream = await generateKeyStream(password, salt!, data.length);
    const plain = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
        plain[i] = data[i] ^ keyStream[i];
    }

    return { data: plain, ext };
}

/**
 * Compare two Uint8Arrays for equality
 */
function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

/**
 * Convert binary PNG to MP4 bytes (for video format)
 */
function binpngToBytes(imageData: ImageData): Uint8Array {
    const { width, height, data } = imageData;
    const bytes: number[] = [];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            bytes.push(data[idx]);     // R
            bytes.push(data[idx + 1]); // G
            bytes.push(data[idx + 2]); // B
        }
    }

    // Trim trailing zeros
    let end = bytes.length;
    while (end > 0 && bytes[end - 1] === 0) {
        end--;
    }

    return new Uint8Array(bytes.slice(0, end));
}

/**
 * Load image from URL and get ImageData
 */
async function loadImageData(imageUrl: string): Promise<ImageData> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Failed to get canvas context'));
                return;
            }

            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            resolve(imageData);
        };

        img.onerror = () => {
            reject(new Error('Failed to load image'));
        };

        img.src = imageUrl;
    });
}

/**
 * Load image data from Blob
 */
async function loadImageDataFromBlob(blob: Blob): Promise<ImageData> {
    const url = URL.createObjectURL(blob);
    try {
        return await loadImageData(url);
    } finally {
        URL.revokeObjectURL(url);
    }
}

/**
 * Main decode function - decode a duck image
 * 
 * @param imageSource - URL string or Blob of the duck image
 * @param password - Optional password for encrypted content
 * @returns DecodeResult with decoded data or error
 */
export async function decodeDuckImage(
    imageSource: string | Blob,
    password: string = ''
): Promise<DecodeResult> {
    try {
        // Load image data
        let imageData: ImageData;
        if (typeof imageSource === 'string') {
            imageData = await loadImageData(imageSource);
        } else {
            imageData = await loadImageDataFromBlob(imageSource);
        }

        // Try different bit widths (2, 6, 8)
        let payload: Uint8Array | null = null;
        let parsed: { data: Uint8Array; ext: string } | null = null;
        let lastError: any = null;

        for (const k of [2, 6, 8]) {
            try {
                payload = extractPayloadWithK(imageData, k);
                parsed = await parseHeader(payload, password);
                break;
            } catch (e: any) {
                lastError = e;
                continue;
            }
        }

        if (!parsed) {
            if (lastError?.type === 'PASSWORD_REQUIRED') {
                return { success: false, error: 'PASSWORD_REQUIRED', errorMessage: 'Password required' };
            }
            if (lastError?.type === 'WRONG_PASSWORD') {
                return { success: false, error: 'WRONG_PASSWORD', errorMessage: 'Wrong password' };
            }
            return { success: false, error: 'NOT_DUCK_IMAGE', errorMessage: 'Not a valid duck image' };
        }

        let finalData = parsed.data;
        let finalExt = parsed.ext;

        // Handle .binpng format (video data stored as image pixels)
        if (finalExt.endsWith('.binpng')) {
            // The data is a PNG image containing binary video data
            const pngBlob = new Blob([finalData.buffer.slice(finalData.byteOffset, finalData.byteOffset + finalData.byteLength) as ArrayBuffer], { type: 'image/png' });
            const binpngImageData = await loadImageDataFromBlob(pngBlob);
            finalData = binpngToBytes(binpngImageData);
            finalExt = finalExt.replace('.binpng', '');
        }

        // Determine MIME type
        let mimeType = 'application/octet-stream';
        const extLower = finalExt.toLowerCase();
        if (extLower === 'png') mimeType = 'image/png';
        else if (extLower === 'jpg' || extLower === 'jpeg') mimeType = 'image/jpeg';
        else if (extLower === 'webp') mimeType = 'image/webp';
        else if (extLower === 'gif') mimeType = 'image/gif';
        else if (extLower === 'mp4') mimeType = 'video/mp4';
        else if (extLower === 'webm') mimeType = 'video/webm';
        else if (extLower === 'mov') mimeType = 'video/quicktime';

        const blob = new Blob([finalData.buffer.slice(finalData.byteOffset, finalData.byteOffset + finalData.byteLength) as ArrayBuffer], { type: mimeType });

        return {
            success: true,
            data: blob,
            extension: finalExt
        };

    } catch (e: any) {
        console.error('Duck decode error:', e);
        return {
            success: false,
            error: 'DECODE_FAILED',
            errorMessage: e.message || 'Decode failed'
        };
    }
}

/**
 * Check if an image might be a duck image (quick heuristic)
 * This is a lightweight check based on image characteristics
 */
export async function mightBeDuckImage(imageSource: string | Blob): Promise<boolean> {
    try {
        // Just try to decode - if it works, it's a duck image
        const result = await decodeDuckImage(imageSource);
        return result.success || result.error === 'PASSWORD_REQUIRED';
    } catch {
        return false;
    }
}
