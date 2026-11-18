# Developer guide

Start with the [README](../README.md) to install and run the app. React handles the browser interface, esbuild bundles the client, and a local Node HTTP server serves the application and API.

## Code map

| Area | Start here |
| --- | --- |
| Client entry and navigation | [main.jsx](../src/main.jsx) mounts [App.jsx](../src/App.jsx). [routes.js](../src/routes.js) parses and formats browser URLs and is shared with the server for deep links. |
| Practice and review | [PracticeSets.jsx](../src/PracticeSets.jsx), [Exam.jsx](../src/Exam.jsx), [Results.jsx](../src/Results.jsx), [AttemptHistory.jsx](../src/AttemptHistory.jsx), and [QuestionBank.jsx](../src/QuestionBank.jsx) each own a screen. |
| Shared UI | [QuestionInput.jsx](../src/QuestionInput.jsx) renders non-coding inputs. [QuestionDetails.jsx](../src/QuestionDetails.jsx), [AnswerReview.jsx](../src/AnswerReview.jsx), and [ExplainWithChatGPT.jsx](../src/ExplainWithChatGPT.jsx) supply shared question and review components. |
| Client I/O and progress | [local-api.js](../src/local-api.js) handles JSON and streamed responses. [useAttemptProgress.js](../src/useAttemptProgress.js) owns loading, optimistic draft updates, submission state, and save errors. |
| Server and HTTP routing | [server.mjs](../scripts/server.mjs) assembles services, checks the local host and origin, and serves built assets. [scripts/routes/](../scripts/routes) registers handlers for practice, coding, generation, and OpenAI. [http.mjs](../scripts/http.mjs) handles request bodies and responses. |
| Attempts and scoring | [attempt-service.mjs](../scripts/attempt-service.mjs) coordinates draft updates, grading, and activity. [attempt-draft.mjs](../scripts/attempt-draft.mjs) validates draft data. [attempts.js](../src/attempts.js) records a completed attempt and its question snapshot. |
| Questions | [question-files.mjs](../scripts/question-files.mjs) reads the catalog. [questions/load.js](../src/questions/load.js) validates and normalizes question sets. [questions/index.js](../src/questions/index.js) defines formats and scoring rules. |
| Integrations | [editor-workspaces.mjs](../scripts/editor-workspaces.mjs) manages files for code-server. [judge0.mjs](../scripts/judge0.mjs) adapts the execution API. [ai-service.mjs](../scripts/ai-service.mjs) handles provider selection and explanation caching. [generate-set.mjs](../scripts/generate-set.mjs) validates and saves generated sets. |

## Request and persistence flow

- **Practice.** The client loads `GET /api/catalog` and `GET /api/progress`. The progress hook updates the screen immediately and serializes draft writes. Submitting waits for pending writes, then posts to `/api/progress`. The attempt service validates the draft ID, grades coding responses through Judge0, and saves the result and question snapshot. History resolves the saved snapshot to show the questions as they were at submission.
- **Coding.** A workspace is scoped to a set, question, draft, and language. The server uses the editor to read workspace files and the runner to check them. The draft records question time and test runs.
- **AI.** Explanations for results use the saved snapshot. Bank explanations are cached by a hash of the question content. Generation loads the catalog and prepares attachments before requesting questions. The generation routes own the active job and allow cancellation until saving begins. Streamed requests use NDJSON with progress events followed by a result or error.

[local-store.mjs](../scripts/local-store.mjs) serializes updates per file within the server process and replaces each JSON file through a temporary file and rename. Use one server process per data directory.

| Location | Contents |
| --- | --- |
| `questions/categories.json` and `questions/<provider>/<exam>/` | Category definitions and authored or generated sets |
| `local-data/attempts.json` | Drafts, submissions, snapshots, and attempt explanations |
| `local-data/execution-settings.json` | Execution limits and exam timers |
| `local-data/bank-explanations.json` | Cached question bank explanations |
| `local-data/chatgpt-auth.json` and `local-data/openai-platform.json` | Credentials and connection settings |
| `local-data/editor/` and `local-data/judge0.env` | Coding workspaces, editor settings, and Judge0 configuration |

## Where to make changes

- Add practice content using the [question authoring guide](question-authoring.md). Keep set and question IDs stable because saved drafts reference them.
- For a new question format, update the catalog validator, shared response and scoring rules, exam input, answer review, draft validation, and generation schema together. Use the existing formats as examples.
- Register a new endpoint with `router.add(method, path, handler)` in the relevant route module. Keep HTTP input and status codes in the route handler and pass domain operations to the relevant service.
- Supply `dataDir`, `questionsDir`, and `port: 0` to `startServer` for isolated checks. Inject `fetchResponse`, `runCode`, or `editor` to exercise the API with substitutes for external services.

## Verify a change

1. Run `npm run build` to validate question files and compile the app.
2. Start the app. Begin a practice attempt, answer and flag a question, and refresh. Submit and reopen the result from Attempt history. Retake the set and confirm the prior result still opens.
3. For coding changes, check an example run and submission. For AI changes, check a streamed success and error, and confirm generation remains cancellable before saving.
