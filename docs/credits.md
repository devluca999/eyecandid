# Stock footage credits

The landing page (apps/web/app/page.tsx) uses demo edits on stock footage from [Mixkit](https://mixkit.co). The clips are trimmed into short loops, re-encoded and served from `apps/web/public/media/` by `scripts/media/build.sh`; the site never loads anything from mixkit.co. The public page is `/credits`.

Licence pages: [Mixkit licences](https://mixkit.co/license/) (Stock Video Free License: `https://mixkit.co/license/#videoFree`; Stock Video Restricted License: `https://mixkit.co/license/#videoRestricted`).

The licence column is what each clip's own page states (its `copyrightNotice`), checked on 17 Nov 2026. **Three clips are under the Mixkit Stock Video Restricted License, not the Free License.** Their terms could not be read automatically (the licence text loads in a modal); confirm they allow use on a commercial product's marketing site before production, or swap them in `scripts/media/clips.tsv`.

| Mixkit id | Title | Page | Licence | Used in |
|---|---|---|---|---|
| 5565 | Cinematic aerial view of countryside meadow | [mixkit.co](https://mixkit.co/free-stock-video/cinematic-aerial-view-of-countryside-meadow-5565/) | **Stock Video Restricted License** | hero (far circle), founder letter |
| 41272 | Youtuber vlogging in his studio | [mixkit.co](https://mixkit.co/free-stock-video/youtuber-vlogging-in-his-studio-41272/) | Stock Video Free License | hero, reel, autopilots |
| 42308 | Cheerful girl recording herself with a colorful background | [mixkit.co](https://mixkit.co/free-stock-video/cheerful-girl-recording-herself-with-a-colorful-background-42308/) | Stock Video Free License | hero, reel, real or ai |
| 32800 | Young woman getting into position for sprinting | [mixkit.co](https://mixkit.co/free-stock-video/young-woman-getting-into-position-for-sprinting-32800/) | Stock Video Free License | hero (runner), genre switcher, final drop |
| 9582 | Sunbeams in a cloudy sunset | [mixkit.co](https://mixkit.co/free-stock-video/sunbeams-in-a-cloudy-sunset-9582/) | **Stock Video Restricted License** | hero |
| 236 | Filling a white cup of coffee | [mixkit.co](https://mixkit.co/free-stock-video/filling-a-white-cup-of-coffee-236/) | Stock Video Free License | hero, cringe to cinema (b-roll), final drop |
| 40865 | A person riding a bicycle to the side of a cycling track | [mixkit.co](https://mixkit.co/free-stock-video/a-person-riding-a-bicycle-to-the-side-of-a-40865/) | Stock Video Free License | hero, genre switcher |
| 42323 | Portrait of an influencer talking to the camera | [mixkit.co](https://mixkit.co/free-stock-video/portrait-of-an-influencer-talking-to-the-camera-42323/) | Stock Video Free License | hero, cringe to cinema, genre switcher |
| 810 | Latte art | [mixkit.co](https://mixkit.co/free-stock-video/latte-art-810/) | Stock Video Free License | hero, reel, founder letter |
| 41181 | Woman taking a selfie in the morning | [mixkit.co](https://mixkit.co/free-stock-video/woman-taking-a-selfie-in-the-morning-41181/) | Stock Video Free License | hero, reel, faq |
| 46653 | Slow motion of a woman running under a city bridge | [mixkit.co](https://mixkit.co/free-stock-video/slow-motion-of-a-woman-running-under-a-city-bridge-46653/) | **Stock Video Restricted License** | real or ai ("ai" tile; a stock clip standing in for AI footage) |
| 583 | Woman doing warm up exercises | [mixkit.co](https://mixkit.co/free-stock-video/woman-doing-warm-up-exercises-583/) | Stock Video Free License | pricing |

Rebuild after changing the list: `scripts/media/build.sh` (needs curl and ffmpeg; raw downloads go to the git-ignored `scripts/media/.raw/`).
