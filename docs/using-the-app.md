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

Use **Manage question sets** to set CPU time, wall-clock time, memory, and the total set budget. Set a time budget on an individual question to give it its own countdown. Coding questions can override each execution limit. The owner can manage shared defaults and language overrides in **Settings**. Judge0 applies its configured maximums to code runs.

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

The model can choose whether to search the web or look up question prompts in the local bank. The activity panel shows live generation, validation, and saving. Each account can run one generation at a time. Use **Cancel generation** to stop a request before saving starts. Reloading or closing the tab that submitted it also cancels the request at that stage.

New generated sets are private to the account that created them. Open **Manage question sets** to edit the questions or add time limits. When web sources are returned, the quiz shows them in the generation result and saves them with the set in MongoDB.

In the question set editor, select a question to expand it and select it again to collapse it. **Add question** opens a new question for editing. Use **Save question set** to apply changes, including individual question deletions. **Delete question set** removes the set from the catalog after confirmation. Saved attempts and results remain available.

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

## Video answers and exam screenshots

In **Manage question sets**, add a **Video response** question with a prompt, grading guidance, and a maximum recording length. Learners start their camera, check the live preview, and record their answer alongside the question. Use **Hide question** to expand the player during recording or playback. The app host uses `ffprobe` from FFmpeg to validate video uploads. Saved video answers remain with the draft after reopening.

Open **Video Answer Practice** to try recording in Firefox, Chrome, or Edge. This sample uses Practice mode, so it opens directly to the video question.

For the written and coding section of a real exam, choose the exam tab in desktop Chrome or Edge. In Firefox, choose the browser window displaying the exam. Quizeit checks that the exam is visible and crops the image to the page before uploading. Enable the webcam, then select **Start exam**. Screenshots are scheduled when each written or coding question opens and every 30 seconds.

When the candidate leaves or returns to the exam, Quizeit logs the focus change and takes a webcam photo when the camera supplies a frame. It also captures the shared exam surface when it can verify the source. If the browser does not identify the shared surface, Quizeit waits until the exam returns to the foreground before capturing it again. Switching windows keeps the existing permissions unless the browser ends the share. Reviewers can compare these events with the images in **Exam evidence**.

Set **Webcam photo interval (seconds)** between 5 and 300. The default is 30 seconds. Quizeit takes a photo at the start of each written or coding question and at the configured interval. Webcam photos use no microphone. The exam pauses if required sharing or camera access stops. The written section is locked when submitted. Video questions follow and use their own camera and microphone controls. Practice sets use neither type of exam capture.

Open **Attempt history** to review practice videos. Administrators can use **Real exams → Review exam submissions** to see exam screenshots, webcam photos, the sharing timeline, and recorded answers. Open a video answer and choose **Mark correct** or **Mark incorrect**. The attempt shows **Pending review** until all submitted video responses have been graded.

Exam screenshots and webcam photos are private files in `local-data/exam-images`. Set `QUIZEIT_EXAM_IMAGES_DIR` in `.env` to use another persistent folder. MongoDB stores the full path and access metadata. Video answers use MongoDB GridFS. Back up the image folder alongside MongoDB and keep its path when restoring. For an older installation, stop Quizeit and run `npm run exam-images:migrate` to move its existing images before restarting.

## Build and invite candidates to a real exam

Administrators manage assessment questions through **Exam question bank**. Practice questions use **Manage question sets**. A saved set stays in its original bank. When administrators use **Generate questions**, they can choose **Practice** or **Real exam**. The latter also accepts a difficulty from 1 to 10.

Under **Real exams**, choose one or more exam question sets and enter the number to draw from each and its minimum difficulty. A question inherits its set's difficulty when it has no override. The fallback is 5. Each invitation gets a randomized selection and order from the pools saved when the exam was created. Later changes to the source sets apply to future exams.

Use **Real exams → Saved exams → View details** to inspect the eligible questions and edit the pass percentage and points per written, coding, or video question. The defaults are 70% and one point per question. The final score is earned points divided by available points. Coding earns full points when all grading tests pass. Reviewers can award full, partial, or zero points for a submitted video. Grading changes apply to future invitations.

Open **Candidate invitations**, select the exam, and enter the candidate's email and the number of days the link is valid. Use **Create invitation link** to share it yourself or **Send invitation email** when delivery is configured. The list shows invitations for every exam, their expiration date and time, and a copy icon for each unused, unexpired link. Older invitations created before copying was supported can use **Replace link** to issue a new link with the same expiry. Share the replacement with the candidate.

Candidates start once with their name and matching email, then resume in the same browser for up to 24 hours after starting. Location sharing is optional. The candidate list shows the recorded IP address, browser information, and approximate location when shared. Open a submitted attempt to grade and review evidence.

Set `QUIZEIT_PUBLIC_URL` to an HTTPS origin in `.env` for remote candidates. Forward that origin to the loopback app through your TLS reverse proxy. Configure the proxy to set a fixed public Host and overwrite `X-Forwarded-For` with the verified client address. Set `QUIZEIT_TRUST_PROXY=1` when using that proxy so Quizeit records the candidate's IP. The public origin serves invitation and candidate pages, while the administration console remains on localhost.

To enable built-in email delivery, also set `QUIZEIT_RESEND_API_KEY` and `QUIZEIT_EXAM_FROM` to your Resend API key and verified sender, then restart Quizeit. [Resend email documentation](https://resend.com/docs/api-reference/emails/send-email)

Keep `local-data/exam-invitation.key` with the deployment's private backup. Quizeit uses it to recover active invitation links for copying from the admin page.
