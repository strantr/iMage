/// <reference path="../plugin.ts" />

interface Project {
  id: number;
  hide_as_adult: boolean;
  hash_id: string;
}

GM.log("artstation ✨", "Initialising");
GM.app("artstation ✨", (log) => {
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
			.gallery-container .gallery-projects .project:nth-child(30)::after,
			*[ng-show*='!currentUser.turn_off_ads'],
			.adult-content-filter
			{
				display: none !important;
			}
		`;

    private project: Project | undefined;
    private projectLoaded: (() => void) | undefined;
    private projects: Record<number, Project> = {};

    constructor() {
      super(log);

      // Block pointless requests
      this.on(
        "xhr:sending",
        async (xhr) => !artstation.blocklist.find((b) => xhr.url.includes(b))
      );

      // Filter viewed projects
      this.on("xhr:loaded", (x) => this.handleXhr(x));
      this.on("stored", (i) => this.projectsViewed(i as number[]));

      // Handle switching pages
      this.on("navigate", (l, f) => this.navigated(l, f));

      // Add custom CSS
      const onready = () => {
        const style = document.createElement("style");
        style.textContent = artstation.css;
        log("Page ready");
        document.body.appendChild(style);
      };
      if (
        document.readyState === "complete" ||
        document.readyState === ("loaded" as any) ||
        document.readyState === "interactive"
      ) {
        onready();
      } else {
        document.addEventListener("DOMContentLoaded", () => {
          onready();
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
        async (e: Event & { detail?: HTMLImageElement }) => {
          const isInViewport = function (elem: HTMLElement) {
            var bounding = elem.getBoundingClientRect();
            return (
              bounding.top >= 0 &&
              bounding.left >= 0 &&
              bounding.bottom <=
                (window.innerHeight || document.documentElement.clientHeight) &&
              bounding.right <=
                (window.innerWidth || document.documentElement.clientWidth)
            );
          };

          if (e.detail) {
            let target: Element | null = e.detail.closest(".project")!;
            const next: HTMLElement = target.nextElementSibling as HTMLElement;
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
            if (next && next.classList.contains("project")) {
              if (!isInViewport(next)) {
                next.scrollIntoView();
              }
            }
          }
        }
      );
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
      let isMosaic: boolean = false;

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
      } else {
        isMosaic =
          window.location.pathname === "/" &&
          !!xhr.url.match(/projects.json\?page=\d+&randomize=true/);
      }
      try {
        const projects = JSON.parse(xhr.responseText);
        if (artstation.isProjectResponse(projects)) {
          const existing = await this.hasViewed(
            projects.data.map((d) => {
              this.projects[d.id] = d;
              return d.id;
            })
          );
          const first = projects.data[0];
          const fullCount = projects.data.length;
          let filtered: number = 0;
          if (isMosaic) {
            for (const proj of projects.data) {
              if ((proj.hide_as_adult = existing.has(proj.id))) {
                filtered++;
              }
            }
            projects.data.sort((a, b) => +a.hide_as_adult - +b.hide_as_adult);
          } else {
            projects.data = projects.data.filter((d) => {
              if (existing.has(d.id)) {
                return false;
              } else {
                d.hide_as_adult = false;
                return true;
              }
            });
            filtered = fullCount - projects.data.length;
          }

          log(xhr.url, `Filtered ${filtered}/${fullCount} projects`);

          if (isArtPage) {
            if (projects.data.length) {
              this.waitFor(() => {
                (document.querySelector(
                  ".artist .pull-left img"
                ) as HTMLElement).style.border = "5px solid #ff0000";
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
      this.projects = {};

      if (location.includes("/artwork/")) {
        this.handleArtworkPage(first);
      } else {
        this.projectLoaded = this.project = undefined;
      }

      let i = 5;
      while (i-- > 0) {
        const els = [
          ...document.querySelectorAll(`a[artstation-open-project]`),
        ];

        if (els.length) {
          i = 0;
          log("Found", els.length, "projects on page");
          for (const el of els) {
            const id = +el.getAttribute("artstation-open-project")!;
            if (await this.hasViewed(id)) {
              el.parentElement!.style.display = "none";
            }

            (el as HTMLElement).addEventListener("mouseup", (e) => {
              if (e.button === 0 || e.button === 1) {
                this.storeView(id);
              }
            });

            // (el as HTMLElement).addEventListener(
            // 	"mouseover",
            // 	(e) => {
            // 		console.log(id, this.projects[id]);
            // 	}
            // );
          }
        } else {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }

    private async handleArtworkPage(first: boolean) {
      if (first) {
        const dataScript = await this.waitFor(async () => {
          const script = [...document.querySelectorAll("script")].find((s) =>
            s.textContent?.includes("cache.put('/projects/")
          )!;
          if (script) {
            return Promise.resolve(script);
          } else {
            return Promise.reject();
          }
        });

        const js = dataScript.textContent!;
        const pos = js.indexOf("cache.put('/projects/");
        const fn = js.substring(pos + 9, js.length - 5);
        this.project = (await new Promise((r) => {
          const get = (_id: string, data: string) => {
            return r(JSON.parse(data));
          };
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
        loading.textContent = `Loading... ${++loadCount}/${pictures.length}`;
        if (+loadCount === pictures.length) {
          loading.remove();

          if (pictures.length > 1) {
            const thumbs = document.createElement("div");
            Object.assign(thumbs.style, {
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
            });
            for (const picture of pictures) {
              const img = picture.querySelector("img") as HTMLImageElement;
              const thumb: HTMLImageElement = document.createElement("img");
              Object.assign(thumb.style, {
                width: "15%",
                height: "auto",
                objectFit: "contain",
                marginRight: "5px",
                cursor: "pointer",
                maxHeight: "200px",
                marginBottom: "10px",
              });
              thumb.onclick = () => {
                picture.scrollIntoView();
              };
              thumb.src = img.src;
              thumbs.appendChild(thumb);
            }
            main.prepend(thumbs);
          }
        }
      };

      for (const picture of pictures) {
        const img: HTMLImageElement = picture.querySelector("img")!;
        if (!img.naturalWidth) {
          img.onload = loaded;
        } else {
          loaded();
        }

        const assetId = picture.closest(".artwork")!.getAttribute("data-id");
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
        const el = document.querySelector(`a[artstation-open-project="${id}"`);
        if (el && el.parentElement!.style.display !== "none") {
          hidden++;
          el.parentElement!.style.filter = "sepia(1) blur(2px)";
        }
      }
      if (hidden) {
        log(`Hidden ${hidden} projects`);
      }
    }

    private static isProjectResponse(data: any): data is { data: Project[] } {
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
