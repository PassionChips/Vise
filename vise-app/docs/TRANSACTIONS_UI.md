# Transactions screen: pinned header, calendar, dates

## Layout: fixed financial context, independent list

Only the list scrolls. The header is pinned over it in a frosted `Glass` layer, and the list is padded by the header's
measured height so the first row starts beneath it.

```
Expanded (top of the list)            Scrolled
┌ Glass header ───────────────┐       ┌ Glass header ───────────────┐
│ Transactions                │       │ €1,822 ↓€3,200 ↑€1,377 [📅][+]│  compact summary
│ BALANCE · OCTOBER 2026      │       │ search…               [filters]│
│ €1,822.73                   │       │ All · Expenses · Income        │
│ INCOME €3,200 │ EXPENSES €1,377     │ 11 transactions                │
│ October 2026 ▾        [📅][+]│       └───────────────────────────────┘
│ search…               [filters]│       ┌ Fri 25 Sep   −€29.60 ┐ day label
│ All · Expenses · Income        │       (the list scrolls under it)
└──────────────────────────────┘
```

**How it collapses** (`CollapsingHeader`): the header never changes size. Its top part (the title and the big balance)
slides up with the list and fades out while the compact summary, the month, the calendar and add buttons, search and
filters stay put. Only `transform` and `opacity` animate, driven natively by the scroll offset, so there is no
re-layout and nothing to feed back into the scroll. The numbers never change because of scrolling.

A small glass label under the header shows which day is at the top once you scroll past the first screen
(`dayAtOffset`, tested).

## Gestures

| Where | Gesture | Result |
|---|---|---|
| Balance block | Swipe sideways (or a flick) | Next / previous month, with a light tick |
| Calendar | Swipe sideways | Months, with momentum across several; snaps to one (`MonthPager`) |
| Calendar title | Tap | Month and year wheels (`WheelPicker`): flick, momentum, snap, a tick per row; no confirm button |
| Calendar | "Today" button | Jump back to this month |

There are no arrow buttons. Screen readers get `increment` / `decrement` actions on the balance block, the calendar
title and each wheel. The calendar covers January 1990 to December 2100. Only the pages near the screen are drawn, and
the visible month and its two neighbours are loaded so amounts are there as you swipe.

Haptics (`expo-haptics`, `src/data/haptics.ts`) are a light selection tick and do nothing where there is no haptic
engine.

## Totals follow what is shown

| Showing | Numbers |
|---|---|
| The whole month | rust-core's `getMonthlySummary` |
| A chosen day, a search, or a filter | `periodTotals()` over exactly the rows listed |

`periodTotals` (`src/data/calendar.ts`) applies the same rules as `rust-core/src/calculations/totals.rs`: only the
chosen currency; excluded, failed and reverted rows skipped; a refund reduces spending; a transfer is ignored.
Changing the month clears the chosen day.

## Dates

Each transaction is stored under the date the user chose, not the day it was entered (the backend always did; the form
only lacked a date picker). The date picker (`DatePickerSheet`) offers *Today / Yesterday / A week ago*, month stepping,
and a month and year chooser, so any past or future date is reachable. Every total, daily figure and chart reads the
stored date. A test (`a_transaction_keeps_the_date_it_happened...`) covers a 2023 and a 2031 transaction and month
boundaries.

When a transaction is saved under a date outside the month on screen, the Transactions tab says
"Saved to March 2023 · View" and jumps there on tap (`src/data/savedTransaction.ts`).

## The spending calendar

The calendar icon (or the month name) opens `CalendarSheet`: every day of a month with what was spent. Tapping a day
shows only that day (a chip in the header clears it).

| Day looks like | Meaning |
|---|---|
| Green wash, green amount | Spent within the daily allowance (monthly limit ÷ days in the month) |
| Light, medium, heavy red wash | Over the allowance (≤ 1.5×, beyond), or, when there is no monthly limit, a third / two thirds / most of the month's biggest day |
| Small green dot | Income that day |
| `+€3.2k` in green | Income only |
| Plain | No activity |
| Ring | Today |

Amounts are compact (`€24`, `€1.2k`) so they fit; the full amount is in each cell's accessibility label. The tints are
soft on purpose (`color.heat` in `src/theme/tokens.ts`, both themes).

## Glass

`src/components/Glass.tsx` blurs what is behind it (`expo-blur`), lays a translucent wash on top so text stays readable,
and adds a hairline edge and soft shadow. Used for the pinned header and the calendar totals only. If a device renders
the blur badly, set `BLUR = false` in that file to fall back to the translucent fill alone.

## Not verified

Layout, blur, the collapse animation, swipes and haptics have not been seen or felt on a device. Check them on a
small phone (header height), in dark mode, and on a phone with a haptic engine. Reanimated and gesture-handler come
in through Expo Router and are not declared in `package.json`; the scroll-linked animation uses React Native's own
`Animated` with the native driver, and Reanimated is only used for small fade-ins.
