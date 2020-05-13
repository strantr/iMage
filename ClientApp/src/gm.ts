type LogMessage = string | { text: string; style: string };
type LoadScriptOptions = {
	reloadOnChange?: boolean;
};

interface GM_xmlHttpRequest {
	url: string;
	method?: string;
	data?: string;
	headers?: Record<string, string>;
	onload: (r: XMLHttpRequest) => void;
	onerror: (r: XMLHttpRequest) => void;
}

interface GM_devConfig {
	host?: string;
	watch: {
		resources: boolean | string[];
		requires: boolean | string[];
	};
	log: boolean;
}

interface GM_resource {
	name: string;
	url: string;
	content: string;
}

type RequestOptions = Omit<GM_xmlHttpRequest, "onload" | "onerror" | "data"> & {
	data?: any;
	ensureSuccess?: boolean;
};

interface GM {
	// Standard
	xmlHttpRequest(opts: GM_xmlHttpRequest): XMLHttpRequest;
	info: {
		scriptMetaStr: string;
		script: {
			resources: GM_resource[];
		};
	};

	// Custom
	metadata: Record<string, string[]> & {
		dev?: GM_devConfig;
		host?: string;
	};
	log(section: LogMessage, ...messages: any[]): void;
	request<T>(opts: RequestOptions & { parse: true }): Promise<T>;
	request(opts: RequestOptions): Promise<XMLHttpRequest>;
	getResourceObj(resourceName: string): GM_resource;
	getResource(resourceName: string): string;
	addStyle(
		opts:
			| {
					style:
						| string
						| Record<string, Record<string, string | number>>;
			  }
			| { resourceName: string }
	): Promise<void>;
	entryPoint(id: string, callback: (log: Console["log"]) => void): void;
	entryPoints: Record<string, (log: Console["log"]) => void>;
}
declare const GM: GM;
declare const unsafeWindow: Window & Record<string, any>;

(() => {
	// Parse metadata
	GM.metadata = GM.info.scriptMetaStr.split("\n").reduce((p, n) => {
		const m = n.match(/\/\/\s*@([^\s]+)\s+(.*)/);
		if (m && m.length === 3) {
			if (m[1] === "dev") {
				p[m[1]] = {
					watch: { requires: true, resources: true },
					...JSON.parse(m[2]),
				} as GM_devConfig;
			} else {
				if (!(m[1] in p)) {
					p[m[1]] = [];
				}
				p[m[1]].push(m[2]);
			}
		}
		return p;
	}, {} as GM["metadata"]);
	if (GM.metadata.host) {
		GM.metadata.host = GM.metadata.host[0];
	}
	if (GM.metadata.dev && !GM.metadata.dev.host) {
		GM.metadata.dev.host = GM.metadata.host;
	}

	// Populate custom functions
	Object.assign(GM, {
		log(section, ...messages) {
			console.log(
				`%c[${section}]`,
				"color: dodgerblue; font-weight: bold",
				...messages
			);
		},
		request(opts: RequestOptions) {
			return new Promise((res, rej) => {
				const req = {
					...opts,
					onload: (x: XMLHttpRequest) => {
						if (
							opts.ensureSuccess === false ||
							(x.status >= 200 && x.status < 300)
						) {
							if ("parse" in opts) {
								res(JSON.parse(x.responseText));
							} else {
								res(x);
							}
						} else {
							rej(x);
						}
					},
					onerror: rej,
				};
				if (typeof req.data === "object") {
					req.data = JSON.stringify(req.data);
					if (!req.headers) {
						req.headers = {};
					}
					req.headers["Content-Type"] = "application/json";
				}
				GM.xmlHttpRequest(req);
			});
		},
		getResourceObj(resourceName) {
			const obj = GM.info.script.resources.find(
				(r) => r.name === resourceName
			);
			if (!obj) {
				throw new Error(`Resource '${resourceName}' not found.`);
			}
			return obj;
		},
		getResource(resourceName) {
			return GM.getResourceObj(resourceName).content;
		},
		addStyle(opts) {
			const style = document.createElement("style");
			if ("resourceName" in opts) {
				style.textContent = GM.getResource(opts.resourceName);
			} else if (typeof opts.style === "string") {
				style.textContent = opts.style;
			} else {
				const s = opts.style;
				style.textContent = Object.keys(s)
					.map((selector) => {
						return (
							selector +
							" { " +
							Object.keys(s[selector])
								.map((prop) => `${prop}: ${s[selector][prop]}`)
								.join(";") +
							"}"
						);
					})
					.join(" ");
			}
			document.body.appendChild(style);
		},
		entryPoint(id, cb) {
			if (!GM.entryPoints) {
				GM.entryPoints = {};
			}
			GM.entryPoints[id] = cb;
		},
	} as GM);
})();

(async () => {
	// Entry point watching already configured
	if ((GM as any).entryPoints) {
		return;
	}

	// Setup watchers and initialise
	async function loadExternal(url: string): Promise<string> {
		let prev: string | null = null;
		if (GM.metadata.dev && GM.metadata.dev.log) {
			GM.log("🐵🛠", `Loading external resource:`, url);
		}
		return new Promise<string>(async (r) => {
			do {
				const uid = new Date().valueOf();
				const u = `${url}${url.includes("?") ? "&" : "?"}uid=${uid}`;
				let resource: string | undefined;
				try {
					resource = (
						await GM.request({
							url: u,
							method: "GET",
						})
					).responseText;
				} catch (error) {
					GM.log("🐵🛠", "Error checking resource:", url);
					await new Promise((r) => setTimeout(r, 1000));
					continue;
				}

				if (prev) {
					if (prev !== resource) {
						GM.log("🐵🛠", "Change detected:", url, "Reloading...");
						window.location.reload();
					}
					await new Promise((r) => setTimeout(r, 500));
				} else {
					if (GM.metadata.dev && GM.metadata.dev.log) {
						GM.log("🐵🛠", "Loaded external resource:", url);
					}
					r(resource);
					prev = resource;
				}
			} while (true);
		});
	}

	async function loadScript(url: string) {
		eval(await loadExternal(url));
	}

	async function loadResource(resourceName: string, url: string) {
		GM.getResourceObj(resourceName).content = await loadExternal(url);
	}

	if (GM.metadata.dev) {
		GM.log("🐵🛠", "Loading dev resources: ", GM.metadata.dev.host);
		if (GM.metadata.dev.watch.requires === true) {
			if (!GM.metadata.dev.host) {
				throw new Error("Development host domain must be set");
			}
			for (const req of GM.metadata["require"]) {
				if (req.startsWith(GM.metadata.dev.host)) {
					await loadScript(req);
				}
			}
		} else if (GM.metadata.dev.watch.requires instanceof Array) {
			for (const req of GM.metadata.dev.watch.requires) {
				await loadScript(req);
			}
		}

		if (GM.metadata.dev.watch.resources === true) {
			if (!GM.metadata.dev.host) {
				throw new Error("Development host domain must be set");
			}
			for (const res of GM.info.script.resources) {
				if (res.url.startsWith(GM.metadata.dev.host)) {
					await loadResource(res.name, res.url);
				}
			}
		} else if (GM.metadata.dev.watch.resources instanceof Array) {
			for (const res of GM.metadata.dev.watch.resources) {
				const obj = GM.getResourceObj(res);
				await loadResource(obj.name, obj.url);
			}
		}
	}

	requestAnimationFrame(() => {
		for (const entryPoint in GM.entryPoints) {
			if (GM.metadata.dev && GM.metadata.dev.log) {
				GM.log("🐵🛠", "Invoking entry point:", entryPoint);
			}
			GM.entryPoints[entryPoint]((...msg) => GM.log(entryPoint, ...msg));
		}
	});
})();
