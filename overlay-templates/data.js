/* =====================================================
   OVERLAY DESIGN TEMPLATES — data.js
   
   This file contains all static template data and
   performance scores read from the Google Sheet:
   "Overlay Design Templates"
   (ID: 1ujBwVxVxpcubJq06s0mRey2QYJvfrxvIrYt1iZFaUME)

   UPDATING SCORES:
   - Scores are read from "Campaign Performance by type
     for last 3 months" tab, updated weekly.
   - To pull live scores automatically, deploy the
     "overlay stats" Apps Script as a Web App and paste
     the URL into APPS_SCRIPT_URL below.

   IMAGES:
   - t.img is null for all templates until screenshots
     are saved locally or Intent.ly preview URLs are
     available.
   - To add an image: save the screenshot to
     overlay-templates/images/DB0001.png  and set
     img: 'images/DB0001.png'  in the template entry.
   ===================================================== */

/* ── Admin password ─────────────────────────────── */
const ADMIN_PASSWORD = "overlays2025";

/* ── Apps Script URL ────────────────────────────────
   Set this to your deployed Web App URL to enable
   live score fetching on every page load.
   Leave as null to use the static SCORES below.

   Deploy steps:
     1. Open Extensions > Apps Script in the sheet
     2. Deploy > New deployment > Web App
     3. Execute as: Me | Access: Anyone
     4. Copy the URL and paste it here.
   ─────────────────────────────────────────────── */
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxelkLJYarWD_CE5btpJB4ULdQUhUb9HYfRD9RvRRiU7VgRVNolKb7DbOfnie9ko5fU-Q/exec";

/* ── Performance scores ─────────────────────────────
   Source: "Campaign Performance by type for last 3
   months" tab — Engagement Rate (col E) and
   Conversion Rate (col H, = Sales / Engaged).
   Values are percentages (e.g. 10.31 = 10.31%).
   null = no data available for that metric.
   ─────────────────────────────────────────────── */
const SCORES = {
  // Dynamic Basket
  DB0001: { eng: 10.31, conv: 15.89 },
  DB0002: { eng: 22.33, conv: 35.82 },
  DB0003: { eng: 12.5, conv: 27.78 },
  DB0004: { eng: 3.41, conv: 35.33 },
  DB0005: { eng: 4.48, conv: 20.49 },
  DB0006: { eng: 0.0, conv: null },
  DB0007: { eng: 6.81, conv: 21.57 },
  DB0008: { eng: 29.04, conv: 35.57 },
  DB0009: { eng: 1.54, conv: 21.43 },
  DB0010: { eng: 16.07, conv: 5.26 },
  DB0011: { eng: 0.0, conv: null },
  DB0012: { eng: 10.91, conv: 14.15 },
  DB0013: { eng: null, conv: null },
  DB0014: { eng: 8.64, conv: 23.94 },
  DB0015: { eng: 7.26, conv: 13.9 },
  DB0016: { eng: 3.42, conv: 8.05 },
  DB0017: { eng: 8.28, conv: 32.14 },

  // Recomminder
  PR0001: { eng: 11.19, conv: 1.82 },
  PR0002: { eng: 0.0, conv: null },
  PR0003: { eng: 9.98, conv: 14.29 },
  PR0004: { eng: 13.26, conv: 6.11 },

  // Redirect
  RD0001: { eng: 4.01, conv: 42.25 },
  RD0002: { eng: 14.62, conv: 1.3 },
  RD0003: { eng: 13.79, conv: 4.03 },
  RD0004: { eng: null, conv: null },

  // Click to Reveal
  RV0001: { eng: null, conv: null },
  RV0002: { eng: 3.89, conv: 10.17 },
  RV0003: { eng: null, conv: null },
  RV0004: { eng: 9.91, conv: 2.92 },

  // Miscellaneous
  MS0001: { eng: null, conv: null },
  MS0002: { eng: null, conv: null },
  MS0003: { eng: 2.09, conv: 6.29 },
  MS0004: { eng: 50.0, conv: 0.0 },
};

/* ── Templates ──────────────────────────────────────
   Fields:
     ref   — unique reference code (e.g. "DB0001")
     cat   — category key: db | pr | rd | rv | ms
     desc  — description from the sheet
     url   — Intent.ly preview URL (full URL)
     img   — image path or URL (null = show placeholder)
               Local: 'images/DB0001.png'
               Remote: full URL
     notes — optional notes from the sheet
     upvotes    — number of upvotes (default 0)
     downvotes  — number of downvotes (default 0)
   ─────────────────────────────────────────────── */
const TEMPLATES = [
  /* ── Dynamic Basket ─────────────────────────── */
  {
    ref: "DB0001",
    cat: "db",
    desc: "Simple Dynamic basket overlay",
    url: "https://preview.intent.ly/#129190",
    img: "images/DB0001.png",
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "DB0002",
    cat: "db",
    desc: "Dynamic basket overlay with animated icon for attention",
    url: "https://preview.intent.ly/#139425",
    img: "images/DB0002.png",
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "DB0003",
    cat: "db",
    desc: "Small format dynamic basket overlay, minimal design",
    url: "https://preview.intent.ly/#142876",
    img: "images/DB0003.png",
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "DB0004",
    cat: "db",
    desc: "Dynamic basket with a 50/50 layout of messaging and basket section",
    url: "https://preview.intent.ly/#149571",
    img: "images/DB0004.png",
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "DB0005",
    cat: "db",
    desc: "Bottom left unobtrusive design",
    url: "https://preview.intent.ly/#149581",
    img: "images/DB0005.png",
    notes:
      "Can be positioned bottom left, bottom right, top left, top right — specify when adding ticket in HubSpot",
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "DB0006",
    cat: "db",
    desc: "Corner overlay with just the product details and a hover effect",
    url: "https://preview.intent.ly/#121004",
    img: "images/DB0006.png",
    notes:
      "Can be positioned bottom left, bottom right, top left, top right — specify when adding ticket in HubSpot",
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "DB0007",
    cat: "db",
    desc: "Dynamic basket with space for USPs that rotate",
    url: "https://preview.intent.ly/#151335",
    img: "images/DB0007.png",
    notes: "Default design for left section — left-centred text",
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "DB0008",
    cat: "db",
    desc: "Dynamic basket with layout specific to date based reservations",
    url: "https://preview.intent.ly/#154632",
    img: null,
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "DB0009",
    cat: "db",
    desc: "Dynamic basket sidebar with USP list under product information",
    url: "https://preview.intent.ly/#159534",
    img: null,
    notes:
      "Can be positioned bottom left, bottom right, top left, top right — specify when adding ticket in HubSpot",
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "DB0010",
    cat: "db",
    desc: "Letterbox style long thin dynamic basket",
    url: "https://preview.intent.ly/#159810",
    img: null,
    notes:
      "Can be positioned bottom left, bottom right, top left, top right — specify when adding ticket in HubSpot",
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "DB0011",
    cat: "db",
    desc: '"Birkenstock" style dynamic basket, positioned left and towards the bottom',
    url: "https://preview.intent.ly/#161354",
    img: null,
    notes:
      "Can be positioned bottom left, bottom right, top left, top right — specify when adding ticket in HubSpot",
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "DB0012",
    cat: "db",
    desc: "Fashion simple",
    url: "https://preview.intent.ly/#161367",
    img: null,
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "DB0013",
    cat: "db",
    desc: "Basket reminder with code and countdown to 30 minutes",
    url: "https://preview.intent.ly/#161587",
    img: null,
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "DB0014",
    cat: "db",
    desc: "Bottom left compact design with hover effect to highlight product",
    url: "https://preview.intent.ly/#162194",
    img: null,
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "DB0015",
    cat: "db",
    desc: "Standard template for products with company branding",
    url: "https://preview.intent.ly/#165015",
    img: null,
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "DB0016",
    cat: "db",
    desc: "VERY non intrusive — just product details and price integrated into the button",
    url: "https://preview.intent.ly/#166247",
    img: null,
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "DB0017",
    cat: "db",
    desc: "Simple basket reminder overlay bottom left",
    url: "https://preview.intent.ly/#166247",
    img: null,
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },

  /* ── Recomminder ─────────────────────────────── */
  {
    ref: "PR0001",
    cat: "pr",
    desc: "Simple product recomminder overlay with USPs scrolling along the bottom",
    url: "https://preview.intent.ly/#149609",
    img: "images/PR0001.png",
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "PR0002",
    cat: "pr",
    desc: "Female focussed recomminder with woman looking at phone",
    url: "https://preview.intent.ly/#149898",
    img: "images/PR0002.png",
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "PR0003",
    cat: "pr",
    desc: "Side by side product recomminder with two products",
    url: "https://preview.intent.ly/#149896",
    img: "images/PR0003.png",
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "PR0004",
    cat: "pr",
    desc: "Standard Square design",
    url: "https://preview.intent.ly/#150076",
    img: "images/PR0004.png",
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },

  /* ── Redirect ────────────────────────────────── */
  {
    ref: "RD0001",
    cat: "rd",
    desc: "Simple basket recomminder overlay for health/beauty clients",
    url: "https://preview.intent.ly/#160834",
    img: "images/RD0001.png",
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "RD0002",
    cat: "rd",
    desc: "Multi CTA for different categories or bestsellers",
    url: "https://preview.intent.ly/#160836",
    img: "images/RD0002.png",
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "RD0003",
    cat: "rd",
    desc: "Multi CTA with different images for each category/product option on hover",
    url: "https://preview.intent.ly/#139633",
    img: "images/RD0003.png",
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "RD0004",
    cat: "rd",
    desc: "Product category carousel sliding images",
    url: "https://preview.intent.ly/#161013",
    img: "images/RD0004.png",
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },

  /* ── Click to Reveal ─────────────────────────── */
  {
    ref: "RV0001",
    cat: "rv",
    desc: "Simple code reveal template with space for images positioned absolutely to the right",
    url: "https://preview.intent.ly/#153895",
    img: "images/RV0001.png",
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "RV0002",
    cat: "rv",
    desc: "Simple code reveal with imagery to the left",
    url: "https://preview.intent.ly/#166077",
    img: "images/RV0002.png",
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "RV0003",
    cat: "rv",
    desc: "Click to reveal template variant",
    url: "https://preview.intent.ly/",
    img: null,
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "RV0004",
    cat: "rv",
    desc: "Click to reveal overlay with new customer banner and brand image",
    url: "https://preview.intent.ly/#171760",
    img: "images/RV0004.png",
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },

  /* ── Miscellaneous ───────────────────────────── */
  {
    ref: "MS0001",
    cat: "ms",
    desc: "Small badge opens click to reveal (preview overlay to see full functionality)",
    url: "https://preview.intent.ly/#160538",
    img: "images/MS0001.png",
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "MS0002",
    cat: "ms",
    desc: "Bottom left click to expand email voucher overlay",
    url: "https://preview.intent.ly/#161370",
    img: "images/MS0002.png",
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "MS0003",
    cat: "ms",
    desc: "Email to reveal basic layout, can be adapted to most brands quite easily",
    url: "https://preview.intent.ly/#173498",
    img: "images/MS0003.png",
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },
  {
    ref: "MS0004",
    cat: "ms",
    desc: "Email voucher overlay with voucher icon and terms link",
    url: "https://preview.intent.ly/#173618",
    img: "images/MS0004.png",
    notes: null,
    upvotes: 0,
    downvotes: 0,
  },
];
