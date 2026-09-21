# CampusPulse

CampusPulse is a full-stack campus issue management platform. Students report campus
problems, staff handle the issues assigned to them, and admins monitor, assign and
analyse them.

## What it does

- Students raise complaints, with an optional photo
- Complaints get a predicted category and priority
- Places and facilities are extracted from the complaint text
- Duplicate complaints are detected and grouped together
- Photos are classified into an image category (Electrical, Plumbing, Structural, General)
- Complaints about the same problem are grouped into issue clusters
- Gemini writes complaint summaries and staff response drafts, always labelled as an
  AI draft for a human to review
- Three roles: student, staff and admin
- Complaint status tracking, in-app notifications and resolution feedback
- Admin analytics: recurring issues, emerging patterns, problem locations and
  facilities, and resolution trends
- A learning loop that keeps every prediction next to what actually happened, what a
  staff member corrected and what the student rated, and measures a retrained model
  against the one in use before it can replace it

## Technology stack

| Layer    | Technology                                              |
| -------- | ------------------------------------------------------- |
| Frontend | React, JavaScript, Tailwind CSS, React Router, Axios    |
| Backend  | Node.js, Express.js                                     |
| Database | PostgreSQL                                              |
| AI       | Python, scikit-learn, joblib, Pillow, PyTorch + torchvision, Google Gemini API |

## Current development stage

What exists today:

- `client/` React app (Vite) with a landing page, login and register, and a set of
  pages per role: `/student/*`, `/staff/*` and `/admin/*`
- `server/` Express API with `/api/health`, `/api/auth`, `/api/complaints` and
  `/api/users` routes
- PostgreSQL schema (9 tables) and a `pg` connection pool
- JWT authentication with bcrypt password hashing and role-based middleware
- A student can submit a complaint (with optional images) and staff/admin can move it
  through its lifecycle
- Admins can assign or reassign a complaint to a staff member, who sees it under
  `/staff/assigned` and can update its status with a note
- `ai/` Python classifier that predicts the category and priority of every new
  complaint, with the result logged in `ai_predictions`
- Every complaint is also scanned for the places and facilities it mentions, and
  compared against the complaints that are still open to spot duplicates
- The first photo of a complaint is classified into Electrical, Plumbing, Structural
  or General and labelled under the image
- Every complaint is grouped into an issue cluster with the other complaints about
  the same facility in the same place, and the admin dashboard lists the clusters
- Staff and admins can ask Gemini for a complaint summary or a response draft, which is
  shown as text and labelled as an AI draft
- Students get in-app notifications for the events on their complaints, and can rate a
  resolved complaint once

Not implemented yet: Socket.IO realtime updates, automated tests and deployment setup.

## AI layer

Every new complaint is sent to the Python classifier before it is saved. The complaint
gets the predicted `category` and `priority`, and a row is written to `ai_predictions`
with the model name and confidence.

```text
POST /api/complaints
   -> python ai/predict.py, kept running by the backend
   -> {"category": "IT & Network", "priority": "high", "confidence": 0.83,
       "model_type": "tfidf_logistic_regression+severity_keywords",
       "entities": {"locations": ["boys hostel", "block a"], "facilities": ["wifi"]}}
   -> the text is compared with the open complaints    (duplicate detection)
   -> the entities are compared with the open clusters (clustering)
   -> the first photo is classified by python ai/cv_classify.py
   -> complaint, cluster and ai_predictions rows are written in one transaction
```

If Python is missing, slow or broken, the complaint is still saved with
`category = NULL` and `priority = 'medium'`, and no prediction row is written. See
[ai/README.md](ai/README.md) for the model and how to retrain it.

### Extracted entities

`ai/nlp_preprocessing.py` cleans the text and looks for known campus vocabulary with
plain regular expressions, because the vocabulary of a campus is small and known:
"boys hostel", "block a", "computer lab" as locations, "wifi", "water", "light" and
"fan" as facilities. A generic name such as "hostel" is dropped when a longer one such
as "boys hostel" also matched.

### Duplicate detection

`server/services/duplicateDetector.js` compares the new complaint with the recent
complaints whose status is still `open`, `assigned` or `in_progress` (at most 100).
Both texts are tokenised, turned into TF-IDF vectors and compared with cosine
similarity. A score of **0.70 or more** is treated as a possible duplicate.

Text similarity alone cannot tell "Light is not working in the **library**" from
"Light is not working in the **corridor**" - the same sentence with one word swapped,
so it scores above the threshold, but they are two different problems. So when both
complaints name a place and those places do not overlap, the pair is not flagged.

Everything is algorithmic and in memory: no vector database and no embedding API.

In the UI, the complaint detail panel shows the extracted places and facilities as
tags, and a flagged duplicate gets a small amber notice in the panel and next to its
row on the admin dashboard.

### Image classification

The first photo of a complaint is sent to `ai/cv_classify.py`, which runs MobileNetV2
pretrained on ImageNet (torchvision) and maps the ImageNet labels that mean something
in a building onto Electrical, Plumbing and Structural. A photo whose top 5 labels
contain none of them is called General.

ImageNet has no classes for these categories and there are no labelled campus photos
to fine-tune on, so this is zero-shot and the accuracy is modest. Measured on 37
Wikimedia Commons photos of campus-type damage, where guessing would score 0.25:

| Model | Correct |
| ----- | ------- |
| `mobilenet_v2_transfer` | 18/37 = 0.49 |
| `color_edge_heuristic` | 13/37 = 0.35 |

The confidence is reported as measured, so a photo the model does not recognise comes
out with a low score instead of a false certainty. If torch is missing or the weights
cannot be downloaded, the colour and edge heuristic runs instead, so a complaint is
never blocked. Training on a few hundred labelled campus photos is what would make
this accurate.

### Issue clustering

`server/services/clusterManager.js` puts every complaint into exactly one cluster: it
joins the best matching open cluster, or it starts a new one.

Text similarity alone is not enough. Measured on real pairs:

```text
0.58  "Fan not working in classroom 3" / "The ceiling fan in classroom 3 is broken"   same issue
0.67  "Fan not working in classroom 3" / "Projector not working in classroom 3"      different issue
```

The different issue scores higher, so a threshold on the text cannot separate them.
The entities from Step 6 can: a complaint only joins a cluster when the place matches,
the facility matches, and the text is similar too (0.50 or more).

### Keeping Python warm

Importing scikit-learn takes about five seconds and torch about fifteen, which is far
too long to pay for every request, so `server/services/pythonBridge.js` starts both
scripts once at boot with `--serve` and talks to them one JSON line at a time. Nothing
is sent until the script prints `READY`. A script that crashes or times out is
restarted on the next request, and the request that hit the problem falls back.

With this, submitting a complaint takes about **40 ms** instead of about 3 seconds, and
adding a photo about **1.2 seconds** instead of 20.

### What is stored

Each analysis is one row in `ai_predictions`, told apart by `model_type`:

| `model_type` | `prediction` example |
| ------------ | -------------------- |
| `tfidf_logistic_regression+severity_keywords` | `category=IT & Network; priority=high; confidence=0.8325` |
| `nlp_entity_extraction` | `locations=boys hostel\|block a; facilities=wifi` |
| `tfidf_cosine_similarity` | `duplicate_of=12; similarity=0.7799` |
| `cv_image_classification` | `image=31; image_category=Electrical; model=mobilenet_v2_transfer` |

The duplicate link is kept here rather than in `complaint_status_history`, because
being flagged as a duplicate is analysis metadata and does not change the complaint's
status. `GET /api/complaints/:id` returns it as `duplicate_warning`.

The cluster of a complaint is not stored here: it is the `complaints.issue_cluster_id`
column, which points at a row in `issue_clusters`. `GET /api/complaints/:id` returns it
as `cluster`, with the number of complaints in it.

### Generative text (Gemini)

`server/services/geminiClient.js` wraps the official `@google/genai` SDK and
`server/services/aiSummary.js` builds the prompts. Gemini is used for two things only:

- `POST /api/complaints/:id/summary` - a short summary of one complaint
- `POST /api/complaints/:id/response-draft` - a reply for a staff member to edit

Everything that decides something stays in the ML/NLP/CV code above: Gemini never
picks the category, the priority, the duplicate or the cluster, and it never changes a
complaint. Both endpoints require `staff` or `admin`.

The prompts are constrained to the data already stored on the complaint, and are told
not to invent dates, locations, causes or resolutions. Generated text is returned to
the browser as plain text and is not written to the database. In the UI it appears
under a clear label, `AI summary` or `AI Draft — Review before sending`, so nothing
generated can be mistaken for a decision or sent on its own.

`GEMINI_API_KEY` is read on the server only and is never sent to the React app. If the
key is missing or the call fails, the endpoint answers `503` with a plain message and
everything else in the app keeps working.

### Admin insights

`server/services/aiInsights.js` turns data that is already stored into five groups of
insights, shown at the top of Admin Analytics:

| Group | Built from | Answers |
| ----- | ---------- | ------- |
| Recurring issues | `issue_clusters`, plus complaints sharing a category and area | What keeps coming back, and where |
| Emerging patterns | complaint counts per category, last 14 days against the previous 14 | What is getting worse |
| Problematic locations | complaints grouped by the area part of `location` | Where complaints concentrate |
| Problematic facilities | `facilities` extracted by the NLP step | Which equipment is involved |
| Resolution trends | `resolved_at - created_at`, reopen counts, `feedback.rating` | How long fixes take and how they were rated |

These are counts and averages, not generated text. Each item carries the figures it was
derived from, so an admin can check the claim rather than trust it. Nothing here is
produced by a language model, and the insights are deliberately campus-wide: the filters
on the page narrow the charts, but "this area is getting worse" is only meaningful over
the whole set.

An "area" is the text before the first ` - ` in a location, so `Academic Block C - 3rd
floor corridor` and `Academic Block C - seminar hall` count as the same place.

### The learning loop

The loop closes the gap between what the model predicted and what turned out to be true.

**1. The data.** `ai_feedback_dataset` is a view that joins the four signals, one row per
complaint:

| Signal | Where it comes from |
| ------ | ------------------- |
| What the model said | `ai_predictions` (the classifier row, with its confidence) |
| What actually happened | `complaints.status`, `resolved_at`, reopen count |
| What the student rated | `feedback.rating` and comment |
| What a person corrected | `ai_feedback` |

**2. Corrections.** `PATCH /api/complaints/:id/classification` (staff or admin) lets
someone overrule the predicted category or priority from the complaint page. The stored
prediction is never overwritten: it is the record of what the model said, and the whole
point of the loop is to be able to compare the two. Only a field that actually changed
produces a row, so `ai_feedback` stays a list of disagreements rather than of every save.

**3. The labels are not all equal.** The dataset view marks each row
`human_corrected` or `ai_uncorrected`. Most rows are the second kind, because the
complaint's category was written from the prediction in the first place, so training on
them is circular. Every evaluation report states how many of each it used, and
`--corrected-only` restricts the run to genuine human labels once there are enough.

**4. Evaluation before replacement.**

```bash
cd server && npm run export:dataset        # writes ai/model/feedback_dataset.json
python ai/evaluate_model.py                # measure, write a report, change nothing
python ai/evaluate_model.py --promote      # allow a better candidate to replace the model
```

`ai/evaluate_model.py` splits the labels into a training part and a held-out test part,
trains a candidate pipeline on the training part, and scores the candidate and the model
currently in use on the same test part. The candidate is only promoted when it wins by at
least 0.01 accuracy, and even then only with `--promote`. Without that flag nothing is
ever written over the model in use. The previous model is copied to
`complaint_model.previous.joblib` first, so a promotion can be undone by copying it back.
The report lands in `ai/model/evaluation_report.json` and is shown on Admin Analytics.

Python never touches the database: Node exports the view to JSON, exactly as `predict.py`
and `cv_classify.py` already receive JSON. A run with too few labelled rows reports
`insufficient_data` and promotes nothing.

## Roles and pages

Each role has its own section of the app, and the sidebar lists exactly the pages in it.

**Student — report, triage, track, resolve, rate**

| Page | Route |
| ---- | ----- |
| Dashboard | `/student/dashboard` |
| My Complaints | `/student/complaints` |
| Complaint detail and feedback | `/student/complaints/:id` |
| Report Issue | `/student/report` |
| Notifications | `/student/notifications` |
| Profile | `/student/profile` |

**Staff — the work queue**

| Page | Route |
| ---- | ----- |
| Dashboard (work queue overview) | `/staff/dashboard` |
| Assigned | `/staff/assigned` |
| In Progress | `/staff/in-progress` |
| Resolved | `/staff/resolved` |
| Workspace for one complaint | `/staff/complaints/:id` |
| Notifications | `/staff/notifications` |
| Profile | `/staff/profile` |

The three queues are the same page filtered by status, and every row opens the
complaint workspace. The workspace shows the record, the status history, the next
workflow step and the Gemini tools, so a staff member can finish a job without leaving
the page.

**Admin — monitor, manage, workload, analytics**

| Page | Route |
| ---- | ----- |
| Dashboard | `/admin/dashboard` |
| Complaints | `/admin/complaints` |
| Complaint detail and assignment | `/admin/complaints/:id` |
| Issue Clusters | `/admin/clusters`, `/admin/clusters/:id` |
| Analytics | `/admin/analytics` |
| Staff | `/admin/staff` |
| Notifications | `/admin/notifications` |
| Profile | `/admin/profile` |

| Role | Lands on |
| ---- | -------- |
| student | `/student/dashboard` |
| staff | `/staff/dashboard` |
| admin | `/admin/dashboard` |

`/notifications` is the same page as the per-role one, for any logged-in user. `/` shows
the landing page, and `/login` and `/register` are public.

Every page starts with a `PageHeader`: a breadcrumb trail that doubles as back
navigation, plus the page title and its main action.

`ProtectedRoute` wraps each of the three role groups and the shared notifications page.
A visitor with no token is sent to `/login`, and a role that is not allowed sees a 403
page. This is only about what the user sees — every API call is authorised again on the
server.

## API endpoints

| Method | Endpoint | Access | Purpose |
| ------ | -------- | ------ | ------- |
| GET | `/api/health` | public | Confirm the backend is running |
| POST | `/api/auth/register-student` | public | Register a new student |
| POST | `/api/auth/register` | admin | Create a staff or admin account |
| POST | `/api/auth/login` | public | Log in and receive a JWT |
| GET | `/api/auth/me` | logged in | Current logged-in user |
| POST | `/api/complaints` | student | Submit a complaint, optionally with images |
| GET | `/api/complaints` | admin | Every complaint, with reporter, assignee, feedback and its issue cluster |
| GET | `/api/complaints/my` | logged in | Complaints submitted by the current user |
| GET | `/api/complaints/assigned` | staff, admin | Complaints currently assigned to the logged-in user |
| GET | `/api/complaints/clusters` | admin | Open issue clusters |
| GET | `/api/complaints/clusters/:id` | admin | One cluster with the complaints in it |
| GET | `/api/complaints/admin/dashboard` | admin | Counts, status breakdown and recent activity |
| GET | `/api/complaints/admin/analytics` | admin | Filtered volume, distribution, workload and resolution metrics |
| GET | `/api/complaints/notifications` | logged in | Notifications for the current user |
| PATCH | `/api/complaints/notifications/:id/read` | logged in | Mark one notification read |
| PATCH | `/api/complaints/notifications/read-all` | logged in | Mark every notification read |
| GET | `/api/complaints/:id` | owner, staff, admin | One complaint plus its status history, images (with image tags), AI prediction, entities, duplicate warning and cluster |
| PATCH | `/api/complaints/:id/status` | staff, admin | Change complaint status |
| POST | `/api/complaints/:id/assign` | admin | Assign the complaint to a staff member |
| POST | `/api/complaints/:id/summary` | staff, admin | Gemini summary of the complaint |
| POST | `/api/complaints/:id/response-draft` | staff, admin | Gemini draft reply for a staff member |
| POST | `/api/complaints/:id/feedback` | student, owner | Rate a resolved or closed complaint, once |
| GET | `/api/complaints/:id/feedback` | owner, staff, admin | Feedback already submitted for a complaint |
| PATCH | `/api/complaints/:id/classification` | staff, admin | Correct the predicted category or priority; recorded in `ai_feedback` for the learning loop |
| GET | `/api/complaints/admin/ai-feedback` | admin | Learning-loop figures: labelled rows, corrections and the last evaluation report |
| GET | `/api/users/staff` | admin | Staff accounts with their workload |
| POST | `/api/users/staff` | admin | Create a staff account |
| GET | `/api/users/me` | logged in | Current user's profile |
| PATCH | `/api/users/profile` | logged in | Update name, department and phone |
| PATCH | `/api/users/change-password` | logged in | Change password |

All routes except health, `register-student` and `login` need
`Authorization: Bearer <token>`.

The `/api/complaints/*` and `/api/users/*` routers apply `authMiddleware` to every
route, and the per-route `roleMiddleware(...)` is the second check.

## Complaint lifecycle

```text
open ──┬── assigned ──┬── in_progress ──┬── resolved ── closed ── reopened
       ├── rejected   ├── rejected      └── reopened
       └── duplicate  └── duplicate
```

`reopened` goes back to `assigned` or `in_progress`. Any other jump is rejected with a
400. Every change is written to `complaint_status_history`. Assigning an `open` or
`reopened` complaint moves it to `assigned`; reassigning one that is already `assigned`
or `in_progress` keeps its status.

## Complaint images

Images are uploaded with `multer`. When `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`
and `CLOUDINARY_API_SECRET` are set, the files are stored on Cloudinary and
`complaint_images.file_url` holds the full `https://res.cloudinary.com/...` URL. Without
those variables the files stay on local disk in `server/uploads/`, served at
`/uploads/<filename>`, which is what local development uses.

- Field name is `images`, up to 5 files per complaint
- Only `image/jpeg` and `image/png`, maximum 5 MB each
- Files are renamed to `<timestamp>-<random>.<ext>` so uploads cannot collide
- The file is written to disk first, because the Python image classifier reads it by
  path, and is uploaded to Cloudinary before the transaction opens
- The `complaint_images` row is written in the same transaction as the complaint, and
  the image is removed again (from Cloudinary or from disk) if that transaction fails
- The local copy of a Cloudinary image is deleted once the complaint is saved, so only
  the cloud copy remains

## Notifications and feedback

Every meaningful lifecycle event writes a row to `notifications` for the people it
concerns: the reporter when a complaint is submitted, assigned or moved to a new
status, and the staff member when a complaint is assigned to them. The bell in the
topbar shows the unread count, `/notifications` lists them, and one notification or all
of them can be marked read.

Once a complaint is `resolved` or `closed`, its owner can rate it from 1 to 5 with an
optional comment. Only the owner may do this, and only once: `feedback` carries
`UNIQUE (complaint_id, user_id)`, so a second row for the same user is rejected by the
database rather than only by the API.

## Folder structure

```text
CampusPulse/
├── client/                        React frontend
│   ├── .env.example               VITE_API_URL
│   └── src/
│       ├── components/
│       │   ├── ui/                Button, Card, Input, Select, Textarea, Badge, StatCard,
│       │   │                      Table, Spinner, Alert, Modal, loading/empty/error states
│       │   ├── complaints/        ComplaintCard
│       │   ├── PageHeader.jsx     Breadcrumbs, title, page action
│       │   ├── ProfilePage.jsx    Shared profile view for all three roles
│       │   ├── ProfileEdit.jsx    Profile and password forms
│       │   ├── ProtectedRoute.jsx Token check, role check, 403 page
│       │   ├── ComplaintDetail.jsx Shared complaint record in titled sections
│       │   ├── StatusTimeline.jsx  Status history timeline
│       │   ├── StatusBreakdown.jsx Status counts as a bar plus legend
│       │   ├── WorkflowSteps.jsx  Assigned -> In Progress -> Resolved -> Closed
│       │   ├── StatusUpdateForm.jsx Workflow actions for a complaint
│       │   ├── AssignForm.jsx     Admin assignment action
│       │   ├── AiTools.jsx        Gemini summary and draft buttons
│       │   ├── AiInsights.jsx     Explainable insights and the learning-loop card
│       │   ├── ClassificationCorrection.jsx Overrule the predicted category or priority
│       │   └── Badges.jsx         Status, priority and category labels
│       ├── layout/
│       │   ├── AppShell.jsx       Topbar + Sidebar + Outlet
│       │   ├── Sidebar.jsx        Role links, mobile drawer, logout
│       │   └── Topbar.jsx         Brand, notification bell, logout
│       ├── pages/                 Home, Login, Register, Notifications, and one
│       │                          set per role: dashboards, queues, complaint
│       │                          detail and workspace, clusters, analytics,
│       │                          staff, profiles
│       ├── api.js                 Axios instance for the backend
│       ├── auth.js                Token/user helpers, landing page per role
│       └── App.jsx                Routes with role protection
├── server/                        Express backend
│   ├── config/db.js               PostgreSQL connection pool
│   ├── database/
│   │   ├── schema.sql             Tables, the feedback dataset view, indexes
│   │   ├── seed-demo.sql          Repeatable demo data
│   │   └── migrations/            Changes applied to an existing database
│   ├── middleware/
│   │   ├── auth.js                JWT check + role check
│   │   └── upload.js              Multer storage, file limits, cleanup helper
│   ├── routes/
│   │   ├── health.js              GET /api/health
│   │   ├── auth.js                register, register-student, login, me
│   │   ├── complaints.js          complaints, status, assignment, images,
│   │   │                          clusters, notifications, analytics, insights,
│   │   │                          feedback, classification correction,
│   │   │                          AI summary and draft
│   │   └── users.js               staff list and creation, own profile
│   ├── scripts/
│   │   └── export-feedback-dataset.js Writes the learning-loop dataset for the evaluator
│   ├── services/
│   │   ├── pythonBridge.js       Starts the Python scripts and keeps them alive
│   │   ├── aiClassifier.js       Category, priority and entities
│   │   ├── cvClassifier.js       Image category of the first photo
│   │   ├── duplicateDetector.js  TF-IDF cosine similarity against open complaints
│   │   ├── clusterManager.js     Groups complaints into issue clusters
│   │   ├── geminiClient.js       Google Gen AI client, timeout and error handling
│   │   ├── aiSummary.js          Prediction formats and the Gemini prompts
│   │   ├── aiInsights.js         Counts and averages behind the admin insights
│   │   └── aiFeedback.js         Corrections and the learning-loop dataset
│   ├── uploads/                   Uploaded complaint images (not in Git)
│   ├── app.js                     Express app setup
│   ├── server.js                  Starts the server
│   └── .env.example               Required environment variables
├── ai/                            Python classifier
│   ├── training_data.py           140 labelled examples
│   ├── train_model.py             Trains and saves the category model
│   ├── evaluate_model.py          Measures a candidate model before it can replace the one in use
│   ├── predict.py                 Category, priority and entities
│   ├── cv_classify.py             Image category (MobileNetV2, heuristic fallback)
│   ├── nlp_preprocessing.py       Text cleaning and campus entity extraction
│   ├── severity.py                Priority keyword rule
│   ├── requirements.txt           scikit-learn, joblib, Pillow, torch, torchvision
│   ├── model/                     Trained model, feedback dataset and evaluation report (generated)
│   └── .venv/                     Virtualenv (not in Git)
└── README.md
```

## Database setup

PostgreSQL is used with the `pg` package. Connection settings are read from environment
variables, never hard-coded.

1. Copy the example file and fill in your local values:

```bash
cd server
copy .env.example .env      # macOS/Linux: cp .env.example .env
```

2. Create the database:

```bash
psql -U postgres -c "CREATE DATABASE campuspulse;"
```

3. Apply the schema:

```bash
psql -U postgres -d campuspulse -f database/schema.sql
```

4. Check the tables:

```bash
psql -U postgres -d campuspulse -c "\dt"
```

The schema creates 9 tables: `users`, `complaints`, `complaint_images`,
`complaint_status_history`, `assignments`, `issue_clusters`, `ai_predictions`,
`notifications` and `feedback`.

### Migrations

`schema.sql` only creates tables that do not exist yet, so an existing database is
updated with the files in `database/migrations/`:

```bash
psql -U postgres -d campuspulse -f database/migrations/001_complaint_status_values.sql
```

| Migration | What it does |
| --------- | ------------ |
| `001_complaint_status_values.sql` | Allows the complaint statuses `open`, `assigned`, `closed`, `duplicate` and `reopened` and makes `open` the default |
| `002_notifications_table.sql` | Adds the `notifications` table |
| `003_feedback_unique_per_user.sql` | Adds `UNIQUE (complaint_id, user_id)` to `feedback` so a user can rate a complaint only once |
| `004_ai_feedback.sql` | Adds the `ai_feedback` table and the `ai_feedback_dataset` view that the learning loop reads |

## Environment variables

Both halves of the app read their settings from environment files. Only the
`.env.example` files are committed, and both `.env` files are ignored by Git.

`server/.env` (copy from `server/.env.example`):

| Variable | Default in the example | Purpose |
| -------- | ---------------------- | ------- |
| `PORT` | `5000` | Port the API listens on |
| `CORS_ORIGIN` | empty | Comma-separated browser origins allowed to call the API. Empty accepts any, which is for local development only |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `campuspulse` | Database name |
| `DB_USER` | `postgres` | Database user |
| `DB_PASSWORD` | placeholder | Database password |
| `DB_SSL` | `false` | `true` for managed Postgres, which only accepts TLS |
| `JWT_SECRET` | placeholder | Signing key for the login tokens |
| `JWT_EXPIRES_IN` | `1d` | How long a token stays valid |
| `PYTHON_BIN` | empty | Interpreter for the AI scripts; empty means `ai/.venv` |
| `AI_TIMEOUT_MS` | `10000` | How long one AI analysis may take |
| `GEMINI_API_KEY` | empty | Enables the Gemini endpoints. Server-side only, never sent to the browser |
| `GEMINI_MODEL` | `gemini-3.6-flash` | Which Gemini text model to call |
| `GEMINI_TIMEOUT_MS` | `20000` | How long one Gemini call may take |
| `CLOUDINARY_CLOUD_NAME` | empty | Cloudinary cloud name. All three are needed to store complaint images in the cloud |
| `CLOUDINARY_API_KEY` | empty | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | empty | Cloudinary API secret. Server-side only |

`client/.env` (copy from `client/.env.example`):

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `VITE_API_URL` | `http://localhost:5000` | Backend base URL used by `client/src/api.js` |

## Running the project

Start the backend:

```bash
cd server
npm install
npm run dev
```

Server runs on http://localhost:5000.

Start the frontend in a second terminal:

```bash
cd client
copy .env.example .env      # macOS/Linux: cp .env.example .env
npm install
npm run dev
```

Frontend runs on http://localhost:5173.

## Health check

```text
GET http://localhost:5000/api/health
```

```json
{
  "status": "ok",
  "message": "CampusPulse backend is running",
  "timestamp": "2026-09-17T10:30:00.000Z"
}
```

## Deployment

The architecture is React/Vite → Node/Express → PostgreSQL + a Python AI bridge, and it
deploys as it is. There is no Dockerfile and no build step in the API: two services and a
database are enough.

### What runs where

| Piece | How it runs | Notes |
| ----- | ----------- | ----- |
| Frontend | Static build of `client/` | `npm run build` produces `client/dist` |
| API | `npm start` in `server/` | Node 20 or newer, port from `PORT` |
| Database | PostgreSQL 14 or newer | Any managed provider works |
| AI bridge | Child processes of the API | Python 3.10+ with `ai/requirements.txt` installed |

The API starts the two Python scripts at boot and keeps them alive, so the Python
interpreter, the packages and the trained model all have to exist on the same host as the
Node process. `PYTHON_BIN` points the bridge at a specific interpreter if `ai/.venv` is not
where it expects.

### Steps

1. **Database.** Create the database, then apply the schema once:

   ```bash
   psql "$DATABASE_URL" -f server/database/schema.sql
   ```

   For a database created before this version, apply the migrations in
   `server/database/migrations/` in order instead. Both are safe to run once; they are not
   re-runnable, so do not put them in a start command.

2. **AI model.** `ai/model/` is not committed, so train the model on the host during the
   build:

   ```bash
   pip install -r ai/requirements.txt
   python ai/train_model.py
   ```

3. **API.** Set the environment variables below and start it:

   ```bash
   cd server && npm ci --omit=dev && npm start
   ```

   Point the platform health check at `/api/health`.

4. **Frontend.** Build with the API URL baked in. Vite reads it at build time, not at
   runtime, so it has to be set before `npm run build`:

   ```bash
   cd client && VITE_API_URL=https://api.example.edu npm run build
   ```

   Serve `client/dist` as static files. Any static host or CDN works.

### Environment variables that matter in production

| Variable | Why |
| -------- | --- |
| `CORS_ORIGIN` | Comma-separated origins allowed to call the API. **Set this.** Left empty the API accepts any origin, which is only right for local development |
| `JWT_SECRET` | Must be a long random value. Changing it signs every user out |
| `DB_SSL` | `true` for managed Postgres, which refuses plain connections |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASSWORD` | Connection details |
| `GEMINI_API_KEY` | Without it the summary and draft endpoints answer `503`; everything else still works |
| `GEMINI_MODEL` | Defaults to `gemini-3.6-flash`. `gemini-2.5-flash` is retired for new keys |
| `PYTHON_BIN` | Only needed if the venv is somewhere unusual |
| `CLOUDINARY_CLOUD_NAME` `CLOUDINARY_API_KEY` `CLOUDINARY_API_SECRET` | **Set these.** They keep the complaint photos in object storage instead of the app's own disk |
| `VITE_API_URL` | Frontend build only, not read by the server |

### Things to know before you deploy

- **Uploads need somewhere to live.** With the `CLOUDINARY_*` variables set, the complaint
  photos go to Cloudinary and nothing is kept on the app's own disk. Without them they are
  written to `server/uploads/`, which on a host with an ephemeral filesystem is wiped on
  every redeploy: set the three variables, or attach a persistent disk.
- **The API scales with the Python workers.** Each API instance starts its own pair of
  Python processes and holds them in memory. That is what keeps an analysis fast, and it is
  also why the API wants a host with enough RAM for scikit-learn and torch.
- **`trust proxy` is on** with one hop, so `req.ip` and the protocol are read from the
  forwarded headers behind a load balancer.
- **The Gemini key needs headroom.** On a free-tier key the summary and draft endpoints
  draw on a *per-day* quota (`GenerateRequestsPerDayPerProjectPerModel`). A few minutes of
  clicking consumes it, and once it is gone those two endpoints answer `503` with
  "Gemini has reached its request limit for now" until it resets. Everything else keeps
  working. Use a key with a paid quota for anything real. If the model named by
  `GEMINI_MODEL` is retired for your key, the API answers `404 NOT_FOUND` and the same
  message shows in the log, which is the signal to point it at a current model.
- **Retraining is a deliberate, offline step.** Nothing retrains on its own. Run the
  evaluation described in the AI layer section, and only promote a model that measured
  better than the one in use.
