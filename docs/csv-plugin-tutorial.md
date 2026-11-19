# Build a CSV export plugin

Walk through Quizeit’s bundled **Practice results export** plugin. It reads the signed-in user’s saved practice results, shows them in a React page, and downloads a CSV. At the end, add your own CSV column from a second plugin.

## 1. Try the built-in exporter

Start Quizeit and designate your account as owner using the [local setup guide](getting-started.md). The repository’s `plugins.config.json` enables `results-csv` by default. If your installation uses a separate allowlist through `QUIZEIT_PLUGIN_CONFIG`, include `results-csv` in its `enabled` array and restart the development server, or rebuild and restart the production app.

1. Open **Practice exams**, complete a set, and submit it.
2. Open **Export practice results** from the sidebar.
3. Select **Download CSV** and check that the exported row matches your attempt.

On a fresh account, the page shows an empty state until you submit a practice attempt. An administrator can change how pending attempts are handled under **Settings → Plugins → Practice results export settings**.

## 2. Register the page and its permission

The manifest in `plugins/results-csv/plugin.json` identifies the plugin and tells Quizeit to bundle its browser entry. The manifest ID also namespaces the API and browser routes.

```json
{
  "id": "results-csv",
  "name": "Practice results export",
  "version": "1.0.0",
  "apiVersion": 1,
  "browser": true
}
```

In `server.mjs`, the registration function declares an `export` permission and gives it to an assignable role. The same permission protects the page and both API actions.

```js
const access = plugin.permission('export')
plugin.role('exporter', { label: 'Practice results exporter', permissions: [access] })
plugin.page({ id: 'results', title: 'Export practice results', permission: access })
```

Administrators have access by default. The owner can give another account access by assigning the **Practice results exporter** role in **Users**. The role grants access to that account’s own practice exports.

## 3. Reuse saved results

The plugin reuses Quizeit’s account-scoped practice results service. Its summaries contain scores and submission metadata. Real exam results, raw answers, and recordings are excluded by the service.

```js
plugin.setting({
  id: 'include-pending',
  label: 'Include attempts pending video review',
  type: 'boolean',
  default: false,
})

async function results({ services, settings }) {
  const rows = await services.attempts.listOwnPracticeResults()
  return settings['include-pending'] ? rows : rows.filter(row => row.passed !== null)
}

plugin.action({ id: 'results', method: 'GET', permission: access, handler: results })
```

The download action calls the same `results` function to keep the table and CSV consistent. The CSV writer escapes quotes and guards formula-like cells before returning the file with the SDK’s `download` helper.

```js
return download('practice-results.csv', content, 'text/csv; charset=utf-8')
```

See [the complete server entry](https://github.com/misyaath/quizeit/blob/main/plugins/results-csv/server.mjs) for the CSV encoder and default columns.

## 4. Render the page

The [React entry](https://github.com/misyaath/quizeit/blob/main/plugins/results-csv/browser.jsx) exports `pages = { results: PracticeResults }`. The key matches the page ID registered on the server. The component calls `action('results')` to load the table and uses `actionUrl('download')` for the download link. Each action is authenticated and authorized on the server.

## 5. Add a column from another plugin

The exporter defines `results-csv.columns` as an extension point. A contribution provides a heading and a function that returns the value for each practice result.

Create `plugins/results-csv-score/plugin.json`.

```json
{
  "id": "results-csv-score",
  "name": "CSV score percentage",
  "version": "1.0.0",
  "apiVersion": 1
}
```

Create `plugins/results-csv-score/server.mjs`.

```js
import { definePlugin } from '../../packages/plugin-sdk/index.js'

export default definePlugin(plugin => {
  plugin.contribute('results-csv.columns', 'percentage', {
    heading: 'Score (%)',
    value: row => row.pointsPossible > 0
      ? Math.round(row.pointsEarned / row.pointsPossible * 100)
      : '',
  })
})
```

Add `results-csv-score` to the same allowlist as `results-csv` and restart Quizeit. Download the CSV again. The final column should be **Score (%)**. Both plugins must be enabled because the extension point belongs to `results-csv`.

For more ways to extend the app, see the [plugin guide and SDK](plugins.md).
