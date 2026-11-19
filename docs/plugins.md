# Build a Quizeit plugin

A plugin lives in `plugins/<id>/` in the same repository as Quizeit. Enable it in the deployment’s plugin allowlist, then build and restart the app. A plugin can own a complete feature, including its UI, API, data and permissions. Plugins can also extend each other through named extension points and events.

Only enable trusted plugins. Server entries run inside NestJS with the privileges of the app process. Browser entries ship in the React bundle. Keep credentials in server-side environment variables.

## Create and enable a plugin

1. Create `plugins/study-notes/plugin.json` with `{"id":"study-notes","name":"Study notes","version":"1.0.0","apiVersion":1,"browser":true}`.
2. Create `plugins/study-notes/server.mjs` and export a registration function using `definePlugin` from `packages/plugin-sdk/index.js`.
3. For a browser plugin, create `plugins/study-notes/browser.jsx` with a named `pages` export. Each key is the ID of a registered page and each value is a React component.
4. Add `study-notes` to the `enabled` array in `plugins.config.json`. For an installation-specific list, copy that file and set `QUIZEIT_PLUGIN_CONFIG` in `.env` to its path. Use the same allowlist for both the build and server. Run `npm run build` and restart, or restart `npm run dev`.

Use lowercase letters, digits, and hyphens in IDs. The runtime namespaces a plugin’s permissions, roles, stores, events, and contributions with its manifest ID. Use unique IDs and keep them stable across releases. Startup rejects unknown permissions, duplicate registrations, invalid contributions, and unsupported manifest API versions.

Example `server.mjs`

```js
import { definePlugin, PluginError } from '../../packages/plugin-sdk/index.js'

export default definePlugin(plugin => {
  const access = plugin.permission('use')
  plugin.role('author', { label: 'Study notes author', permissions: [access] })
  plugin.page({ id: 'notes', title: 'Study notes', permission: access })
  const notes = plugin.store('notes', () => ({}))

  plugin.action({ id: 'notes', method: 'GET', permission: access, async handler({ user }) {
    return { note: (await notes.read())[user.id] ?? '' }
  } })
  plugin.action({ id: 'notes', method: 'PUT', permission: access, async handler({ user, readJson }) {
    const { note } = await readJson()
    if (typeof note !== 'string' || note.length > 2000) throw new PluginError(400, 'Enter a note of up to 2,000 characters.')
    await notes.update(current => ({ ...current, [user.id]: note }))
    return { note }
  } })
})
```

In `browser.jsx`, export `export const pages = { notes: StudyNotes }`. The component receives `action(name, method, data)` for JSON, with `GET` as the default, and `actionUrl(name)` for links and downloads. The page appears in the sidebar for allowed users and has its own URL at `/plugins/study-notes/notes`. The server checks the same permission on requests to `/api/plugins/study-notes/notes`. The account owner can assign the plugin’s author role in **Users**. Administrators have access to plugin permissions by default. Plugin roles extend normal signed-in practice access with the declared plugin permissions.

## Reuse existing features

| Need | API |
| --- | --- |
| Grant a permission to all signed-in learners and staff | Use `plugin.permission(name, { access: 'signed-in' })`. The default is `'assigned'`, which grants access to administrators and roles that declare the permission. |
| Add a settings form | Call `plugin.setting({ id, label, type, default })`. Supported types are `boolean`, `integer` (`min`, `max`), and `text` (`maxLength`). Administrators edit values through **Settings**, and actions receive validated `settings`. Use setting fields for deployment-wide preferences. |
| Save feature data | Use `plugin.store(name, () => initialValue)`. It returns `read()` and `update(current => next)` backed by the app’s MongoDB store. Check user ownership explicitly in your feature. Disabling a plugin keeps its data. |
| Read saved practice results | Call `services.attempts.listOwnPracticeResults()` from an action. It returns summaries for the signed-in account, including its legacy history when it is the owner. Real exams, raw answers, and media are excluded. |
| React to submissions or manual grading | Use `plugin.on('attempt.submitted', handler)` or `plugin.on('attempt.graded', handler)`. The callback receives a result summary after persistence. Delivery is in-process and best effort. Handlers should be quick and tolerate repeated delivery. |
| Expose a new extension point | Call `const point = plugin.definePoint('extensions', validate)`. Another plugin can call `plugin.contribute('your-plugin.extensions', 'its-extension', value)`. Read the values with `plugin.contributions(point)` after registration, such as inside an action. |
| Publish a new event | Use `plugin.defineEvent('changed')`. After startup, the declaring plugin can await `plugin.emit(event, payload)` and other enabled plugins can subscribe with `plugin.on(event, handler)`. Use data that supports `structuredClone`. |
| Add a question generator | Contribute to `quizeit.question-generators`. The generator supplies `name`, a list of supported existing `formats`, and `generate({ batch, prompt, instructions, signal, onProgress })`. Return `{ model, text }` with the question batch as JSON text. Quizeit manages validation, cancellation, and saving. Plugin generators receive text prompts. |

`PluginError(status, message)` returns a handled client error from an action. `download(filename, text, contentType)` returns an attachment. Actions receive a public account profile in `user`, parsed query parameters in `query`, and `readJson()` for reading the request body once.

Start with the [CSV results plugin](../plugins/results-csv/) for a complete example, including an extension point for adding CSV columns. The [demo generator](../plugins/demo-generator/) is a deterministic sample provider. Add `demo-generator` to the allowlist to try it from **Generate questions** without API credentials. Use it for development fixtures.

The version 1 SDK covers the APIs described here. To change a built-in workflow, use a hook that workflow exposes. For example, the generator accepts new providers today, while adding a question format still involves the question validator, assessment, input, and review code.
