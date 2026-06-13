//#region src/SdfImageBaker.ts
const INF = 0x56bc75e2d63100000;
const alphaTable = new Float64Array(256);
for (let i = 0; i < 256; i++) {
	const d = .5 - Math.pow(i / 255, 1 / 2.2);
	alphaTable[i] = d * Math.abs(d);
}
alphaTable[255] = -INF;
var SdfImageBaker = class {
	buffer;
	radius;
	cutoff;
	withOriginalRGBChannel;
	premultiplyAlpha;
	constructor({ buffer = 3, radius = 8, cutoff = .25, withOriginalRGBChannel = false, premultiplyAlpha = false } = {}) {
		this.buffer = buffer;
		this.radius = radius;
		this.cutoff = cutoff;
		this.withOriginalRGBChannel = withOriginalRGBChannel;
		this.premultiplyAlpha = premultiplyAlpha;
	}
	_createCanvas(srcWidth, srcHeight) {
		if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(srcWidth, srcHeight);
		const canvas = document.createElement("canvas");
		canvas.width = srcWidth;
		canvas.height = srcHeight;
		return canvas;
	}
	drawImage(unknownSrc, options = {}) {
		let srcWidth = 0, srcHeight = 0, srcData = null;
		if (ArrayBuffer.isView(unknownSrc) || Array.isArray(unknownSrc)) {
			if (!options.width || !options.height) throw Error("For raw data width and height should be provided by options");
			srcWidth = options.width;
			srcHeight = options.height;
			srcData = unknownSrc;
		} else if (window.HTMLCanvasElement && unknownSrc instanceof window.HTMLCanvasElement) {
			const canvas = unknownSrc;
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("canvas context not available");
			srcWidth = canvas.width;
			srcHeight = canvas.height;
			srcData = ctx.getImageData(0, 0, srcWidth, srcHeight).data;
		} else if (window.CanvasRenderingContext2D && unknownSrc instanceof window.CanvasRenderingContext2D) {
			const canvas = unknownSrc.canvas;
			const ctx = unknownSrc;
			srcWidth = canvas.width;
			srcHeight = canvas.height;
			srcData = ctx.getImageData(0, 0, srcWidth, srcHeight).data;
		} else if (window.ImageData && unknownSrc instanceof window.ImageData) {
			const imgData = unknownSrc;
			srcWidth = unknownSrc.width;
			srcHeight = unknownSrc.height;
			srcData = imgData.data;
		}
		if (!srcData) throw new Error("unknown src");
		const dstWidth = srcWidth + 2 * this.buffer;
		const dstHeight = srcHeight + 2 * this.buffer;
		const len = Math.max(dstWidth * dstHeight, 0);
		const channels = this.withOriginalRGBChannel ? 4 : 1;
		const dst = new Uint8ClampedArray(len * channels);
		const size = Math.max(dstWidth, dstHeight);
		const gridOuter = new Float64Array(dstWidth * dstHeight);
		const gridInner = new Float64Array(dstWidth * dstHeight);
		const f = new Float64Array(size);
		const z = new Float64Array(size + 1);
		const v = new Uint16Array(size);
		gridOuter.fill(INF, 0, len);
		gridInner.fill(0, 0, len);
		const hasColor = this.withOriginalRGBChannel ? new Uint8Array(len) : null;
		let imgIdx = 3;
		for (let y = 0; y < srcHeight; y++) {
			let j = (y + this.buffer) * dstWidth + this.buffer;
			for (let x = 0; x < srcWidth; x++, imgIdx += 4, j++) {
				const a = srcData[imgIdx];
				if (this.withOriginalRGBChannel && a > 0) {
					dst[j * 4] = srcData[imgIdx - 3];
					dst[j * 4 + 1] = srcData[imgIdx - 2];
					dst[j * 4 + 2] = srcData[imgIdx - 1];
					hasColor[j] = 1;
				}
				if (a === 0) continue;
				const t = alphaTable[a];
				gridOuter[j] = Math.max(0, t);
				gridInner[j] = Math.max(0, -t);
			}
		}
		if (this.withOriginalRGBChannel) this._bleedColor(dst, dstWidth, dstHeight, hasColor);
		edt(gridOuter, 0, 0, dstWidth, dstHeight, dstWidth, f, v, z);
		edt(gridInner, 0, 0, dstWidth, dstHeight, dstWidth, f, v, z);
		const scale = 255 / this.radius;
		const base = 255 * (1 - this.cutoff);
		for (let i = 0; i < len; i++) {
			const d = Math.sqrt(gridOuter[i]) - Math.sqrt(gridInner[i]);
			const sdfVal = Math.round(base - scale * d);
			if (this.withOriginalRGBChannel) {
				dst[i * 4 + 3] = sdfVal;
				const clampedAlpha = dst[i * 4 + 3];
				if (this.premultiplyAlpha && clampedAlpha > 0) {
					const a = clampedAlpha / 255;
					dst[i * 4] = dst[i * 4] / a;
					dst[i * 4 + 1] = dst[i * 4 + 1] / a;
					dst[i * 4 + 2] = dst[i * 4 + 2] / a;
				}
			} else dst[i] = sdfVal;
		}
		return {
			data: dst,
			width: dstWidth,
			height: dstHeight
		};
	}
	_bleedColor(dst, width, height, hasColor) {
		const passes = Math.ceil(this.radius) + this.buffer + 1;
		let current = hasColor;
		for (let pass = 0; pass < passes; pass++) {
			const next = current.slice();
			let changed = false;
			for (let y = 0; y < height; y++) {
				const row = y * width;
				for (let x = 0; x < width; x++) {
					const i = row + x;
					if (current[i]) continue;
					let src = -1;
					if (x > 0 && current[i - 1]) src = i - 1;
					else if (x < width - 1 && current[i + 1]) src = i + 1;
					else if (y > 0 && current[i - width]) src = i - width;
					else if (y < height - 1 && current[i + width]) src = i + width;
					if (src >= 0) {
						dst[i * 4] = dst[src * 4];
						dst[i * 4 + 1] = dst[src * 4 + 1];
						dst[i * 4 + 2] = dst[src * 4 + 2];
						next[i] = 1;
						changed = true;
					}
				}
			}
			if (!changed) break;
			current = next;
		}
	}
};
function edt(data, x0, y0, width, height, gridSize, f, v, z) {
	for (let x = x0; x < x0 + width; x++) edt1d(data, y0 * gridSize + x, gridSize, height, f, v, z);
	for (let y = y0; y < y0 + height; y++) edt1d(data, y * gridSize + x0, 1, width, f, v, z);
}
function edt1d(grid, offset, stride, length, f, v, z) {
	v[0] = 0;
	z[0] = -INF;
	z[1] = INF;
	f[0] = grid[offset];
	for (let q = 1, k = 0, s = 0; q < length; q++) {
		f[q] = grid[offset + q * stride];
		const q2 = q * q;
		do {
			const r = v[k];
			s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2;
		} while (s <= z[k] && --k > -1);
		k++;
		v[k] = q;
		z[k] = s;
		z[k + 1] = INF;
	}
	for (let q = 0, k = 0; q < length; q++) {
		while (z[k + 1] < q) k++;
		const r = v[k];
		const qr = q - r;
		grid[offset + q * stride] = f[r] + qr * qr;
	}
}
//#endregion
export { SdfImageBaker };
