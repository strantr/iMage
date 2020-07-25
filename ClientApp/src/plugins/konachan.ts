/// <reference path="../plugin.ts" />

GM.log("konachan 🎎", "Initialising");
GM.app("konachan 🎎", (log) => {
	class konachan extends iMagePlugin {
		private get isPostList() {
			return !!document.querySelector("#post-list-posts");
		}
		private get isPostView() {
			return !!document.querySelector("#post-view");
		}

		constructor() {
			super(log);
			this.on("ready", () => this.ready());
		}

		private ready() {
			log("Page ready");

			if (this.isPostList) {
				this.handlePostList();
			} else if (this.isPostView) {
				this.handlePostView();
			}
		}

		private hideBefore(link: HTMLElement) {
			let post: HTMLElement = link.closest("li")!;
			let next = post ? post.nextElementSibling : null;
			while (post) {
				const id = post.getAttribute("id")!.substr(1);
				this.storeView(id, true);
				const t = post.previousElementSibling as HTMLElement;
				post.remove();
				post = t;
			}
			if (next) {
				if (!konachan.isInViewport(next)) {
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

		private handlePostList() {
			this.on("stored", this.stored);

			this.addMenu("#post-list-posts li");
			window.addEventListener(
				"iMage:hide",
				async (e: Event & { detail?: HTMLImageElement }) => {
					if (e.detail) {
						this.hideBefore(e.detail);
					}
				}
			);

			GM.addStyle({
				style: {
					"#post-list": {
						display: "flex",
						overflow: "hidden",
					},
					"#post-list .content": {
						"flex-grow": 1,
					},
					"#post-list-posts .javascript-hide": {
						display: "inline-block !important",
					},
					"#post-list-posts": {
						display: "flex !important",
						"flex-wrap": "wrap",
						"align-items": "center",
						"justify-content": "space-between",
					},
					"#post-list-posts li": {
						width: "unset !important",
					},
					"#post-list-posts .inner": {
						width: "unset !important",
						height: "unset !important",
					},
					"#post-list-posts li img": {
						"min-width": "400px !important",
						height: "auto",
					},
					"#lsidebar": {
						display: "none",
					},
				},
			});

			this.hideViewed([...document.querySelectorAll("#post-list-posts li")]);
			this.addInfiniteScrolling();
		}

		private addInfiniteScrolling() {
			const lastPageElement = document.querySelector(
				".pagination a:nth-last-child(2)"
			)! as HTMLLinkElement;
			const lastPage = +lastPageElement.textContent!.trim();
			const pageFormat = lastPageElement.href.match(/(.*page=)(\d+)(.*)/)!;
			super.infiniteScrolling(
				(page) => `${pageFormat[1]}${page}${pageFormat[3]}`,
				1,
				lastPage,
				"#post-list-posts",
				async (nodes) => {
					const links = nodes.filter(
						(n) => (n as HTMLElement).tagName == "LI"
					) as HTMLElement[];

					const toAdd: HTMLElement[] = [];
					for (const link of links) {
						if (!(await this.hasViewed(link.getAttribute("id")!.substr(1)))) {
							toAdd.push(link);
						}
					}

					this.addMenu(toAdd);
					return toAdd;
				}
			);
		}

		private async hideViewed(nodes: Element[]) {
			for (const node of nodes) {
				const id = node.getAttribute("id")!.substr(1);
				if (await this.hasViewed(id)) {
					node.remove();
				}
			}
		}

		private async stored(ids: (string | number)[]) {
			log("Broadcast recieved:", ids);
			let hidden = 0;
			for (const id of ids) {
				const post = document.querySelector("#p" + id) as HTMLElement;
				if (post) {
					hidden++;
					post.style.filter = "sepia(1) blur(2px)";
				}
			}
			log("Found and updated", `${hidden}/${ids.length}`, "projects on page");
		}

		private handlePostView() {
			GM.addStyle({
				style: {
					"#post-view": {
						display: "flex",
						overflow: "hidden",
						"flex-direction": "column-reverse",
					},
					"#right-col": {
						width: "100%",
					},
					"#image": {
						width: "100%",
						height: "auto",
					},
					"#image:hover": {
						cursor: "pointer",
						width: "unset",
						height: "auto",
					},
					"#post-view .sidebar": {
						width: "100%",
						display: "flex",
					},
					".sidebar > div": {
						"margin-right": "1em",
					},
					".footer, #resized_notice, #post-view #right-col div + div": {
						display: "none",
					},
				},
			});

			const image = document.querySelector("#image")!;
			const id = window.location.href.match(/post\/show\/(\d+)/)![1];
			const post = unsafeWindow.Post.posts._object[id];
			const meta = JSON.stringify(post);
			const href = `${post.file_url}#id=${id}&metadata=${encodeURIComponent(
				meta
			)}`;

			this.createElement("a", {
				props: {
					href,
				},
				before: image.parentElement!,
			}).append(image);

			this.storeView(id, true);
		}
	}
	log("Ready!");
	new konachan();
});
