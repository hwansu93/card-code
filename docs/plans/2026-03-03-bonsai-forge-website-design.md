# Bonsai Forge — Website & Business Design

## Overview

Bonsai Forge is a new tech-focused branch under Bonsai Group LLC, positioned as a hybrid services + content company specializing in AI tools, marketing automation, and SEO. It launches as a services-first business supported by content marketing, with products to be added later as they mature.

## Brand

- **Name:** Bonsai Forge
- **Entity:** DBA under Bonsai Group LLC (DBA filing required)
- **Domain:** bonsaiforge.com
- **Email:** hello@bonsaiforge.com (Cloudflare email routing)
- **Tagline candidates:** "Crafted Automation" / "AI Tools, Forged for Business" / "Build Smarter. Grow Faster."

### Visual Identity

- **Fonts:**
  - Display/Headings: Space Grotesk
  - Body: DM Sans
  - Monospace accents: JetBrains Mono
- **Color temperature:** Warm
  - Base: Deep charcoal/slate (not pure black)
  - Primary accent: Ember/amber (forge heat)
  - Secondary: Warm slate
  - Tertiary: Copper
  - Dark mode default, light mode available
- **Border radius:** Tight (4-8px) — sharp, crafted aesthetic
- **Shadows:** Minimal at rest, subtle on hover/focus
- **Icons:** Phosphor (single library, consistent throughout)
- **Motion:** Expressive for landing pages — entrance animations with stagger, scroll-driven reveals. Baseline: 150-200ms hover, 200-300ms color, 300ms layout, 400-600ms page-level. Always respect prefers-reduced-motion.
- **Tone:** Direct, no-fluff. Competent and genuine. Stand out by avoiding AI buzzword hype.

### Design Principles (from project standards)

- No generic AI aesthetics (no purple-to-blue gradients, glassmorphism, pill buttons, stock content)
- No generic fonts (Inter, Roboto, system-ui banned)
- Dark + light mode mandatory with .dark class, localStorage persistence, FOUC prevention
- Design tokens as CSS custom properties
- Density over emptiness — intentional spacing
- Every animation must serve a purpose (guide attention, confirm action, smooth transition)

## Positioning

- **Model:** Hybrid — services-first with content marketing, products added later
- **Inspiration:** AgentixLabs (services agency) + ProMarkia (SaaS platform) — same parent company, different brand faces
- **Differentiation:** Genuine expertise demonstrated through content and case studies, not buzzword-laden AI hype. Transparent, direct communication.
- **Target audience:** Broad — small business owners, marketing professionals, solo entrepreneurs. Start wide, narrow based on traction.

## Tech Stack

- **Framework:** Astro (static site generation)
- **Styling:** Tailwind CSS
- **Hosting:** Cloudflare Pages (free tier, global CDN, auto-deploy from Git)
- **Blog:** Astro content collections (markdown files with frontmatter)
- **Email:** Cloudflare email routing
- **Booking:** Cal.com (free tier) for consultation scheduling
- **Analytics:** Cloudflare Web Analytics (privacy-focused, free)

## Site Structure

```
bonsaiforge.com/
├── / (Home)              — Value prop, featured services, blog preview, CTA
├── /services             — What we offer (SEO, marketing automation, AI tools)
│   └── /services/[slug]  — Individual service detail pages (expandable)
├── /blog                 — Articles, tutorials, insights
│   └── /blog/[slug]      — Individual posts (markdown-driven)
├── /about                — Founder story, what Bonsai Forge is about
└── /contact              — Contact form + consultation booking link
```

### Page Details

**Homepage (/)**
- Clear statement of what Bonsai Forge does (not a giant buzzword hero)
- 2-3 featured service capabilities
- Recent blog posts preview (3 latest)
- Primary CTA: "Book a free consultation" or "See our services"
- Dense, scroll-driven layout with personality

**Services (/services)**
- Starting service areas:
  1. SEO & Site Analysis — comprehensive website auditing, technical SEO, performance optimization
  2. Marketing Automation — AI-powered content workflows, campaign automation, lead nurturing
  3. AI Tool Development — custom tools and automation for business processes
- Each service is a markdown file in an Astro content collection — adding new services = adding a new file
- Individual service pages (/services/[slug]) with detail, process, and CTA

**Blog (/blog)**
- Astro content collections with markdown/MDX
- Frontmatter: title, date, tags, description, author
- Tag filtering, RSS feed
- Clean URLs (/blog/post-title)
- Content pipeline:
  - Phase 1: Manual curation + AI-assisted drafts (review and edit before publishing)
  - Phase 2: Semi-automated — tag topics during work, generate drafts, quick review, deploy
- Target cadence: 1-2 posts per week

**About (/about)**
- Founder story — genuine, personal
- What Bonsai Forge is and why it exists
- Portfolio of past work (Bonsai Toolkit, RankReady, dashboard — framed as capabilities)
- Not corporate "About Us" — differentiate by being real

**Contact (/contact)**
- Contact form (email delivery via Cloudflare or third-party form service)
- Cal.com embedded booking widget for free consultations
- Direct email link as fallback

## Marketing Strategy

### Channels

1. **LinkedIn (primary)** — B2B audience, organic reach, thought leadership
   - Profile updated to reflect Bonsai Forge
   - Post 2-3x per week: blog article shares, short-form insights, behind-the-scenes
2. **Blog/SEO (secondary)** — Organic search traffic that compounds over time
   - Target long-tail keywords in SEO, AI tools, and marketing automation space
   - Use own tools to audit and optimize site performance

### Content Strategy

- Write about real problems solved and real topics discovered during work
- Avoid formulaic SEO-bait titles ("7 Proven Hidden Checks Before...")
- Topics pulled from actual Claude Code work and client engagements
- Formats: tutorials, insights, tool comparisons, case studies (starting with own projects)

### Lead Generation

- Free consultations via Cal.com booking
- Blog content drives organic traffic
- LinkedIn posts drive direct traffic
- Contact form captures inbound interest
- No paid advertising at launch — organic only

### Cold Start Strategy (Zero Customer Base)

1. Own projects serve as case studies (Bonsai Toolkit, RankReady, dashboard)
2. Free consultations lower the barrier to first conversations
3. Blog content establishes expertise before anyone hires you
4. LinkedIn network provides first warm leads
5. The website itself is portfolio piece #1

## Go-to-Market Phases

### Phase 1 — Foundation (Week 1-2)
1. Register domain (bonsaiforge.com)
2. File DBA for "Bonsai Forge" in state
3. Set up Cloudflare account + email routing
4. Build and deploy website (Astro + Tailwind on Cloudflare Pages)
5. All pages live with 3 seed blog posts

### Phase 2 — Content & Credibility (Week 2-4)
6. LinkedIn profile updated to reflect Bonsai Forge
7. Begin LinkedIn posting cadence (2-3x/week)
8. Write additional blog posts from real work topics
9. Services page refined based on what resonates

### Phase 3 — Lead Generation (Week 4-6)
10. Cal.com booking link live for free consultations
11. Simple lead tracking (spreadsheet or lightweight CRM)
12. LinkedIn content drives traffic to site

### Phase 4 — Growth & Iteration (Ongoing)
13. Blog cadence: 1-2 posts per week
14. Build semi-automated content pipeline as volume increases
15. Expand services page as new capabilities develop
16. Add products section when tools mature (RankReady or successor)
17. Evaluate additional marketing channels based on traction data

## Future Expansion (Not for V1)

- Products page with mature tools (RankReady evolution)
- Customer testimonials and case studies from real clients
- Service-specific landing pages for paid advertising
- Semi-automated blog content pipeline
- Additional marketing channels (evaluated based on traction)
- White-label service offerings

## Legal Checklist

- [ ] File DBA for "Bonsai Forge" in state
- [ ] Register bonsaiforge.com domain
- [ ] Set up business email via Cloudflare
- [ ] Privacy policy page (required for contact forms)
- [ ] Terms of service (needed when offering services)

## Key Decisions Made

1. **Brand:** Bonsai Forge (DBA under Bonsai Group LLC) — retains Bonsai equity with tech-forward "Forge" identity
2. **No products at launch** — RankReady and future tools will be added when they mature
3. **Services + content hybrid** — content builds authority, services capture demand
4. **Astro + Cloudflare Pages** — static, fast, free hosting, great SEO, markdown blog
5. **LinkedIn + blog only** — focus over channel sprawl
6. **Broad audience** — narrow based on traction data, not assumptions
7. **Manual blog pipeline first** — quality content over volume, evolve to semi-automated later
8. **Own projects as portfolio** — no need to wait for clients to have case studies
