/// <reference path="../plugin.ts" />

interface Project {
	id: number;
	hide_as_adult: boolean;
	hash_id: string;
}

interface ProjectElement {
	id: number;
	hash: string;
	link: HTMLElement;
	parent: HTMLElement;
}

GM.log("artstation ✨", "Initialising");
GM.app("artstation ✨", (log) => {
	class artstation extends iMagePlugin {
		private static artworkLinkSelector = "[href*='/artwork/']";

		private static blocklist = [
			"/announcements/",
			"/notifications/",
			"/messaging/",
			"/cart/",
			"/learning/",
			"/marketplace/",
			"/prints/",
			"/blogging/",
			"/views_tracking/",
			"/top_row_items.json",
			"/52020.json",
			"/jobs.json",
			"/myartstation/settings/user_blocks.json",
			"ng-version.txt",
			"comments.json",
			"profitwell.com",
		];

		private static css = `
			hello-world,
			sidebar-product,
			marketplace-popular-product,
			featured-magazine-posts,
			subscription-plans,
			learning-courses,
			marketplace-products,
			art-prints-carousel,
			featured-jobs,
			blogs-trending,
			latest-magazine-posts,
			.mobile-apps,
			.chrome-store,
			.home-books,
			.site-footer,
			.corporate-footer,
			.project-comments-title,
			.project-comments-form,
			[ng-if="user.show_store"],
			[ng-if="user.show_prints"],
			[ng-if="user.show_blog"],
			[ng-class="{active: action=='challenges'}"],
			[ng-class="{active: action=='following'}"],
			[ng-class="{active: action=='followers'}"],
			[ng-class="{active: action=='profile'}"],
			li[ng-if="showResourceActions"],
			[ng-authorized-click="showUserMessageModal()"]
			{
				display: none !important;
			}
			sticky-navigation+ul.list-inline {
				position: absolute;
				z-index: 9999;
				right: 0;
				margin-top: -50px;
			}
		`;

		private activeRequests: Map<
			XMLHttpRequest2,
			{ wait: Promise<void>; resolve: () => void }
		> = new Map();
		private projectsById: Record<number, Project> = {};
		private projectsByHash: Record<string, Project> = {};
		private progress = { total: 0, current: 0 };
		private previousPage: string | null = null;

		private get currentPage():
			| "community"
			| "list"
			| "likes"
			| "artwork"
			| "other" {
			const page = window.location.toString();
			if (page.includes("/community/channels?sort_by=community")) {
				return "community";
			}
			if (page.endsWith("/likes")) {
				return "likes";
			}
			if (page.includes("/community/")) {
				return "list";
			}
			if (page.includes("/artwork/")) {
				return "artwork";
			}

			return "other";
		}

		constructor() {
			super(log);

			this.on("xhr:sending", this.xhrSending);
			this.on("xhr:loaded", this.xhrLoaded);

			this.on("ready", this.ready);
			this.on("navigate", this.navigated);
			this.on("stored", this.projectStored);

			document.addEventListener("mouseup", this.mouseUp.bind(this), {
				capture: true,
			});

			window.addEventListener(
				"iMage:hide",
				async (e: Event & { detail?: HTMLImageElement }) => {
					if (e.detail) {
						this.hideProjectsBefore(e.detail);
					}
				}
			);
		}

		private hideProjectsBefore(link: HTMLImageElement) {
			let project = this.getProject(link, "ancestor");
			let next = project ? project.parent.nextElementSibling : null;
			while (project) {
				this.viewedProject(project, true);
				this.storeView(project.id, true);
				project = this.getProject(
					project.parent.previousElementSibling as HTMLElement,
					"descendant"
				);
			}
			if (next) {
				if (!artstation.isInViewport(next)) {
					next.scrollIntoView({
						behavior: "smooth",
						block: "center",
						inline: "center",
					});
				}
			} else {
				window.scrollTo({
					behavior: "smooth",
					top: 0,
				});
			}
		}

		private mouseUp(e: MouseEvent) {
			if (e.button === 0 || e.button === 1) {
				// Hide images on mouseup
				const proj = this.getProject(e.srcElement as HTMLElement, "ancestor");
				if (proj) {
					log("Viewed project", proj);
					this.viewedProject(proj, false);
					this.storeView(proj.id, false);
				}
			} else if (e.button === 2) {
				this.addMenu(artstation.artworkLinkSelector);
			}
		}

		private ready() {
			log("Page ready");
			GM.addStyle(artstation.css);
		}

		private getHashFromUrl(url: string = window.location.toString()) {
			return url.split("/artwork/")[1];
		}

		private getProject(
			el: HTMLElement,
			findLink: "ancestor" | "descendant" | false
		) {
			let link: HTMLElement | null = el;
			if (el) {
				if (findLink === "ancestor") {
					link = el.closest(artstation.artworkLinkSelector) as HTMLElement;
				} else if (findLink === "descendant") {
					if (el.matches(artstation.artworkLinkSelector)) {
						link = el;
					} else {
						link = el.querySelector(artstation.artworkLinkSelector);
					}
				}
			}

			if (!link) {
				return null;
			}

			const hash = this.getHashFromUrl(link.getAttribute("href")!);
			if (!(hash in this.projectsByHash)) {
				console.error("Project not found by hash", hash, this.projectsByHash);
				return null;
			}
			const id = this.projectsByHash[hash].id;
			return {
				id,
				hash,
				link,
				get parent() {
					return (
						(link!.closest(
							"projects-list-item, .project, .more-artworks-item, .mosaic-element"
						) as HTMLElement) || link
					);
				},
			};
		}

		private async getProjectsOnPage(
			waitForAny: boolean
		): Promise<ProjectElement[]> {
			let projects: ProjectElement[];
			let step = 0;
			do {
				if (projects!) {
					await new Promise((r) => setTimeout(r, 100));
				}
				projects = [
					...document.querySelectorAll(artstation.artworkLinkSelector),
				]
					.map((el) => this.getProject(el as HTMLElement, false)!)
					.filter((a) => a);
			} while (waitForAny && !projects.length && ++step < 10);

			return projects;
		}

		private async findProjectOnPage(id: number) {
			const projects = await this.getProjectsOnPage(false);
			return projects.find((p) => p.id === id);
		}

		private viewedProject(proj: ProjectElement, hide: boolean) {
			if (hide) {
				proj.parent.style.display = "none";
			} else {
				proj.parent.style.filter = "sepia(1) blur(2px)";
			}
		}

		private async hideProjectsOnPage() {
			// Handle hiding projects on the page on load/cached
			const projects = await this.getProjectsOnPage(true);
			const seen = await this.hasViewed(projects.map((p) => p.id));
			log("Hiding", `${seen.size}/${projects.length}`, "projects on page");
			for (const proj of projects) {
				if (seen.has(proj.id)) {
					this.viewedProject(proj, true);
				}
			}
		}

		private async handleArtworkPage(first: boolean) {
			const forceHighRes = (pictures: NodeListOf<HTMLPictureElement>) => {
				for (const picture of pictures) {
					const source = picture.querySelectorAll("source")!;
					for (const s of source) {
						s.remove();
					}
				}
			};

			const waitForLoad = async (
				pictures: NodeListOf<HTMLPictureElement>,
				main: HTMLElement
			) => {
				// Add loading indicator
				let loaded: () => void;
				const wait = new Promise((r) => (loaded = r));
				const loading = this.createElement("div", {
					style: {
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
					},
					text: `Loading... 0/${pictures.length}`,
					startOf: main,
				});

				let loadCount = 0;
				const onload = () => {
					if (++loadCount === pictures.length) {
						loaded();
					} else {
						loading.textContent = `Loading... 0/${pictures.length}`;
					}
				};

				for (const picture of pictures) {
					const img: HTMLImageElement = picture.querySelector("img")!;
					if (img.complete) {
						onload();
					} else {
						img.onload = onload;
					}
				}

				await wait;
				log("All images loaded");
				loading.remove();
			};

			const createThumbs = (
				pictures: NodeListOf<HTMLPictureElement>,
				main: HTMLElement
			) => {
				this.createElement("div", {
					style: {
						display: "flex",
						flexWrap: "wrap",
						justifyContent: "center",
					},
					startOf: main,
					children: [...pictures].map((p) =>
						this.createElement("img", {
							style: {
								width: "15%",
								height: "auto",
								objectFit: "contain",
								marginRight: "5px",
								cursor: "pointer",
								maxHeight: "200px",
								marginBottom: "10px",
							},
							props: {
								src: p.querySelector("img")!.src,
								onclick: () =>
									p.scrollIntoView({
										behavior: "smooth",
										block: "center",
										inline: "center",
									}),
							},
						})
					),
				});
			};

			let project: Project;
			if (first) {
				// On initial load the JSON for the current project is stored in a script tag
				// hacky method for extracting it:
				const script = [...document.querySelectorAll("script")].find((s) =>
					s.textContent?.includes("cache.put('/projects/")
				)!;

				const js = script.textContent!;
				const pos = js.indexOf("cache.put('/projects/");
				const fn = js.substring(pos + 9, js.length - 5);
				project = (await new Promise((r) => {
					const get = (_id: string, data: string) => {
						return r(JSON.parse(data));
					};
					eval(get.name + fn);
				})) as Project;

				this.projectsByHash[project.hash_id] = this.projectsById[
					project.id
				] = project;
			} else {
				project = this.projectsByHash[this.getHashFromUrl()];
			}

			log("Artwork page", project.id, project.hash_id);
			this.storeView(project.id, true);

			const main = document.querySelector(
				"main.artwork-container"
			)! as HTMLElement;
			const pictures = document.querySelectorAll("picture");
			log("Found", pictures.length, "pictures on page");
			forceHighRes(pictures);
			await waitForLoad(pictures, main);
			if (pictures.length > 1) {
				createThumbs(pictures, main);
			}

			for (const picture of pictures) {
				const img: HTMLImageElement = picture.querySelector("img")!;
				const assetId = picture.closest(".artwork")!.getAttribute("data-id");
				const meta = JSON.stringify({ project: project, assetId });
				const src = img.getAttribute("src");
				const href = `${src}#id=${project.id}&metadata=${encodeURIComponent(
					meta
				)}`;
				this.createElement("a", {
					props: {
						href,
					},
					before: picture.parentElement!,
				}).append(picture);
			}
		}

		private async navigated(_: string, first: boolean) {
			if (this.previousPage !== "artwork" || this.currentPage !== "other") {
				// Maintain projects list from artwork page
				this.progress.current = 0;
				this.updateProgress(0, 0);
			} else {
				this.updateProgress(0, this.progress.total);
			}
			this.previousPage = this.currentPage;

			await this.waitFor(() => {
				if (Object.keys(this.projectsByHash).length) {
					return Promise.resolve();
				}
				return Promise.reject();
			});
			await this.waitForRequests();
			await this.hideProjectsOnPage();

			if (this.currentPage === "artwork") {
				this.handleArtworkPage(first);
			}
		}

		private async xhrSending(xhr: XMLHttpRequest2) {
			if (artstation.blocklist.find((b) => xhr.url!.includes(b))) {
				// Block pointless requests
				return false;
			}

			let resolve: () => void;
			let wait = new Promise<void>((r) => (resolve = r));
			this.activeRequests.set(xhr, { wait, resolve: resolve! });
			return true;
		}

		private async xhrLoaded(xhr: XMLHttpRequest2) {
			const data = xhr.getResponseJSON();

			// Filter out viewed projects
			if (artstation.isProjectResponse(data)) {
				const projects = data.data;
				const count = projects.length;
				const first = projects[0];
				const existing = await this.hasViewed(
					projects.map((proj) => {
						this.projectsById[proj.id] = this.projectsByHash[
							proj.hash_id
						] = proj;
						return proj.id;
					})
				);

				if (
					(this.currentPage === "likes" && xhr.url!.includes("likes.json")) ||
					((this.currentPage === "artwork" || this.currentPage === "other") &&
						xhr.url?.includes("projects.json"))
				) {
					this.updateProgress(
						projects.length || data.total_count,
						data.total_count
					);
				}

				data.data = projects.filter((p) => !existing.has(p.id));
				log(`Filtered ${count - data.data.length}/${count} projects`, xhr.url);

				if (this.currentPage !== "community" && !data.data.length) {
					data.data = [first];
					first.hide_as_adult = true;
				}
				xhr.setResponseJSON(data);
			}

			// Resolve request block
			const req = this.activeRequests.get(xhr)!;
			this.activeRequests.delete(xhr);
			req.resolve();
		}

		private scrollProgress: HTMLDivElement | null = null;
		private async updateProgress(add: number, total: number) {
			this.progress.current += add;
			this.progress.total = total;

			if (total === 0) {
				if (this.scrollProgress) {
					this.scrollProgress.remove();
					this.scrollProgress = null;
				}
				return;
			}

			if (!this.scrollProgress) {
				this.scrollProgress = this.createElement("div", {
					style: {
						zIndex: 99999,
						position: "fixed",
						top: 0,
						left: 0,
						background: "rgba(255, 255, 255, 0.5)",
						width: "100vw",
						height: "5px",
					},
					startOf: document.body,
				});
			}

			const w = (
				(this.progress.current / (this.progress.total || 1)) *
				100
			).toFixed(0);
			this.scrollProgress.style.borderLeft = `${w}vw inset ${
				w === "100" ? "dodgerblue" : "white"
			}`;
		}

		private async projectStored(ids: (string | number)[]) {
			log("Project view broadcast recieved:", ids);
			let hidden = 0;
			for (const id of ids) {
				const proj = await this.findProjectOnPage(+id);
				if (proj) {
					hidden++;
					this.viewedProject(proj, false);
				}
			}
			log("Found and updated", `${hidden}/${ids.length}`, "projects on page");
		}

		private async waitForRequests() {
			while (this.activeRequests.size) {
				log(
					"Waiting for",
					this.activeRequests.size,
					"request(s) to complete..."
				);
				await Promise.all([...this.activeRequests.values()].map((r) => r.wait));
			}
			log("All requests completed");
		}

		private static isProjectResponse(
			data: any
		): data is { data: Project[]; total_count: number } {
			return (
				data &&
				data.data &&
				data.data instanceof Array &&
				data.data.length &&
				"hide_as_adult" in data.data[0]
			);
		}

		private static isInViewport(elem: Element) {
			const bounding = elem.getBoundingClientRect();
			return (
				bounding.top >= 0 &&
				bounding.left >= 0 &&
				bounding.bottom <=
					(window.innerHeight || document.documentElement.clientHeight) &&
				bounding.right <=
					(window.innerWidth || document.documentElement.clientWidth)
			);
		}
	}

	log("Ready!");
	new artstation();
});
