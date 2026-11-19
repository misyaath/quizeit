# Developer guide

Start with the [README](../README.md) to install and run the app. React handles the browser interface, esbuild bundles the client, and one NestJS app serves the bundle and the API.

## Code map

| Area | Start here |
| --- | --- |
| Client entry and navigation | [main.jsx](../src/main.jsx) mounts [App.jsx](../src/App.jsx). [routes.js](../src/routes.js) parses and formats browser URLs and is shared with the server for deep links. |
| Practice and review | [PracticeSets.jsx](../src/PracticeSets.jsx), [Exam.jsx](../src/Exam.jsx), [Results.jsx](../src/Results.jsx), [AttemptHistory.jsx](../src/AttemptHistory.jsx), and [QuestionBank.jsx](../src/QuestionBank.jsx) each own a screen. |
| Shared UI | [QuestionInput.jsx](../src/QuestionInput.jsx) renders non-coding inputs. [QuestionDetails.jsx](../src/QuestionDetails.jsx), [AnswerReview.jsx](../src/AnswerReview.jsx), and [ExplainWithChatGPT.jsx](../src/ExplainWithChatGPT.jsx) supply shared question and review components. |
| Client I/O and progress | [local-api.js](../src/local-api.js) handles JSON and streamed responses. [useAttemptProgress.js](../src/useAttemptProgress.js) owns loading, optimistic draft updates, submission state, and save errors. |
| Server and HTTP routing | [server.mjs](../scripts/server.mjs) bootstraps NestJS with its Express adapter. [backend-services.module.mjs](../scripts/backend-services.module.mjs) provides services to the practice, coding, and AI modules. The [frontend controller](../scripts/routes/frontend.mjs) serves the React build and deep links. [nest-http.mjs](../scripts/routes/nest-http.mjs) checks the local host and origin and formats errors. |
| Attempts and scoring | [attempt-service.mjs](../scripts/attempt-service.mjs) coordinates draft updates, grading, and activity. [attempt-draft.mjs](../scripts/attempt-draft.mjs) validates draft data. [attempts.js](../src/attempts.js) records a completed attempt and its question snapshot. |
| Questions | [question-files.mjs](../scripts/question-files.mjs) reads the catalog. [questions/load.js](../src/questions/load.js) validates and normalizes question sets. [questions/index.js](../src/questions/index.js) defines formats and scoring rules. |
| Integrations | [editor-workspaces.mjs](../scripts/editor-workspaces.mjs) manages files for code-server. [judge0.mjs](../scripts/judge0.mjs) adapts the execution API. [ai-service.mjs](../scripts/ai-service.mjs) handles provider selection and explanation caching. [generate-set.mjs](../scripts/generate-set.mjs) validates and saves generated sets. |

## Request and persistence flow

- **Practice.** The client loads `GET /api/catalog` and `GET /api/progress`. The progress hook updates the screen immediately and serializes draft writes. Submitting waits for pending writes, then posts to `/api/progress`. The attempt service validates the draft ID, grades coding responses through Judge0, and saves the result and question snapshot. History resolves the saved snapshot to show the questions as they were at submission.
- **Coding.** A workspace is scoped to a set, question, draft, and language. The server uses the editor to read workspace files and the runner to check them. The draft records question time and test runs.
- **AI.** Explanations for results use the saved snapshot. Bank explanations are cached by a hash of the question content. Generation loads the catalog and prepares attachments before requesting questions. The generation routes own the active job and allow cancellation until saving begins. Streamed requests use NDJSON with progress events followed by a result or error.

[app-data.mjs](../scripts/app-data.mjs) imports each store when it is missing from MongoDB. [mongo-store.mjs](../scripts/mongo-store.mjs) serializes updates per store within the server process and uses a revision check to publish each replacement atomically. Large values use GridFS. Use one server process per database because generation, sign-in flows, and coding operations keep some session state in memory.

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
- For a new question format, update the catalog validator, shared response and scoring rules, exam input, answer review, draft validation, and generation schema together. Use the existing formats as examples.
- Add a controller method in the relevant NestJS module under [scripts/routes/](../scripts/routes) and attach the HTTP method decorator with `bindRoute`. Pass domain operations to the relevant service. Controllers use [http.mjs](../scripts/http.mjs) for request size limits, JSON responses, and NDJSON streaming.
- Supply a separate `mongoDatabase`, `dataDir`, `questionsDir`, and `port: 0` to `startServer` for isolated checks. Supply `mongoUri` if the test data directory lacks MongoDB connection settings. Inject `fetchResponse`, `runCode`, or `editor` to exercise the API with substitutes for external services.

## Verify a change

1. Run `npm run build` to validate question files and compile the app.
2. Start the app. Begin a practice attempt, answer and flag a question, and refresh. Submit and reopen the result from Attempt history. Retake the set and confirm the prior result still opens.
3. For coding changes, check an example run and submission. For AI changes, check a streamed success and error, and confirm generation remains cancellable before saving.
