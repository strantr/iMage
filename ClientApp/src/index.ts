/// <reference path="./gm.ts" />
/// <reference path="./cropper.ts" />

GM.app("🧙‍♂️🖼", async (log) => {
	if (!GM.metadata["host"]) {
		throw new Error("@host userscript metadata not set.");
	}
	log("Running!", "Host:", GM.metadata["host"]);

	// Remove default styles
	for (const link of [
		...document.querySelectorAll("head link[rel='stylesheet']"),
	]) {
		link.remove();
	}
	GM.addStyle({
		resourceName: "main-css",
	});

	GM.addStyle({
		resourceName: "cropperjs-css",
	});

	const image = document.querySelector("img")!;
	if (!image.complete) {
		await new Promise((r) => (image.onload = r));
	}
	image.style.display = "none";

	const canvas = document.createElement("canvas") as HTMLCanvasElement;
	const ctx = canvas.getContext("2d")!;
	canvas.height = image.naturalHeight;
	canvas.width = image.naturalWidth;
	ctx.drawImage(image, 0, 0);
	const imageData = canvas.toDataURL("image/png");

	const VCropper = getVCropper(log, image, imageData);
	document.body.append(
		new VCropper({
			el: document.createElement("div"),
		}).$el
	);
});
