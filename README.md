# Fuel Expense & Slip Management System — Phase 1 to 5

## Kaise chalayein

1. [Node.js](https://nodejs.org) installed hona chahiye
2. Terminal mein is folder mein jayein:
   ```
   cd FuelExpenseSystem
   ```
3. Claude API key set karein (OCR ke liye):
   ```
   # Windows:
   set ANTHROPIC_API_KEY=sk-ant-xxxxxxxx

   # Mac/Linux:
   export ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
   ```
4. Server start karein:
   ```
   node server.js
   ```
5. Browser mein kholein: **http://localhost:3000**

Koi `npm install` ki zaroorat nahi.

## Demo Login

| Role       | Username     | Password   |
|------------|--------------|------------|
| Admin      | `admin`      | `admin123` |
| Accountant | `accountant` | `acc123`   |

## Folder Structure

```
FuelExpenseSystem/
├── server.js                  ← backend server (Phase 1–5 routes)
├── lib/
│   ├── db.js                  ← JSON database helper
│   └── auth.js                ← password hashing + tokens
├── data/                      ← auto-created (users, entries, etc.)
└── public/
    ├── index.html             ← Login page
    ├── app.js                 ← Login logic
    ├── style.css              ← Login styles
    ├── dashboard.html         ← Fuel entry dashboard + charts
    ├── fuel-app.js            ← Dashboard logic + stats
    ├── dashboard.css          ← Dashboard styles
    ├── slip-upload.html       ← Slip upload + OCR page (Phase 2)
    ├── slip-upload.js         ← OCR logic (Phase 2)
    ├── slip-upload.css        ← Upload page styles
    ├── search-filter.html     ← Search & filter page (Phase 3)
    ├── search-filter.js       ← Filter logic (Phase 3)
    ├── search-filter.css      ← Filter page styles
    ├── reports.html           ← PDF report generator (Phase 4)
    ├── reports.js             ← Report logic (Phase 4)
    └── reports.css            ← Report page styles
```

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/login` | Login |
| POST | `/api/logout` | Logout |
| GET | `/api/me` | Current user info |
| GET | `/api/entries` | Entries list (filter: search, vehicle, driver, month, dateFrom, dateTo) |
| POST | `/api/entries` | New entry add |
| DELETE | `/api/entries/:id` | Entry delete (admin only) |
| GET | `/api/stats` | Dashboard stats + charts data |
| POST | `/api/ocr` | Slip image OCR via Claude Vision |
| GET | `/api/reports/pdf` | Print-ready HTML report |

## Phases

| Phase | Kya hai | Status |
|---|---|---|
| Phase 1 | Login, CRUD, JSON database, role-based auth | ✅ Done |
| Phase 2 | Slip photo upload + camera + Claude OCR | ✅ Done |
| Phase 3 | Search, filter, dashboard charts | ✅ Done |
| Phase 4 | PDF report generator | ✅ Done |
| Phase 5 | Mobile polish, bug fixes, final QA | ✅ Done |

## PDF Report Kaise Save Karein

1. Reports page kholein → filter select karein
2. **Print / Save PDF** button dabayein
3. Browser ka print dialog khulay ga
4. **"Save as PDF"** option select karein
5. Save kar lein

## Future Upgrades (Phase 6)

- GPS location tagging
- Duplicate slip detection
- WhatsApp report sending
- Cloud backup (Google Drive)
- Native mobile app (React Native)