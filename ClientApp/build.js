const concurrently = require("concurrently");
const fs = require("fs");
const path = require("path");
const pluginsDir = path.resolve(__dirname, "src/plugins");
fs.readdir(pluginsDir, { withFileTypes: true }, (err, ents) => {
	if (err) throw err;
	ents = ents.filter((ent) => ent.isFile() && ent.name.endsWith(".ts"));
	const commands = ents.map(
		(ts) =>
			`tsc "${path.resolve(
				pluginsDir,
				ts.name
			)}" --outFile "${path.resolve(
				__dirname,
				"dist/plugins",
				ts.name.substr(0, ts.name.lastIndexOf(".")) + ".js"
			)}" --module System --target ES2020 --lib ES2015,DOM,DOM.Iterable ${process.argv
				.splice(2)
				.join(" ")}`
	);
	concurrently(commands).catch(() => {});
});
