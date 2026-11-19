# Develop Quizeit locally

Use Linux with Docker Compose and Node.js 22.13 or later. Run the commands from the repository root.

```sh
git clone https://github.com/misyaath/quizeit.git
cd quizeit
npm ci
npm run mongo:up
npm run dev
```

Open [Quizeit on localhost](http://127.0.0.1:5173/). Sign up and use the app as a learner. To manage users, roles, and shared questions in your local installation, designate your account as the owner and refresh the page.

```sh
npm run account:owner -- developer@example.com
```

## Run coding labs

Start Judge0 to enable code execution. The owner can also use the full VS Code workspace in the browser by starting code-server.

```sh
npm run judge0:up
npm run editor:up
```

`npm run up` starts MongoDB, Judge0, and code-server, builds the app, and runs the server. Stop the development server first if it uses the same port. `npm run down` stops the local Docker services and keeps saved data.

## Configure your installation

Docker startup creates `.env` from the [environment template](https://github.com/misyaath/quizeit/blob/main/.env.example) if it is missing. Set `MONGODB_URI` to connect to another MongoDB deployment and use `MONGODB_DATABASE` to select a database. Restart the app after changing environment variables.

Quizeit seeds its question catalog on startup. Run `npm run mongo:migrate -- --questions` after editing source question files when you want to load the changes into an existing installation.

## Run checks and preview documentation

```sh
npm test
npm run build
npm ci --prefix docs
npm run dev --prefix docs
```

The docs server prints its URL. The site uses `/quizeit/` as its base path for GitHub Pages. Run `npm run build --prefix docs` to verify the production docs build and check internal links.

Find the relevant feature in the [architecture guide](development.md) or create a [plugin that exports practice results](csv-plugin-tutorial.md).
