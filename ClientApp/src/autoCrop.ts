/// <reference path="../node_modules/cropperjs/types/index.d.ts" />

type Pixel = [number, number, number, number];
type Direction = 1 | -1;
type Side = "top" | "right" | "bottom" | "left";

class AutoCrop {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private imageData: ImageData | undefined;
	private x: number = 0;
	private y: number = 0;
	private width: number = 0;
	private height: number = 0;

	public get cropBounds() {
		return {
			x: this.x,
			y: this.y,
			width: this.width,
			height: this.height,
		};
	}

	public get data() {
		return this.canvas.toDataURL("image/png");
	}

	public constructor(image: HTMLImageElement) {
		if (!image.complete) {
			throw new Error(
				"Image must be loaded before attempting to create AutoCrop instance."
			);
		}
		this.canvas = document.createElement("canvas");
		this.canvas.width = image.naturalWidth;
		this.canvas.height = image.naturalHeight;
		this.canvas.style.imageRendering = "-moz-crisp-edges";
		this.ctx = this.canvas.getContext("2d")!;
		this.ctx.drawImage(image, 0, 0);
	}

	public getImage(): Promise<HTMLImageElement> {
		const img = new Image();
		return new Promise((r) => {
			img.onload = () => {
				r(img);
			};
			img.src = this.data;
		});
	}

	public crop(moving: boolean, maxIterations: number = 5) {
		let changed = true;
		this.x = 0;
		this.y = 0;
		this.width = this.canvas.width;
		this.height = this.canvas.height;

		do {
			// console.log("---------------LOOP-------------");
			// console.log(
			// 	"Get:",
			// 	`(${this.x},${this.y})`,
			// 	`(${this.width}x${this.height})`
			// );
			this.imageData = this.ctx.getImageData(
				this.x,
				this.y,
				this.width,
				this.height
			);

			const cropLeft = this.scanImage(1, false, moving) ?? 0;
			const cropRight = this.scanImage(-1, false, moving) ?? this.width;
			const cropTop = this.scanImage(1, true, moving) ?? 0;
			const cropBottom = this.scanImage(-1, true, moving) ?? this.height;

			const cropWidth = cropRight - cropLeft;
			const cropHeight = cropBottom - cropTop;

			// console.log(
			// 	"Crop:",
			// 	`t=${cropTop}, r=${cropRight}, b=${cropBottom}, l=${cropLeft}, ` +
			// 		`w=${cropWidth}, h=${cropWidth}, dX=${
			// 			this.width - cropWidth
			// 		}, dY=${this.height - cropHeight}`
			// );

			if (this.width !== cropWidth || this.height !== cropHeight) {
				// console.log(
				// 	"(wxh)",
				// 	`(${this.width}x${this.height})`,
				// 	"->",
				// 	`(${cropWidth}x${cropHeight})`,
				// 	"|",
				// 	"(x,y)",
				// 	`(${this.x},${this.y})`,
				// 	"->",
				// 	`(${this.x + cropLeft},${this.y + cropTop})`
				// );
				this.width = cropWidth;
				this.height = cropHeight;
				this.x += cropLeft;
				this.y += cropTop;
			} else {
				changed = false;
			}
		} while (changed && --maxIterations);

		// console.log(
		// 	"Result:",
		// 	`(${this.x},${this.y})`,
		// 	`(${this.width}x${this.height})`
		// );
		this.imageData = this.ctx.getImageData(
			this.x,
			this.y,
			this.width,
			this.height
		);
		this.canvas.width = this.width;
		this.canvas.height = this.height;
		this.ctx.putImageData(
			this.imageData,
			0,
			0,
			0,
			0,
			this.width,
			this.height
		);
	}

	private getPixel(x: number, y: number): Pixel {
		const p = y * (this.width * 4) + x * 4;
		return [
			this.imageData!.data[p],
			this.imageData!.data[p + 1],
			this.imageData!.data[p + 2],
			this.imageData!.data[p + 3],
		];
	}

	private getDifference(p1: Pixel, p2: Pixel): number {
		if (p1[3] === 0 && p2[3] === 0) return 0; // both fully transparent

		const rmean = (p1[0] + p2[0]) / 2;
		const r = p1[0] - p2[0];
		const g = p1[1] - p2[1];
		const b = p1[2] - p2[2];
		return Math.sqrt(
			(((512 + rmean) * r * r) >> 8) +
				4 * g * g +
				(((767 - rmean) * b * b) >> 8)
		);
	}

	private scanImage(
		direction: Direction,
		flip: boolean,
		moving: boolean
	): number | null {
		let pixel: Pixel;
		let result: number | null = null;
		let a = this.width;
		let b = this.height;
		if (flip) {
			a = this.height;
			b = this.width;
		}
		AutoCrop.scan(
			a,
			b,
			direction,
			(x: number, y: number, first: boolean) => {
				if (flip) {
					const t = x;
					x = y;
					y = t;
				}
				if (first) {
					pixel = this.getPixel(x, y);
					return true;
				} else {
					const p2 = this.getPixel(x, y);
					const diff = this.getDifference(pixel, p2);
					if (moving) {
						pixel = p2;
					}
					if (diff <= 50) {
						return true;
					} else {
						result = flip ? y : x;
						if (direction < 0) result++;
						return false;
					}
				}
			}
		);
		return result;
	}

	private static scan(
		a: number,
		b: number,
		direction: Direction,
		cb: (a: number, b: number, first: boolean) => boolean
	) {
		const iStop = direction > 0 ? a : -1;
		const jStart = direction > 0 ? 0 : b - 1;
		const jStop = direction > 0 ? b : -1;
		for (let i = direction > 0 ? 0 : a - 1; i != iStop; i += direction) {
			let f = true;
			for (let j = jStart; j != jStop; j += direction) {
				if (!cb(i, j, f)) return;
				f = false;
			}
		}
	}
}
