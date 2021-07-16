import express from "express";
import Docker from "dockerode";
import tar from "tar-fs";
import fs from "fs";
import path from "path";
const app = express();
const port = process.env.PORT || 8080;

// Used to parse JSON bodies, size limited
app.use(express.json({ limit: "300kb" }));

// Docker API setup
// windows: { host: "https://localhost", port: 2375 }
// linux: { socketPath: "/var/run/docker.sock" }
const docker = new Docker({ socketPath: "/var/run/docker.sock" });

// write and pack file into tar for docker API engine
function buildPack(language: string, script: string) {
	switch (language) {
		case "python":
			fs.writeFile("./langs/python/app.py", script, function (err) {
				if (err) throw err;
			});

			return tar.pack(path.join(__dirname, "../langs/python"));
			break;
		default:
			throw new Error("Unsupported Language");
	}
}

app.get("/", (req, res) => {
	res.status(200).send("listening!");
});

app.post("/run", async (req, res) => {
	console.log("begin " + req.body.language);
	try {
		// get user info
		const user = req.body.user;
		const imageName = user + "-image";
		const containerName = user + "-container";

		// pack for docker API build call
		const pack = buildPack(req.body.language, req.body.script);

		// promise stream while docker builds image
		const stream = await docker.buildImage(pack, {
			t: imageName,
		});

		// promise stream resolve
		await new Promise((resolve, reject) => {
			docker.modem.followProgress(stream, (err: unknown, res: unknown) =>
				err ? reject(err) : resolve(res)
			);
		});

		// run container
		await docker.run(imageName, [], process.stdout, {
			name: containerName,
			AttachStdin: true,
			AttachStdout: true,
			AttachStderr: true,
			Tty: true,
			OpenStdin: true,
			StdinOnce: false,
		});

		// clean up after app concludes
		const container = docker.getContainer(containerName);
		await container.wait();
		await container.remove();

		res.status(200).send();
	} catch (err) {
		console.log(err);
		res.status(500).send(err);
	}
});

app.listen(port, () => console.log(`Running on port ${port}`));
