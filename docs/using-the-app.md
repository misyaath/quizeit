# Using quizeit

## Practice

- Take the ten 60-question case-study levels, three original 60-question exams, or the 20-question bonus drill. The levels progress from service fundamentals to production incident analysis and include scenario variants for reinforcing skills.
- Use Previous, Next, or the question navigator to move around. Flag questions for review and submit when ready.
- Review the raw practice score, domain breakdown, and explanations after submission. Multi-part questions require a complete correct answer for credit.
- Open the Question bank to browse the full question and answer collection by domain and response format.
- Draft progress and every submitted attempt are saved in MongoDB. Open Attempt history and expand a practice set to review its submissions, scores, and pass or fail counts. The practice pass mark is 70% correct.
- The home page opens **Dashboard** for score trends, question accuracy, pass rate, recorded practice time, topics to review, and coding activity by language. Open **Practice exams** to browse and start sets.

The practice formats are single choice, multiple select, drag-and-drop matching with keyboard-accessible dropdowns, build lists, and short typed answers. Each case-study level starts with a shared scenario and five questions based on it. Code exhibits include AKS YAML, Python Azure SDK and Functions snippets, SQL, KQL, and configurations. Microsoft’s sandbox shows formats that may appear. The practice levels also include typed recall drills.

## Coding labs

Open **Coding labs → AI-200 coding lab · Vector search** from Practice exams. The question and examples appear on the left. VS Code runs in the right pane with Auto Save on. Drag the dividers to resize the panels, or focus a divider and press the arrow keys. Every coding question offers the installed Judge0 programming languages. The language menu groups them by whether the question supplies starter code. Selecting another language opens a blank file in its own workspace. Open **AI-200 project lab · Score thresholds** to try the included multi-file starters in Python, JavaScript, or PHP.

See [coding lab setup](../README.md#optional-coding-labs).

**Run examples** saves any pending edits, then checks visible tests in Judge0. **Custom input** runs with your own standard input. **Submit set** saves pending edits and grades the selected solution against all tests. Each language has a separate workspace for each question and attempt. Grading reads the entry file and helper files declared by the question. The submitted source, custom input and output, grades, and run history are saved in MongoDB.

### Activity and limits

Use **Manage question sets** to set CPU time, wall-clock time, memory, the total set budget, and the default time per question. A question can override its own time budget and, for coding questions, each execution limit. The owner can manage shared defaults and language overrides in **Settings**. Judge0 applies its configured maximums to code runs.

The set and question timers count visible practice time. Use **Pause timer** to pause until you explicitly resume. Opening the same attempt again restores saved time and the pause state. Reaching a time budget shows a warning and keeps submission available.

Open a saved attempt to see elapsed time, time with each question visible, editing activity, saves, example and custom runs, and submission requests. The **Activity by programming language** table groups editing and runs by language. Each question identifies the language submitted for grading. Start and finish timestamps, counts, and resource usage are available under **Run history**. Editing stats count edit events, single-character edits, characters inserted or deleted, and focused editing time with a 30-second idle cutoff.

## Exam information

Microsoft lists AI-200 as intermediate with a 120-minute assessment. It covers hands-on Azure backend decisions involving Python, data retrieval, containers, service integration, and production monitoring. AZ-204 retired on July 31, 2026, and Microsoft named AI-200 as its replacement.

[AI-200 certification](https://learn.microsoft.com/en-us/credentials/certifications/azure-ai-cloud-developer-associate/) · [Current study guide](https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/ai-200) · [Microsoft exam experience and sandbox](https://learn.microsoft.com/en-us/credentials/support/exam-duration-exam-experience) · [AZ-204 retirement announcement](https://learn.microsoft.com/en-us/partner-center/referrals/partner-reported-azure-consumed-revenue)

## Generate a question set

Open **Generate questions**, choose a model from your connected ChatGPT account, and select its reasoning effort or leave it at Model default. Describe the topic in the prompt box and choose 1–60 questions and the formats you want. There must be at least one question per selected format.

Select **Coding** to generate programming exercises. Name a language in the prompt or use the Python default. Generated coding questions open in the VS Code practice editor with starter code and a visible example, and use Judge0 to grade the submitted program.

Use **Attach files** to add up to three study files totaling 10 MiB. The quiz sends them with the prompt, or uses them on their own if the prompt is empty. With the ChatGPT connection, the quiz sends text extracted from PDFs and UTF-8 text files, up to 60,000 characters total. With OpenAI Platform enabled, it sends the files directly as Responses API inputs and also accepts Word, PowerPoint, and Excel files. The saved set records the attachment names.

ChatGPT matches the subject to the existing provider and exam catalog. When a match is missing, it proposes a relevant provider or exam. After the full set passes validation, the app saves the set and any new categories together in MongoDB.

The model can choose whether to search the web or look up question prompts in the local bank. Web search has no domain allowlist and depends on ChatGPT model and account support. The activity panel shows live model and tool stages, plus local validation and saving. Only one set generates at a time. Use **Cancel generation** to stop the active request. Reloading or closing the tab that submitted it also cancels generation before saving starts. When web sources are returned, the quiz shows them in the generation result and saves them in the set JSON.

Every successful run writes a separate `generated-<id>.json` file in the matched folder. Running the same prompt again creates another set and leaves the earlier set and its attempts available. The result shows the model, category, and saved path. Invalid or incomplete runs write no set file.

## Connect ChatGPT and explain a result

1. Open the quiz on `http://127.0.0.1:5173/` and go to **Settings**.
2. Choose **Continue with ChatGPT**, sign in at OpenAI, and approve ChatGPT plan usage. OpenAI redirects you to quiz settings.
3. In **Review answers**, expand a question and choose **Explain with ChatGPT**. The server uses an eligible model from your ChatGPT account's model catalog. The explanation appears in the quiz and is saved with the attempt. From **Question bank**, expand any question and choose **Explain with ChatGPT** to generate a study explanation without submitting a set. Both kinds of AI explanations can use web search and read-only question lookup. Their activity panel shows live progress, and linked sources appear when returned. Use **Refresh explanation** to regenerate a cached answer. Bank explanations are cached in MongoDB.

The connection requires an eligible ChatGPT plan, such as Plus or Pro. Review access and usage in [ChatGPT Settings](https://chatgpt.com/settings/usage). The local server stores OAuth credentials in MongoDB. Use **Disconnect** to sign out. Any existing `local-data/openai.json` from the API-key version is no longer read.

The owner can use **Settings → Import previous browser attempts** to copy results and drafts from the older browser-storage version into MongoDB.

## Use OpenAI hosted tools

In **Settings → OpenAI hosted tools**, enter an OpenAI Platform API key and choose **Connect and enable hosted tools**. This switches new question generation and AI explanations to GPT-6.2 Astra on your Platform account. Platform usage, Code Interpreter, and File Search storage can incur API charges. The key is stored in MongoDB.

Upload a study file under **Study files** and wait for **Ready**. The app uses the project's vector store for hosted File Search and displays any document names cited by OpenAI. Code Interpreter can run Python in OpenAI's sandbox. Hosted tool search can discover the deferred quiz-bank lookup. The model decides when to use these tools.

Use **Switch to ChatGPT OAuth** to switch back. You can delete uploaded files from OpenAI in the same settings section. Existing explanations can be regenerated using **Refresh explanation**.
