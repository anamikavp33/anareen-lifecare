# Putting Anareen Lifecare online (GitHub + Render)

This guide puts the app on the internet so patients can open it on their phones. It takes about 20 minutes. You need a GitHub account and a Render account.

**Why Render and not GitHub Pages?** GitHub Pages can only show fixed pages. This app needs a running Node.js server (for the database, logins and live updates), so GitHub stores the code and Render runs it.

## 1. Put the code on GitHub

Do this once.

1. Sign in at <https://github.com>.
2. Open <https://github.com/new>. Name the repository `anareen-lifecare` and click **Create repository**. Don't tick "Add a README" (the project has one).
3. In the project folder, run:
   ```bash
   git init -b main
   git add -A
   git commit -m "Anareen Lifecare"
   git remote add origin https://github.com/<your-username>/anareen-lifecare.git
   git push -u origin main
   ```
   The first push opens a browser window to sign in to GitHub. Approve it.

**Check nothing secret is uploaded.** `git status --ignored` should list `.env`, `data/` and `node_modules/` as ignored. `.gitignore` also blocks `backups/`, `logs/`, `*.pem`, `*.key` and Firebase/Google key files. Never commit `.env`.

Later, after changing the code: `git add -A`, `git commit -m "what changed"`, `git push`. Render redeploys automatically.

## 2. Settings the app needs on Render

`render.yaml` in this repository already sets them all, so you don't have to type them. You can change any of them later in Render under **Environment**.

| Variable | Value | Notes |
|---|---|---|
| `JWT_SECRET` | long random text | **Secret.** Render generates it for you (`generateValue: true`). Never put it in git. |
| `NODE_ENV` | `production` | Logins only over HTTPS; the server refuses to start without `JWT_SECRET` |
| `TZ_NAME` | `Asia/Kolkata` | Hospital time zone: daily reset, booking hours |
| `BOOKING_OPEN` / `BOOKING_CLOSE` | `06:00` / `19:00` | Hours when patients can book online |
| `RETENTION_DAYS` | `30` | Patient names and numbers are deleted after this many days |
| `HOSPITAL_NAME` | `Anareen Lifecare Hospital` | Shown in the app |
| `DB_PATH` | `/var/data/anareen.db` | The database, on the persistent disk |
| `BACKUP_DIR` | `/var/data/backups` | Daily backups, on the disk |
| `LOG_FILE` | `/var/data/logs/error.log` | Error log, on the disk |
| `BACKUP_KEEP` | `14` | Number of daily backups kept |
| `TRUST_PROXY` | `1` | Render puts one HTTPS proxy in front of the app |
| `FORCE_HTTPS` | `true` | Sends `http://` visitors to `https://` |
| `NODE_VERSION` | `22` | Node.js version Render uses |

**Making your own `JWT_SECRET`** (only if you'd rather set it yourself): run this on your computer and paste the output into Render's `JWT_SECRET` field:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Changing `JWT_SECRET` later signs everyone out, which is harmless.

**The persistent disk.** `render.yaml` mounts a 1 GB disk at `/var/data`. It keeps bookings, accounts and backups when the app restarts or you deploy new code. Disks need a paid plan (Starter, about US$7/month, plus about US$0.25/month for 1 GB). On the free plan, everything is wiped at every restart and the demo passwords come back.

## 3. Create the service on Render

1. Go to <https://render.com> and click **Get Started**. Choose **GitHub** to sign up, so Render can see your repositories.
2. Add a payment card under **Account → Billing**. A disk needs a paid plan.
3. Click **New +** (top right) → **Blueprint**.
4. Choose **anareen-lifecare** from the list. If it isn't listed, click **Configure account** and give Render access to that repository.
5. Render reads `render.yaml` and shows one web service, **anareen-lifecare**, with a disk. Click **Apply**.
6. Wait for the build (2–5 minutes). The **Logs** tab should end with:
   ```
   First run: demo data created. Sign in as admin / Admin@123
   Backup saved: /var/data/backups/anareen-YYYY-MM-DD.db
   Anareen Lifecare Hospital running at http://localhost:10000
   ```
   ("localhost" is inside Render's computer. Your public address is shown at the top of the page.)

## 4. Check it's working

Your public address is at the top of the service page, for example `https://anareen-lifecare.onrender.com`.

1. Open `https://<your-address>/api/health`. You should see `"ok":true` and `"database":"ok"`.
2. Open `https://<your-address>` on your phone. The home page shows the departments, and the dot next to them turns green ("Live").
3. Book a token on **Book token**, then find it on **My tokens** with the same mobile number.
4. Open `http://<your-address>` (http, not https). It should switch to `https://` by itself.

If something is wrong, look at the **Logs** tab on Render. Server errors are also written to `/var/data/logs/error.log`; you can read it from the **Shell** tab with `cat /var/data/logs/error.log`.

## 5. Change every demo password straight away

The demo passwords are written in the README, so anyone can try them. Change them before you share the link with anyone:

1. Open `https://<your-address>/login` and sign in as `admin` / `Admin@123`.
2. Click **Change password** (bottom left) and set a new admin password.
3. Go to **👤 Staff accounts** and click **Reset password** for `reception` and **every doctor** (`dr.arun`, `dr.fathima`, `dr.meera`, `dr.joseph`, `dr.lakshmi`, `dr.rajesh`, `dr.sanjay`, `dr.anjali`, `dr.nisha`, `dr.vivek`). Use a different password for each, at least 8 characters.
4. Delete accounts for doctors who won't use the system, and remove demo doctors under **🩺 Doctors**.
5. Sign out, then try `Admin@123` again. It must say "Incorrect username or password".

Give each person their own password privately. Each of them can change it later with **Change password**.

## Backups on Render

The app backs itself up to `/var/data/backups` every day, and Render also snapshots the disk daily. Both are on Render, so now and then download a copy for safekeeping. From the **Shell** tab, `ls /var/data/backups` lists them. To restore one, see "Restoring a backup" in the README.
