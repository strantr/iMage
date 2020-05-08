/// <reference path="../plugin.ts" />

interface Project {
	id: number;
	hide_as_adult: boolean;
	hash_id: string;
}

GM.entryPoint("artstation ✨", (log) => {
	class artstation extends iMagePlugin {
		private static blocklist = [
			"/c/32020.json",
			"cart/guest/count.json",
			"/marketplace/products/",
			"ng-version.txt",
			"/comments.json",
			"/views_tracking/entity_views.json",
			"/top_row_items.json",
			"/public_announcements/current.json",
			"/blogging/posts/",
			"/messaging/messages/",
		];

		private static css = `
			community-subscriptions,
			community-subscriptions ~ *,
			.gallery-marketplace, 
			.get-started,
			.home-top-row,
			.gallery-container .gallery-projects .project:nth-child(12):after,
			*[ng-show*='!currentUser.turn_off_ads']
			{
				display: none !important;
			}
		`;

		private ready: Promise<void>;
		private project: Project | undefined;
		private projectLoaded: (() => void) | undefined;

		constructor() {
			super(log);

			// Add custom CSS
			const style = document.createElement("style");
			style.textContent = artstation.css;

			let resolve: () => void;
			this.ready = new Promise((r) => (resolve = r)).then(() => {
				log("Page ready");
				document.body.appendChild(style);
			});

			if (
				document.readyState === "complete" ||
				document.readyState === ("loaded" as any) ||
				document.readyState === "interactive"
			) {
				resolve!();
			} else {
				document.addEventListener("DOMContentLoaded", () => {
					resolve();
				});
			}

			// Add context menu on mouse down
			document.addEventListener("mousedown", (e) => {
				if (e.button == 2) {
					this.addMenu(".project");
				}
			});

			// Handle context menu click
			window.addEventListener(
				"iMage:hide",
				async (e: Event & { menuSource?: Element }) => {
					if (e.menuSource) {
						let target: Element | null = e.menuSource.closest(
							".project"
						)!;
						const next = target.nextElementSibling;
						const hide: number[] = [];
						do {
							const id = +target
								.querySelector("[artstation-open-project]")!
								.getAttribute("artstation-open-project")!;
							(target as HTMLElement).style.display = "none";
							hide.push(id);
						} while ((target = target.previousElementSibling));
						log("Hiding", hide.length, "projects");
						await this.storeView(hide);
						if (
							next &&
							(next as HTMLElement).classList.contains("project")
						) {
							next.scrollIntoView();
						}
					}
				}
			);

			// Block pointless requests
			this.on(
				"xhr:sending",
				async (xhr) =>
					!artstation.blocklist.find((b) => xhr.url.includes(b))
			);

			// Filter viewed projects
			this.on("xhr:loaded", (x) => this.handleXhr(x));

			// Handle viewing artwork pages
			this.on("navigate", (l, f) => this.navigated(l, f));

			// Handle viewing artwork pages
			this.on("stored", (i) => this.projectsViewed(i as number[]));
		}

		private async handleXhr(xhr: XMLHttpRequest & { url: string }) {
			const setResponse = (data: string) =>
				Object.defineProperties(xhr, {
					response: {
						get: () => data,
					},
					responseText: {
						get: () => data,
					},
				});

			const isArtPage = window.location.pathname.startsWith("/artwork/");
			if (isArtPage) {
				const id = window.location.pathname.split("/").pop()!;
				if (xhr.url.endsWith("/projects/" + id + ".json")) {
					// Project page viewed
					this.project = JSON.parse(xhr.responseText) as Project;
					await this.storeView(this.project.id);
					this.project.hide_as_adult = false;
					setResponse(JSON.stringify(this.project));
					if (this.projectLoaded) {
						this.projectLoaded();
					}
					return;
				}
			} else if (
				window.location.pathname === "" &&
				xhr.url.match(/projects.json\?page=\d+&randomize=true/)
			) {
				return;
			}
			try {
				const projects = JSON.parse(xhr.responseText);
				if (artstation.isProjectResponse(projects)) {
					const existing = await this.hasViewed(
						projects.data.map((d) => {
							d.hide_as_adult = false;
							return d.id;
						})
					);
					const first = projects.data[0];
					const fullCount = projects.data.length;
					projects.data = projects.data.filter(
						(d) => !existing.has(d.id)
					);

					log(
						`Filtered ${
							fullCount - projects.data.length
						}/${fullCount} projects`
					);

					if (isArtPage) {
						if (projects.data.length) {
							this.waitFor(() => {
								(document.querySelector(
									".artist .pull-left img"
								) as HTMLElement).style.border =
									"5px solid #ff0000";
								return Promise.resolve();
							});
						}
					}

					if (!projects.data.length) {
						first.hide_as_adult = true;
						projects.data = [first];
					}
					setResponse(JSON.stringify(projects));
				}
			} catch (error) {
				log(error);
			}
		}

		private async navigated(location: string, first: boolean) {
			if (location.includes("/artwork/")) {
				this.handleArtworkPage(first);
			} else {
				this.projectLoaded = this.project = undefined;
				const els = [
					...document.querySelectorAll(`a[artstation-open-project]`),
				];
				for (const el of els) {
					const id = +el.getAttribute("artstation-open-project")!;
					if (await this.hasViewed(id)) {
						el.parentElement!.style.filter = "sepia(1) blur(2px)";
					}
				}
			}
		}

		private async handleArtworkPage(first: boolean) {
			if (first) {
				await this.ready;
				const dataScript = [
					...document.querySelectorAll("script"),
				].find((s) =>
					s.textContent?.includes("cache.put('/projects/")
				)!;
				const js = dataScript.textContent!;
				const pos = js.indexOf("cache.put('/projects/");
				const fn = js.substring(pos + 9, js.length - 5);

				this.project = (await new Promise((r) => {
					const get = (_id: string, data: string) =>
						r(JSON.parse(data));
					eval(get.name + fn);
				})) as Project;

				this.storeView(this.project.id);
			}

			if (!this.project) {
				await new Promise((r) => (this.projectLoaded = r));
			}
			if (!this.project) {
				log("Current project not set");
				return;
			}

			log("Artwork page", this.project.id, this.project.hash_id);
			const pictures = await this.waitFor(async () => {
				const pics = document.querySelectorAll("picture");
				if (pics.length) {
					return Promise.resolve(pics);
				} else {
					return Promise.reject();
				}
			});

			const loading = document.createElement("div");
			Object.assign(loading.style, {
				backgroundImage:
					"url(http://samherbert.net/svg-loaders/svg-loaders/puff.svg)",
				width: "80px",
				height: "80px",
				display: "flex",
				alignItems: "center",
				color: "lightskyblue",
				fontWeight: "bold",
				textAlign: "center",
				lineHeight: "24px",
				margin: "20px auto",
				backgroundSize: "contain",
			});
			loading.textContent = `Loading... 0/${pictures.length}`;
			const main = document.querySelector("main.artwork-container")!;
			main.prepend(loading);

			let loadCount = 0;
			const loaded = () => {
				loading.textContent = `Loading... ${++loadCount}/${
					pictures.length
				}`;
				if (+loadCount === pictures.length) {
					loading.remove();
				}
			};
			for (const picture of pictures) {
				const img: HTMLImageElement = picture.querySelector("img")!;
				if (!img.naturalWidth) {
					img.onload = loaded;
				} else {
					loaded();
				}

				const assetId = picture
					.closest(".artwork")!
					.getAttribute("data-id");
				const meta = JSON.stringify({ project: this.project, assetId });
				const src = img.getAttribute("src");
				const href = `${src}#id=${
					this.project.id
				}&metadata=${encodeURIComponent(meta)}`;

				const wrapper = document.createElement("a");
				wrapper.href = href;
				picture.parentNode!.insertBefore(wrapper, picture);
				wrapper.appendChild(picture);
			}
		}

		private async projectsViewed(ids: number[]) {
			let hidden = 0;
			for (const id of ids) {
				const el = document.querySelector(
					`a[artstation-open-project="${id}"`
				);
				if (el && el.parentElement!.style.display !== "none") {
					hidden++;
					el.parentElement!.style.filter = "sepia(1) blur(2px)";
				}
			}
			if (hidden) {
				log(`Hidden ${hidden} via broadcast`);
			}
		}

		private static isProjectResponse(
			data: any
		): data is { data: Project[] } {
			return (
				data &&
				data.data &&
				data.data instanceof Array &&
				data.data.length &&
				"hide_as_adult" in data.data[0]
			);
		}
	}

	log("Ready");
	new artstation();
});
