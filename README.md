# Retirement Corpus Planner

A one-page dashboard that splits an Indian retirement corpus (₹) into buckets for the next 10-15 years.

**Inputs:** age, corpus, monthly expenses, spouse working (yes/no), risk profile (low/medium), horizon (10/12/15 years).

**Output:**
- Emergency fund (6 months if spouse works, else 12) and medical buffer
- Bucket 1 Income (years 1-3): SCSS (60+), Post Office MIS, FD ladder
- Bucket 2 Stability (years 4-7): RBI Floating Rate Bonds, debt funds
- Bucket 3 Growth (years 8+): index / balanced advantage / flexi-cap funds
- Health insurance cover and premium estimate
- Year-by-year projection with inflation, premiums and a warning if money runs out

## Use it
Open `index.html` in a browser. No install, no server. To host it, enable GitHub Pages on this repo (Settings → Pages → branch `main`, folder `/`).

## Change assumptions
Returns, inflation, and SCSS/POMIS limits are in `ASSUMPTIONS` at the top of `plan.js`.

## Test
`node test.js`

*Educational tool, not financial advice.*
