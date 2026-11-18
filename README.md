# quizeit

A local React app for cloud certification practice. It includes an Azure AI-200 question bank, a study dashboard, saved attempts, and optional coding labs and AI study tools.

## Developer setup

Use Node.js 22.13 or later with npm. Run these commands from the repository root.

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/). The development command watches the app and server source. Refresh the page to see frontend or question-bank changes. Press Ctrl+C to stop the server.

Dashboard, Practice exams, Question bank, and Attempt history work with the default setup. The app loads questions from `questions/` and writes practice data to the git-ignored `local-data/` directory.

## Build and run

```sh
npm run build
npm start
```

The build validates the question catalog and bundles the client into `dist/`. The Node server serves the bundle and the local API on port 5173. Stop the development server before starting the built app.

## Optional coding labs

On Linux with Docker and Docker Compose, start the Judge0 runner and VS Code editor from the repository root.

```sh
npm run judge0:up
npm run editor:up
npm run dev
```

If the quiz was already running, restart it to pick up `local-data/judge0.env`. Open **Practice exams → Coding labs**. Judge0 listens on `127.0.0.1:2358` and code-server on `127.0.0.1:8180`. Set `JUDGE0_URL` and `JUDGE0_TOKEN` before starting the quiz to connect a separate Judge0 instance.

The local Judge0 worker uses a privileged container. Use a dedicated VM if running other people's code. The startup script selects the cgroup v1 or v2 Compose configuration. Stop the services with `npm run editor:stop` and `npm run judge0:stop`.

## Optional AI features

Open **Settings** at `http://127.0.0.1:5173/` to connect an eligible ChatGPT account or configure an OpenAI Platform API key under **OpenAI hosted tools**.

## Documentation

- [Developer guide](docs/development.md) covers architecture, data flows, extension points, and verification.
- [Question authoring](docs/question-authoring.md) covers catalog structure, JSON formats, and coding questions.
- [Using the app](docs/using-the-app.md) covers practice, coding labs, AI sign-in, question generation, and hosted tools.
