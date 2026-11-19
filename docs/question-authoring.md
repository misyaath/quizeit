# Author question sets

[questions/categories.json](https://github.com/misyaath/quizeit/blob/main/questions/categories.json) lists the main categories (`providers`) and their subcategories (`exams`). Add a provider or exam there using lowercase IDs with optional hyphens, then place set files under `questions/<provider-id>/<exam-id>/`. For example, use `questions/azure/ai-200/my-set.json`. Run `npm run mongo:migrate -- --questions` after editing, then refresh the page. The import adds or updates the files you provide and keeps the other sets already in MongoDB.

The Practice exams and Question bank pages both offer Provider and Exam filters. Azure includes the existing AI-200 bank. AWS Solutions Architect Associate, Google Associate Cloud Engineer, and Other topics are available as destinations for your own or generated sets.

Each file creates a practice set. Use 60 questions for a full exam. Longer files split into 60-question parts, and shorter files or remaining questions appear as shorter sets. Files are displayed in filename order. Use a unique set `id` and a unique `id` for each question across the entire folder. Use lowercase letters, digits, and hyphens for IDs, and keep them stable to preserve saved progress. Add new sets in new files so completed attempts keep their original membership.

```json
{
  "id": "my-container-practice",
  "title": "My Container Apps practice",
  "questions": [
    {
      "id": "my-container-practice-001",
      "domain": "containers",
      "type": "single",
      "prompt": "Which Container Apps setting keeps one replica ready when traffic stops?",
      "options": ["Minimum replicas", "Revision label", "Ingress target port"],
      "answer": "Minimum replicas",
      "explanation": "A minimum of one replica keeps the app from scaling to zero."
    }
  ]
}
```

| Type | Required fields besides `id`, `domain`, `type`, `prompt`, and `explanation` |
| --- | --- |
| `single` | `options` is an array of distinct choices. `answer` exactly matches one choice. |
| `multi` | `options` is an array of choices. `answer` lists at least two correct choices, with at least one distractor in `options`. |
| `text` | `answer` is an array of one or more accepted spellings or values. |
| `match` | `labels` contains the items to match. Each entry in `answer` corresponds to the label at the same position. |
| `order` | `answer` lists the steps in the correct order. |

For `match` and `order`, omit `options` to have the app rearrange the displayed choices, or supply the same items as `answer` in your preferred display order. Add a `caseStudy` object with `title` and `background` when a question needs shared context. Optional `exhibits` arrays on a question or inside a case study contain objects with a `title` and `code` string. Sets can declare `difficulty` from 1 to 10. Supported domain IDs are `containers`, `data`, `integration`, `operations`, and `general` for other subjects. Invalid JSON or invalid question data is reported by the build with the filename and, for question-level errors, the question number.

## Author a coding question

See [the included coding lab JSON](https://github.com/misyaath/quizeit/blob/main/questions/azure/ai-200/05-coding-lab.json) for a complete example. Use `"type": "coding"` and add a `languages` array with `id`, `starter`, and `solution` fields. Common IDs include `python`, `javascript`, `typescript`, `csharp`, `java`, `go`, `rust`, and `php`. The local `/api/code/languages` endpoint lists the available IDs and their Judge0 runtimes. Add up to six `tests` with distinct `label` values, `stdin`, and `expected`. Mark private grading cases with `"hidden": true` and supply at least one visible example.

For Python, JavaScript, or PHP, a language can also declare up to five additional `files`, each with a relative `path`, `starter`, and `solution`. The app runs the entry file and its project files together inside the sandbox. See [the included project lab JSON](https://github.com/misyaath/quizeit/blob/main/questions/azure/ai-200/06-project-lab.json).

