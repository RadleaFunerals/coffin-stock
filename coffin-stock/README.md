# Coffin Stock – Radlea (temporary inventory and ordering tool)

A single-page web app hosted on Netlify, with a small shared store (Netlify Blobs) so everyone sees the same counts.

## What's in the folder
- `public/index.html` – the app (Overview, Stock, Ordering, Activity)
- `netlify/functions/state.mjs` – saves and loads the shared data (PIN protected)
- `netlify/functions/order-reminder.mjs` – 7:00am Brisbane check that emails a reminder on each supplier's order day and the day before
- `netlify.toml`, `package.json` – Netlify settings

## Deploy (one time)
Netlify's drag-and-drop deploy does **not** run functions. Use one of these instead:
- **Netlify CLI:** in this folder run `npm install`, then `npx netlify deploy --prod` (it asks you to log in and create or choose a site).
- **GitHub:** push the folder to a GitHub repo and use "Import from Git" in Netlify.

Then in Netlify go to **Site configuration → Environment variables** and add:

| Variable | Value |
|---|---|
| `APP_PIN` | The shared PIN staff enter to open the app (required) |
| `REMINDER_TO` | Email address(es) for reminders, comma-separated |
| `EMAILJS_SERVICE_ID` | From EmailJS (same account as the timesheet) |
| `EMAILJS_TEMPLATE_ID` | An EmailJS template with **To** = `{{to_email}}`, **Subject** = `{{subject}}`, body = `{{message}}` |
| `EMAILJS_PUBLIC_KEY` | EmailJS → Account → Public key |
| `EMAILJS_PRIVATE_KEY` | EmailJS → Account → Private key |
| `APP_URL` | The site address (optional, adds a link to the email) |

In EmailJS → Account → Security, turn on **"Allow EmailJS API for non-browser applications"**. Without it the reminder email is refused.
Redeploy after adding the variables.

## Using it
- First visit: enter the PIN and your name (your name goes in the activity log).
- **Overview:** order reminders, key figures, and *What's needed* (upcoming funerals with a cover check). Press **Done** when the coffin has been used: it comes off stock from the area you choose.
- **Stock:** − / + per holding area, tap a number to set the count and reorder level, **Record use** and **Receive delivery** for multiples.
- **Ordering:** set each supplier's order and delivery days (Killara still to be set).
- **Activity:** every change, who made it and when. Use **Download CSV** to get stock, funerals and activity.

## Notes
- Counts start blank ("Not counted") until entered.
- The cover check uses total stock across all three holding areas.
- If two people save at once, the app reloads the latest data and re-applies the change, so nothing is overwritten.
- A dated backup of each day's last state is kept in the store.
- If the shared store can't be reached (for example, opening the file directly from your computer), the app runs in **Local mode**: changes stay on that device only and a yellow banner says so.
