# Roles update: what to do

You asked for different logins with different roles, created by the admin. That is built. There are five roles, and the admin creates each login on a new **Users & Roles** page.

| Role | Can do |
|---|---|
| **Admin** | Everything, including logins, Time Config, adding and deleting doctors, equipment and patients |
| **Scheduling staff** | Generate and edit the schedule, recurring plans, register and edit patients, doctor leave and availability, equipment in/out of service, check-in, print, WhatsApp, reports, export. Cannot manage logins or Time Config, or delete doctors, equipment or patients |
| **Doctor / Therapist** | Sees only **their own** sessions (dashboard, timetable, check-in, print), ticks them attended or missed, adds their own leave. Cannot see other doctors' sessions, the patient list or phone numbers |
| **Reception** | Timetable, check-in (attended / missed), print sheets, WhatsApp reminders with phone numbers. Cannot create, move or cancel sessions |
| **Manager (read-only)** | Dashboard, reports and Excel export. Cannot change anything or see phone numbers |

## Do this, in order

**0. Before you start:** this builds on the previous update. You need Email/Password sign-in switched on and your own admin account created (steps 5 and 6 of `CHANGES.md`: a user in Authentication, plus a `users` document with `role` = `admin`). If your live site is still the very first version with no login screen, run the two deploy commands in step 2 one straight after the other, because the old site stops working once the rules change.


**1. Copy the files in.** Unzip `therapy-scheduler-update.zip` over your project and choose replace. No new npm packages are needed. Then:
```bash
npm test -- --watchAll=false    # 105 tests should pass
npm run build                   # "Compiled successfully"
```

**2. Deploy the rules and the index first, then the app.**
```bash
firebase deploy --only firestore:rules,firestore:indexes
npm run build
firebase deploy --only hosting
```
The new rules still work with the current version of the site, so nothing breaks in between. After deploying, open **Firestore, Indexes** in the console. One index (`schedule`: doctorId, startTime) will say *Building*; wait until it says *Enabled* before creating doctor logins.

**3. Check your own account.** Your existing `users/{your uid}` document (`role: admin`) keeps working. You can add `name` and `email` fields to it if you want your name shown in the sidebar. Accounts you made earlier with role `viewer` keep working and are treated as **Manager**.

**4. Run the two tidy-ups once.** Sign in as admin, open **Users & Roles**, and press both buttons under *One-time tidy-ups*:
- *Move patient phone numbers to the restricted list* (phone numbers now live in their own collection so doctors and managers cannot read them).
- *Add patient names to older sessions* (doctors cannot read the patient list, so each session carries the patient's name; this fills it in for sessions made before this update).

**5. Create the logins.** On **Users & Roles**, enter name, email and role, and press **Create login**. The person gets an email with a link to choose their own password; you never see or set it. For a **doctor** login, first make sure the doctor exists under *Doctors & Leave*, then pick that doctor in the form. This link is what limits the doctor to their own sessions.

**6. Check the security rules yourself.** I could not run the rules here (there is no Firestore emulator on my side), so please check them once. The simplest test is the real thing: sign in as each role (use a private window) and confirm what the table above says. For a stricter check, use **Firestore, Rules, Rules Playground** in the console with these tests (use the UID of a user with the stated role, and any real document ID):

| Simulate as | Request | Must be |
|---|---|---|
| Doctor | get `/schedule/<one of their own sessions>` | Allowed |
| Doctor | get `/schedule/<another doctor's session>` | **Denied** |
| Doctor | get `/patients/<any>` or `/patientContacts/<any>` | **Denied** |
| Reception | get `/patientContacts/<any>` | Allowed |
| Reception | update `/schedule/<any>` changing something other than `status` | **Denied** |
| Manager | get `/patients/<any>` | Allowed |
| Manager | get `/patientContacts/<any>` | **Denied** |
| Manager | update `/schedule/<any>` | **Denied** |
| Scheduling staff | update `/config/timeslots` | **Denied** |
| Scheduling staff | get `/users/<someone else>` | **Denied** |
| Admin | get `/users/<someone else>` | Allowed |
| Admin | update `/users/<their own uid>` | **Denied** (stops the last admin locking themselves out) |
| Anyone signed in with no `users` document | get `/patients/<any>` | **Denied** |

If any row behaves differently, tell me which one and I will fix the rules.

## Things to know
- **Deactivate** switches a person's access off at once. The sign-in account itself stays in Firebase; deleting it needs the Firebase console (or a paid server function, which I left out). A deactivated or removed person cannot read anything.
- **An email that already has a login** (for example one you made in the console) cannot be created again. Use *Add an existing login* on the Users page and paste its UID from Authentication, Users.
- **Password emails** come from Firebase's standard template and may land in spam. *Send password email* on a person's row sends it again.
- **You cannot change or deactivate your own account** from the Users page, on purpose, so there is always an admin.
- **Doctor sees names stored on the session.** If a patient is renamed later, old sessions keep the old name for doctors until the next generate or the tidy-up button.
- **Leave added by a doctor** does not move their sessions by itself (doctors may not change the schedule). Scheduling staff and admins see a *Needs attention* box on their dashboard with a button that moves those sessions to free doctors.
- **New pages:** *Check-in* (everyone who marks attendance), *My Leave* (doctors), *Users & Roles* (admin).

## What I tested
105 automated tests (permission rules per role, every screen per role, account states, the Users page, phone-number move, doctor-only data loading) and a real Chromium run of every role on the real Firestore SDK: 50 checks, covering which pages each role sees, typed-in addresses that are blocked, creating and changing logins, check-in, WhatsApp, leave and moving stuck sessions. All passed with no console errors.

**Not tested:** the security rules themselves (step 6), real account creation and the password email (they need your Firebase project), and the extra Firestore index (step 2).
