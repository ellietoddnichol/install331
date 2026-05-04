# Division 10 Bid Reasoning Playbook

This file explains how the app should think when it receives a proposal, spec section, takeoff, or notes.

## Core idea

Do **not** treat all extracted text equally.

The app should first decide:
1. What is scope?
2. What is commercial language?
3. What is install knowledge?
4. What hidden work is implied?

## What the uploaded sample files teach us

### Pattern 1: Proposal files mix scope and non-scope
The uploaded proposals contain:
- company header / contact information
- proposal metadata
- grouped product scope
- material subtotals
- commercial qualifiers like tax, bond, unload, and site visit

Your parser should **not** create line items from headers, bond terms, sales tax lines, or generic bid language.

### Pattern 2: Takeoffs and proposals contain different intelligence
A takeoff often tells you:
- what products exist
- rough quantities
- some notes

A proposal often tells you:
- alternates
- commercial assumptions
- whether labor is excluded
- logistics responsibility
- whether field visit was excluded

The app should combine both.

## Reasoning examples

### Example: "wood bases for lockers"
This should not become:
- locker item only

It should become:
- locker system
- plus separate base carpentry/prep operation
- plus leveling
- plus anchoring
- plus likely coordination to dimensions before final set

### Example: "floor mounted overhead braced"
This should not become:
- generic partition stall count only

It should become:
- partition system
- floor anchor condition
- overhead brace condition
- plumb/level/adjust sequence
- likely backing/layout review

### Example: "semi-recessed cabinet"
This should not become:
- just one cabinet item

It should become:
- cabinet item
- plus mounting-condition logic
- plus possible wall/recess review
- plus projection/path-of-travel awareness

## Recommended parser stack

### Pass 1 — block classification
Classify every block into:
- metadata
- scope header
- scope item
- alternate
- subtotal
- commercial term
- inclusion note

### Pass 2 — scope interpretation
Turn scope text into:
- item family
- install family
- code sensitivity
- substrate sensitivity
- hidden-scope recipes

### Pass 3 — estimate shaping
Build:
- materials
- labor operations
- logistics
- alternates
- exclusions
- clarifications

## Default commercial logic

If document says:
- "IF LABOR IS NEEDED, PLEASE CALL FOR QUOTE"
Then:
- mark proposal as material-only
- do not assume labor included

If document says:
- "JOB SITE VISIT: NO"
Then:
- increase uncertainty
- favor field verify flags
- avoid pretending hidden conditions are known

If document says:
- "CUSTOMER TO RECEIVE/UNLOAD"
Then:
- do not add unload labor by default

## Best implementation pattern

Use these layers together:
- product catalog
- install knowledge
- hidden-scope recipes
- commercial term classifier
- document block classifier
- proposal clarification generator

This gives you an app that does more than match words. It reasons about what the words mean in construction.
