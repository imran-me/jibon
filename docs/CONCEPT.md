# JIBON — Emergency Response Intelligence

**One line:** A bystander opens an app, taps an icon or just speaks, and an AI takes over the
entire emergency chain — understanding what is happening, routing the call to the right
department instead of a generic operator, telling the ambulance what equipment to load,
recruiting a nearby volunteer, putting a doctor on the line for first aid, and preparing every
hospital along the route *before* the patient arrives.

---

## 1. The problem, stated fully

Somebody collapses on a footpath in Dhaka, or a bus goes off the road outside Patuakhali. In
the first sixty seconds, the only person who can help is a bystander — and that bystander is
almost never a doctor. They are a rickshaw puller, a shopkeeper, a student. They are frightened,
they do not know what is wrong with the person in front of them, and critically, **they do not
know who to call.** So they call the only number they can remember, 999, and the entire weight
of the emergency now rests on a voice conversation between a panicking stranger and an
operator who cannot see anything.

That conversation takes one to two minutes, sometimes longer. The operator has to establish
what happened, where it happened, and how bad it is, using nothing but the caller's words —
words that are often wrong, because the caller has no vocabulary for what they are seeing. "He
fell down and he is not waking up" could be cardiac arrest, a stroke, a diabetic hypoglycaemic
crash, a head injury, or an epileptic seizure. Each of those needs a completely different
response, a different set of equipment, and a different hospital department. The operator
guesses, and dispatches an ambulance.

Then the second failure arrives. The ambulance that shows up is very often a **transport vehicle,
not a treatment vehicle** — a van with a stretcher, a driver, and no defibrillator, no oxygen, no
airway kit, no trained paramedic. It was dispatched blind, so it could not have been loaded
correctly even in principle. Precious minutes are spent driving to the scene by a crew who will
arrive without the one item that would have mattered.

And then the third failure. The ambulance drives to a hospital that has no idea it is coming. The
patient is wheeled into a general emergency department, where the assessment process starts
again from zero — history, examination, triage, imaging, a search for a specialist, a search for a
free operating theatre, a search for the right blood group. Every one of those steps could have
been started forty minutes earlier, while the patient was still in transit. Instead they start now,
with the clock already deep into the window where survival is decided.

Layered on top of all of this is geography. Bangladesh's specialist capacity is concentrated in a
handful of cities. A patient in Kuakata who needs neurosurgery is not going to get it in Kuakata,
and quite possibly not in Patuakhali either — they are going to Dhaka, and that is a long journey
on roads that do not cooperate. Right now that journey is dead time: hours in which the patient
is simply being moved, receiving no escalation of care, while the facility that will actually treat
them knows nothing about them.

The pattern underneath all four failures is the same. **Information that exists is not moving.** The
bystander can see the patient but cannot interpret what they see. The operator can interpret
but cannot see. The ambulance crew knows neither until they arrive. The hospital knows nothing
until the doors open. Every handoff in the chain throws away what the previous link learned,
and every one of those losses is paid for in minutes — and in emergency medicine, minutes are
the whole game. Survival in cardiac arrest falls by roughly seven to ten percent for every minute
that passes without effective intervention. Trauma outcomes are shaped decisively inside the
first hour. We are not short of medicine. We are short of coordination.

## 2. What JIBON does

JIBON replaces the single blind phone call with a continuous, intelligent channel that stays open
from the moment of the emergency until the patient is in the right hands.

**It starts without words.** The app opens to a small grid of large, unmistakable icons — a heart,
a body on the ground, a road accident, fire, drowning, childbirth, a burn, poisoning. A terrified
person who cannot compose a sentence can still hit an icon in under two seconds. If they can
speak, they simply speak, in Bangla, in English, or in the mix of both that people actually use,
and they do not have to structure it — "uni pore gechen, nishash nite parchen na, mukh nila hoye
jacche" is enough. The AI parses meaning out of panic, which is something a human operator
also does, but the AI does it in under a second and does it identically at three in the morning on
the four-hundredth call of the shift.

**It sees.** This is the part no phone call can do. The app asks the bystander to point the camera
at the patient, and the model looks: is the chest rising, what colour is the face, is there visible
blood and roughly how much, is a limb at an angle limbs do not go, is the person responding to
the light. It cross-checks what it is seeing against what it was told. A caller who says "he is
breathing" while the video shows no chest movement and blue lips is now a very different
priority, and the system knows that within seconds rather than never.

**It routes, instead of relaying.** Because the system has already classified the emergency, it does
not need to dump the call on a generic operator to make a routing decision. It opens a line
directly to the department that actually handles this — cardiac, trauma, burns, obstetric, poison
control — and hands them a structured brief that is already written. The human specialist joins a
call that is already informed, instead of starting an interview.

**It does not hang up.** The channel stays open for the entire event. This is the design decision
that changes everything downstream: the AI is listening and watching continuously, so the
patient's condition is being tracked, not sampled once. Deterioration gets noticed. And because
the line is live, three things can be done in parallel that today are done in sequence or not at all:

- **A doctor talks the bystander through the first few minutes.** Chest compressions at the right
  rate, how to position an unconscious person so they do not aspirate, how to apply pressure to
  a bleed, what absolutely not to do to a suspected spinal injury. The bystander stops being a
  helpless witness and becomes the first responder, which is what they physically are anyway.
- **A nearby trained volunteer is dispatched.** Off-duty nurses, medical students, trained
  first-aiders, anyone in the registry within a few minutes' walk gets pinged with the location
  and the situation. In dense cities a volunteer on foot beats a vehicle in traffic, routinely.
- **The ambulance is loaded correctly.** This is the quiet, enormous win. Because the emergency
  is already classified, the dispatch tells the crew what to bring — defibrillator and airway kit for
  a cardiac arrest, spinal board and tourniquets for road trauma, oxygen and a nebuliser for
  respiratory distress, obstetric kit for a complicated delivery. The vehicle stops being a taxi and
  starts being a treatment unit, without buying a single new ambulance.

**It prepares the destination.** While the ambulance is still moving, the receiving hospital already
has the case: the classification, the vital trend, the video assessment, what has been
administered, ETA. The AI proposes what needs to be standing by — which department, whether
an operating theatre should be prepped and with which team, which drugs and consumables to
pull, whether to cross-match and reserve blood and of which group. The hospital's decisions
start when the ambulance starts moving, not when it stops.

## 3. The relay: the part that is genuinely new

The strongest idea in this design is what happens on a long transfer, and it deserves to be stated
on its own.

A patient in Kuakata needing definitive care in Dhaka has to travel through Patuakhali. Today
that intermediate facility is just scenery. In JIBON it becomes a **relay point**. As soon as the
route is set, the system alerts the Patuakhali medical team, gives them the full case, and tells
them exactly what to have waiting at the roadside — blood, fluids, a stabilising drug, an airway,
a clinician to ride along. The ambulance does not stop for an admission; it makes a rendezvous.
Patuakhali hands up supplies and a trained person who continues treatment in the moving
vehicle, and the ambulance carries on to Dhaka with a higher level of care on board than it left
with. Meanwhile Dhaka has had the entire journey to prepare.

This converts the transfer from dead time into **escalating care**. The patient's level of treatment
rises at each waypoint instead of flatlining until arrival. It requires no new hospitals, no new
ambulances, and no new doctors — only the coordination to know who is on the route, what
they have, and what to ask them for. That coordination is exactly what an AI with the full case
context can do and a phone tree cannot.

## 4. Why this needs AI, and specifically a multimodal model

It is worth being precise about this, because "we added AI" is not an argument.

Every link in this chain fails for one of two reasons: interpretation or simultaneity.

**Interpretation.** Turning a panicked, code-switched, medically illiterate description plus a shaky
video into a clinical classification is a genuinely hard perception problem. It is not a decision
tree. The input is unstructured speech in two languages, and unstructured visual evidence, and
the two have to be reconciled against each other. This is precisely what a multimodal model is
for — Gemini takes the audio transcript, the images, and the structured context together and
returns a classification, a severity, an equipment list, and a confidence, in one pass.

**Simultaneity.** A human dispatcher does one thing at a time. The moment an emergency is
classified, JIBON needs to brief a department, generate an equipment manifest, alert volunteers,
notify a doctor, compute the route, identify relay points, and draft the hospital's preparation
order — all at once, all consistent with each other. That is orchestration across many
simultaneous outputs from one shared understanding of the case, which is the thing a model
does effortlessly and a person under pressure cannot.

And it must be honest about uncertainty. Every classification carries a calibrated confidence, and
below a threshold it escalates to a human rather than deciding. **The AI never overrides a
clinician. It prepares, proposes, and hands over.** That distinction is what makes it deployable.

## 5. What we can honestly claim

The instinct to say "this saves ninety percent" is understandable, but it will not survive a
judge's follow-up question, and a weaker claim you can defend beats a strong one you cannot.

What is genuinely defensible:

- Time is the dominant variable in emergency survival, and this system attacks time at four
  separate points: recognition, routing, equipment, and destination readiness.
- Every minute removed is a measurable increase in survival probability for the time-critical
  conditions — cardiac arrest, major haemorrhage, stroke, obstructed airway.
- Several of the gains cost nothing to realise. Loading the right equipment does not require a
  new ambulance. Preparing a theatre in advance does not require a new theatre. Recruiting a
  volunteer already nearby does not require hiring anyone. **The resource already exists; only the
  information is missing.**

Frame the impact as *minutes saved per link in the chain*, and let the medical literature on
time-to-treatment do the rest. That is a claim that gets stronger under questioning instead of
weaker.

## 6. Scope for the build

The full system spans a citizen app, a dispatch console, hospital integrations, and a volunteer
network. What we build and demonstrate is the **coordination intelligence** — the part that is
actually novel, and the part that shows Gemini doing something a rules engine could not:

1. **Intake** — icon-first or voice-first report, plus optional photo, in Bangla or English, turned
   into a structured clinical classification with a confidence score.
2. **Dispatch decision** — the equipment manifest, the department to route to, the volunteer
   radius, and the first-aid script for the bystander, all generated from that one classification.
3. **The route plan** — destination selection by capability rather than proximity, with relay points
   identified along the way and each one given its own prepare-order.
4. **The command console** — live incidents, response-time analytics, survival-window tracking,
   and full drill-down into every number, so the operational case is visible and not just asserted.

Everything is inspectable. Every number opens into the records behind it. That is the difference
between a demo and a system.

---

## Appendix: the condensed prompt

> Build an emergency medical response coordination system for Bangladesh. Today a bystander
> who witnesses a collapse or an accident can only call 999, spend one to two minutes describing
> the scene to an operator who cannot see it, and wait for an ambulance that was dispatched
> blind and therefore arrives without the right equipment, heading to a hospital that does not
> know it is coming. Every handoff in that chain discards what the previous link learned, and each
> loss is paid in minutes that decide whether the patient lives.
>
> The system replaces that single blind call with a continuous multimodal channel. The bystander
> taps an emergency icon or simply speaks in Bangla, English or a mix of both; the AI classifies
> the emergency from that speech, cross-checks it against live camera evidence of the patient,
> assigns a severity and a calibrated confidence, and routes the call directly to the correct
> specialist department rather than a generic operator. The channel then stays open for the whole
> event: the AI keeps watching and listening for deterioration, a doctor talks the bystander
> through immediate first aid, a trained volunteer nearby is dispatched on foot, and the
> ambulance is told precisely what equipment to load for this specific emergency.
>
> While the ambulance is still in transit, the destination hospital receives the full case and
> prepares in advance — the department, the operating theatre and team, the drugs and
> consumables, the cross-matched blood. On long transfers the system turns intermediate
> facilities into relay points: a hospital on the route is told what to have waiting at the roadside,
> hands up supplies and a clinician who continues treatment in the moving vehicle, so the level of
> care escalates during the journey instead of flatlining until arrival.
>
> The AI never overrides a clinician. It classifies, prepares, proposes and hands over, always with
> an explicit confidence, escalating to a human whenever it is unsure. The resources already
> exist — the ambulances, the theatres, the doctors, the volunteers. What is missing is the
> information moving fast enough between them, and that is the entire problem this solves.
