# Monetisation plan

NetRate is built to earn from a high-intent, high-value audience (UK contractors deciding how to be paid) without compromising the tool. The numbers are never influenced by any commercial arrangement. Three revenue lines, in priority order.

## 1. Affiliate partnerships (primary)

Contractors searching this question are about to make three commercial decisions, each with a strong affiliate or lead-generation market:

| Slot (built into the page) | Programme type | Typical economics |
|----------------------------|----------------|-------------------|
| Contractor accountants | Lead / CPA referral | £40 to £150 per qualified sign-up |
| Umbrella companies | Per-registration referral | £25 to £100 per worker registered |
| Contractor mortgages / protection | Mortgage broker lead | £30 to £200 per qualified lead |

The three cards live in the `#partners` section of `index.html`, already styled and marked `rel="sponsored nofollow"`. To activate:

1. Join the relevant affiliate or referral programmes (for example via Awin, or direct broker schemes).
2. Replace each card's `href="#"` with your tracked affiliate URL.
3. Keep the visible affiliate disclosure that is already on the page (required by the ASA and CAP Code).

This is the highest-yield line because intent is high and a single accountancy or mortgage lead can be worth more than thousands of ad impressions.

## 2. Display advertising (secondary)

Personal-finance keywords carry some of the highest ad rates in the UK market. Two slots are reserved:

- An in-content unit (`.ad-slot[data-ad="in-content"]`) below the results.
- The header comment block in `index.html` for the publisher script.

To activate Google AdSense: add the publisher script in `<head>`, place an `<ins class="adsbygoogle">` unit in the reserved slot, and push it from `app.js`. AdSense approval is smoother on a custom domain (see below). Once traffic reaches roughly 10,000 sessions a month, a managed network such as Mediavine or Raptive typically pays several times AdSense RPM for finance content.

## 3. Optional pro export (tertiary, later)

The free tool already prints a clean PDF. A future paid tier could add a branded, multi-scenario PDF or a saved-comparison feature, sold through a merchant-of-record (Lemon Squeezy or Paddle) so VAT is handled. Kept out of v1 to maximise reach first.

## Traffic strategy

The tool is designed to be discoverable and immune to AI Overviews (it computes a personalised result, which a summary cannot replace):

- On-page SEO is in place: descriptive title and meta description, canonical URL, Open Graph and Twitter cards, `WebApplication` structured data, `sitemap.xml`, `robots.txt`.
- The FAQ block targets real long-tail queries ("why do umbrella workers pay employer's NI", "is outside IR35 better paid").
- Shareable result URLs and a strong social card encourage organic sharing in contractor communities.
- Next SEO step: a short custom domain (better AdSense approval and link equity) pointed at GitHub Pages, plus one or two explainer articles linking back to the tool.

## Compliance and ethics

- Every page carries an "estimate, not advice" disclaimer.
- Affiliate links are disclosed in plain sight and never alter the calculation.
- Before taking revenue, confirm the University of Oxford outside-work disclosure and any visa self-employment conditions, and operate this under a personal identity, not an institutional one. (Carried over from the free-tools portfolio guardrails.)

## Cost base

Hosting is GitHub Pages (free). There is no backend, so marginal cost per user is effectively zero. The only paid step is an optional custom domain (around £10 a year).
