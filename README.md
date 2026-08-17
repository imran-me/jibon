# JIBON — Emergency Response Intelligence

**জীবন** · AI emergency coordination for Bangladesh.

> Don't wait for the patient to arrive before preparing for the patient.

A bystander taps an icon or simply speaks. Gemini classifies the emergency, routes it to the right
department instead of a generic operator, tells the ambulance what equipment to load, alerts a nearby
volunteer, and prepares every hospital along the route — while the patient is still on the road.

---

## The problem

Someone collapses in Kuakata. The only person there is a shopkeeper who is not medically trained and
does not know who to call, so they dial 999 and spend one to two minutes describing a scene the
operator cannot see. An ambulance is dispatched blind, so it arrives without the one piece of
equipment that mattered. It drives to a hospital that does not know it is coming, where the
assessment starts again from zero.

Four failures, one cause: **information that exists is not moving.** The bystander can see but cannot
interpret. The operator can interpret but cannot see. The crew knows neither until they arrive. The
hospital knows nothing until the doors open. Every handoff discards what the previous link learned,
and each loss is paid in minutes that decide whether the patient lives.

## What JIBON does

| Stage | Conventional | JIBON |
|---|---|---|
| Understanding | 1–2 min voice interview | Speech + image classified in seconds |
| Routing | Generic operator decides | Straight to the correct specialist department |
| Equipment | Whatever the unit happens to carry | Manifest matched to the classified emergency |
| Destination | Nearest hospital | Nearest hospital **that can actually treat this** |
| Transfer | Dead time | Relay points prepared along the route |
| Arrival | Hospital learns at the door | Team, theatre and blood already standing by |

### The relay

The idea the product is built around. A patient in Kuakata needing definitive care in Dhaka travels
through Patuakhali and Barishal. Today those facilities are scenery. JIBON turns them into **relay
points**: each is given the full case and told what to have waiting at the roadside, then hands up
supplies and a clinician who continues treatment in the moving vehicle. Transfer time stops being
dead time and becomes **escalating care** — without a single new ambulance, theatre or doctor.

---

## For judges — 90 seconds

Open the site, press **▶ Guided tour**. It runs a real emergency (an unconscious person on Kuakata beach
road) through the platform's own state machine and moves the screen to whichever interface is acting at
that moment, narrating as it goes:

1. **Report Emergency** — the bystander taps one icon or speaks in Bangla/English; the AI builds a
   structured brief with every line labelled *Reported / Observed / AI inferred / Verified / Needs confirmation*.
2. **Command Center** — the case is on the board, prioritised and routed; every KPI and every dot on the
   network map opens the cases behind it.
3. **Ambulance** — the crew has the equipment manifest, the route and the relay before reaching the patient.
4. **Patient / Doctor** — the clinician reads instead of asking; the caller is never re-interviewed.
5. **Hospital Board** — receiving and relay hospitals move **Notified → Preparing → Team ready** while the
   patient is still on the road.
6. **Impact** — conventional vs coordinated pipeline, measured on the dataset, closing on
   *"Don't wait for the patient to arrive before preparing for the patient."*

Every number is clickable. Every recommendation has a **Why?**. Nothing is decoration.

## Running it

The whole application is one file — `index.html` — with no build step, no dependencies and no server.
Double-click it, or serve the folder with anything static:

```bash
git clone https://github.com/imran-me/jibon.git
cd jibon
python serve.py        # http://localhost:8000  (or just open index.html)
```

### Deploying

Push to GitHub, then **Settings → Pages → Deploy from branch → `main` / root**. `.nojekyll` is committed.

### Gemini

The console is fully usable with no key — classification falls back to a local rule set and every
"Explain" action produces a deterministic rationale from the same computed statistics.

For live Gemini, open the **Gemini AI** tab and paste a free key from
[Google AI Studio](https://aistudio.google.com/apikey). It is stored in your browser's localStorage and
sent directly to Google (`gemini-2.5-flash` by default). **No key is ever committed to this repository** —
there is no server here for one to live on. Gemini is used for:

- speech / photo → structured triage JSON (type, priority, consciousness, breathing, observations,
  missing information, calibrated confidence)
- "Why this hospital?" routing rationale written from the structured routing payload
- operational Q&A grounded on pre-computed figures, so the model cannot invent a total

Every AI surface degrades to a local fallback, so venue wifi cannot take the demo down.

## Architecture

`index.html` is deliberately a single file so it cannot fail to load on a judge's laptop. Inside it the
layering is still strict, top to bottom:

```
Reference data     TYPES · HOSP (facilities + capabilities) · KIT (equipment manifests)
                   PREP (hospital checklists) · AID (lay first-aid protocols) · GEO
Seeded dataset     132 emergencies from a fixed seed — last 7 days coordinated, 3 weeks before
                   conventional — so every before/after figure is computed, never asserted
Scenario engine    runSim(): drives a genuine case record through the real stages at compressed speed
Views              Command Center · Report · Patient/Doctor · Ambulance · Hospital Board ·
                   All Cases · Impact · Gemini AI — each a pure function of state
Drill-downs        every KPI, chart segment, facility, case and timeline event opens a sheet
Gemini client      gem(): structured output, thinking budget, 20 s timeout, safety/finish handling
```

`src/` holds the earlier ES-module build of the same product (kept for reference; the deployed page does
not load it).

### Design rules the code enforces

**No number is a dead end.** Every KPI, chart segment, legend entry, table row, facility and timeline
event opens a panel that recomputes from the same functions the tile used.

**Nothing is displayed without provenance.** Every clinical fact carries a badge — `Reported`,
`Observed`, `AI inferred`, `Verified`, `Needs confirmation`.

**The AI classifies; it does not prescribe.** First-aid steps, equipment manifests and hospital
checklists are static, reviewable tables. The model selects which protocol applies; it never authors one,
never names a medication, never states a diagnosis as fact.

**Privacy by construction.** Microphone and camera activate only on an explicit press and stop on release;
cases live in the browser only; the timeline is the audit log; a "Clear local data" control removes
everything.

## Honest scope

This prototype is **not** connected to 999, to any ambulance dispatch system, or to any hospital
record, and it does not claim to be. Scenarios are explicitly labelled as simulations. Production
deployment would require role-based access, a per-case audit log, a data retention schedule, and
clinical governance sign-off on every protocol table.

What is real: the classification, the capability-based routing and relay selection, the analytics,
and the coordination model. The resources already exist — the ambulances, the theatres, the doctors,
the volunteers. What is missing is the information moving fast enough between them.

---

Built for **Build with AI Hack Days @ EMK**, Dhaka.
