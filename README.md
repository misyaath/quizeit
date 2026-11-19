# quizeit

A self-hosted React and NestJS app for certification practice and real exams. It includes an Azure AI-200 question bank, saved attempts, coding labs, and optional AI study tools.

## Start the full app

Use Linux with Docker Compose and Node.js 22.13 or later. Run these commands from the repository root as your regular user.

```sh
npm ci
npm run up
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/). The command starts MongoDB, Judge0 and its dependencies, and the VS Code editor in Docker. It waits for them to be ready, builds React, and starts the NestJS app in the foreground. Press Ctrl+C to stop the app. Run `npm run down` to stop the Docker containers and retain saved data.

## Environment configuration

The app and Compose read the root `.env`. Docker startup creates it from [.env.example](.env.example) when missing. It fills blank Docker credentials from the previous `local-data/*.env` files or generates them on a fresh setup. You can also copy the example to `.env` before the first startup to customize settings. Git ignores the real `.env`.

Set `MONGODB_URI` to the connection string for Atlas or another MongoDB deployment. Set `MONGODB_DATABASE` to change the default database name `quizeit`. For external Judge0, set `JUDGE0_URL` and the corresponding `JUDGE0_TOKEN`. Restart the app after changing its environment.

## Developer setup

```sh
npm run mongo:up
npm run dev
```

The development command watches the app and server source. Use `npm run docker:up` to start all the Docker services for development. For a production build, run `npm run build` and `npm start` with MongoDB running. Stop the development server before starting the built app on the same port.

App startup seeds the catalog from `questions/` and imports existing application data from legacy JSON files in `local-data/` when the corresponding MongoDB stores are missing. You can also run `npm run mongo:migrate` directly. To load additions and edits to authored questions after initialization, run `npm run mongo:migrate -- --questions`.

## Coding labs

Open **Practice exams → Coding labs**. By default, Judge0 listens on `127.0.0.1:2358` and code-server on `127.0.0.1:8180`. If you started only MongoDB, use `npm run judge0:up` and `npm run editor:up` to start the coding services.

The local Judge0 worker uses a privileged container. Use a dedicated VM if running other people's code. Startup selects the cgroup v1 or v2 configuration for Judge0 and keeps the existing Docker projects so their networks and volumes are reused.

## Optional AI features

Open **Settings** at `http://127.0.0.1:5173/` to connect an eligible ChatGPT account or configure an OpenAI Platform API key under **OpenAI hosted tools**.

## Documentation

- [Quizeit User Guide](https://misyaath.github.io/quizeit/docs/) covers accounts, roles, question authoring, practice, and real exams with screenshots.
- [Quizeit developer documentation](https://misyaath.github.io/quizeit/) includes local setup, the plugin SDK, and a walkthrough of the CSV exporter.
- [Developer guide](docs/development.md) covers architecture, data flows, extension points, and verification.
- [Plugin guide](docs/plugins.md) shows how to add and enable features in the same repository.
- [Contributing](CONTRIBUTING.md) covers local development and checks.
- [Question authoring](docs/question-authoring.md) covers catalog structure, JSON formats, and coding questions.
- [Using the app](docs/using-the-app.md) covers practice, coding labs, AI sign-in, question generation, and hosted tools.

## Accounts and question sets

Create an account from quizeit’s sign-in screen. To give your account access to the earlier local attempts and AI settings and to enable editing the shared question bank, designate it from the project terminal:

```sh
npm run account:owner -- your-account-email
```

Refresh the app after assigning the owner. Each other account can create and edit its own private question sets. Use **Manage question sets** to set category and subcategory labels, add or edit questions, and archive existing sets. Active attempts retain their question version. Category and subcategory also filter the quiz and question bank.

To enable Google sign-in, set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`. Register `http://127.0.0.1:5173/auth/google/callback` on the Google OAuth web client, adjusting the port or hostname to match the URL you use. Restart the app. An existing password account can connect Google from **Settings**.

Set and question time budgets use active practice time. The clock pauses while the quiz is hidden, closed, or explicitly paused. Time is saved at regular checkpoints and resumed on return. Exceeding a budget shows a warning and allows submission. Coding results continue to show Judge0 runtime and memory separately from practice time.

### Manage users

Administrators can open **Users** to list accounts and manage learners. The owner can also grant or remove the Administrator role. Deactivation blocks sign-in and invalidates existing sessions. Restoring an account preserves its question sets and attempt history. An email, password, or role change requires the affected user to sign in again.
