# Instagram Growth + Creative Research (Vineyard Brand)

Research date: March 3, 2026.

## 1) Discovery and recommendation basics

- Recommendation eligibility is the core gate for non-follower reach across surfaces like Explore and recommended feed/reels.
- Account Status is the first operational check: if content is flagged as ineligible, reach is constrained regardless of creative quality.
- Instagram's official Best Practices hub exists to guide creators/businesses on creation, engagement, reach, monetization, and guideline-safe content.

Implication for this product:
- Every generated concept should be optimized for saves/shares/watch-through while remaining recommendation-eligible.

## 2) Technical publishing constraints that shape product design

- Instagram Content Publishing API supports single media, videos/reels, and carousel publishing.
- Carousel publishing supports up to 10 media children through API containers.
- API publishing has throughput constraints (50 published posts per 24h per account), so the app should prioritize scheduling and batching.

Implication for this product:
- The planner should deliberately choose among single, carousel, and reel rather than forcing one canvas.
- Carousel plans should cap to 10 assets in publishing payload.

## 3) Video/reel execution principles for performance

Official docs emphasize format support and recommendation safety, not a single "perfect formula". Operationally, high-performing reels consistently:
- establish a clear hook immediately,
- maintain visual pace with frequent beat shifts,
- remain legible with on-screen text,
- end with one clear CTA.

Implication for this product:
- When video assets exist, generate a beat-by-beat editing blueprint: hook, timeline beats, edit actions, cover frame direction, and CTA end card.

## 4) Vineyard/wine brand compliance constraints

For wine brands, performance must coexist with alcohol compliance:
- Wine Institute code emphasizes legal-drinking-age targeting and responsible communication.
- TTB social media guidance clarifies ad responsibility extends to brand-controlled social channels.
- FTC requires clear disclosure for endorsements/material connections (for example #ad/#sponsored when applicable).

Implication for this product:
- Generated copy must avoid intoxication framing, health/performance claims, and youth-oriented positioning.
- Include disclosure prompts in campaign operations where creators/influencers are used.

## 5) Recommended creative system for vineyard content

- Carousel: "Vine-to-glass education" sequence (hook, terroir/provenance, process, tasting notes, pairing, CTA).
- Reel: "Place + craft + pour" rhythm (vineyard wide, cellar detail, pour macro, lifestyle moment, CTA card).
- Single image: premium hero for launches, awards, and tasting announcements.

## Official source links

- Instagram recommendation eligibility: https://help.instagram.com/313829416281232/
- Instagram best practices entry point: https://about.fb.com/news/2024/10/best-practices-educational-hub-creators-instagram/
- Instagram API collection (official): https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api
- Carousel publishing request (official): https://www.postman.com/meta/instagram/request/7lrbwcc/create-carousel-container
- Reels publishing request (official): https://www.postman.com/meta/instagram/request/0wg7lfi/publish-reel
- Wine Institute code of advertising standards: https://wineinstitute.org/our-work/responsibility/code-of-advertising-standards/
- TTB social media and alcohol advertising: https://www.ttb.gov/advertising/social-media
- FTC social media disclosure guidance: https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers
