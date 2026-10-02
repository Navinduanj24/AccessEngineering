---
name: Demo delay calibration
description: Guidance for keeping the concrete-delivery demo dataset's operational pattern plausible.
---

Choose delivery outcomes first, then apply delay-cause modifiers only to outcomes that are already delayed. Otherwise a mostly-on-time seed can drift into implausibly poor on-time performance after traffic, site, or plant adjustments.

**Why:** The initial seed's reason modifiers added delay to records selected as on-time, causing the dashboard to report 13% on time despite a better base distribution.

**How to apply:** When changing demo-data outcome bands or adding new delay patterns, keep reliability calibration separate from reason/stage adjustments and check the rendered dashboard against the intended demo profile.