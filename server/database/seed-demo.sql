-- CampusPulse - demo data seed
--
-- Fills the database with a realistic, interconnected campus so every screen can
-- be demonstrated: student dashboard -> staff queue and workflow -> admin
-- dashboard -> issue clusters -> analytics.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DOES NOT DO
-- ---------------------------------------------------------------------------
-- It only inserts rows. It does not create or alter tables, so apply the schema
-- and the migrations first:
--
--   psql -U postgres -d campuspulse -f database/schema.sql
--   psql -U postgres -d campuspulse -f database/migrations/001_complaint_status_values.sql
--   psql -U postgres -d campuspulse -f database/migrations/002_notifications_table.sql
--   psql -U postgres -d campuspulse -f database/migrations/003_feedback_unique_per_user.sql
--   psql -U postgres -d campuspulse -f database/seed-demo.sql
--
-- ---------------------------------------------------------------------------
-- HOW THE DEMO DATA IS MARKED AND KEPT REPEATABLE
-- ---------------------------------------------------------------------------
-- Every seeded account has an email ending in "@demo.campuspulse.test" (the
-- .test TLD is reserved for exactly this). Running the file again deletes the
-- rows created by the previous run first, so it can be re-run as often as
-- needed without duplicating anything and without touching other rows.
--
-- Real accounts (the existing admin, any student you registered yourself) are
-- never deleted or changed. The one exception is complaint assignments, which
-- are attributed to the first existing admin account.
--
-- ---------------------------------------------------------------------------
-- LOGINS CREATED BY THIS SEED
-- ---------------------------------------------------------------------------
-- All 14 demo accounts use the password:  Demo@1234
--
--   student  aarav.deshmukh@demo.campuspulse.test     (most complaints)
--   student  priya.nair@demo.campuspulse.test
--   staff    ramesh.yadav@demo.campuspulse.test       (water, plumbing, furniture)
--   staff    imran.shaikh@demo.campuspulse.test       (electrical)
--   staff    sunita.pawar@demo.campuspulse.test       (housekeeping)
--   staff    deepak.rathod@demo.campuspulse.test      (IT and network)
--   admin    use your existing admin account
--
-- ---------------------------------------------------------------------------
-- NOTES ON VALUES THAT ARE NOT FREE CHOICES
-- ---------------------------------------------------------------------------
-- * complaints.category must be one of the values the Python classifier can
--   return: Infrastructure, IT & Network, Sanitation, Electrical, General. The
--   sub-topics the demo covers (water, plumbing, Wi-Fi, hostel, cleanliness,
--   furniture, labs, library) live in the titles, locations and extracted
--   entities, which is where the pipeline actually puts them.
-- * ai_predictions.prediction is the exact "key=value; key=value" format that
--   services/aiSummary.js writes and reads back.
-- * No complaint_images or cv_image_classification rows are seeded, because the
--   uploaded files they point at would not exist on disk and the UI would show
--   broken thumbnails. Submit a complaint with a photo through the app to get
--   real computer-vision rows.

BEGIN;

-- ---------------------------------------------------------------------------
-- The complaint plan. One row per complaint, with the staff member it belongs
-- to and the AI values that will be written for it. Keeping it in a temporary
-- table means the title is written once and reused by every later step.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE demo_plan (
  student_email  VARCHAR(150) NOT NULL,
  staff_email    VARCHAR(150),
  title          VARCHAR(150) NOT NULL,
  description    TEXT         NOT NULL,
  category       VARCHAR(50)  NOT NULL,
  location       VARCHAR(150) NOT NULL,
  priority       VARCHAR(20)  NOT NULL,
  status         VARCHAR(20)  NOT NULL,
  cluster_title  VARCHAR(150),
  age_days       INTEGER      NOT NULL,
  confidence     NUMERIC(5,4) NOT NULL,
  ent_locations  TEXT         NOT NULL,
  ent_facilities TEXT         NOT NULL
) ON COMMIT DROP;

INSERT INTO demo_plan
  (student_email, staff_email, title, description, category, location, priority, status,
   cluster_title, age_days, confidence, ent_locations, ent_facilities)
VALUES
-- Cluster 1: water supply, Boys Hostel B
('aarav.deshmukh@demo.campuspulse.test', 'ramesh.yadav@demo.campuspulse.test',
 'No water supply in Boys Hostel B bathrooms since yesterday night',
 'No water has come from the taps on the first floor since around 9 pm yesterday. About forty students are using the ground floor bathroom instead. The tanker that usually comes on Tuesday did not come this week.',
 'Infrastructure', 'Boys Hostel B - 1st floor washroom', 'urgent', 'in_progress',
 'Water supply disruption in Boys Hostel B', 4, 0.8641,
 'boys hostel b|first floor washroom', 'water supply|taps|overhead tank'),

('sneha.iyer@demo.campuspulse.test', 'ramesh.yadav@demo.campuspulse.test',
 'Water tanker has not arrived and the 2nd floor taps are dry',
 'The second floor taps have been dry since Monday morning. We have complained to the hostel office twice. Some students are buying bottled water.',
 'Infrastructure', 'Boys Hostel B - 2nd floor washroom', 'high', 'assigned',
 'Water supply disruption in Boys Hostel B', 6, 0.7928,
 'boys hostel b|second floor washroom', 'water tanker|taps'),

('siddharth.menon@demo.campuspulse.test', 'ramesh.yadav@demo.campuspulse.test',
 'Low water pressure on the third floor of Boys Hostel B',
 'Water on the third floor comes in a thin trickle and takes almost an hour to fill a bucket. It has been like this for over a week. The lower floors are fine.',
 'Infrastructure', 'Boys Hostel B - 3rd floor washroom', 'medium', 'resolved',
 'Water supply disruption in Boys Hostel B', 21, 0.6215,
 'boys hostel b|third floor washroom', 'water supply|tap'),

-- Cluster 2: washroom leaks, Girls Hostel A
('priya.nair@demo.campuspulse.test', 'ramesh.yadav@demo.campuspulse.test',
 'Tap in Girls Hostel A common washroom keeps running',
 'One of the taps in the common washroom does not close properly and has been running continuously for three days. Water is being wasted the whole day. It gets very noisy at night.',
 'Infrastructure', 'Girls Hostel A - common washroom', 'medium', 'closed',
 'Repeated washroom leaks in Girls Hostel A', 34, 0.6487,
 'girls hostel a|common washroom', 'tap|water supply'),

('ananya.reddy@demo.campuspulse.test', 'ramesh.yadav@demo.campuspulse.test',
 'Water leaking from the pipe under the washbasin in Girls Hostel A',
 'There is a steady leak from the pipe joint under the washbasin on the second floor. Water collects on the floor and it becomes slippery. Someone could fall.',
 'Infrastructure', 'Girls Hostel A - 2nd floor washroom', 'high', 'in_progress',
 'Repeated washroom leaks in Girls Hostel A', 5, 0.7436,
 'girls hostel a|second floor washbasin', 'water pipe joint|washbasin'),

-- Cluster 3: Wi-Fi dead spots, Academic Block C
('aditya.verma@demo.campuspulse.test', 'deepak.rathod@demo.campuspulse.test',
 'Wi-Fi keeps dropping in Academic Block C third floor',
 'The Wi-Fi drops every few minutes on the third floor of Academic Block C. It is impossible to attend online lectures from here. The signal shows full bars but nothing loads.',
 'IT & Network', 'Academic Block C - 3rd floor corridor', 'high', 'in_progress',
 'Wi-Fi dead spots in Academic Block C', 3, 0.8194,
 'academic block c|third floor', 'wi-fi'),

('karan.bhatia@demo.campuspulse.test', 'deepak.rathod@demo.campuspulse.test',
 'No Wi-Fi signal in the Academic Block C seminar hall',
 'There is no Wi-Fi signal at all inside the Academic Block C seminar hall. Guest lectures and student presentations need internet and we have to use mobile hotspots. This has been happening since the renovation.',
 'IT & Network', 'Academic Block C - seminar hall', 'medium', 'assigned',
 'Wi-Fi dead spots in Academic Block C', 8, 0.8062,
 'academic block c|seminar hall', 'wi-fi'),

('ishita.banerjee@demo.campuspulse.test', 'deepak.rathod@demo.campuspulse.test',
 'Wi-Fi speed is unusable in Academic Block C staff cabins',
 'Internet in the staff cabins of Academic Block C is extremely slow during the day. Opening a single web page takes minutes. It works normally after 6 pm when most people have left.',
 'IT & Network', 'Academic Block C - staff cabins', 'low', 'resolved',
 'Wi-Fi dead spots in Academic Block C', 26, 0.5583,
 'academic block c|staff cabins', 'wi-fi|internet speed'),

-- Cluster 4: lighting, Computer Lab 2
('rohan.kulkarni@demo.campuspulse.test', 'imran.shaikh@demo.campuspulse.test',
 'Tube lights in Computer Lab 2 keep flickering',
 'The tube lights in Computer Lab 2 flicker constantly while we are working. It is hard to read the screen and the flickering gives headaches. Three of the fittings are affected.',
 'Electrical', 'Computer Lab 2', 'medium', 'closed',
 'Flickering tube lights in Computer Lab 2', 40, 0.6891,
 'computer lab 2', 'tube light'),

('meera.joshi@demo.campuspulse.test', 'imran.shaikh@demo.campuspulse.test',
 'Two tube lights in Computer Lab 2 have stopped working',
 'Two tube lights above the last row of computers in Lab 2 have stopped working completely. That part of the lab is very dark in the afternoon. Students avoid sitting there.',
 'Electrical', 'Computer Lab 2', 'low', 'assigned',
 'Flickering tube lights in Computer Lab 2', 9, 0.7105,
 'computer lab 2', 'tube light'),

-- Cluster 5: waste collection, Central Canteen
('aarav.deshmukh@demo.campuspulse.test', 'sunita.pawar@demo.campuspulse.test',
 'Garbage bins behind the Central Canteen are overflowing',
 'The garbage bins behind the Central Canteen have not been emptied for four days. Waste is spilling out on to the ground. It is right next to where students stand to eat.',
 'Sanitation', 'Central Canteen - rear entrance', 'high', 'in_progress',
 'Garbage not collected near Central Canteen', 2, 0.7738,
 'central canteen|rear entrance', 'garbage bins'),

('sneha.iyer@demo.campuspulse.test', 'sunita.pawar@demo.campuspulse.test',
 'Wet waste is not being cleared from the Central Canteen daily',
 'Wet waste from the canteen kitchen is being left overnight instead of being cleared daily. The smell reaches the seating area by morning. It has become a regular problem this month.',
 'Sanitation', 'Central Canteen', 'medium', 'assigned',
 'Garbage not collected near Central Canteen', 7, 0.7026,
 'central canteen|kitchen', 'wet waste|dustbin'),

('siddharth.menon@demo.campuspulse.test', 'sunita.pawar@demo.campuspulse.test',
 'Strong smell from the uncollected waste near the Central Canteen',
 'There is a strong smell from the waste piled up near the back of the Central Canteen. It is worst between 2 pm and 4 pm. Students have started avoiding the back entrance.',
 'Sanitation', 'Central Canteen - rear entrance', 'high', 'resolved',
 'Garbage not collected near Central Canteen', 18, 0.8117,
 'central canteen|rear entrance', 'waste|dustbin'),

-- Cluster 6: library furniture
('priya.nair@demo.campuspulse.test', 'ramesh.yadav@demo.campuspulse.test',
 'Reading room benches in the Central Library are broken',
 'Two benches in the Central Library reading room have broken supports and wobble when anyone sits. One of them has a nail sticking out. Students are avoiding that corner of the room.',
 'Infrastructure', 'Central Library - reading room', 'medium', 'resolved',
 'Damaged benches in Central Library reading room', 29, 0.6342,
 'central library|reading room', 'bench'),

('ananya.reddy@demo.campuspulse.test', 'ramesh.yadav@demo.campuspulse.test',
 'Splintered wooden bench in the Central Library reading room',
 'The wooden bench near the window in the reading room has splinters on the seat surface. My friend got a splinter on her hand last week. It was reported earlier but has come back after a temporary fix.',
 'Infrastructure', 'Central Library - reading room', 'low', 'reopened',
 'Damaged benches in Central Library reading room', 45, 0.6018,
 'central library|reading room', 'wooden bench|furniture'),

-- Cluster 7: drinking water, Sports Complex
('aditya.verma@demo.campuspulse.test', 'ramesh.yadav@demo.campuspulse.test',
 'Water cooler at the Sports Complex is not cooling water',
 'The water cooler on the ground floor of the Sports Complex dispenses water at room temperature. It has not cooled water for about two weeks. Most students fill bottles from the cooler near the canteen instead.',
 'Infrastructure', 'Sports Complex - ground floor', 'medium', 'in_progress',
 'Water coolers not working in Sports Complex', 11, 0.6624,
 'sports complex|ground floor', 'water cooler'),

('ishita.banerjee@demo.campuspulse.test', 'ramesh.yadav@demo.campuspulse.test',
 'Both water coolers at the Sports Complex are out of order',
 'Both water coolers at the Sports Complex are out of order. After practice there is no cold drinking water anywhere nearby. We have to walk to the academic block.',
 'Infrastructure', 'Sports Complex', 'high', 'resolved',
 'Water coolers not working in Sports Complex', 33, 0.7493,
 'sports complex', 'water cooler|drinking water'),

-- Cluster 8: ceiling fans, Lecture Hall 4
('karan.bhatia@demo.campuspulse.test', 'imran.shaikh@demo.campuspulse.test',
 'Ceiling fans in Lecture Hall 4 are not working',
 'Three of the four ceiling fans in Lecture Hall 4 do not run at all. The hall gets very stuffy during afternoon lectures. The one working fan makes a loud rattling sound.',
 'Electrical', 'Lecture Hall 4', 'high', 'closed',
 'Ceiling fans not working in Lecture Hall 4', 30, 0.7281,
 'lecture hall 4', 'ceiling fan'),

('rohan.kulkarni@demo.campuspulse.test', 'imran.shaikh@demo.campuspulse.test',
 'Fan regulator in Lecture Hall 4 is sparking',
 'The regulator of the second fan in Lecture Hall 4 sparked when a student turned it on. We switched off the mains immediately. No one was hurt but it needs to be checked before the hall is used again.',
 'Electrical', 'Lecture Hall 4', 'urgent', 'resolved',
 'Ceiling fans not working in Lecture Hall 4', 15, 0.8836,
 'lecture hall 4', 'fan regulator|ceiling fan'),

-- Standalone complaints
('meera.joshi@demo.campuspulse.test', 'deepak.rathod@demo.campuspulse.test',
 'Projector in Lecture Hall 3 does not display anything',
 'The projector in Lecture Hall 3 switches on but does not display anything from the laptop. Faculty had to cancel a slide-based lecture. The same issue happened twice last week.',
 'General', 'Lecture Hall 3', 'medium', 'closed', NULL, 24, 0.5907,
 'lecture hall 3', 'projector'),

('aarav.deshmukh@demo.campuspulse.test', 'ramesh.yadav@demo.campuspulse.test',
 'Drinking water purifier in the Administrative Block is leaking',
 'The drinking water purifier in the Administrative Block pantry is leaking from the bottom. Water has spread under the cabinet. It has been dripping since Thursday.',
 'Infrastructure', 'Administrative Block - pantry', 'medium', 'resolved', NULL, 20, 0.6583,
 'administrative block|pantry', 'water purifier'),

('sneha.iyer@demo.campuspulse.test', 'deepak.rathod@demo.campuspulse.test',
 'Printer in the Computer Lab 1 is out of toner',
 'The printer in Computer Lab 1 has been showing a low toner warning for over a week and now prints very faint pages. Assignment printouts are not readable. We need the cartridge replaced.',
 'General', 'Computer Lab 1', 'low', 'resolved', NULL, 27, 0.5241,
 'computer lab 1', 'printer|toner cartridge'),

('priya.nair@demo.campuspulse.test', 'ramesh.yadav@demo.campuspulse.test',
 'Lift in the Academic Block A stops between floors',
 'The lift in Academic Block A stopped between the first and second floor this morning with four people inside. We used the emergency phone and it started again after a few minutes. It should be checked before someone gets stuck again.',
 'Infrastructure', 'Academic Block A - lift', 'urgent', 'in_progress', NULL, 1, 0.8942,
 'academic block a|lift', 'lift|emergency phone'),

('karan.bhatia@demo.campuspulse.test', 'imran.shaikh@demo.campuspulse.test',
 'Exposed electrical wiring near the Academic Block B staircase',
 'Some electrical wiring is hanging loose from the wall near the staircase of Academic Block B. The insulation looks worn at one point. Students use this staircase all day.',
 'Electrical', 'Academic Block B - staircase', 'urgent', 'assigned', NULL, 2, 0.8714,
 'academic block b|staircase', 'electrical wiring'),

('siddharth.menon@demo.campuspulse.test', NULL,
 'Street light outside Boys Hostel A is not working',
 'The street light outside the main gate of Boys Hostel A has not been working for two nights. The path to the hostel is completely dark. It is unsafe for students returning after evening labs.',
 'Electrical', 'Boys Hostel A - main gate', 'medium', 'open', NULL, 1, 0.6056,
 'boys hostel a|main gate', 'street light'),

('aditya.verma@demo.campuspulse.test', 'deepak.rathod@demo.campuspulse.test',
 'Library computers restart on their own',
 'Four computers in the library computer section restart on their own every 15 to 20 minutes. Any work that is not saved is lost. The same machines were repaired last month.',
 'IT & Network', 'Central Library - computer section', 'medium', 'reopened', NULL, 16, 0.6679,
 'central library|computer section', 'desktop computers'),

('ishita.banerjee@demo.campuspulse.test', NULL,
 'Leaking ceiling in the Central Library reference section during rain',
 'Water drips from the ceiling in the Central Library reference section whenever it rains. Books kept on the nearest shelf got damp last week. A bucket is being kept there now.',
 'Infrastructure', 'Central Library - reference section', 'high', 'open', NULL, 2, 0.7368,
 'central library|reference section', 'ceiling|roof leakage'),

('rohan.kulkarni@demo.campuspulse.test', 'sunita.pawar@demo.campuspulse.test',
 'Cockroaches in the Central Mess kitchen',
 'There are cockroaches in the Central Mess kitchen, especially near the sink area. A few students have seen them in the serving area too. This needs proper pest control, not just cleaning.',
 'Sanitation', 'Central Mess - kitchen', 'high', 'in_progress', NULL, 3, 0.7912,
 'central mess|kitchen|sink area', 'pest control'),

('ananya.reddy@demo.campuspulse.test', 'ramesh.yadav@demo.campuspulse.test',
 'Washbasin in the Girls Hostel B washroom is blocked',
 'The washbasin in the Girls Hostel B washroom drains very slowly and now stands full of dirty water. Two more basins on the same row are getting blocked. It is difficult to use in the morning rush.',
 'Infrastructure', 'Girls Hostel B - washroom', 'medium', 'resolved', NULL, 22, 0.6825,
 'girls hostel b|washroom', 'washbasin|drain'),

('meera.joshi@demo.campuspulse.test', 'deepak.rathod@demo.campuspulse.test',
 'College Wi-Fi login page does not open on Android phones',
 'The campus Wi-Fi login page does not open on Android phones since the last update. It works fine on laptops. Most students use Android and cannot connect at all.',
 'IT & Network', 'Campus-wide', 'medium', 'closed', NULL, 38, 0.7143,
 'campus wide', 'wi-fi|captive portal'),

('aarav.deshmukh@demo.campuspulse.test', NULL,
 'Broken chairs in the Computer Lab 2',
 'Three chairs in Computer Lab 2 have broken backrests. The chairs are still being used because there are no spares. One of them wobbles badly.',
 'Infrastructure', 'Computer Lab 2', 'low', 'open', NULL, 1, 0.5488,
 'computer lab 2', 'chairs'),

('sneha.iyer@demo.campuspulse.test', NULL,
 'Water from the cooler in the Academic Block B tastes bitter',
 'Water from the cooler in Academic Block B has a bitter taste and a strange smell. A few students felt uneasy after drinking it yesterday. Please get the filter checked.',
 'Sanitation', 'Academic Block B - water cooler', 'medium', 'open', NULL, 1, 0.6395,
 'academic block b|water cooler', 'water cooler|filter'),

('siddharth.menon@demo.campuspulse.test', 'imran.shaikh@demo.campuspulse.test',
 'Air conditioner in the Administrative Block conference room is not cooling',
 'The air conditioner in the Administrative Block conference room does not cool at all and only blows warm air. Meetings held there in the afternoon are very uncomfortable. The outdoor unit makes a loud noise.',
 'Electrical', 'Administrative Block - conference room', 'high', 'in_progress', NULL, 2, 0.7624,
 'administrative block|conference room', 'air conditioner'),

('aditya.verma@demo.campuspulse.test', 'sunita.pawar@demo.campuspulse.test',
 'Open drain near the Sports Complex is choked',
 'The open drain along the north side of the Sports Complex is choked with leaves and plastic. Water is standing and has started to smell. Mosquitoes are breeding in it.',
 'Sanitation', 'Sports Complex - north side', 'high', 'assigned', NULL, 5, 0.7791,
 'sports complex|north side', 'open drain'),

('priya.nair@demo.campuspulse.test', 'ramesh.yadav@demo.campuspulse.test',
 'Broken window pane in Girls Hostel B room 214',
 'The window pane in room 214 of Girls Hostel B is cracked and a piece has fallen out. Rain water and insects come in. The room is occupied and it gets cold at night.',
 'Infrastructure', 'Girls Hostel B - room 214', 'medium', 'reopened', NULL, 12, 0.6547,
 'girls hostel b|room 214', 'window pane'),

('ishita.banerjee@demo.campuspulse.test', 'imran.shaikh@demo.campuspulse.test',
 'Switchboard in the Electronics Lab gives a shock',
 'A student got a mild shock from the switchboard in the Electronics Lab while plugging in a power supply. The board is loose on the wall. We have put tape over it for now.',
 'Electrical', 'Electronics Lab', 'urgent', 'resolved', NULL, 13, 0.9073,
 'electronics lab', 'switchboard|power supply'),

('karan.bhatia@demo.campuspulse.test', 'deepak.rathod@demo.campuspulse.test',
 'No network cable point working in the Electronics Lab',
 'The network cable points at three benches in the Electronics Lab are not working. Equipment that needs a wired connection cannot be used. Students are sharing the one point that works.',
 'IT & Network', 'Electronics Lab', 'medium', 'resolved', NULL, 19, 0.6958,
 'electronics lab|benches', 'network cable point|ethernet'),

('ananya.reddy@demo.campuspulse.test', 'ramesh.yadav@demo.campuspulse.test',
 'Water logging outside the Administrative Block after rain',
 'Water collects in front of the Administrative Block entrance after every heavy rain and stays for hours. Visitors have to walk through it. The drain outside seems to be blocked.',
 'Infrastructure', 'Administrative Block - entrance', 'low', 'closed', NULL, 42, 0.5731,
 'administrative block|entrance', 'water logging|drain');

-- ---------------------------------------------------------------------------
-- 1. Remove the previous run
--
-- Demo rows are recognised by the reserved demo email domain. Complaints go
-- first so that everything hanging off them (history, assignments, feedback,
-- predictions) is removed by its own cascade. Real accounts are untouched.
-- ---------------------------------------------------------------------------
DELETE FROM notifications
WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@demo.campuspulse.test')
   OR related_complaint_id IN (
        SELECT c.id FROM complaints c
        JOIN users u ON u.id = c.user_id
        WHERE u.email LIKE '%@demo.campuspulse.test');

DELETE FROM complaints
WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@demo.campuspulse.test');

DELETE FROM issue_clusters
WHERE title IN (
  'Water supply disruption in Boys Hostel B',
  'Repeated washroom leaks in Girls Hostel A',
  'Wi-Fi dead spots in Academic Block C',
  'Flickering tube lights in Computer Lab 2',
  'Garbage not collected near Central Canteen',
  'Damaged benches in Central Library reading room',
  'Water coolers not working in Sports Complex',
  'Ceiling fans not working in Lecture Hall 4'
);

DELETE FROM users WHERE email LIKE '%@demo.campuspulse.test';

-- ---------------------------------------------------------------------------
-- 2. People: 10 students and 4 staff
--    (the admin already exists and is reused as the assigner)
--    Password for all of them: Demo@1234
-- ---------------------------------------------------------------------------
INSERT INTO users (name, email, password_hash, role, department, phone, created_at, updated_at)
VALUES
('Aarav Deshmukh',    'aarav.deshmukh@demo.campuspulse.test',    '$2b$10$AnpYu3/hCJ1cKdGF03FjlOn2Hgp7rvKeVAjAEYUEWYLn300hrG7wm', 'student', 'Computer Engineering',        '+91 98210 44715', now() - interval '96 days', now() - interval '96 days'),
('Priya Nair',        'priya.nair@demo.campuspulse.test',        '$2b$10$AnpYu3/hCJ1cKdGF03FjlOn2Hgp7rvKeVAjAEYUEWYLn300hrG7wm', 'student', 'Electronics & Telecom',       '+91 99405 22138', now() - interval '94 days', now() - interval '94 days'),
('Rohan Kulkarni',    'rohan.kulkarni@demo.campuspulse.test',    '$2b$10$AnpYu3/hCJ1cKdGF03FjlOn2Hgp7rvKeVAjAEYUEWYLn300hrG7wm', 'student', 'Mechanical Engineering',      '+91 98706 33192', now() - interval '93 days', now() - interval '93 days'),
('Sneha Iyer',        'sneha.iyer@demo.campuspulse.test',        '$2b$10$AnpYu3/hCJ1cKdGF03FjlOn2Hgp7rvKeVAjAEYUEWYLn300hrG7wm', 'student', 'Information Technology',      '+91 90045 71620', now() - interval '91 days', now() - interval '91 days'),
('Aditya Verma',      'aditya.verma@demo.campuspulse.test',      '$2b$10$AnpYu3/hCJ1cKdGF03FjlOn2Hgp7rvKeVAjAEYUEWYLn300hrG7wm', 'student', 'Civil Engineering',           '+91 97654 88213', now() - interval '90 days', now() - interval '90 days'),
('Meera Joshi',       'meera.joshi@demo.campuspulse.test',       '$2b$10$AnpYu3/hCJ1cKdGF03FjlOn2Hgp7rvKeVAjAEYUEWYLn300hrG7wm', 'student', 'Computer Engineering',        '+91 88450 19937', now() - interval '88 days', now() - interval '88 days'),
('Karan Bhatia',      'karan.bhatia@demo.campuspulse.test',      '$2b$10$AnpYu3/hCJ1cKdGF03FjlOn2Hgp7rvKeVAjAEYUEWYLn300hrG7wm', 'student', 'Electrical Engineering',      '+91 99873 50264', now() - interval '86 days', now() - interval '86 days'),
('Ananya Reddy',      'ananya.reddy@demo.campuspulse.test',      '$2b$10$AnpYu3/hCJ1cKdGF03FjlOn2Hgp7rvKeVAjAEYUEWYLn300hrG7wm', 'student', 'Chemical Engineering',        '+91 96334 27708', now() - interval '83 days', now() - interval '83 days'),
('Siddharth Menon',   'siddharth.menon@demo.campuspulse.test',   '$2b$10$AnpYu3/hCJ1cKdGF03FjlOn2Hgp7rvKeVAjAEYUEWYLn300hrG7wm', 'student', 'Mechanical Engineering',      '+91 90762 65341', now() - interval '80 days', now() - interval '80 days'),
('Ishita Banerjee',   'ishita.banerjee@demo.campuspulse.test',   '$2b$10$AnpYu3/hCJ1cKdGF03FjlOn2Hgp7rvKeVAjAEYUEWYLn300hrG7wm', 'student', 'Information Technology',      '+91 99018 47625', now() - interval '78 days', now() - interval '78 days'),

('Ramesh Yadav',      'ramesh.yadav@demo.campuspulse.test',      '$2b$10$AnpYu3/hCJ1cKdGF03FjlOn2Hgp7rvKeVAjAEYUEWYLn300hrG7wm', 'staff',   'Facilities & Maintenance',    '+91 98220 61884', now() - interval '150 days', now() - interval '150 days'),
('Imran Shaikh',      'imran.shaikh@demo.campuspulse.test',      '$2b$10$AnpYu3/hCJ1cKdGF03FjlOn2Hgp7rvKeVAjAEYUEWYLn300hrG7wm', 'staff',   'Electrical Maintenance',      '+91 97639 10472', now() - interval '148 days', now() - interval '148 days'),
('Sunita Pawar',      'sunita.pawar@demo.campuspulse.test',      '$2b$10$AnpYu3/hCJ1cKdGF03FjlOn2Hgp7rvKeVAjAEYUEWYLn300hrG7wm', 'staff',   'Housekeeping & Sanitation',   '+91 90287 35516', now() - interval '146 days', now() - interval '146 days'),
('Deepak Rathod',     'deepak.rathod@demo.campuspulse.test',     '$2b$10$AnpYu3/hCJ1cKdGF03FjlOn2Hgp7rvKeVAjAEYUEWYLn300hrG7wm', 'staff',   'IT & Network Support',        '+91 98601 72943', now() - interval '144 days', now() - interval '144 days');

-- ---------------------------------------------------------------------------
-- 3. Issue clusters: each one groups the complaints about the same problem
--
-- A cluster stays 'open' while the problem keeps coming back, which is also the
-- only status the clusters page lists. Only the one whose complaints are all
-- finished is 'resolved'.
-- ---------------------------------------------------------------------------
INSERT INTO issue_clusters (title, description, category, location, status, created_at, updated_at, resolved_at)
VALUES
('Water supply disruption in Boys Hostel B',
 'Several complaints about dry taps and low pressure in Boys Hostel B over the last three weeks. Traced to the overhead tank supply line.',
 'Infrastructure', 'Boys Hostel B', 'open',
 now() - interval '21 days', now() - interval '3 days', NULL),

('Repeated washroom leaks in Girls Hostel A',
 'Running taps and leaking pipe joints in the Girls Hostel A washrooms, reported three times this month.',
 'Infrastructure', 'Girls Hostel A', 'open',
 now() - interval '34 days', now() - interval '5 days', NULL),

('Wi-Fi dead spots in Academic Block C',
 'Weak or missing Wi-Fi on the third floor, in the seminar hall and in the staff cabins of Academic Block C.',
 'IT & Network', 'Academic Block C', 'open',
 now() - interval '26 days', now() - interval '3 days', NULL),

('Flickering tube lights in Computer Lab 2',
 'Lighting faults above the computer rows in Lab 2, affecting two separate rows of fittings.',
 'Electrical', 'Computer Lab 2', 'open',
 now() - interval '40 days', now() - interval '9 days', NULL),

('Garbage not collected near Central Canteen',
 'Overflowing bins and uncollected wet waste at the rear of the Central Canteen, reported repeatedly.',
 'Sanitation', 'Central Canteen', 'open',
 now() - interval '18 days', now() - interval '2 days', NULL),

('Damaged benches in Central Library reading room',
 'Broken and splintered benches in the reading room. One complaint was closed and the problem came back.',
 'Infrastructure', 'Central Library', 'open',
 now() - interval '45 days', now() - interval '29 days', NULL),

('Water coolers not working in Sports Complex',
 'Both drinking water coolers at the Sports Complex were out of service for several weeks.',
 'Infrastructure', 'Sports Complex', 'open',
 now() - interval '33 days', now() - interval '11 days', NULL),

('Ceiling fans not working in Lecture Hall 4',
 'Fans and a fan regulator in Lecture Hall 4, including an electrical safety complaint. Both complaints are now finished.',
 'Electrical', 'Lecture Hall 4', 'resolved',
 now() - interval '30 days', now() - interval '15 days', now() - interval '15 days');

-- ---------------------------------------------------------------------------
-- 4. Complaints
--    created_at is "now minus age_days", so the demo always looks current.
-- ---------------------------------------------------------------------------
INSERT INTO complaints
  (user_id, title, description, category, location, priority, status, issue_cluster_id, created_at, updated_at)
SELECT u.id, p.title, p.description, p.category, p.location, p.priority, p.status,
       (SELECT ic.id FROM issue_clusters ic WHERE ic.title = p.cluster_title),
       now() - (p.age_days || ' days')::interval,
       now() - (p.age_days || ' days')::interval
FROM demo_plan p
JOIN users u ON u.email = p.student_email;

-- ---------------------------------------------------------------------------
-- 5. Assignments
--
-- Every complaint that has moved past "open" was assigned by the admin to the
-- staff member who owns that kind of work. The two timestamps are placed on the
-- same relative scale as the status history below, so the workflow reads in the
-- right order: created -> assigned -> in progress -> resolved -> closed.
-- ---------------------------------------------------------------------------
INSERT INTO assignments (complaint_id, staff_id, assigned_by, assigned_at, completed_at)
SELECT c.id, s.id, adm.id,
       c.created_at + (now() - c.created_at) * (2::float8 / (flow.max_step + 1)),
       CASE WHEN c.status IN ('resolved', 'closed')
            THEN c.created_at + (now() - c.created_at) * (4::float8 / (flow.max_step + 1))
       END
FROM complaints c
JOIN demo_plan p ON p.title = c.title
JOIN users s ON s.email = p.staff_email AND s.role = 'staff'
JOIN (VALUES ('assigned', 2), ('in_progress', 3), ('resolved', 4), ('closed', 5), ('reopened', 5))
     AS flow(status, max_step) ON flow.status = c.status
CROSS JOIN (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1) adm;

-- ---------------------------------------------------------------------------
-- 6. Status history
--
-- The steps each status must have passed through. Step times are spread
-- evenly between the moment the complaint was created and now, so the audit
-- trail is always in the past and always in order.
-- ---------------------------------------------------------------------------
INSERT INTO complaint_status_history (complaint_id, status, changed_by, note, created_at)
SELECT c.id, fl.history_status,
       CASE fl.actor
         WHEN 'reporter' THEN c.user_id
         WHEN 'admin'    THEN adm.id
         ELSE (SELECT a.staff_id FROM assignments a
               WHERE a.complaint_id = c.id ORDER BY a.id DESC LIMIT 1)
       END,
       fl.note,
       c.created_at + (now() - c.created_at) * (fl.step_no::float8 / (fl.max_step + 1))
FROM complaints c
JOIN demo_plan p ON p.title = c.title
JOIN (VALUES
  ('open',        1, 1, 'open',        'reporter', 'Complaint registered by the student'),
  ('assigned',    1, 2, 'open',        'reporter', 'Complaint registered by the student'),
  ('assigned',    2, 2, 'assigned',    'admin',    'Assigned to the department handling it'),
  ('in_progress', 1, 3, 'open',        'reporter', 'Complaint registered by the student'),
  ('in_progress', 2, 3, 'assigned',    'admin',    'Assigned to the department handling it'),
  ('in_progress', 3, 3, 'in_progress', 'staff',    'Work started on site'),
  ('resolved',    1, 4, 'open',        'reporter', 'Complaint registered by the student'),
  ('resolved',    2, 4, 'assigned',    'admin',    'Assigned to the department handling it'),
  ('resolved',    3, 4, 'in_progress', 'staff',    'Work started on site'),
  ('resolved',    4, 4, 'resolved',    'staff',    'Problem fixed and checked on site'),
  ('closed',      1, 5, 'open',        'reporter', 'Complaint registered by the student'),
  ('closed',      2, 5, 'assigned',    'admin',    'Assigned to the department handling it'),
  ('closed',      3, 5, 'in_progress', 'staff',    'Work started on site'),
  ('closed',      4, 5, 'resolved',    'staff',    'Problem fixed and checked on site'),
  ('closed',      5, 5, 'closed',      'admin',    'Closed after the student confirmed the fix'),
  ('reopened',    1, 5, 'open',        'reporter', 'Complaint registered by the student'),
  ('reopened',    2, 5, 'assigned',    'admin',    'Assigned to the department handling it'),
  ('reopened',    3, 5, 'in_progress', 'staff',    'Work started on site'),
  ('reopened',    4, 5, 'resolved',    'staff',    'Problem fixed and checked on site'),
  ('reopened',    5, 5, 'reopened',    'reporter', 'Student reported that the problem came back')
) AS fl(status, step_no, max_step, history_status, actor, note) ON fl.status = c.status
CROSS JOIN (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1) adm;

-- Keep the complaint row in step with its own history
UPDATE complaints c
SET updated_at = last_change.at
FROM (
  SELECT complaint_id, max(created_at) AS at
  FROM complaint_status_history
  GROUP BY complaint_id
) last_change
WHERE last_change.complaint_id = c.id
  AND c.title IN (SELECT title FROM demo_plan);

UPDATE complaints c
SET resolved_at = res.at
FROM (
  SELECT complaint_id, min(created_at) AS at
  FROM complaint_status_history
  WHERE status = 'resolved'
  GROUP BY complaint_id
) res
WHERE res.complaint_id = c.id
  AND c.status IN ('resolved', 'closed');

-- ---------------------------------------------------------------------------
-- 7. AI predictions
--
-- Stored in the same "key=value; key=value" format the app writes, so the AI
-- panel on the complaint page reads them back like any live prediction. These
-- are per-complaint model outputs only: there are no accuracy or performance
-- figures anywhere, because the pipeline does not store any.
-- ---------------------------------------------------------------------------

-- Category and priority, from the TF-IDF classifier plus the severity keywords
INSERT INTO ai_predictions (complaint_id, model_type, prediction, confidence, created_at)
SELECT c.id,
       'tfidf_logistic_regression+severity_keywords',
       'category=' || p.category || '; priority=' || p.priority || '; confidence=' || p.confidence,
       p.confidence,
       c.created_at + interval '2 minutes'
FROM complaints c
JOIN demo_plan p ON p.title = c.title;

-- Extracted places and facilities
INSERT INTO ai_predictions (complaint_id, model_type, prediction, confidence, created_at)
SELECT c.id,
       'nlp_entity_extraction',
       'locations=' || p.ent_locations || '; facilities=' || p.ent_facilities,
       NULL,
       c.created_at + interval '2 minutes'
FROM complaints c
JOIN demo_plan p ON p.title = c.title;

-- Duplicate warnings. Only complaints that are still being worked on are
-- flagged, and only against an earlier complaint that is still active, which
-- is what the duplicate check compares against.
INSERT INTO ai_predictions (complaint_id, model_type, prediction, confidence, created_at)
SELECT newer.id,
       'tfidf_cosine_similarity',
       'duplicate_of=' || older.id || '; similarity=' || d.similarity,
       d.similarity,
       newer.created_at + interval '2 minutes'
FROM (VALUES
  ('Water tanker has not arrived and the 2nd floor taps are dry',
   'No water supply in Boys Hostel B bathrooms since yesterday night', 0.8126),
  ('No Wi-Fi signal in the Academic Block C seminar hall',
   'Wi-Fi keeps dropping in Academic Block C third floor', 0.7734),
  ('Wet waste is not being cleared from the Central Canteen daily',
   'Garbage bins behind the Central Canteen are overflowing', 0.7418)
) AS d(newer_title, older_title, similarity)
JOIN complaints newer ON newer.title = d.newer_title
JOIN complaints older ON older.title = d.older_title;

-- ---------------------------------------------------------------------------
-- 8. Feedback: a rating from the student who reported the complaint
-- ---------------------------------------------------------------------------
INSERT INTO feedback (complaint_id, user_id, rating, comment, created_at)
SELECT c.id, c.user_id, f.rating, f.comment, c.resolved_at + interval '6 hours'
FROM (VALUES
  ('Low water pressure on the third floor of Boys Hostel B', 4,
   'Pressure is much better now. It took a couple of days but it is usable again.'),
  ('Tap in Girls Hostel A common washroom keeps running', 5,
   'The plumber came the same day and replaced the washer. No noise at night since then.'),
  ('Wi-Fi speed is unusable in Academic Block C staff cabins', 3,
   'Speed is fine near the window but it still drops near the door. Better than before though.'),
  ('Tube lights in Computer Lab 2 keep flickering', 5,
   'All the affected fittings were replaced over the weekend. No flickering since.'),
  ('Strong smell from the uncollected waste near the Central Canteen', 4,
   'Bins are being cleared daily now. Please keep it up during the exam weeks too.'),
  ('Both water coolers at the Sports Complex are out of order', 2,
   'Only one cooler was repaired. The second one still does not work after practice.'),
  ('Ceiling fans in Lecture Hall 4 are not working', 4,
   'Fans are running again. The third fan still makes a rattling noise when set to full speed.'),
  ('Fan regulator in Lecture Hall 4 is sparking', 5,
   'Reported in the morning and it was replaced by evening. This one was dangerous, so thank you.'),
  ('Projector in Lecture Hall 3 does not display anything', 3,
   'The projector works now but the HDMI cable is still loose and cuts out if the table is touched.'),
  ('Drinking water purifier in the Administrative Block is leaking', 5,
   'Leak stopped and the filter was changed as well. No water under the cabinet now.'),
  ('Printer in the Computer Lab 1 is out of toner', 4,
   'New cartridge installed. Printouts are readable again.'),
  ('Washbasin in the Girls Hostel B washroom is blocked', 5,
   'Cleared within a day. The other basins on the row are also draining properly now.'),
  ('Switchboard in the Electronics Lab gives a shock', 5,
   'They treated this as urgent and replaced the whole board the same day. Good response.')
) AS f(title, rating, comment)
JOIN complaints c ON c.title = f.title;

-- ---------------------------------------------------------------------------
-- 9. Notifications
--
-- Derived from the status history so the feed matches what actually happened,
-- using the same wording and event types the API writes.
-- ---------------------------------------------------------------------------
INSERT INTO notifications (user_id, type, title, message, related_complaint_id, is_read, created_at)
SELECT c.user_id,
       CASE h.status
         WHEN 'open'        THEN 'complaint_submitted'
         WHEN 'assigned'    THEN 'complaint_assigned'
         WHEN 'in_progress' THEN 'complaint_status_changed'
         WHEN 'resolved'    THEN 'complaint_resolved'
         WHEN 'closed'      THEN 'complaint_closed'
         WHEN 'reopened'    THEN 'complaint_reopened'
       END,
       CASE h.status
         WHEN 'open'        THEN 'Complaint Submitted'
         WHEN 'assigned'    THEN 'Complaint Assigned'
         WHEN 'in_progress' THEN 'Status Updated'
         WHEN 'resolved'    THEN 'Complaint Resolved'
         WHEN 'closed'      THEN 'Complaint Closed'
         WHEN 'reopened'    THEN 'Complaint Reopened'
       END,
       CASE h.status
         WHEN 'open'        THEN 'Your complaint "' || c.title || '" has been submitted successfully.'
         WHEN 'assigned'    THEN 'Your complaint "' || c.title || '" has been assigned to a staff member.'
         WHEN 'in_progress' THEN 'Your complaint "' || c.title || '" is now "in_progress".'
         WHEN 'resolved'    THEN 'Your complaint "' || c.title || '" has been marked as resolved. You can now submit feedback.'
         WHEN 'closed'      THEN 'Your complaint "' || c.title || '" has been closed.'
         WHEN 'reopened'    THEN 'Your complaint "' || c.title || '" has been reopened.'
       END,
       c.id,
       h.created_at < now() - interval '5 days',
       h.created_at
FROM complaint_status_history h
JOIN complaints c ON c.id = h.complaint_id
WHERE c.title IN (SELECT title FROM demo_plan)
  AND h.status IN ('open', 'assigned', 'in_progress', 'resolved', 'closed', 'reopened');

-- The staff member also gets told when work lands on their queue
INSERT INTO notifications (user_id, type, title, message, related_complaint_id, is_read, created_at)
SELECT a.staff_id,
       'complaint_assigned_to_you',
       'New Complaint Assigned',
       'You have been assigned complaint "' || c.title || '".',
       c.id,
       a.assigned_at < now() - interval '5 days',
       a.assigned_at
FROM assignments a
JOIN complaints c ON c.id = a.complaint_id
WHERE c.title IN (SELECT title FROM demo_plan);

COMMIT;
