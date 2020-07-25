/// <reference path="./gm.ts" />

interface XMLHttpRequest2 extends XMLHttpRequest {
	url: string | undefined;
	method: string | undefined;
	getResponseJSON<T extends {}>(): T;
	setResponseJSON(data: {}): void;
}

const iMagePlugin = (() => {
	const _windowId = window.location.toString() + "|" + Math.random();
	const _EVENTS_ = Symbol();
	const _xhr: typeof XMLHttpRequest = unsafeWindow.XMLHttpRequest;
	let _listeners: {
		sending?: (xhr: XMLHttpRequest2) => Promise<boolean>;
		loaded?: (xhr: XMLHttpRequest2) => Promise<void>;
	};

	class _XMLHttpRequest2 extends _xhr implements XMLHttpRequest2 {
		private [_EVENTS_]: Function[];
		public url: string | undefined;
		public method: string | undefined;

		constructor() {
			super();
			this[_EVENTS_] = [];
		}

		public addEventListener(
			evt: string,
			handler: (evt: Event) => void,
			..._: any[]
		) {
			if (evt === "load" && _listeners.loaded) {
				GM.debug("💻 XHR", "💫 Intercepting load listener");
				this[_EVENTS_].push(handler);
			} else {
				super.addEventListener.apply(this, arguments as any);
			}
		}

		public async open(method: string, url: string) {
			this.method = method;
			this.url = url;
			GM.debug("💻 XHR", "🚪 Open", `(${this.method} ${this.url})`);
			return super.open.apply(this, arguments as any);
		}

		public getResponseJSON<T extends {}>(): T {
			return this.responseType === "json"
				? this.response
				: JSON.parse(this.responseText);
		}

		public setResponseJSON(data: {}) {
			Object.defineProperties(this, {
				response: {
					get: () =>
						this.responseType === "json" ? data : JSON.stringify(data),
				},
				responseText: {
					get: () => JSON.stringify(data),
				},
			});
		}

		public send() {
			GM.debug("💻 XHR", "📫 Sending", `(${this.method} ${this.url})`);

			let run = () => {
				if (_listeners.loaded) {
					if (this.onload) {
						GM.debug(
							"💻 XHR",
							"💫 Intercepting onload listener",
							`(${this.method} ${this.url})`
						);
						this[_EVENTS_].unshift(this.onload);
						this.onload = null;
					}

					let self = this;
					super.addEventListener("load", function () {
						GM.debug(
							"💻 XHR",
							"💫 Calling load hook",
							`(${self.method} ${self.url})`
						);
						_listeners.loaded!(self).then(() => {
							for (const evt of self[_EVENTS_] || []) {
								evt.apply(this, arguments);
							}
						});
					});
				}

				super.send.apply(this, arguments as any);
				GM.debug("💻 XHR", "📫 Sent", `(${this.method} ${this.url})`);
			};

			if (_listeners.sending) {
				_listeners.sending(this).then((r) => {
					if (r) {
						run();
					}
				});
			} else {
				run();
			}
		}
	}

	function hookNetwork(listeners: typeof _listeners) {
		GM.log("💻 XHR", "Installing hooks");

		unsafeWindow.XMLHttpRequest = _XMLHttpRequest2;
		_listeners = listeners;
	}

	function hookNavigate(listener: () => Promise<void>) {
		const push = history.pushState;
		history.pushState = function () {
			push.apply(this, arguments as any);
			listener();
		};
		const replace = history.replaceState;
		history.replaceState = function () {
			replace.apply(this, arguments as any);
			listener();
		};
	}

	function promisify<T>(
		obj: T extends {
			onsuccess?: Function | null;
			onerror?: Function | null;
		}
			? T
			: never,
		cb?: (obj: T) => void
	) {
		if (cb) cb((obj as unknown) as T);
		return new Promise((res, rej) => {
			obj.onsuccess = res;
			obj.onerror = rej;
		});
	}

	abstract class iMagePlugin {
		private db: IDBDatabase | undefined;
		private xhr = false;
		private listeners: Record<string, Function[]> = {};
		private log: Console["log"];

		constructor(log: Console["log"]) {
			this.log = log;
		}

		private async onXhrLoaded(xhr: XMLHttpRequest2) {
			for (const listener of this.listeners["xhr:loaded"] || []) {
				await listener.call(this, xhr);
			}
		}

		private async onXhrSending(xhr: XMLHttpRequest2) {
			let send = true;
			for (const listener of this.listeners["xhr:sending"] || []) {
				if (!(await listener.call(this, xhr))) {
					send = false;
				}
			}
			GM.log(
				"💻 XHR",
				send ? "✅ Allowed" : "🛑 Blocked",
				"(" + xhr.method + " " + xhr.url + ")"
			);
			return send;
		}

		private async onNavigate(first: boolean) {
			const location = window.location.toString();
			GM.log("💻 URL", "Page changed", location);
			for (const listener of this.listeners["navigate"] || []) {
				await listener.call(this, location, first);
			}
		}

		private handleBroadcast() {
			const channel = new BroadcastChannel(this.constructor.name);
			channel.onmessage = async (event) => {
				let message: {
					id: string;
					data: any;
					_source: string;
				} = event.data;
				if (message._source === _windowId) return;

				for (const listener of this.listeners[message.id] || []) {
					await listener.call(this, message.data);
				}
			};
		}

		private async getDb() {
			if (!this.db) {
				const req = unsafeWindow.indexedDB.open(this.constructor.name);
				req.onupgradeneeded = () => {
					this.log("Creating database");
					req.result.createObjectStore(this.constructor.name);
				};
				await promisify(req);
				this.db = req.result;
			}
			return this.db;
		}

		private async getStoreTransaction(write: boolean = false) {
			const db = await this.getDb();
			return db
				.transaction(this.constructor.name, write ? "readwrite" : "readonly")
				.objectStore(this.constructor.name);
		}

		protected broadcast<T>(eventId: string, data: T) {
			const channel = new BroadcastChannel(this.constructor.name);
			channel.postMessage({ id: eventId, data, _source: _windowId });
			channel.close();
		}

		public async storeView<T extends string | number>(
			ids: T | T[],
			broadcast: boolean
		): Promise<void> {
			if (!(ids instanceof Array)) {
				ids = [ids];
			}
			try {
				await Promise.all(
					ids.map(async (item) => {
						return promisify(
							(await this.getStoreTransaction(true)).add(item, item)
						);
					})
				);
			} catch (error) {
				// ignore
			}
			if (broadcast) {
				this.broadcast("stored", ids);
			}
		}

		public async hasViewed<T extends string | number>(
			ids: T[]
		): Promise<Set<T>>;
		public async hasViewed<T extends string | number>(id: T): Promise<boolean>;
		public async hasViewed<T extends string | number>(
			ids: T | T[]
		): Promise<any> {
			let single = false;
			if (!(ids instanceof Array)) {
				single = true;
				ids = [ids];
			}
			const exists = new Set();
			const store = await this.getStoreTransaction(false);
			await Promise.all(
				ids.map((item) =>
					promisify(store.get(item)).then((e) => {
						if (((e as Event).target as IDBRequest).result === item) {
							exists.add(item);
						}
					})
				)
			);
			if (single) {
				return exists.has(ids[0]);
			} else {
				return exists;
			}
		}

		public on(
			event: "xhr:loaded",
			listener: (xhr: XMLHttpRequest2) => void
		): void;
		public on(
			event: "xhr:sending",
			listener: (xhr: XMLHttpRequest2) => Promise<boolean>
		): void;
		public on(
			event: "navigate",
			listener: (location: string, first: boolean) => Promise<void>
		): void;
		public on(
			event: "stored",
			listener: (ids: (string | number)[]) => Promise<void>
		): void;
		public on(event: "ready", listener: () => void): void;
		on(event: string, listener: Function): void {
			if (event === "ready") {
				if (
					document.readyState === "complete" ||
					document.readyState === ("loaded" as any) ||
					document.readyState === "interactive"
				) {
					listener();
				} else {
					document.addEventListener("DOMContentLoaded", () => {
						listener();
					});
				}
				return;
			}

			if (!(event in this.listeners)) {
				this.listeners[event] = [];
			}
			this.listeners[event].push(listener);

			if (event.startsWith("xhr:") && !this.xhr) {
				this.xhr = true;
				hookNetwork({
					loaded: (x) => this.onXhrLoaded(x),
					sending: (x) => this.onXhrSending(x),
				});
			} else if (event === "navigate") {
				hookNavigate(() => this.onNavigate(false));
				this.onNavigate(true);
			} else if (event === "stored") {
				this.handleBroadcast();
			}
		}

		public addMenu(selector: string | HTMLElement[]) {
			if (!document.getElementById("iMageMenu")) {
				const menu: HTMLMenuElement = document.createElement("menu");

				let target: Element;
				(menu as any).onshow = (e: { explicitOriginalTarget: Element }) => {
					target = e.explicitOriginalTarget;
					window.dispatchEvent(
						new CustomEvent("iMage:preview", { detail: target })
					);
				};

				menu.setAttribute("type", "context");
				menu.id = "iMageMenu";
				const item = document.createElement("menuitem");
				item.setAttribute("label", "🧙‍♂️ Hide Images");
				item.onclick = () => {
					window.dispatchEvent(
						new CustomEvent("iMage:hide", { detail: target })
					);
				};
				menu.appendChild(item);
				document.body.appendChild(menu);
			}
			const elements = (typeof selector === "string"
				? [...document.querySelectorAll(selector)]
				: selector
			).filter((el) => {
				return el.getAttribute("contextmenu") !== "iMageMenu";
			});
			for (const el of elements) {
				el.setAttribute("contextmenu", "iMageMenu");
			}
			if (elements.length) {
				this.log("Added menu to", elements.length, "items");
			}
		}

		protected infiniteScrolling(
			getPageUrl: (page: number) => string,
			minPage: number,
			maxPage: number,
			contentSelector: string,
			filterNodes: (nodes: Node[]) => Promise<HTMLElement[]>
		) {
			let currentPage = minPage;
			let loading = false;
			const content = document.querySelector(contentSelector)!;

			const next = async () => {
				loading = true;
				GM.debug(
					"💻 InfiniteScroll",
					"☁ Loading Page",
					`(${currentPage}/${maxPage})`
				);

				if (currentPage === maxPage) {
					window.removeEventListener("scroll", check);
				}
				const html = await (await fetch(getPageUrl(++currentPage))).text();
				const doc = new DOMParser().parseFromString(html, "text/html");
				const target = doc.querySelector(contentSelector)!;
				for (const node of await filterNodes([...target.childNodes])) {
					content.appendChild(node);
				}
				loading = false;
				await check();
			};

			const check = async () => {
				if (
					!loading &&
					document.body.scrollHeight - window.innerHeight - window.scrollY < 300
				) {
					await next();
				}
			};

			new (window as any).ResizeObserver(check).observe(document.body);
			window.addEventListener("scroll", check);
			check();
		}

		protected async waitFor<T>(check: () => Promise<T>) {
			// eslint-disable-next-line no-constant-condition
			while (true) {
				try {
					return await check();
				} catch (ex) {
					await new Promise((r) => setTimeout(r, 250));
				}
			}
		}

		protected createElement<K extends keyof HTMLElementTagNameMap>(
			tagName: K,
			opts?: {
				style?: Record<string, string | number>;
				text?: string;
				attrs?: Record<string, string>;
				props?: Partial<HTMLElementTagNameMap[K]>;
				children?: Element[];
			} & (
				| { before?: Element }
				| { after?: Element }
				| { endOf?: Element }
				| { startOf?: Element }
			)
		): HTMLElementTagNameMap[K] {
			const el = document.createElement(tagName);
			if (opts) {
				if (opts.style) {
					Object.assign(el.style, opts.style);
				}
				if (opts.text) {
					el.textContent = opts.text;
				}
				if (opts.attrs) {
					for (const attr in opts.attrs) {
						el.setAttribute(attr, opts.attrs[attr]);
					}
				}
				if (opts.props) {
					Object.assign(el, opts.props);
				}
				if (opts.children) {
					for (const c of opts.children) {
						el.appendChild(c);
					}
				}
				if ("before" in opts && opts.before) {
					opts.before.before(el);
				} else if ("after" in opts && opts.after) {
					opts.after.after(el);
				} else if ("startOf" in opts && opts.startOf) {
					opts.startOf.prepend(el);
				} else if ("endOf" in opts && opts.endOf) {
					opts.endOf.append(el);
				}
			}
			return el;
		}

		protected static isInViewport(elem: Element) {
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

		// public debug_logAllValues() {
		// 	this.getDb().then((db) => {
		// 		db
		// 			.transaction(this.constructor.name)
		// 			.objectStore(this.constructor.name)
		// 			.getAll().onsuccess = function () {
		// 				console.log(this.result.join(","));
		// 			};
		// 	});
		// }
	}

	return iMagePlugin;
})();
