# mano.md — running Juice Stop on a Windows laptop, from nothing

This guide assumes **you have never seen this project before** and that your laptop has nothing
installed. Every step says exactly what to type, what to click, and what you should see. If a step
does not look the way it is described here, stop at that step — do not carry on and hope. The
"When it goes wrong" section at the end covers every failure I have actually hit.

Total time: **about 15 minutes**, most of it waiting for downloads.

- [Part 0 — What you are installing](#part-0--what-you-are-installing)
- [Part 1 — Install Node.js](#part-1--install-nodejs)
- [Part 2 — Install Git](#part-2--install-git)
- [Part 3 — Get the code](#part-3--get-the-code)
- [Part 4 — The one setup command](#part-4--the-one-setup-command)
- [Part 5 — Open the app](#part-5--open-the-app)
- [Part 6 — Log in to the kitchen](#part-6--log-in-to-the-kitchen)
- [Part 7 — Drive a whole order end to end](#part-7--drive-a-whole-order-end-to-end)
- [Part 8 — Stopping and starting again](#part-8--stopping-and-starting-again)
- [When it goes wrong](#when-it-goes-wrong)
- [Appendix — What actually got installed](#appendix--what-actually-got-installed)

---

## Part 0 — What you are installing

Two programs, and nothing else:

| Program | Why |
|---|---|
| **Node.js 24** | Runs the whole project. Everything is JavaScript/TypeScript. |
| **Git** | Downloads the code from GitHub. |

You do **not** need Docker, a database server, an account with anyone, or any API keys. The
database is a single file that gets created on your laptop.

---

## Part 1 — Install Node.js

### 1.1 — Check whether you already have it

1. Press the **Windows key** on your keyboard.
2. Type `powershell`.
3. In the results, click **Windows PowerShell**. A dark blue window opens with a blinking cursor.
4. Type this exactly, then press **Enter**:

   ```powershell
   node --version
   ```

5. Read what comes back:

   - **`v24.something`** (for example `v24.18.0`) or higher → you are done with Part 1. **Skip to
     [Part 2](#part-2--install-git).**
   - **`v22.x`, `v20.x`, or any number below 24** → you must upgrade. Continue to 1.2.
   - **`node : The term 'node' is not recognized...`** → not installed. Continue to 1.2.

> **Node 24 is not optional.** The project refuses to install on anything older — this is enforced
> by the package manager, not a warning you can click past.

### 1.2 — Download it

1. Open your web browser.
2. Go to **<https://nodejs.org>**
3. You will see two big green buttons. Click the one labelled **LTS** — it will say something like
   *"24.x.x LTS — Recommended For Most Users"*.

   > If the LTS button shows a number **lower** than 24, click **"Other Downloads"** instead, then
   > pick the newest version numbered 24 or higher, then **"Windows Installer (.msi)"** for
   > **64-bit**.

4. A file downloads, named something like `node-v24.18.0-x64.msi`. Wait for it to finish.

### 1.3 — Run the installer

1. Click the downloaded file (in your browser's downloads bar, or in your **Downloads** folder).
2. **"Node.js Setup"** opens. Click **Next**.
3. Tick **"I accept the terms in the License Agreement"**. Click **Next**.
4. Leave the install folder as it is. Click **Next**.
5. On the "Custom Setup" screen, change nothing. Click **Next**.
6. On "Tools for Native Modules", **leave the checkbox unticked**. Click **Next**.

   > If you tick it, the installer opens a second window that downloads several gigabytes of build
   > tools. You do not need them, and it takes 20+ minutes.

7. Click **Install**.
8. Windows shows a **"Do you want to allow this app to make changes to your device?"** box. Click
   **Yes**.
9. Wait for the progress bar. Click **Finish**.

### 1.4 — Prove it worked

**This bit matters and people skip it.** Your PowerShell window from step 1.1 does not know Node
exists yet — programs only learn about newly installed software when they start up.

1. Go back to your PowerShell window.
2. Type `exit` and press **Enter**. The window closes.
3. Press the **Windows key**, type `powershell`, click **Windows PowerShell**. A *new* window opens.
4. Type this and press **Enter**:

   ```powershell
   node --version
   ```

5. You should now see **`v24.18.0`** or similar. If you still see the "not recognized" error, see
   [When it goes wrong](#node---version-still-says-not-recognized).

---

## Part 2 — Install Git

### 2.1 — Check whether you already have it

In the same PowerShell window, type and press **Enter**:

```powershell
git --version
```

- **`git version 2.x.x`** → done. **Skip to [Part 3](#part-3--get-the-code).**
- **`git : The term 'git' is not recognized...`** → continue to 2.2.

### 2.2 — Download and install

1. Go to **<https://git-scm.com/download/win>**
2. The download starts on its own after a second or two. If it does not, click
   **"64-bit Git for Windows Setup"**.
3. Run the downloaded `.exe`.
4. Click **Yes** on the Windows permission box.
5. You will now be asked roughly ten questions. **Click "Next" on every single one without
   changing anything.** The defaults are all correct for this project.
6. On the last screen, click **Install**.
7. When it finishes, **untick "View Release Notes"**, then click **Finish**.

### 2.3 — Prove it worked

Again — close and reopen PowerShell first.

1. Type `exit`, press **Enter**.
2. Windows key → `powershell` → **Windows PowerShell**.
3. Type and press **Enter**:

   ```powershell
   git --version
   ```

4. You should see `git version 2.x.x`.

---

## Part 3 — Get the code

### 3.1 — Choose where it will live

We will put it in your user folder. In PowerShell, type and press **Enter**:

```powershell
cd $env:USERPROFILE
```

Nothing visible happens. That is correct — the prompt now points at `C:\Users\YourName`.

### 3.2 — Download the project

Type this **as one line**, then press **Enter**:

```powershell
git clone https://github.com/MourjyaSany/juice-stop.git
```

You will see:

```
Cloning into 'juice-stop'...
remote: Enumerating objects: ...
Receiving objects: 100% (...), done.
Resolving deltas: 100% (...), done.
```

This takes 10–60 seconds depending on your connection.

### 3.3 — Go into the project folder

```powershell
cd juice-stop
```

Your prompt now ends with `\juice-stop>`. **Every command from here on must be typed in this
folder.** If you ever open a new PowerShell window, run these two lines first:

```powershell
cd $env:USERPROFILE
cd juice-stop
```

---

## Part 4 — The one setup command

### 4.1 — Run it

Type this and press **Enter**:

```powershell
node scripts/bootstrap.mjs
```

**That is the whole setup.** One command. It installs the package manager, downloads every
dependency, writes the configuration file, builds the shared libraries, creates the database,
fills it with the menu, and then starts both servers.

### 4.2 — What you will see, in order

Six numbered steps. It is normal for step 4 to sit still for a couple of minutes.

```
Juice Stop — setting up

[1/6] Checking Node
      ✓ Node 24.18.0

[2/6] Checking pnpm
      pnpm not found — installing via corepack…
      ✓ pnpm 11.17.0 (via corepack)

[3/6] Configuring environment
      ✓ .env created from .env.example
      Dev defaults work as-is. No external accounts, keys or services needed.

[4/6] Installing dependencies
      First run pulls the whole toolchain — a few minutes is normal.
      ... lots of scrolling progress lines ...
      ✓ Workspace installed

[5/6] Building workspace libraries
      ✓ core, menu and db built (Prisma client generated)

[6/6] Preparing the database
      ✓ Schema up to date
      ✓ Seeded — 197 items, 26 categories, settings, a demo customer
```

### 4.3 — Then it starts the servers

Immediately after, you will see a summary and then the servers booting:

```
  Customer app   http://localhost:3100
  Kitchen board  http://localhost:3100/kitchen
  API            http://localhost:3000/api/v1

  Ctrl-C stops both.
```

followed by a lot of coloured log lines. **Wait until you see both of these:**

```
@juice-stop/web:dev:  ✓ Ready in 12.3s
@juice-stop/api:dev:  ... Juice Stop API · role=api · env=development · http://localhost:3000
```

The web app is usually ready in 10–60 seconds. The API takes longer on the very first run — up to
about 90 seconds — because it is compiling itself for the first time. **Be patient. It is not
stuck.**

> **You will see a red `ERROR` line saying `Redis unavailable at boot — running in degraded mode`.**
> **This is expected and nothing is broken.** Redis is an optional cache. Every part of ordering,
> the kitchen and the menu works without it.

### 4.4 — Leave this window alone

**Do not close this PowerShell window.** It *is* the servers. Closing it stops the app.

Minimise it and leave it running in the background.

---

## Part 5 — Open the app

1. Open your web browser (Chrome, Edge, Firefox — any).
2. In the address bar, type this and press **Enter**:

   ```
   localhost:3100
   ```

3. You should see the Juice Stop landing page: a dark screen, the words **"Night fuel,
   delivered."**, a live status panel, and a burger that assembles itself as you scroll.

If the page says *"This site can't be reached"*, the servers have not finished booting. Wait 30
seconds and press **F5** to reload.

### 5.1 — Set up a customer profile

Before you can order, the app needs a name, a phone number and an address.

1. At the bottom of the screen there is a floating bar with **Home**, **Menu**, **Orders** and
   **Profile**. Click **Profile**.
2. Fill in **Full name** — anything, e.g. `Test Customer`.
3. Fill in **Phone** — must be a real-looking Indian mobile: 10 digits starting with 6, 7, 8 or 9.
   For example `9876543210`.
4. Click **Add address**.
5. **Block** — click the dropdown and pick any block, e.g. **Block C**.
6. **Flat number** — type anything, e.g. `402`.
7. **Contact name** and **Contact phone** — fill in the same as above if not already filled.
8. Click **Save address**.

### 5.2 — Place an order

1. Click **Home** at the bottom, then the big **Start your order** button. (If it says **Browse the
   menu** instead, see the note below.)
2. Pick any item. Items with sizes or add-ons open a panel — choose a size, tick any extras, then
   click **Add to cart**.
3. **The cart minimum is ₹100.** Add items until you are over it, or the checkout button stays
   disabled.
4. A bar appears at the bottom showing your cart. Click it, then click **Checkout**.
5. Choose **Delivery** or **Takeaway**.
6. Optionally add extras (Mayo, Kurkure, Compact Cigarette) from the "Anything else?" section.
7. Pick a payment method — **UPI**, **Card**, **Net banking** or **Wallet**. No real money moves;
   payment is simulated.
8. Click **Place order**.
9. You land on a confirmation screen, then order tracking.

> ### ⚠️ "Ordering opens at 7 PM"
>
> **Juice Stop only accepts orders between 19:00 and 04:00 IST.** This is a deliberate business
> rule, not a bug. Browsing the menu works 24 hours a day; only ordering is gated.
>
> **If you are testing outside those hours**, open the file `.env` in the project folder (see
> [How to edit .env](#how-to-edit-env) below) and change these two lines:
>
> ```
> STORE_OPEN_TIME=19:00
> STORE_CLOSE_TIME=04:00
> ```
>
> to:
>
> ```
> STORE_OPEN_TIME=00:00
> STORE_CLOSE_TIME=23:59
> ```
>
> Save the file, then **stop and restart the servers** (see [Part 8](#part-8--stopping-and-starting-again)).

---

## Part 6 — Log in to the kitchen

The kitchen dashboard is a separate screen for staff. Riders use it too — there is no separate
delivery app.

1. Open a **new browser tab** (Ctrl+T).
2. Go to:

   ```
   localhost:3100/kitchen
   ```

3. You are sent to a login screen.
4. **Username:** `cook`
5. **Password:** `cook123`
6. Click **Sign in**.

You land on the dashboard: four columns — **Incoming**, **Preparing**, **Ready**, **Completed** —
with live counters across the top.

> These credentials are development-only. The API **refuses to start in production** with them
> enabled, so they cannot accidentally ship.

### 6.1 — Useful arrangement

Put the two tabs side by side so you can watch both at once:

1. Click the customer tab. Press **Windows key + Left Arrow**. It snaps to the left half.
2. Click the kitchen tab. Press **Windows key + Right Arrow**. It snaps to the right half.

Now you can place an order on the left and watch it appear on the right.

---

## Part 7 — Drive a whole order end to end

With both windows visible:

| # | Where | What you do | What you should see |
|---|---|---|---|
| 1 | Customer | Place an order | It appears in **Incoming** on the kitchen side **within a second** |
| 2 | Kitchen | Click **Accept** | Card stays in Incoming; customer status changes |
| 3 | Kitchen | — | The card says **"Customer can still edit · 9:58 left"** and there is no Start button |
| 4 | Customer | On the tracking screen, click **Cook it now** | The kitchen's countdown vanishes **immediately** and **Start preparing** appears |
| 5 | Kitchen | Click **Start preparing** | Card moves to **Preparing**. Customer timer restarts at **40:00** |
| 6 | Kitchen | Click **Mark ready** | Card moves to **Ready**. Customer timer restarts at **25:00** |
| 7 | Kitchen | Click **Out for delivery** | Card moves to **Completed**. Customer shows **"Almost at your doorstep"**, timer at **15:00** |
| 8 | Customer | Look at the tracking screen | A **Delivery code** box shows four digits, e.g. `4679` |
| 9 | Kitchen | Type those four digits into the box on the card | The **Delivered** button turns green |
| 10 | Kitchen | Click **Delivered** | Order completes. Customer shows **Delivered** |

**The rider genuinely cannot complete an order without that code.** It is never shown anywhere in
the kitchen app — the rider has to read it off the customer's phone. Try typing a wrong code: it is
rejected and the order stays where it was.

### 7.1 — Undo a mis-tap

Any card that has moved past **Incoming → new** has a small **↶ Back to …** button underneath —
including accepted orders still sitting in Incoming. Click it to step that order back one phase.
Rejected and cancelled orders deliberately have no way back, because both settle money.

### 7.2 — Turn an item off, and watch the menu change

1. On the kitchen side, click **Inventory** in the left sidebar.
2. Type an item name in the search box, e.g. `paneer`.
3. Click the green **Available** button on a row. It turns red and says **Sold out**.
4. Switch to the customer tab and go to the menu.
5. **Without refreshing**, that item is now greyed out and marked **Sold out**.
6. Click **Unlimited** on the kitchen side to put it back.

The **10 left** / **5 left** buttons set a real count that decreases as customers order, and flips
the item to sold out when it hits zero.

---

## Part 8 — Stopping and starting again

### 8.1 — Stop

1. Click on the PowerShell window that is running the servers.
2. Press **Ctrl + C**.
3. If it asks `Terminate batch job (Y/N)?`, type `Y` and press **Enter**.
4. The prompt comes back. Both servers are stopped.

### 8.2 — Start again later

You never need to run the full setup twice. Open PowerShell and run:

```powershell
cd $env:USERPROFILE
cd juice-stop
pnpm dev
```

That is it — about 30 seconds and both servers are up again.

> Running `node scripts/bootstrap.mjs` a second time is also safe. It reinstalls, re-applies
> migrations and starts the servers, and it deliberately **leaves your existing database alone** —
> so orders you placed while testing are not wiped.

### 8.3 — Get the latest code later

```powershell
cd $env:USERPROFILE
cd juice-stop
git pull
node scripts/bootstrap.mjs
```

### 8.4 — Start completely fresh (wipe all orders)

```powershell
cd $env:USERPROFILE
cd juice-stop
pnpm db:reset
```

This deletes every order and re-seeds the menu. It does **not** touch your code.

---

## When it goes wrong

### `node --version` still says "not recognized"

You did not close and reopen PowerShell. Programs only pick up newly installed software when they
start.

1. Type `exit`, press **Enter**.
2. Windows key → `powershell` → **Windows PowerShell**.
3. Try again.

If it *still* fails, restart your laptop and try once more.

### "Node 24 or newer is required — this is Node v20.x"

Your Node is too old. Go back to [Part 1](#part-1--install-nodejs) and install Node 24. Installing
the new version over the old one is fine — you do not need to uninstall anything first.

### `EADDRINUSE: address already in use :::3000` (or `:::3100`)

Something is already using that port — almost always a copy of these servers you forgot to stop.

Find and stop it:

```powershell
Get-NetTCPConnection -LocalPort 3000,3100 -State Listen | Select-Object LocalPort,OwningProcess
```

That prints a table with a number under `OwningProcess`. Stop it, replacing `1234` with that
number:

```powershell
Stop-Process -Id 1234 -Force
```

Then run `pnpm dev` again.

### `git : The term 'git' is not recognized`

Git is not installed, or PowerShell has not noticed it yet. Close PowerShell, reopen it, try again.
If it still fails, go back to [Part 2](#part-2--install-git).

### The setup failed partway through

Run the exact same command again:

```powershell
node scripts/bootstrap.mjs
```

Every step is safe to repeat. It picks up where it left off and will not duplicate anything.

If it fails in the same place twice, read the last few lines above the `✗` — the actual reason is
always printed there.

### The browser says "This site can't be reached"

- Check the PowerShell window is still open and shows `✓ Ready`.
- Check you typed `localhost:3100`, not `localhost:3000`. Port **3000** is the API — visiting it in
  a browser shows a "Not found" message, which is correct and not an error.
- Give it another 30 seconds on a first run. The API is slow to compile the first time.

### The "Place order" button is greyed out

Work down this list:

1. **Is it between 7 PM and 4 AM IST?** If not, see the note at the end of
   [Part 5](#52--place-an-order).
2. **Is your cart over ₹100?** That is the minimum order.
3. **Have you filled in your profile?** Name and a valid 10-digit phone are required.
4. **For delivery, have you added an address?** Takeaway does not need one.

### A red `ERROR ... Redis unavailable` line

Expected. Not a problem. Redis is an optional cache and everything works without it.

### The kitchen shows "Nothing here" after placing an order

- Confirm the order actually went through — the customer should be on a confirmation screen with an
  order number.
- Check the coloured dot at the bottom of the kitchen sidebar. **Green = Live.** If it is red, the
  connection dropped; the board still refreshes every 15 seconds regardless, so wait a moment.
- Press **F5** on the kitchen tab.

### `pnpm : The term 'pnpm' is not recognized`

You are trying to run `pnpm dev` in a window opened before setup ran. Close PowerShell, reopen,
`cd` back into the folder, and try again. If it persists, run `node scripts/bootstrap.mjs` — it
installs pnpm for you.

### How to edit `.env`

1. In PowerShell, in the project folder, type this and press **Enter**:

   ```powershell
   notepad .env
   ```

2. Notepad opens with the settings file.
3. Make your change.
4. Press **Ctrl + S** to save.
5. Close Notepad (click the **X**, or press **Alt + F4**).
6. Restart the servers — see [Part 8](#part-8--stopping-and-starting-again).

---

## Appendix — What actually got installed

Nothing was installed system-wide except Node.js and Git. Everything else lives inside the project
folder and disappears if you delete it.

| Thing | Where | What it is |
|---|---|---|
| `node_modules/` | project folder | ~560 downloaded libraries |
| `.env` | project folder | Local settings. Not shared, not committed. |
| `packages/db/prisma/dev.db` | project folder | The database — one file |
| pnpm | Node's install folder | The package manager |

### The addresses

| Address | What it is |
|---|---|
| <http://localhost:3100> | Customer app |
| <http://localhost:3100/menu> | Menu — works 24/7 |
| <http://localhost:3100/orders> | Your orders |
| <http://localhost:3100/kitchen> | Kitchen dashboard (`cook` / `cook123`) |
| <http://localhost:3100/kitchen/inventory> | Stock control |
| <http://localhost:3000/api/v1/menu> | The raw API, if you are curious |

### To remove everything

Stop the servers (Ctrl+C), then:

```powershell
cd $env:USERPROFILE
Remove-Item -Recurse -Force juice-stop
```

> Careful — that deletes the folder and everything in it, including the database. Uninstall Node.js
> and Git from **Settings → Apps → Installed apps** if you want them gone too.
