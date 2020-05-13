/// <reference path="./gm.ts" />
/// <reference path="./autoCrop.ts" />
/// <reference path="../node_modules/vue/types/index.d.ts" />
/// <reference path="../node_modules/cropperjs/types/index.d.ts" />

interface Resolution {
	width: number;
	height: number;
}

interface Rectangle extends Resolution {
	x: number;
	y: number;
}

interface ImageMatch {
	match: string;
	similarity: number;
	recommendation: string;
}

function getVCropper(
	log: Console["log"],
	originalImage: HTMLImageElement,
	originalImageData: string
) {
	async function cloneImage() {
		const image = document.createElement("img");
		image.src = originalImage.src;
		if (!image.complete) {
			await new Promise((r) => (image.onload = r));
		}
		return image;
	}

	return Vue.extend({
		name: "v-cropper",
		template: GM.getResource("vcropper-html"),
		data() {
			return {
				image: null as HTMLImageElement | null,
				cropper: null as Cropper | null,
				movingCrop: true,
				paddingColor: null as string | null,
				cropperColor: null as string | null,
				resolution: null as Resolution | null,
				resolutions: [
					{ width: 2560, height: 1600 },
					{ width: 1080, height: 1920 },
				] as Resolution[],
				autoCropRect: null as Rectangle | null,
				saving: false,
				duplicates: null as ImageMatch[] | null,
				host: GM.metadata.host!,
			};
		},
		watch: {
			async image(
				newImage: HTMLImageElement | null,
				oldImage: HTMLImageElement | null
			) {
				if (oldImage) {
					oldImage.remove();
				}
				if (newImage) {
					document.body.append(newImage);
					this.createCropper();
				}
			},
			paddingColor() {
				this.updatePaddingColor();
			},
			cropperColor(color: string | null) {
				const modal = document.querySelector(
					".cropper-modal"
				) as HTMLDivElement;
				if (color === null) {
					modal.style.opacity = "0.5";
					modal.style.backgroundColor = "#000";
				} else {
					modal.style.opacity = "1";
					modal.style.backgroundColor = color;
				}
			},
			resolution() {
				if (this.cropper && this.resolution) {
					this.cropper.setAspectRatio(
						this.resolution.width / this.resolution.height
					);
				}
			},
		},
		methods: {
			getBestFit(): Resolution {
				if (!this.image) {
					return this.resolutions[0];
				}
				let percent = 1;
				let min = this.resolutions[0];
				for (const sz of this.resolutions) {
					const sX = sz.width / this.image.naturalWidth;
					const sY = sz.height / this.image.naturalHeight;
					const s = Math.max(sX, sY);
					const uW = this.image.naturalWidth * s;
					const uH = this.image.naturalHeight * s;
					const diff = uW - sz.width + (uH - sz.height);
					const t = sz.width * sz.height;
					const p = diff / t;

					if (p < percent) {
						percent = p;
						min = sz;
					}
				}

				return min;
			},
			createCropper() {
				if (this.cropper) {
					log("Destroy cropper");
					this.cropper.destroy();
				}
				if (!this.resolution || !this.image) return;
				this.cropper = new Cropper(this.image, {
					aspectRatio: this.resolution.width / this.resolution.height,
					guides: false,
					autoCropArea: 1,
					dragMode: "move",
					cropmove: (e) => {
						(this.cropper as any).limited = !e.detail.originalEvent
							.shiftKey;
					},
					ready: () => {
						this.updatePaddingColor();
					},
				});
			},
			async updatePaddingColor() {
				const bg = document.querySelector(
					".cropper-bg"
				) as HTMLDivElement;
				if (this.paddingColor) {
					bg.style.backgroundPosition = "-100%";
					bg.style.backgroundRepeat = "no-repeat";
					bg.style.backgroundColor = this.paddingColor;
				} else {
					bg.style.backgroundRepeat = "unset";
					bg.style.backgroundPosition = "unset";
				}
			},
			async autoCrop() {
				const autoCrop = new AutoCrop(originalImage);
				autoCrop.crop(this.movingCrop);
				this.resolution = this.getBestFit();
				this.image = await autoCrop.getImage();
				log("Auto-cropped image", autoCrop.cropBounds);
				this.autoCropRect = autoCrop.cropBounds;
			},
			async restoreOriginal() {
				this.image = await cloneImage();
				this.autoCropRect = null;
			},
			async save(opts: { crop: boolean; edit: boolean }) {
				let rect: Rectangle;
				this.saving = true;
				if (opts.crop) {
					const cropData = this.cropper!.getData()!;
					rect = {
						width: Math.round(cropData.width),
						height: Math.round(cropData.height),
						x: Math.round(
							cropData.x +
								(this.autoCropRect ? this.autoCropRect.x : 0)
						),
						y: Math.round(
							cropData.y +
								(this.autoCropRect ? this.autoCropRect.y : 0)
						),
					};
				} else {
					rect = { x: 0, y: 0, width: 0, height: 0 };
				}

				try {
					const location = window.location.href.replace(
						window.location.hash,
						""
					);
					const params = window.location.hash
						.substr(1)
						.split("&")
						.reduce((p, n) => {
							const s = n.split("=");
							p[s[0]] = decodeURIComponent(s[1]);
							return p;
						}, {} as Record<string, string>);
					let metadata: any = params["metadata"];
					try {
						metadata = JSON.parse(metadata);
					} catch (error) {}
					await GM.request({
						method: "POST",
						url: GM.metadata["host"] + "/api/image/save",
						data: {
							imageData: originalImageData,
							bounds: rect,
							openForEdit: opts.edit,
							metadata: {
								sourceUrl: location,
								sourceId: params["id"],
								data: metadata,
							},
							target: this.resolution,
						},
					});
				} catch (error) {
					const xhr = error as XMLHttpRequest;
					alert(
						`Error saving: ${xhr.status} ${xhr.statusText}: ${xhr.responseText}`
					);
				}
				this.saving = false;
			},
		},
		async created() {
			this.resolution = this.getBestFit();
			this.image = await cloneImage();
			this.duplicates = (
				await GM.request<ImageMatch[]>({
					method: "POST",
					url: GM.metadata["host"] + "/api/image/check",
					data: {
						imageData: originalImageData,
					},
					parse: true,
				})
			).sort((a, b) => b.similarity - a.similarity);
		},
	});
}
