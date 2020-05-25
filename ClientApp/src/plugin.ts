/// <reference path="./gm.ts" />

const iMagePlugin = (() => {
	interface XMLHttpRequest2 extends XMLHttpRequest {
		url: string;
		method: string;
	}

	function hookNetwork(listeners: {
		sending?: (xhr: XMLHttpRequest2) => Promise<boolean>;
		loaded?: (xhr: XMLHttpRequest2) => Promise<void>;
	}) {
		GM.log("💻 XHR", "Installing hooks");

		const xhr = {
			open: XMLHttpRequest.prototype.open,
			send: XMLHttpRequest.prototype.send,
			addEventListener: XMLHttpRequest.prototype.addEventListener,
		};

		// Intercept load event handlers
		const loadEvents: Array<Function> = [];
		XMLHttpRequest.prototype.addEventListener = function (
			this: XMLHttpRequest,
			event: string,
			handler: Function
		) {
			if (event === "load") {
				loadEvents.push(handler);
			} else {
				return xhr.addEventListener.apply(this, arguments as any);
			}
		} as any;

		// Intercept open to add metadata and handlers
		XMLHttpRequest.prototype.open = function (
			this: XMLHttpRequest2,
			method: string,
			url: string
		) {
			let onload = this.onload;
			this.method = method;
			this.url = url;
			this.onload = null;

			Object.defineProperty(this, "onload", {
				get() {
					return onload;
				},
				set(listener) {
					onload = listener;
				},
			});

			xhr.addEventListener.call(this, "load", async (...args: any[]) => {
				if (listeners.loaded) {
					await listeners.loaded(this);
				}
				if (onload) {
					onload.apply(this, args as any);
				}
				for (const evt of loadEvents) {
					evt.apply(this, args);
				}
			});

			return xhr.open.apply(this, arguments as any);
		};

		XMLHttpRequest.prototype.send = async function (this: XMLHttpRequest2) {
			if (listeners.sending && !(await listeners.sending(this))) {
				return;
			}
			xhr.send.apply(this, arguments as any);
		};
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
			if (!send) {
				GM.log("💻 XHR", "🛑", xhr.method + " " + xhr.url);
			} else {
				GM.log("💻 XHR", "✅", xhr.method + " " + xhr.url);
			}
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
				} = event.data;
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
				.transaction(
					this.constructor.name,
					write ? "readwrite" : "readonly"
				)
				.objectStore(this.constructor.name);
		}

		protected broadcast<T>(eventId: string, data: T) {
			const channel = new BroadcastChannel(this.constructor.name);
			channel.postMessage({ id: eventId, data });
			channel.close();
		}

		public async storeView<T extends string | number>(
			ids: T | T[]
		): Promise<void> {
			if (!(ids instanceof Array)) {
				ids = [ids];
			}
			this.broadcast("stored", ids);
			try {
				await Promise.all(
					ids.map(async (item) => {
						return promisify(
							(await this.getStoreTransaction(true)).add(
								item,
								item
							)
						);
					})
				);
			} catch (error) {
				// ignore
			}
		}

		public async hasViewed<T extends string | number>(
			ids: T[]
		): Promise<Set<T>>;
		public async hasViewed<T extends string | number>(
			id: T
		): Promise<boolean>;
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
						if (
							((e as Event).target as IDBRequest).result === item
						) {
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
		on(event: string, listener: Function): void {
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

		public addMenu(selector: string) {
			if (!document.getElementById("iMageMenu")) {
				const menu: HTMLMenuElement = document.createElement("menu");

				let target: Element;
				(menu as any).onshow = (e: {
					explicitOriginalTarget: Element;
				}) => {
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
			const elements = document.querySelectorAll(selector);
			for (const el of elements) {
				el.setAttribute("contextmenu", "iMageMenu");
			}
			this.log("Added menu to", elements.length, "items");
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
	}

	return iMagePlugin;
})();
