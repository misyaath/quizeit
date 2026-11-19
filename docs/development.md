# Developer guide

Start with the [local setup guide](getting-started.md) to install and run the app. React handles the browser interface, esbuild bundles the client, and one NestJS app serves the bundle and the API.

## Code map

The repository runs as a modular monolith. The Nest application composes the built-in feature modules and plugin runtime. React uses the same server and signed-in session. Shared assessment logic is usable by both and has no framework dependency.

| Area | Start here |
| --- | --- |
| Application composition | [apps/server/app-module.mjs](https://github.com/misyaath/quizeit/blob/main/apps/server/app-module.mjs) composes the NestJS modules. [apps/web/plugins/](https://github.com/misyaath/quizeit/tree/main/apps/web/plugins) integrates plugin pages and navigation with React. |
| Extensions | [packages/plugin-sdk/](https://github.com/misyaath/quizeit/tree/main/packages/plugin-sdk) provides the versioned entry point. [apps/server/plugins/](https://github.com/misyaath/quizeit/tree/main/apps/server/plugins) loads and validates the enabled plugins. Each plugin’s manifest and code live in [plugins/](https://github.com/misyaath/quizeit/tree/main/plugins). See the [plugin guide](plugins.md). |
| Client entry and navigation | [main.jsx](https://github.com/misyaath/quizeit/blob/main/src/main.jsx) mounts [App.jsx](https://github.com/misyaath/quizeit/blob/main/src/App.jsx). [routes.js](https://github.com/misyaath/quizeit/blob/main/src/routes.js) parses and formats browser URLs and is shared with the server for deep links. |
| Practice and review | [PracticeSets.jsx](https://github.com/misyaath/quizeit/blob/main/src/PracticeSets.jsx), [Exam.jsx](https://github.com/misyaath/quizeit/blob/main/src/Exam.jsx), [Results.jsx](https://github.com/misyaath/quizeit/blob/main/src/Results.jsx), [AttemptHistory.jsx](https://github.com/misyaath/quizeit/blob/main/src/AttemptHistory.jsx), and [QuestionBank.jsx](https://github.com/misyaath/quizeit/blob/main/src/QuestionBank.jsx) each own a screen. |
| Shared UI | [QuestionInput.jsx](https://github.com/misyaath/quizeit/blob/main/src/QuestionInput.jsx) renders non-coding inputs. [QuestionDetails.jsx](https://github.com/misyaath/quizeit/blob/main/src/QuestionDetails.jsx), [AnswerReview.jsx](https://github.com/misyaath/quizeit/blob/main/src/AnswerReview.jsx), and [ExplainWithChatGPT.jsx](https://github.com/misyaath/quizeit/blob/main/src/ExplainWithChatGPT.jsx) supply shared question and review components. |
| Client I/O and progress | [local-api.js](https://github.com/misyaath/quizeit/blob/main/src/local-api.js) handles JSON and streamed responses. [useAttemptProgress.js](https://github.com/misyaath/quizeit/blob/main/src/useAttemptProgress.js) owns loading, optimistic draft updates, submission state, and save errors. |
| Server and HTTP routing | [server.mjs](https://github.com/misyaath/quizeit/blob/main/scripts/server.mjs) bootstraps NestJS with its Express adapter. [backend-services.module.mjs](https://github.com/misyaath/quizeit/blob/main/scripts/backend-services.module.mjs) provides services to the practice, coding, and AI modules. The [frontend controller](https://github.com/misyaath/quizeit/blob/main/scripts/routes/frontend.mjs) serves the React build and deep links. [nest-http.mjs](https://github.com/misyaath/quizeit/blob/main/scripts/routes/nest-http.mjs) checks the local host and origin and formats errors. |
| Attempts and scoring | [attempt-service.mjs](https://github.com/misyaath/quizeit/blob/main/scripts/attempt-service.mjs) coordinates draft updates, grading, and activity. [attempt-draft.mjs](https://github.com/misyaath/quizeit/blob/main/scripts/attempt-draft.mjs) validates draft data. [attempts.js](https://github.com/misyaath/quizeit/blob/main/src/attempts.js) records a completed attempt and its question snapshot. [packages/assessment/](https://github.com/misyaath/quizeit/tree/main/packages/assessment) owns shared marks, exam section ordering, and result summaries. |
| Questions | [question-files.mjs](https://github.com/misyaath/quizeit/blob/main/scripts/question-files.mjs) reads the catalog. [questions/load.js](https://github.com/misyaath/quizeit/blob/main/src/questions/load.js) validates and normalizes question sets. [questions/index.js](https://github.com/misyaath/quizeit/blob/main/src/questions/index.js) defines formats and scoring rules. |
| Integrations | [editor-workspaces.mjs](https://github.com/misyaath/quizeit/blob/main/scripts/editor-workspaces.mjs) manages files for code-server. [judge0.mjs](https://github.com/misyaath/quizeit/blob/main/scripts/judge0.mjs) adapts the execution API. [ai-service.mjs](https://github.com/misyaath/quizeit/blob/main/scripts/ai-service.mjs) handles provider selection and explanation caching. [generate-set.mjs](https://github.com/misyaath/quizeit/blob/main/scripts/generate-set.mjs) validates and saves generated sets. |

## Request and persistence flow

- **Practice.** The client loads `GET /api/catalog` and `GET /api/progress`. The progress hook updates the screen immediately and serializes draft writes. Submitting waits for pending writes, then posts to `/api/progress`. The attempt service validates the draft ID, grades coding responses through Judge0, and saves the result and question snapshot. History resolves the saved snapshot to show the questions as they were at submission.
- **Coding.** A workspace is scoped to a set, question, draft, and language. The server uses the editor to read workspace files and the runner to check them. The draft records question time and test runs.
- **AI.** Explanations for results use the saved snapshot. Bank explanations are cached by a hash of the question content. Generation loads the catalog and prepares attachments before requesting questions. The generation routes own the active job and allow cancellation until saving begins. Streamed requests use NDJSON with progress events followed by a result or error.

[app-data.mjs](https://github.com/misyaath/quizeit/blob/main/scripts/app-data.mjs) imports each store when it is missing from MongoDB. [mongo-store.mjs](https://github.com/misyaath/quizeit/blob/main/scripts/mongo-store.mjs) serializes updates per store within the server process and uses a revision check to publish each replacement atomically. Large values use GridFS. Use one server process per database because generation, sign-in flows, and coding operations keep some session state in memory.

| Location | Contents |
| --- | --- |
| MongoDB `app_state.catalog` | Category definitions and question sets seeded from `questions/`, plus newly generated sets |
| MongoDB `app_state.progress` | Drafts, submissions, snapshots, and attempt explanations |
| MongoDB `app_state.executionSettings` | Execution limits and exam timers |
| MongoDB `app_state.bankExplanations` | Cached question bank explanations |
| MongoDB `app_state.chatgptAuth` and `app_state.platformTools` | Credentials and connection settings |
| MongoDB `users`, `sessions`, and `google_signin` | Account profiles, hashed session tokens, and short-lived Google sign-in state |
| `local-data/editor/` | Live coding workspaces and editor settings |
| `.env` | Application and Docker configuration initialized from `.env.example` and legacy env files |

Learner stores use account-specific document IDs. The designated owner accesses the original practice and AI stores. The catalog records private set ownership and archive state, and drafts keep a set snapshot for grading and review after edits.

## Where to make changes

- Add practice content using the [question authoring guide](question-authoring.md). Keep set and question IDs stable because saved drafts reference them.
- Add an optional feature under `plugins/<id>/` and register it in the allowlist. Reuse a published service, event, or contribution point when integrating with existing features. Keep feature-specific policy and UI in the plugin.
- For a new question format, update the catalog validator, shared response and scoring rules, exam input, answer review, draft validation, and generation schema together. Use the existing formats as examples.
- Add a controller method in the relevant NestJS module under [scripts/routes/](https://github.com/misyaath/quizeit/blob/main/scripts/routes) and attach the HTTP method decorator with `bindRoute`. Pass domain operations to the relevant service. Controllers use [http.mjs](https://github.com/misyaath/quizeit/blob/main/scripts/http.mjs) for request size limits, JSON responses, and NDJSON streaming.
- Supply a separate `mongoDatabase`, `dataDir`, `questionsDir`, and `port: 0` to `startServer` for isolated checks. Supply `mongoUri` if the test data directory lacks MongoDB connection settings. Inject `fetchResponse`, `runCode`, or `editor` to exercise the API with substitutes for external services.

## Verify a change

1. Run `npm test` for the extension contract checks and `npm run build` to validate question files and compile the app.
2. Start the app. Begin a practice attempt, answer and flag a question, and refresh. Submit and reopen the result from Attempt history. Retake the set and confirm the prior result still opens.
3. For coding changes, check an example run and submission. For AI changes, check a streamed success and error, and confirm generation remains cancellable before saving.
