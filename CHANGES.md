# What changed, and what you need to do

Follow the steps in order. Steps 1 to 4 are on your computer; steps 5 to 7 are in the Firebase console and take about 10 minutes.

## 1. Back up first
```bash
git checkout -b big-update
git add -A && git commit -m "before big update"
```

## 2. Copy the files in
Unzip `therapy-scheduler-update.zip` into your project folder (the one that contains `package.json`) and choose **replace** when asked.

**Delete these old files** (nothing uses them any more):
- `src/components/Home.js`  (replaced by `Dashboard.js`)
- `src/components/Header.js` and `src/components/Header.css`
- `src/Styles/theme.css` (the `Styles` folder can go)

The `Scheduler.js` I gave you last time is replaced by the new one in this zip.

If you have not done it yet, remove the packages nothing uses:
```bash
npm uninstall @mui/material @mui/icons-material @emotion/react @emotion/styled jspdf jspdf-autotable react-dnd react-dnd-html5-backend xlsx
```
No new packages are needed. Sign-in uses `firebase/auth`, which is already inside the `firebase` package.

## 3. Run the tests and a build
```bash
npm test -- --watchAll=false     # should say 60 passed
npm run build                    # should say "Compiled successfully"
```

## 4. Add one line to .gitignore (already done in the zip)
`build/` is now ignored, so the build folder stops being committed.
If it is still tracked: `git rm -r --cached build`

## 5. Firebase console: turn on sign-in and create roles
1. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable.**
2. **Authentication → Users → Add user.** Create your admin account and copy its **User UID**.
3. **Build → Firestore Database → Start collection** named `users`.
   Document ID = the UID you copied. Add a field `role` (type *string*) with the value `admin`.
4. Repeat for every other staff member. Use `viewer` for people who should only look, not edit.

## 6. Deploy in this order (the order matters)
```bash
npm run build
firebase deploy --only hosting          # 1st: the new app, with the login screen
```
Open https://hospital-scheduler-c7365.web.app, sign in as the admin and check that everything loads.
Only then:
```bash
firebase deploy --only firestore:rules  # 2nd: lock the database
```
If you deploy the rules first, the old version of the site stops working, and if you have no `users` document yet you will lock yourself out of editing.
Afterwards, in the console open **Firestore → Rules → Rules Playground** and try a read as a viewer and a write as a viewer (the write must be denied).

## 7. Open *Time Config* and press Save once
Saving that page has never worked: it stored a list of lists, which Firestore refuses ("Nested arrays are not supported"). So the app has always been using the built-in default hours and durations. It now saves correctly. Check the hours, the session length of each therapy and the closed days, press **Save Config**, then generate a schedule.

---

## Behaviour changes you should know about
- **Generate no longer deletes the whole schedule.** It replaces only the *scheduled* sessions on the dates you pick. Attended, missed and cancelled sessions are kept as history, and new sessions are placed around them.
- **Doctor choice** is now the least busy doctor (and the patient's usual doctor if they have one), instead of random. If the first doctor has no free time, other doctors of that therapy are tried.
- **Midday fix:** the old code put some afternoon starts (15:00, 16:00) in the "midday" group by mistake. Fixed. For long sessions where no midday start exists, 3 sessions a day are now spread early morning / late morning / afternoon instead of failing.
- **Mark Unavailable** used to do the opposite of what it meant: it moved sessions away when you marked a doctor *available* again, and moved them without checking the other doctor was free. It now offers to move sessions only when a doctor becomes unavailable or goes on leave, and only to doctors who are actually free.
- **Existing data:** old sessions have no `status` (treated as "scheduled") and no `duration` (treated as 30 minutes, which is how they were generated) until you regenerate them. Existing doctors and patients need no changes.
- **The app loads the last 120 days of sessions**, so it stays fast as history grows. Reports and the timetable can look back that far.
- **Export** now has a date range (default: next 7 days), skips cancelled sessions and sorts rows by time. The Excel layout is unchanged.

## What is new, page by page
| Page | For | What it does |
|---|---|---|
| Sign-in | everyone | Email and password. Accounts with no role see "No access yet". |
| Dashboard | everyone | Today's counts, up next, doctor workload, equipment, patients with no session |
| Timetable | everyone (admin can drag) | Doctors as columns; drag to move; click for status, WhatsApp, reschedule |
| Print & Share | everyone | Doctor or patient sheets, print / save as PDF, WhatsApp message |
| Reports | everyone | Utilization, attendance and missed rate, sessions per therapy per week |
| Export | everyone | Excel for a date range |
| Scheduler | admin | Generate day/week, manual add with clash check, unplaced sessions listed |
| Edit Sessions | admin | Edit, mark attended / missed / cancelled, reschedule, delete |
| Recurring Plans | admin | Weekdays x weeks, preview, save, remove remaining |
| Doctors & Leave | admin | Leave (full day, morning, afternoon), availability, safe reassignment |
| Patients | admin | Now with an optional phone number (for WhatsApp) |
| Equipment | admin | Machines / kits that only one patient can use at a time |
| Time Config | admin | Hours, Tuesday hours, closed days, session length per therapy (save fixed) |

## What I tested, and what I could not
**Tested:** the scheduling logic (36 automated tests, including 300 random hospitals checked for overlaps, leave, equipment and hours), every screen (24 automated tests), and the whole app in a real Chromium browser on the real Firestore SDK running offline: dashboard, drag and drop, mark attended, Time Config save, generate, leave and reassignment, equipment, plans, edit and reschedule, print to PDF, Excel download, phone layout, viewer role, and opening the installed app with no network. All of it passed with no console errors.

**Not tested (needs your real Firebase project), please check:**
- **Sign-in and the security rules.** Use *Firestore, Rules, Rules Playground* after step 6: a viewer must be able to read and must be refused a write.
- **Hosting.** After deploying, open the site, sign in, and try "Add to Home screen" on a phone.
- **WhatsApp links** with a real number. Numbers are assumed to be Indian (+91) unless they already start with a country code.
- **Touch screens** do not support dragging a session. On a phone or tablet, click the session and use *Move to* instead.
